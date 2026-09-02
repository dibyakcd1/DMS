import { supabase } from "@/integrations/supabase/client";

/**
 * Permanently deletes a product and all of its associated records
 * (inventory batches, stock movements, price history, aliases, and line items).
 */
export async function deleteProductAndStock(productId: string): Promise<void> {
  if (!productId) return;

  // 1. Delete inventory batches
  await supabase.from("inventory_batches").delete().eq("product_id", productId);

  // 2. Delete inventory records
  await supabase.from("inventory").delete().eq("product_id", productId);

  // 3. Delete stock movements and inventory movements
  await supabase.from("stock_movements").delete().eq("product_id", productId);
  await supabase.from("inventory_movements").delete().eq("product_id", productId);

  // 4. Delete price history
  await supabase.from("product_price_history").delete().eq("product_id", productId);

  // 5. Delete price slabs
  await supabase.from("price_slabs").delete().eq("product_id", productId);

  // 6. Delete aliases
  await supabase.from("grn_product_aliases").delete().eq("product_id", productId);

  // 7. Delete purchase invoice items referencing this product
  await supabase.from("purchase_invoice_items").delete().eq("product_id", productId);

  // 8. Delete order items referencing this product
  await supabase.from("order_items").delete().eq("product_id", productId);

  // 9. Delete the product itself
  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) {
    console.error("Error deleting product:", error);
    throw error;
  }
}

/**
 * Batch deletes multiple products and their related stock records.
 */
export async function deleteMultipleProductsAndStock(productIds: string[]): Promise<{ success: number; failed: number }> {
  if (!productIds || productIds.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  for (const id of productIds) {
    try {
      await deleteProductAndStock(id);
      success++;
    } catch (err) {
      console.error(`Failed to delete product ${id}:`, err);
      failed++;
    }
  }

  return { success, failed };
}

export interface DatabaseStats {
  productsCount: number;
  batchesCount: number;
  inventoryCount: number;
  purchaseInvoicesCount: number;
  ordersCount: number;
  invoicesCount: number;
  shopsCount: number;
  customersCount: number;
  companiesCount: number;
  schemesCount: number;
  suppliersCount: number;
}

async function getTableCount(table: string): Promise<number> {
  try {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Fetches high-level database counts across core operational tables.
 */
export async function fetchDatabaseStats(): Promise<DatabaseStats> {
  const [
    productsCount,
    batchesCount,
    inventoryCount,
    purchaseInvoicesCount,
    ordersCount,
    invoicesCount,
    shopsCount,
    customersCount,
    companiesCount,
    schemesCount,
    suppliersCount
  ] = await Promise.all([
    getTableCount("products"),
    getTableCount("inventory_batches"),
    getTableCount("inventory"),
    getTableCount("purchase_invoices"),
    getTableCount("orders"),
    getTableCount("invoices"),
    getTableCount("shops"),
    getTableCount("customers"),
    getTableCount("companies"),
    getTableCount("schemes"),
    getTableCount("grn_product_aliases")
  ]);

  return {
    productsCount,
    batchesCount,
    inventoryCount,
    purchaseInvoicesCount,
    ordersCount,
    invoicesCount,
    shopsCount,
    customersCount,
    companiesCount,
    schemesCount,
    suppliersCount
  };
}

/**
 * Clears all stock ledger, batch records, and inventory entries.
 */
export async function purgeAllInventoryAndBatches(): Promise<void> {
  await supabase.from("stock_ledger").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("stock_movements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("inventory_movements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("inventory_batches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("inventory").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

/**
 * Clears all purchase invoices, invoice items, and supplier product mappings.
 */
export async function purgeAllPurchaseInvoices(): Promise<void> {
  await supabase.from("purchase_invoice_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("grn_product_aliases").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("purchase_invoices").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

/**
 * Clears all sales orders, order items, customer invoices, and payments.
 */
export async function purgeAllSalesAndOrders(): Promise<void> {
  await supabase.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("invoices").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

/**
 * Clears all products, pricing tiers, price history, and related records.
 */
export async function purgeAllProducts(): Promise<void> {
  await purgeAllInventoryAndBatches();
  await supabase.from("price_slabs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("product_price_history").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("grn_product_aliases").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("purchase_invoice_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

/**
 * Clears all schemes and promotional configurations.
 */
export async function purgeAllSchemes(): Promise<void> {
  await supabase.from("schemes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

/**
 * Clears all companies and unlinks associated product/scheme foreign keys.
 */
export async function purgeAllCompanies(): Promise<void> {
  // First clear schemes which reference companies
  await purgeAllSchemes();
  // Unlink company references in products & purchase invoices
  await supabase.from("products").update({ company_id: null }).neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("purchase_invoices").update({ company_id: null } as Record<string, unknown>).neq("id", "00000000-0000-0000-0000-000000000000");
  // Delete all companies
  await supabase.from("companies").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

/**
 * Clears all shops, outlets, custom pricing overrides, and customer registries.
 */
export async function purgeAllShopsAndCustomers(): Promise<void> {
  await supabase.from("shop_product_price_overrides").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  // Delete orders and invoices linked to shops first if they exist
  await purgeAllSalesAndOrders();
  await supabase.from("shops").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  try {
    await supabase.from("customers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  } catch {
    // Optional table
  }
}

/**
 * Clears all learned supplier mappings, aliases, and templates.
 */
export async function purgeAllSuppliersAndAliases(): Promise<void> {
  await supabase.from("grn_product_aliases").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  try {
    await supabase.from("import_mapping_templates").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  } catch {
    // Optional table
  }
}

export interface ProductionResetOptions {
  purgeStockAndBatches: boolean;
  purgePurchaseInvoices: boolean;
  purgeSalesAndOrders: boolean;
  purgeProductCatalog: boolean;
  purgeCustomers: boolean;
  purgeCompanies: boolean;
  purgeSchemes: boolean;
  purgeSuppliers: boolean;
}

/**
 * Performs a comprehensive database reset for a fresh production rollout.
 */
export async function executeProductionReset(options: ProductionResetOptions): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Purge schemes first
    if (options.purgeSchemes) {
      await purgeAllSchemes();
    }

    // 2. Purge sales & orders (foreign key dependents)
    if (options.purgeSalesAndOrders) {
      await purgeAllSalesAndOrders();
    }

    // 3. Purge purchase invoices & GRN items
    if (options.purgePurchaseInvoices) {
      await purgeAllPurchaseInvoices();
    }

    // 4. Purge supplier aliases & templates
    if (options.purgeSuppliers) {
      await purgeAllSuppliersAndAliases();
    }

    // 5. Purge stock & batches
    if (options.purgeStockAndBatches) {
      await purgeAllInventoryAndBatches();
    }

    // 6. Purge product catalog if requested
    if (options.purgeProductCatalog) {
      await purgeAllProducts();
    }

    // 7. Purge companies if requested
    if (options.purgeCompanies) {
      await purgeAllCompanies();
    }

    // 8. Purge shops/customers if requested
    if (options.purgeCustomers) {
      await purgeAllShopsAndCustomers();
    }

    return {
      success: true,
      message: "Database cleanup completed successfully. Selected modules have been reset."
    };
  } catch (err: unknown) {
    console.error("Error executing production reset:", err);
    throw err;
  }
}

import { inferTaxonomyCategory, inferTaxonomyDivision } from "@/lib/taxonomy";

/**
 * Finds and repairs any products or aliases named 'Unknown', 'Unknown Product', with empty names,
 * or with legacy 'SPECIAL PRODUCTS' category. Restores real names from GRN invoice aliases.
 */
export async function healUnknownProducts(): Promise<{ repaired: number; purgedAliases: number }> {
  let repaired = 0;
  let purgedAliases = 0;

  try {
    // 1. Clean up any unknown/noise aliases from grn_product_aliases
    const { data: badAliases } = await supabase
      .from("grn_product_aliases")
      .select("id, raw_name, external_code")
      .or("raw_name.ilike.unknown,raw_name.ilike.unknown product,raw_name.ilike.null");

    if (badAliases && badAliases.length > 0) {
      const idsToDelete = badAliases
        .filter(a => !a.external_code || a.external_code.toLowerCase().includes('unknown'))
        .map(a => a.id);

      if (idsToDelete.length > 0) {
        await supabase.from("grn_product_aliases").delete().in("id", idsToDelete);
        purgedAliases = idsToDelete.length;
      }
    }

    // 2. Fetch all products to inspect both placeholder names and misclassified categories
    const { data: allProducts } = await supabase
      .from("products")
      .select("*");

    if (allProducts && allProducts.length > 0) {
      for (const prod of allProducts) {
        const currentName = (prod.name || "").trim();
        const isBadName = !currentName || 
          ['unknown', 'unknown product', 'unknown item', 'null', 'undefined', 'item', 'n/a', 'na'].includes(currentName.toLowerCase());

        const currentCategory = (prod.division_category || "").trim();
        const isBadCategory = !currentCategory || currentCategory === "SPECIAL PRODUCTS" || currentCategory === "Other" || currentCategory === "Uncategorized";

        const currentSku = (prod.sku || "").trim();
        const isBadSku = !currentSku || currentSku === "-" || currentSku === "—";

        if (isBadName || isBadCategory || isBadSku || !prod.mrp || prod.mrp === 0) {
          const updates: Record<string, unknown> = {};

          // Look up alias table for original invoice name
          let bestName = currentName;
          let bestSku = currentSku;
          let bestHsn = prod.hsn;

          const { data: aliases } = await supabase
            .from("grn_product_aliases")
            .select("raw_name, external_code, hsn")
            .eq("product_id", prod.id);

          if (aliases && aliases.length > 0) {
            const validAlias = aliases.find(a => a.raw_name && !a.raw_name.toLowerCase().includes('unknown'));
            if (validAlias) {
              if (isBadName && validAlias.raw_name) {
                bestName = validAlias.raw_name.trim();
              }
              if (isBadSku && validAlias.external_code) {
                bestSku = validAlias.external_code.trim().toUpperCase();
              }
              if ((!bestHsn || bestHsn === '33074100') && validAlias.hsn) {
                bestHsn = validAlias.hsn;
              }
            }
          }

          // If still bad name, generate meaningful fallback
          if (!bestName || isBadName) {
            const brand = prod.brand || "Madhukunj";
            if (bestSku && !isBadSku) {
              bestName = `${brand} Item [${bestSku}]`;
            } else if (prod.brand && prod.brand.toLowerCase().includes("mk")) {
              bestName = `Madhukunj 100 Pouch`;
            } else {
              bestName = `${brand} Product`;
            }
          }

          if (isBadName || bestName !== prod.name) {
            updates.name = bestName;
          }

          // Fix SKU
          if (isBadSku || !bestSku) {
            const prefix = (prod.brand || "ITEM").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();
            updates.sku = `${prefix}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          } else if (bestSku !== prod.sku) {
            updates.sku = bestSku;
          }

          // Fix Category & Division
          const correctCat = inferTaxonomyCategory(bestName, undefined, bestHsn || prod.hsn);
          if (correctCat && (isBadCategory || prod.division_category !== correctCat)) {
            updates.division_category = correctCat;
            updates.division = inferTaxonomyDivision(correctCat);
          }

          // Fix MRP if 0 and cost exists
          if ((!prod.mrp || prod.mrp === 0)) {
            const cost = Number(prod.cost_price) || 0;
            if (cost > 0) {
              updates.mrp = Math.ceil(cost * 1.25);
            }
          }

          if (Object.keys(updates).length > 0) {
            await supabase
              .from("products")
              .update(updates)
              .eq("id", prod.id);

            repaired++;
          }
        }
      }
    }
  } catch (err) {
    console.error("Error healing unknown products:", err);
  }

  return { repaired, purgedAliases };
}
