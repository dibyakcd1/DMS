import { supabase } from "@/integrations/supabase/client";
import { sanitizeProductForDb } from "@/lib/packaging";
import { Product } from "@/types";

interface PostgrestErrorLike {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

/**
 * Extracts any missing column name(s) or enum validation failures from PostgREST / Postgres error messages.
 */
function extractMissingColumns(error: unknown): string[] {
  if (!error || typeof error !== "object") return [];
  const err = error as PostgrestErrorLike;
  const msg = `${err.message || ""} ${err.details || ""} ${err.hint || ""}`;

  const found: string[] = [];
  const patterns = [
    /Could not find the ['"]?([a-zA-Z0-9_ ]+)['"]? column of ['"]?products['"]?/gi,
    /column ["']([a-zA-Z0-9_ ]+)["'] of relation ["']?products["']? does not exist/gi,
    /column ["']([a-zA-Z0-9_ ]+)["'] does not exist/gi,
    /Could not find the ['"]?([a-zA-Z0-9_ ]+)['"]? column/gi,
    /invalid input value for enum ([a-zA-Z0-9_]+):/gi,
    /invalid input syntax for enum ([a-zA-Z0-9_]+):/gi,
    /invalid input syntax for type ([a-zA-Z0-9_]+):/gi,
  ];

  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(msg)) !== null) {
      if (match[1]) {
        found.push(match[1].trim());
      }
    }
  }

  if (msg.includes("enum unit_type") || msg.includes("unit_type")) {
    found.push("unit_type");
  }

  // Also check direct keywords in error text
  const checkKeywords = [
    "cgst_rate", "cgst rate", "cgstrate",
    "sgst_rate", "sgst rate", "sgstrate",
    "igst_rate", "igst rate", "igstrate",
    "division", "sub_category", "sub category",
    "division_category", "normal product category", "normal_product_category",
    "weight_per_unit_grams", "selling_price", "preferred_sell_unit",
    "item_pack_type", "case_qty_unit", "case_qty_value",
    "unit_type"
  ];

  for (const kw of checkKeywords) {
    if (msg.toLowerCase().includes(kw.toLowerCase()) && (msg.includes("does not exist") || msg.includes("Could not find") || msg.includes("schema cache") || msg.includes("invalid input value for enum") || err.code === "22P02")) {
      found.push(kw);
    }
  }

  return Array.from(new Set(found));
}

/**
 * Automatically adapts payload when PostgreSQL check constraints are violated (e.g. 23514).
 * Returns true if an adaptation was performed and retry should be attempted.
 */
function adaptPayloadForConstraint(payload: Record<string, unknown>, error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as PostgrestErrorLike;
  const msg = `${err.message || ""} ${err.details || ""} ${err.hint || ""}`;

  // Handle division_category check constraint violation (e.g. products_division_category_check)
  if (
    msg.includes("products_division_category_check") ||
    msg.includes("division_category_check") ||
    (err.code === "23514" && (msg.includes("division_category") || msg.includes("category")))
  ) {
    const currentVal = String(payload.division_category || "");
    const lower = currentVal.toLowerCase();

    // Progression of valid database fallback values for legacy check constraints:
    if (currentVal === "Household Care" || currentVal === "Household") {
      delete payload.division_category;
      return true;
    } else if (currentVal === "Uncategorized" || currentVal === "SPECIAL PRODUCTS" || currentVal === "Other") {
      delete payload.division_category;
      return true;
    } else if (lower.includes("blend") || lower.includes("mix") || lower.includes("masala")) {
      payload.division_category = "Blended Spice";
      return true;
    } else if (lower.includes("spice") || lower.includes("haldi") || lower.includes("mirch") || lower.includes("chilli") || lower.includes("turmeric") || lower.includes("coriander")) {
      payload.division_category = "Spices";
      return true;
    } else {
      delete payload.division_category;
      return true;
    }
  }

  // Handle pack_category check constraint (BOX, POUCH, JAR, BAG, TIN, ACB, BOTTLE)
  if (
    msg.includes("pack_category_check") ||
    (err.code === "23514" && (msg.includes("pack_category") || msg.includes("pack_size")))
  ) {
    const currentVal = String(payload.pack_category || "").toUpperCase();
    const allowed = ["BOX", "POUCH", "JAR", "BAG", "TIN", "ACB", "BOTTLE"];
    if (allowed.includes(currentVal)) {
      delete payload.pack_category;
      return true;
    } else {
      payload.pack_category = "POUCH";
      return true;
    }
  }

  // Generic check constraint violation fallback (code 23514)
  if (err.code === "23514") {
    if (payload.division_category !== undefined) {
      delete payload.division_category;
      return true;
    }
    if (payload.unit_type !== undefined) {
      delete payload.unit_type;
      return true;
    }
    if (payload.item_pack_type !== undefined) {
      delete payload.item_pack_type;
      return true;
    }
    if (payload.division !== undefined) {
      delete payload.division;
      return true;
    }
  }

  return false;
}

/**
 * Removes a column and any of its casing/spacing variations from a payload object.
 */
function removeColumnFromPayload(payload: Record<string, unknown>, colName: string): boolean {
  let removed = false;
  const targetNorm = colName.toLowerCase().replace(/[\s_-]/g, "");

  for (const key of Object.keys(payload)) {
    const keyNorm = key.toLowerCase().replace(/[\s_-]/g, "");
    if (keyNorm === targetNorm) {
      delete payload[key];
      removed = true;
    }
  }

  // If tax rate is removed, remove its sibling tax rate columns as well to prevent sequential failures
  if (targetNorm.includes("cgst") || targetNorm.includes("sgst") || targetNorm.includes("igst")) {
    for (const key of ["cgst_rate", "sgst_rate", "igst_rate", "cgst rate", "sgst rate", "igst rate"]) {
      if (payload[key] !== undefined) {
        delete payload[key];
        removed = true;
      }
    }
  }

  return removed;
}

// Fields that should never be sent to the products table (relational, computed, or frontend-only)
const NON_PERSISTENT_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "inventory_quantity",
  "stock_base_units",
  "avg_landed_cost",
  "landed_cost",
  "is_low_stock",
  "company",
  "warehouse",
  "batches",
  "history",
  "profile",
  "profiles",
  "stock_count",
  "price_tiers"
]);

export interface PersistProductResult {
  data: Record<string, unknown> | null;
  error: unknown;
}

/**
 * Safely persists a product to Supabase, automatically adapting to schema cache
 * variations, enforcing product uniqueness by SKU and Name, and gracefully removing
 * columns that do not exist on the remote database.
 */
export async function persistProductToSupabase(
  rawInput: Partial<Product> | Record<string, unknown>,
  targetId?: string | null,
  options?: { skipUniquenessCheck?: boolean }
): Promise<PersistProductResult> {
  let isInsert = !targetId || targetId === "new" || targetId.startsWith("clone:");
  
  // 1. Sanitize input to conform to expected structure
  const sanitized = sanitizeProductForDb(rawInput as Record<string, unknown>);
  
  // 2. Clone payload into a mutable working copy
  const payload: Record<string, unknown> = { ...(sanitized as unknown as Record<string, unknown>) };

  // Explicitly copy additional valid product properties if present
  const extendedFields: Array<keyof Product> = [
    "unit_type",
    "base_weight_unit",
    "display_weight_unit",
    "case_type",
    "case_qty_value",
    "case_qty_unit",
    "base_unit",
    "is_chain_item",
    "is_mrp_priced",
    "chain_mrp_label",
    "target_margin_basic",
    "target_margin_special",
    "target_margin_wholesale",
    "cost_price"
  ];

  for (const field of extendedFields) {
    if (rawInput[field] !== undefined && rawInput[field] !== null && rawInput[field] !== "") {
      payload[field] = rawInput[field];
    }
  }

  // If this is an UPDATE (not insert), preserve existing product values for fields NOT explicitly provided in rawInput
  if (!isInsert) {
    const rawRecord = rawInput as Record<string, unknown>;
    
    // If name was not provided or was empty string in rawInput, don't overwrite existing name
    if (rawRecord.name === undefined || rawRecord.name === null || String(rawRecord.name).trim() === "") {
      delete payload.name;
    }
    // If sku was not provided or was empty string, don't overwrite existing sku
    if (rawRecord.sku === undefined || rawRecord.sku === null || String(rawRecord.sku).trim() === "") {
      delete payload.sku;
    }
    // If mrp was not explicitly provided, don't overwrite existing mrp
    if (rawRecord.mrp === undefined || rawRecord.mrp === null) {
      delete payload.mrp;
    }
    // If brand was not provided, don't overwrite
    if (rawRecord.brand === undefined || rawRecord.brand === null) {
      delete payload.brand;
    }
    // If category was not provided, don't overwrite
    if (rawRecord.division_category === undefined && rawRecord.category === undefined) {
      delete payload.division_category;
    }
    // If division was not provided, don't overwrite
    if (rawRecord.division === undefined) {
      delete payload.division;
    }
    // If hsn was not provided, don't overwrite
    if (rawRecord.hsn === undefined || rawRecord.hsn === null) {
      delete payload.hsn;
    }
    // If gst_rate was not provided, don't overwrite
    if (rawRecord.gst_rate === undefined && rawRecord.tax_rate === undefined) {
      delete payload.gst_rate;
      delete payload.cgst_rate;
      delete payload.sgst_rate;
      delete payload.igst_rate;
    }
  }

  // Remove non-persistent fields
  for (const key of Object.keys(payload)) {
    if (NON_PERSISTENT_FIELDS.has(key)) {
      delete payload[key];
    }
  }

  // Postgres enum unit_type accepts 'pieces', 'packet', 'kg_g' (not 'pcs')
  if (payload.unit_type === "pcs") {
    payload.unit_type = "pieces";
  }

  // Uniqueness enforcement: if insert, check if a product already exists with this SKU or Name
  if (isInsert && !options?.skipUniquenessCheck) {
    const rawSku = typeof payload.sku === "string" ? payload.sku.trim() : "";
    const rawName = typeof payload.name === "string" ? payload.name.trim() : "";

    if (rawSku || rawName) {
      try {
        let existingId: string | null = null;

        // 1. Check SKU match
        if (rawSku) {
          const { data: bySku } = await supabase
            .from("products")
            .select("id")
            .eq("sku", rawSku)
            .limit(1)
            .maybeSingle();
          if (bySku?.id) existingId = bySku.id;
        }

        // 2. Check Name match if not already found
        if (!existingId && rawName) {
          const { data: byName } = await supabase
            .from("products")
            .select("id")
            .ilike("name", rawName)
            .limit(1)
            .maybeSingle();
          if (byName?.id) existingId = byName.id;
        }

        if (existingId) {
          targetId = existingId;
          isInsert = false;
        }
      } catch (checkErr) {
        console.warn("[persistProduct] Uniqueness check warning:", checkErr);
      }
    }
  }

  // 3. Retry loop: try updating/inserting, and if PostgREST complains about a missing column or check constraint, adapt and retry
  const maxRetries = 15;
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (isInsert) {
        const { data, error } = await supabase
          .from("products")
          .insert(payload as never)
          .select()
          .single();

        if (!error) {
          return { data: (data as unknown as Record<string, unknown>) || null, error: null };
        }

        // First check if check constraint failed and adapt
        if (adaptPayloadForConstraint(payload, error)) {
          console.warn(`[persistProduct] Adapted payload due to database constraint:`, error);
          continue;
        }

        const missingCols = extractMissingColumns(error);
        let anyRemoved = false;
        for (const missingCol of missingCols) {
          if (removeColumnFromPayload(payload, missingCol)) {
            console.warn(`[persistProduct] Dropping unsupported column "${missingCol}" from products insert.`);
            removedColumns.push(missingCol);
            anyRemoved = true;
          }
        }

        if (anyRemoved) {
          continue;
        }

        return { data: null, error };
      } else {
        const { data, error } = await supabase
          .from("products")
          .update(payload as never)
          .eq("id", targetId)
          .select()
          .single();

        if (!error) {
          return { data: (data as unknown as Record<string, unknown>) || null, error: null };
        }

        // First check if check constraint failed and adapt
        if (adaptPayloadForConstraint(payload, error)) {
          console.warn(`[persistProduct] Adapted payload due to database constraint:`, error);
          continue;
        }

        const missingCols = extractMissingColumns(error);
        let anyRemoved = false;
        for (const missingCol of missingCols) {
          if (removeColumnFromPayload(payload, missingCol)) {
            console.warn(`[persistProduct] Dropping unsupported column "${missingCol}" from products update.`);
            removedColumns.push(missingCol);
            anyRemoved = true;
          }
        }

        if (anyRemoved) {
          continue;
        }

        return { data: null, error };
      }
    } catch (err: unknown) {
      if (adaptPayloadForConstraint(payload, err)) {
        console.warn(`[persistProduct] Caught exception for constraint. Adapting and retrying.`, err);
        continue;
      }

      const missingCols = extractMissingColumns(err);
      let anyRemoved = false;
      for (const missingCol of missingCols) {
        if (removeColumnFromPayload(payload, missingCol)) {
          console.warn(`[persistProduct] Caught exception for column "${missingCol}". Dropping and retrying.`);
          removedColumns.push(missingCol);
          anyRemoved = true;
        }
      }

      if (anyRemoved) {
        continue;
      }
      return { data: null, error: err };
    }
  }

  return {
    data: null,
    error: new Error(
      `Could not save product after schema adaptation. (Dropped unsupported columns: ${removedColumns.join(", ") || "none"})`
    )
  };
}
