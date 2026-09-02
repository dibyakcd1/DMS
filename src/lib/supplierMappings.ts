import { supabase } from "@/integrations/supabase/client";

export type GrnAliasRecord = {
  id?: string;
  raw_name: string;
  product_id: string;
  supplier_name?: string | null;
  external_code?: string | null;
  code_type?: string | null;
  company_id?: string | null;
  hsn?: string | null;
  confidence?: number;
  use_count?: number;
};

export function normalizeAliasKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

const LOCAL_STORAGE_KEY_PREFIX = "tatvisha_grn_alias_";

function getLocalAliases(supplierName: string): GrnAliasRecord[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${normalizeAliasKey(supplierName)}`);
    if (raw) {
      return JSON.parse(raw) as GrnAliasRecord[];
    }
  } catch (e) {
    console.warn("Failed to read local supplier alias:", e);
  }
  return [];
}

function saveLocalAliases(supplierName: string, entries: GrnAliasRecord[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${normalizeAliasKey(supplierName)}`, JSON.stringify(entries));
  } catch (e) {
    console.warn("Failed to write local supplier alias:", e);
  }
}

/**
 * Load all aliases for a supplier and/or company from `grn_product_aliases`
 */
export async function loadAliases(
  supplierName?: string | null,
  companyId?: string | null
): Promise<GrnAliasRecord[]> {
  const results: GrnAliasRecord[] = [];

  try {
    let query = supabase.from("grn_product_aliases").select("*");

    if (supplierName && companyId) {
      query = query.or(`supplier_name.ilike.%${supplierName}%,company_id.eq.${companyId}`);
    } else if (supplierName) {
      query = query.ilike("supplier_name", `%${supplierName}%`);
    } else if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query;
    if (!error && data) {
      results.push(...(data as unknown as GrnAliasRecord[]));
    }
  } catch (err) {
    console.warn("Error fetching aliases from Supabase:", err);
  }

  // Merge with local fallback if supplierName provided
  if (supplierName) {
    const local = getLocalAliases(supplierName);
    const seen = new Set(results.map(r => `${normalizeAliasKey(r.raw_name)}_${r.external_code || ""}`));
    for (const item of local) {
      const key = `${normalizeAliasKey(item.raw_name)}_${item.external_code || ""}`;
      if (!seen.has(key)) {
        results.push(item);
      }
    }
  }

  return results;
}

/**
 * Record or reinforce a learned alias mapping in `grn_product_aliases`.
 */
export async function recordCorrection(
  rawName: string,
  productId: string,
  supplierName?: string | null,
  opts?: {
    externalCode?: string | null;
    codeType?: string | null;
    companyId?: string | null;
    hsn?: string | null;
  }
): Promise<void> {
  if (!rawName && !opts?.externalCode) return;
  if (!productId) return;

  const normalizedRaw = (rawName || "").trim();
  const supplier = (supplierName || "").trim() || null;
  const externalCode = (opts?.externalCode || "").trim() || null;
  const codeType = opts?.codeType || (externalCode ? "external" : "name");
  const companyId = opts?.companyId || null;
  const hsn = (opts?.hsn || "").trim() || null;

  // 1. Save to localStorage for instant local access
  if (supplier) {
    const local = getLocalAliases(supplier);
    const matchIdx = local.findIndex(
      e => normalizeAliasKey(e.raw_name) === normalizeAliasKey(normalizedRaw) || 
           (externalCode && e.external_code === externalCode)
    );
    if (matchIdx >= 0) {
      local[matchIdx].product_id = productId;
      local[matchIdx].confidence = 100;
      local[matchIdx].external_code = externalCode;
      local[matchIdx].company_id = companyId;
      local[matchIdx].hsn = hsn;
    } else {
      local.push({
        raw_name: normalizedRaw,
        product_id: productId,
        supplier_name: supplier,
        external_code: externalCode,
        code_type: codeType,
        company_id: companyId,
        hsn,
        confidence: 100,
        use_count: 1,
      });
    }
    saveLocalAliases(supplier, local);
  }

  // 2. Persist to DB table `grn_product_aliases`
  try {
    // Check if an entry already exists for raw_name + supplier or external_code
    let existingQuery = supabase.from("grn_product_aliases").select("id, use_count");
    
    if (normalizedRaw && supplier) {
      existingQuery = existingQuery.eq("raw_name", normalizedRaw).eq("supplier_name", supplier);
    } else if (normalizedRaw) {
      existingQuery = existingQuery.eq("raw_name", normalizedRaw);
    } else if (externalCode) {
      existingQuery = existingQuery.eq("external_code", externalCode);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing?.id) {
      await supabase
        .from("grn_product_aliases")
        .update({
          product_id: productId,
          external_code: externalCode,
          code_type: codeType,
          company_id: companyId,
          hsn: hsn,
          confidence: 100,
          use_count: (existing.use_count || 1) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("grn_product_aliases").insert({
        raw_name: normalizedRaw || (externalCode ? `CODE:${externalCode}` : "ITEM"),
        product_id: productId,
        supplier_name: supplier,
        external_code: externalCode,
        code_type: codeType,
        company_id: companyId,
        hsn: hsn,
        confidence: 100,
        use_count: 1,
        last_used_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("Could not save to grn_product_aliases in DB:", err);
  }
}

/**
 * Returns a fast lookup mapping for names and external codes to product IDs.
 */
export async function getLearnedMap(
  supplierName?: string | null,
  companyId?: string | null
): Promise<{
  nameMap: Map<string, string>;
  codeMap: Map<string, string>;
}> {
  const nameMap = new Map<string, string>();
  const codeMap = new Map<string, string>();

  const aliases = await loadAliases(supplierName, companyId);
  for (const a of aliases) {
    if (a.raw_name && a.product_id) {
      nameMap.set(normalizeAliasKey(a.raw_name), a.product_id);
      nameMap.set(a.raw_name.trim().toLowerCase(), a.product_id);
    }
    if (a.external_code && a.product_id) {
      codeMap.set(a.external_code.trim().toUpperCase(), a.product_id);
    }
  }

  return { nameMap, codeMap };
}

// Backward compatibility helper
export async function loadTemplate(supplierName: string) {
  return loadAliases(supplierName);
}
export async function saveTemplate(supplierName: string, entries: GrnAliasRecord[]) {
  saveLocalAliases(supplierName, entries);
}
