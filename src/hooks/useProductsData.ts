import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_SHORT } from "@/lib/config";
import { useAuth } from "@/context/AuthContextCore";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { useProductsCatalog } from "@/hooks/useProductsCatalog";
import { useQueryClient } from "@tanstack/react-query";
import { type Product } from "@/types";
import { useFilters } from "@/hooks/useFilters";
import { sanitizeProductForDb, persistProductToSupabase } from "@/lib/packaging";
import { inferTaxonomyCategory, inferTaxonomyDivision } from "@/lib/taxonomy";
import { ensureSku, resolveCompanyShortCode } from "@/lib/skuGenerator";

const ANY = "All";

const empty: Partial<Product> = {
  name: "", sku: "", mrp: 0, gst_rate: 0, hsn: "",
  min_stock: 10, is_active: true,
  units_per_packet: 1, packets_per_case: 1,
  item_pack_type: "pcs", division_category: "",
  unit_type: "pcs", weight_per_unit_grams: null,
  display_weight_unit: "g",
  brand: "", preferred_sell_unit: "packet",
  batch_number: "",
  case_qty_unit: "unit",
};

const computeWeightPerUnit = (value: number | null, unit: string | null): number | null => {
  if (!value || !unit) return null;
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'gms' || u === 'ml') return value;
  if (u === 'kg' || u === 'ltr' || u === 'l') return value * 1000;
  return null;
};

const extractWeight = (name: string) => {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(\.?gms?|g|kg|ml|ltr)/i);
  if (match) {
    const value = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    // Standardize all variations of weight units
    if (unit === 'g' || unit === 'gms' || unit === '.gms') unit = 'g';
    if (unit === 'kg') unit = 'Kg';
    return { value, unit };
  }
  return null;
};

export function useProductsData() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { 
    state, 
    debouncedSearch, 
    setSearch, 
    setCategory, 
    setFilter, 
    reset: clearFilters 
  } = useFilters({ category: ANY, initialFilters: { sort: 'Stock (High)' } });

  const [open, setOpen] = React.useState(false);
  const [edit, setEdit] = React.useState<Partial<Product>>(empty);
  const [inferred, setInferred] = React.useState<string | null>(null);
  const [productsActiveTab, setProductsActiveTab] = React.useState("details");
  const [showHealConfirm, setShowHealConfirm] = React.useState(false);
  const [showInactive, setShowInactive] = React.useState(true);

  const handleNameChange = (name: string) => {
    const weight = extractWeight(name);
    setEdit(prev => {
      const updates: Partial<Product> = { name };
      if (weight) {
        updates.pack_size_value = weight.value;
        updates.pack_size_unit = weight.unit;
        updates.case_qty_unit = "kg";
        if (!prev.preferred_sell_unit || prev.preferred_sell_unit === 'packet' || prev.preferred_sell_unit === 'unit') {
          updates.preferred_sell_unit = "kg";
        }
      }
      return { ...prev, ...updates };
    });
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch
  } = useProductsCatalog(
    debouncedSearch,
    undefined,
    showInactive,
    state.filters.sort,
    state.filters.pack,
    state.category
  );

  const allItems = React.useMemo(() => {
    const flat = data?.pages.flatMap(p => p.data) || [];
    const filtered = flat.filter(p => showInactive || p.is_active || (p.inventory?.quantity || 0) > 0);
    
    // Sort: Active AND In Stock first, then by the user's selected sort if applicable
    return [...filtered].sort((a, b) => {
      const aQty = a.inventory?.quantity || 0;
      const bQty = b.inventory?.quantity || 0;
      const aActive = a.is_active && aQty > 0;
      const bActive = b.is_active && bQty > 0;

      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }
      
      // Secondary sort: if both same "activeness", keep original sort or at least push 0 stock to bottom
      if (aQty === 0 && bQty > 0) return 1;
      if (aQty > 0 && bQty === 0) return -1;
      
      return 0;
    });
  }, [data, showInactive]);

  const [history, setHistory] = React.useState<Record<string, unknown[]>>({});
  const [loadingHistory, setLoadingHistory] = React.useState<Record<string, boolean>>({});

  const fetchHistory = async (productId: string) => {
    if (loadingHistory[productId]) return;
    setLoadingHistory(prev => ({ ...prev, [productId]: true }));
    try {
      const { data, error } = await supabase
        .from("product_price_history")
        .select(`
          *,
          profile:profiles!changed_by(full_name)
        `)
        .eq("product_id", productId)
        .order("changed_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      setHistory(prev => ({ ...prev, [productId]: (data || []) as unknown[] }));
    } catch (err: unknown) {
      console.error("[Context] fetchHistory failed", err);
    } finally {
      setLoadingHistory(prev => ({ ...prev, [productId]: false }));
    }
  };

  const [healing, setHealing] = React.useState(false);
  const [healProgress, setHealProgress] = React.useState({ current: 0, total: 0 });

  const performHealData = async () => {
    if (!isAdmin || healing) return;

    setHealing(true);
    const toastId = toast.loading("Standardizing entire product database...");
    
    try {
      const { data: allItemsList, error: fetchError } = await supabase.from("products").select("*");
      if (fetchError) throw fetchError;
      if (!allItemsList) return;

      // Fetch companies to map correct company IDs
      const { data: dbCompanies } = await supabase
        .from("companies")
        .select("id, name, short_code");

      const companyMap = new Map<string, string>();
      if (dbCompanies) {
        dbCompanies.forEach(c => {
          companyMap.set(c.short_code.toUpperCase(), c.id);
          companyMap.set(c.name.toUpperCase(), c.id);
          companyMap.set(c.name.trim().toUpperCase(), c.id);
          companyMap.set(c.id, c.id);
        });
      }

      setHealProgress({ current: 0, total: allItemsList.length });
      let count = 0;
      let errorCount = 0;
      
      const standardize = (val: string | null, type: 'weight' | 'pack' = 'weight') => {
        if (!val) return val;
        const normalized = val.trim().toLowerCase();
        
        if (type === 'weight') {
          if (["g", "gms", ".gms", "g.", "gms.", "gm", "gram", "grams"].includes(normalized)) return "g";
          if (["kg", "kgs", "kg.", "kgs.", "kilogram", "kilograms"].includes(normalized)) return "Kg";
        } else {
          if (["packet", "pkt", "pkts", "pouch", "sachet", "pkg", "pkd"].includes(normalized)) return "packet";
          if (["unit", "pcs", "pc", "units"].includes(normalized)) return "pcs";
          if (["case", "ctn", "carton", "box", "bag"].includes(normalized)) return "case";
          if (["kg", "kgs"].includes(normalized)) return "kg";
        }
        return val;
      };

      for (let i = 0; i < allItemsList.length; i++) {
        const p = allItemsList[i];
        setHealProgress({ current: i + 1, total: allItemsList.length });
        
        const newPackUnit = standardize(p.pack_size_unit, 'weight');
        const newBaseWeightUnit = (newPackUnit === "g" || newPackUnit === "Kg") ? newPackUnit : null;
        const newCaseUnit = standardize(p.case_qty_unit, 'pack');
        const newPreferredUnit = standardize(p.preferred_sell_unit, 'pack');
        const newUnit = standardize(p.unit, 'pack');
        const newBaseUnit = standardize(p.base_unit, 'pack');

        let newPPC = p.packets_per_case;
        const b = (p.brand || "").toUpperCase();
        if (b === COMPANY_SHORT || b === "TE" || b === "BM") {
          if (p.name?.includes("100 g") && (!newPPC || newPPC <= 1)) {
            newPPC = 18;
          } else if (p.name?.includes("50 g") && (!newPPC || newPPC <= 1)) {
            newPPC = 30;
          }
        }

        const calculatedUPC = (p.units_per_packet || 1) * (newPPC || 1);
        const currentUPC = p.units_per_case || 1;

        const updates: Record<string, unknown> = {};
        if (p.pack_size_unit !== newPackUnit) updates.pack_size_unit = newPackUnit;
        if (p.preferred_sell_unit !== newPreferredUnit) updates.preferred_sell_unit = newPreferredUnit;
        if (p.unit !== newUnit && newUnit) updates.unit = newUnit;
        if (p.packets_per_case !== newPPC) updates.packets_per_case = newPPC;

        if (currentUPC !== calculatedUPC && calculatedUPC > 1) {
          updates.units_per_case = calculatedUPC;
        }

        // Heal company_id based on brand/SKU patterns
        const itemBrandLower = p.brand ? String(p.brand).toLowerCase() : "";
        const itemSkuUpper = p.sku ? String(p.sku).toUpperCase() : "";
        const itemNameLower = p.name ? String(p.name).toLowerCase() : "";

        const isParle = p.id === "e29cb1bc-0731-4a4c-8822-0ef3d1b919a0" || 
                        p.id === "aee5bc79-bd3d-4c31-beef-9a5c888d3e60" || 
                        itemSkuUpper.startsWith("PL-") || 
                        itemBrandLower.includes("parle") ||
                        itemNameLower.includes("parle");

        const isJyothy = p.id === "cfa5be10-8bda-4cae-90aa-f166113b2fa0" || 
                         p.id === "fb8e7a6b-ed3d-4952-b91c-843ac5bb2e00" || 
                         itemSkuUpper.startsWith("JL-") || 
                         itemBrandLower.includes("jyothy") || 
                         itemBrandLower.includes("ujala") || 
                         itemBrandLower.includes("exo") ||
                         itemNameLower.includes("ujala") ||
                         itemNameLower.includes("exo");

        const isHul = p.id === "e29cb1bc-0731-4a4c-8822-0ef3d1b919a1" || 
                      p.id === "e2cb1bc0-7314-4c88-220e-f3d1b919a2e0" ||
                      itemSkuUpper.startsWith("HU-") ||
                      ["surf", "lux", "dove", "knorr", "vim", "hul", "unilever"].some(kw => itemBrandLower.includes(kw) || itemNameLower.includes(kw));

        const isItc = p.id === "ea812456-9a2f-410a-81a1-cf5011bd2aa1" ||
                      p.id === "ea812456-9a2f-410a-81a1-cf5011bd2aa2" ||
                      itemSkuUpper.startsWith("IT-") ||
                      ["ashirvaad", "yippee", "sunfeast", "itc"].some(kw => itemBrandLower.includes(kw) || itemNameLower.includes(kw));

        const isMadhukunj = itemSkuUpper.startsWith("MK-") || 
                        itemSkuUpper.startsWith("MAD-") ||
                        itemBrandLower.includes("madhukunj") || 
                        itemBrandLower === "mk" ||
                        itemBrandLower.includes("shanti") ||
                        itemBrandLower.includes("shantilaxmi") ||
                        itemNameLower.includes("madhukunj") ||
                        itemNameLower.startsWith("mk ") ||
                        itemNameLower.includes(" mk") ||
                        itemNameLower.includes("bhola") ||
                        itemNameLower.includes("radhe radhe") ||
                        itemNameLower.includes("real 100") ||
                        itemNameLower.includes("nature series") ||
                        itemNameLower.includes("agarbatti") ||
                        itemNameLower.includes("dhoop") ||
                        itemNameLower.includes("incense") ||
                        itemNameLower.includes("champa") ||
                        itemNameLower.includes("mogra") ||
                        itemNameLower.includes("kasturi") ||
                        itemNameLower.includes("gugal") ||
                        itemNameLower.includes("loban") ||
                        itemNameLower.includes("sambrani") ||
                        p.hsn === "33074100" ||
                        p.preferred_sell_unit === "doz" ||
                        p.division_category === "Puja Samagri" ||
                        p.division_category === "Incense & Dhoop";

        let correctCompanyId: string | undefined = undefined;
        if (isMadhukunj) {
          correctCompanyId = companyMap.get("MAD") || companyMap.get("MK") || companyMap.get("MADHUKUNJ");
          if (!p.brand || p.brand === "General / Independent Brand" || p.brand === "General" || p.brand === "Independent Brand") {
            updates.brand = "Madhukunj";
          }
        } else if (isParle) {
          correctCompanyId = companyMap.get("PARLE") || companyMap.get("PARLE PRODUCTS");
          if (!p.brand || p.brand === "General / Independent Brand" || p.brand === "General") {
            updates.brand = "Parle";
          }
        } else if (isJyothy) {
          correctCompanyId = companyMap.get("JYOTHY") || companyMap.get("JYOTHY LABS");
          if (!p.brand || p.brand === "General / Independent Brand" || p.brand === "General") {
            updates.brand = "Jyothy Labs";
          }
        } else if (isHul) {
          correctCompanyId = companyMap.get("HUL") || companyMap.get("HINDUSTAN UNILEVER") || companyMap.get("HINDUSTAN UNILEVER (HUL)");
          if (!p.brand || p.brand === "General / Independent Brand" || p.brand === "General") {
            updates.brand = "Hindustan Unilever";
          }
        } else if (isItc) {
          correctCompanyId = companyMap.get("ITC") || companyMap.get("ITC LIMITED");
          if (!p.brand || p.brand === "General / Independent Brand" || p.brand === "General") {
            updates.brand = "ITC";
          }
        } else if (p.brand && !["general", "general / independent brand", "general supplier"].includes(p.brand.toLowerCase())) {
          correctCompanyId = companyMap.get(p.brand.toUpperCase());
        }

        if (correctCompanyId && p.company_id !== correctCompanyId) {
          updates.company_id = correctCompanyId;
        }

        // Heal blank / unknown product names and SKUs
        const currentName = (p.name || "").trim();
        const isBadName = !currentName || 
          ['unknown', 'unknown product', 'unknown item', 'null', 'undefined', 'item', 'n/a', 'na'].includes(currentName.toLowerCase());
        const currentCategory = (p.division_category || "").trim();
        const isBadCategory = !currentCategory || currentCategory === "SPECIAL PRODUCTS" || currentCategory === "Other" || currentCategory === "Uncategorized";
        const currentSku = (p.sku || "").trim();
        const isBadSku = !currentSku || currentSku === "-" || currentSku === "—";

        let bestName = currentName;
        let bestSku = currentSku;
        let bestHsn = p.hsn;

        if (isBadName || isBadSku) {
          const { data: aliases } = await supabase
            .from("grn_product_aliases")
            .select("raw_name, external_code, hsn")
            .eq("product_id", p.id);

          if (aliases && aliases.length > 0) {
            const validAlias = aliases.find(a => a.raw_name && !a.raw_name.toLowerCase().includes('unknown'));
            if (validAlias) {
              if (isBadName && validAlias.raw_name) bestName = validAlias.raw_name.trim();
              if (isBadSku && validAlias.external_code) bestSku = validAlias.external_code.trim().toUpperCase();
              if ((!bestHsn || bestHsn === '33074100') && validAlias.hsn) bestHsn = validAlias.hsn;
            }
          }

          if (isBadName && (!bestName || isBadName)) {
            const brand = p.brand || "Madhukunj";
            if (bestSku && !isBadSku) {
              bestName = `${brand} Item [${bestSku}]`;
            } else if (p.brand && p.brand.toLowerCase().includes("mk")) {
              bestName = `Madhukunj 100 Pouch`;
            } else {
              bestName = `${brand} Product`;
            }
          }

          if (isBadName && bestName) updates.name = bestName;
          if (isBadSku && bestSku) updates.sku = bestSku;
        }

        // Heal category & division to canonical FMCG taxonomy (e.g. Household Care, Spices, etc.)
        const resolvedName = updates.name ? String(updates.name) : bestName || currentName;
        const resolvedHsn = bestHsn || p.hsn;
        const correctCategory = inferTaxonomyCategory(resolvedName, undefined, resolvedHsn);
        if (correctCategory && (isBadCategory || p.division_category !== correctCategory)) {
          updates.division_category = correctCategory;
          updates.division = inferTaxonomyDivision(correctCategory);
        }

        // Heal Dozen items (Pooja, Agarbatti, Incense, Pouches sold in dozens)
        const nameForDozen = resolvedName.toLowerCase();
        const brandForDozen = (p.brand || "").toLowerCase();
        const isDozenCandidate = nameForDozen.includes("pouch") || 
          nameForDozen.includes("agarbatti") || 
          nameForDozen.includes("incense") || 
          nameForDozen.includes("dhoop") || 
          nameForDozen.includes("radhe radhe") || 
          nameForDozen.includes("real 100") || 
          nameForDozen.includes("nature series") || 
          brandForDozen.includes("madhukunj") || 
          brandForDozen.includes("mk") ||
          resolvedHsn === "33074100" ||
          p.units_per_packet === 12 ||
          p.item_pack_type === "doz";

        if (isDozenCandidate && p.preferred_sell_unit !== "doz") {
          updates.preferred_sell_unit = "doz";
          updates.units_per_packet = 12;
          updates.units_per_case = 12;
          if (!p.item_pack_type || p.item_pack_type === "packet") {
            updates.item_pack_type = "pouch";
          }
        }

        // Heal zero MRP if landed cost exists
        if ((!p.mrp || p.mrp === 0) && p.cost_price && Number(p.cost_price) > 0) {
          updates.mrp = Math.ceil(Number(p.cost_price) * 1.25);
        }

        if (Object.keys(updates).length > 0) {
          const sanitizedPayload = sanitizeProductForDb({
            ...p,
            ...updates
          });

          const { error: updateError } = await supabase
            .from("products")
            .update(sanitizedPayload)
            .eq("id", p.id);
          
          if (!updateError) count++;
          else {
            console.error('[Heal Error]', updateError);
            errorCount++;
          }
        }
      }
      
      toast.success(`Succesfully standardized ${count} products${errorCount > 0 ? `. ${errorCount} errors occurred.` : ''}`, { id: toastId });
      refetch(); 
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setHealing(false);
      setHealProgress({ current: 0, total: 0 });
    }
  };

  const deduplicateProducts = async () => {
    if (!isAdmin || healing) return;
    setHealing(true);
    const toastId = toast.loading("Analyzing catalog for duplicate products...");

    try {
      const { data: allProds, error: fetchErr } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: true });

      if (fetchErr) throw fetchErr;
      if (!allProds || allProds.length === 0) {
        toast.info("No products found to analyze", { id: toastId });
        return;
      }

      // Group products by normalized name
      const normalize = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const groups = new Map<string, typeof allProds>();

      allProds.forEach(p => {
        const key = normalize(p.name);
        if (!key) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      });

      const duplicateGroups = Array.from(groups.values()).filter(g => g.length > 1);

      if (duplicateGroups.length === 0) {
        toast.success("No duplicate products found in catalog", { id: toastId });
        return;
      }

      toast.loading(`Merging ${duplicateGroups.length} duplicate product groups...`, { id: toastId });

      let mergedCount = 0;
      let removedCount = 0;

      for (const group of duplicateGroups) {
        // Pick best keeper: prefer one with real SKU (not containing generated dashes/random), or created first
        const isGeneratedSku = (sku?: string | null) => !sku || /-[0-9]{3,}$/.test(sku) || sku.startsWith("ITEM-");
        
        const keeper = group.find(p => !isGeneratedSku(p.sku)) || group[0];
        const duplicates = group.filter(p => p.id !== keeper.id);

        // Find best SKU across group
        const bestSku = group.find(p => !isGeneratedSku(p.sku))?.sku || keeper.sku;

        for (const dup of duplicates) {
          try {
            // 1. Move invoice items to keeper
            await supabase
              .from("purchase_invoice_items")
              .update({ product_id: keeper.id })
              .eq("product_id", dup.id);

            // 2. Move order items to keeper
            await supabase
              .from("order_items")
              .update({ product_id: keeper.id })
              .eq("product_id", dup.id);

            // 3. Move aliases to keeper
            await supabase
              .from("grn_product_aliases")
              .update({ product_id: keeper.id })
              .eq("product_id", dup.id);

            // 4. Handle inventory
            const { data: dupInv } = await supabase
              .from("inventory")
              .select("*")
              .eq("product_id", dup.id);

            if (dupInv && dupInv.length > 0) {
              for (const inv of dupInv) {
                // Check if keeper has inventory in same batch
                const { data: keeperInv } = await supabase
                  .from("inventory")
                  .select("*")
                  .eq("product_id", keeper.id)
                  .limit(1)
                  .maybeSingle();

                if (keeperInv) {
                  await supabase
                    .from("inventory")
                    .update({ quantity: (keeperInv.quantity || 0) + (inv.quantity || 0) })
                    .eq("id", keeperInv.id);
                } else {
                  await supabase
                    .from("inventory")
                    .update({ product_id: keeper.id })
                    .eq("id", inv.id);
                }
              }
            }

            // 5. Delete duplicate product
            const { error: delErr } = await supabase
              .from("products")
              .delete()
              .eq("id", dup.id);

            if (!delErr) {
              removedCount++;
            }
          } catch (e) {
            console.warn("Failed to merge duplicate product:", dup.id, e);
          }
        }

        // Update keeper with best SKU if changed
        if (bestSku && keeper.sku !== bestSku) {
          await supabase
            .from("products")
            .update({ sku: bestSku })
            .eq("id", keeper.id);
        }

        mergedCount++;
      }

      toast.success(`Successfully merged ${mergedCount} groups (${removedCount} duplicates removed)`, { id: toastId });
      queryClient.invalidateQueries({ queryKey: ["products-catalog"] });
      refetch();
    } catch (err: unknown) {
      console.error("[Deduplicate Error]", err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setHealing(false);
    }
  };

  const healData = () => {
    if (!isAdmin || healing) return;
    setShowHealConfirm(true);
  };

  const openEdit = (p: Product) => {
    setInferred(null);
    setProductsActiveTab("details");
    fetchHistory(p.id);
    setEdit({ ...p });
    setOpen(true);
  };

  const save = async () => {
    if (!edit.name?.trim() || !edit.sku?.trim()) return toast.error("Name and SKU required");

    try {
      const { data: existing, error: checkError } = await supabase
        .from("products")
        .select("id")
        .eq("sku", edit.sku.trim().toUpperCase())
        .neq("id", edit.id || "")
        .maybeSingle();
      
      if (checkError) {
        console.error('[Context] SKU check failed', checkError);
        return toast.error(friendlyError(checkError));
      }
      if (existing) return toast.error(`SKU "${edit.sku.toUpperCase()}" already exists`);
    } catch (err) {
       console.error('[Context] SKU check caught error', err);
       return toast.error(friendlyError(err));
    }
    
    const normalize = (val: string | null | undefined): "pcs" | "packet" | "case" | "kg" => {
      if (!val) return "pcs";
      const v = val.toLowerCase();
      if (v === "case" || v === "ctn" || v === "carton" || v === "box" || v === "bag") return "case";
      if (v === "packet" || v === "pouch" || v === "sachet" || v === "pkt" || v === "pkg" || v === "pack") return "packet";
      if (v === "kg") return "kg";
      return "pcs";
    };

    const normType = normalize(edit.unit_type);
    if (normType !== 'pcs' && normType !== 'kg') {
      if (Number(edit.units_per_packet || 0) <= 1 && Number(edit.packets_per_case || 0) <= 1) {
        return toast.error("Configuration Required", {
          description: "For non-unit products, you must specify units per packet or packets per case to ensure correct stock deduction."
        });
      }
    }

    const { error } = await persistProductToSupabase(edit, edit.id);

    if (error) {
      console.error('[Context] save product failed', error);
      return toast.error(friendlyError(error));
    }
    toast.success(edit.id ? "Product updated" : "Product saved");
    setOpen(false); 
    refetch();
  };

  const [stats, setStats] = React.useState({ active: 0, total: 0, lowStock: 0, outOfStock: 0 });
  const [companiesWithCounts, setCompaniesWithCounts] = React.useState<{ id: string; label: string; count: number }[]>([]);

  React.useEffect(() => {
    async function fetchStats() {
      // Basic stats
      const qTotal = supabase.from("v_product_stock").select("id", { count: 'exact', head: true });
      const qActive = supabase.from("v_product_stock").select("id", { count: 'exact', head: true }).eq("is_active", true).gt("stock_base_units", 0);
      const qLow = supabase.from("v_product_stock").select("id", { count: 'exact', head: true }).eq("is_active", true).lte("stock_base_units", 10).gt("stock_base_units", 0);
      const qOut = supabase.from("v_product_stock").select("id", { count: 'exact', head: true }).eq("stock_base_units", 0);

      // Fetch companies
      const qCompanies = supabase.from("companies").select("id, name, short_code");
      
      // Fetch products for client-side mapping & counting
      const qProducts = supabase.from("v_product_stock").select("id, company_id, sku, brand, stock_base_units, is_active");

      try {
        const [rTotal, rActive, rLow, rOut, rCompanies, rProducts] = await Promise.all([
          qTotal, qActive, qLow, qOut, qCompanies, qProducts
        ]);
        
        setStats({
          total: rTotal.count || 0,
          active: rActive.count || 0,
          lowStock: rLow.count || 0,
          outOfStock: rOut.count || 0,
        });

        const companiesList = (rCompanies.data && rCompanies.data.length > 0)
          ? rCompanies.data.map(c => ({ id: c.id, name: c.name, short_code: c.short_code }))
          : [];

        // Initialize counts to 0 for all companies
        const countsMap: Record<string, number> = {};
        companiesList.forEach(c => {
          countsMap[c.id] = 0;
        });

        if (rProducts.data) {
          rProducts.data.forEach(item => {
            const typedItem = item as { stock_base_units?: number | null; is_active?: boolean | null; company_id?: string | null };
            const stockQty = Number(typedItem.stock_base_units || 0);
            const isProductActive = typedItem.is_active !== false;
            if (stockQty <= 0 || !isProductActive) {
              return;
            }

            if (typedItem.company_id && countsMap[typedItem.company_id] !== undefined) {
              countsMap[typedItem.company_id] = (countsMap[typedItem.company_id] || 0) + 1;
            }
          });
        }

        const list = companiesList.map(c => ({
          id: c.id,
          label: c.name,
          count: countsMap[c.id] || 0
        }));

        setCompaniesWithCounts(list);
      } catch (err) {
        console.error("Stats fetch failed", err);
      }
    }
    fetchStats();
  }, []);

  const categories = React.useMemo(() => {
    const activeCompanies = companiesWithCounts.filter(c => c.count > 0);
    const totalCount = activeCompanies.reduce((sum, c) => sum + c.count, 0);
    return [
      { id: ANY, label: ANY, count: totalCount },
      ...activeCompanies
    ];
  }, [companiesWithCounts]);

  return {
    isAdmin,
    state,
    setSearch,
    setCategory,
    setFilter,
    clearFilters,
    open,
    setOpen,
    edit,
    setEdit,
    inferred,
    productsActiveTab,
    setProductsActiveTab,
    showHealConfirm,
    setShowHealConfirm,
    showInactive,
    setShowInactive,
    allItems,
    stats,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    history,
    healing,
    healProgress,
    performHealData,
    healData,
    deduplicateProducts,
    openEdit,
    save,
    categories,
    empty,
    handleNameChange
  };
}
