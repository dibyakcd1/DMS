import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";
import { normalizeDivisionCategory, inferTaxonomyDivision } from "@/lib/taxonomy";
import { isProductDozenPackaging } from "@/lib/packaging";

export function useProductsCatalog(
  searchOrOptions?: string | { search?: string; category?: string; showInactive?: boolean; sort?: string; packType?: string; companyId?: string },
  category?: string,
  showInactive?: boolean,
  sort?: string,
  packType?: string,
  companyId?: string
) {
  const searchStr = typeof searchOrOptions === "string" ? searchOrOptions : searchOrOptions?.search;
  const catStr = typeof searchOrOptions === "object" ? searchOrOptions?.category : category;
  const inactiveBool = typeof searchOrOptions === "object" ? searchOrOptions?.showInactive : showInactive;
  const sortStr = typeof searchOrOptions === "object" ? searchOrOptions?.sort : sort;
  const packTypeStr = typeof searchOrOptions === "object" ? searchOrOptions?.packType : packType;
  const finalCompanyId = typeof searchOrOptions === "object" ? searchOrOptions?.companyId : companyId;

  return useInfiniteQuery({
    queryKey: ["products-catalog", searchStr, catStr, inactiveBool, sortStr, packTypeStr, finalCompanyId],
    queryFn: async ({ pageParam = 0 }) => {
      const pageSize = 20;

      // Fetch actual companies from database to map dynamically
      const { data: dbCompanies } = await supabase
        .from("companies")
        .select("id, name, short_code, accent_hex");

      const companyMap = new Map<string, { id: string; name: string; short_code: string; accent_hex: string }>();

      if (dbCompanies) {
        dbCompanies.forEach(c => {
          const mapped = {
            id: c.id,
            name: c.name,
            short_code: c.short_code,
            accent_hex: c.accent_hex || "#6366F1"
          };
          companyMap.set(c.short_code.toUpperCase(), mapped);
          companyMap.set(c.id, mapped);
        });
      }

      const buildQuery = (selectFields: string) => {
        let q = supabase
          .from("v_product_stock")
          .select(selectFields, { count: 'exact' });

        if (searchStr) {
          q = q.or(`name.ilike.%${searchStr}%,sku.ilike.%${searchStr}%`);
        }

        if (finalCompanyId && finalCompanyId !== "All") {
          q = q.eq("company_id", finalCompanyId);
        }

        if (catStr && catStr !== "All") {
          q = q.eq("division_category", catStr);
        }

        if (!inactiveBool) {
          q = q.eq("is_active", true);
        }

        if (packTypeStr && packTypeStr !== "All") {
          q = q.eq("item_pack_type", packTypeStr.toLowerCase());
        }

        // Apply sorting
        if (sortStr === 'Stock (High)') {
          q = q.order('stock_base_units', { ascending: false });
        } else if (sortStr === 'Stock (Low)') {
          q = q.order('stock_base_units', { ascending: true });
        } else if (sortStr === 'Z-A') {
          q = q.order('name', { ascending: false });
        } else {
          q = q.order('name', { ascending: true });
        }

        return q;
      };

      const selectCols = `
        id,
        name,
        sku,
        mrp,
        hsn,
        min_stock,
        is_active,
        division_category,
        division,
        unit_type,
        item_pack_type,
        packets_per_case,
        units_per_packet,
        units_per_case,
        preferred_sell_unit,
        brand,
        stock_base_units,
        avg_landed_cost,
        pack_size_value,
        pack_size_unit,
        unit,
        weight_per_unit_grams,
        company_id,
        gst_rate,
        cgst_rate,
        sgst_rate,
        igst_rate
      `;

      interface CatalogItem {
        stock_base_units?: number;
        avg_landed_cost?: number;
        company_id?: string;
        name?: string;
        hsn?: string;
        division_category?: string;
        division?: string;
        brand?: string;
        gst_rate?: number | null;
        cgst_rate?: number | null;
        sgst_rate?: number | null;
        igst_rate?: number | null;
        [key: string]: unknown;
      }

      let data: CatalogItem[] | null = null;
      let error: { code: string; message: string } | null = null;
      let count: number | null = null;

      try {
        const primaryRes = await buildQuery(selectCols).range(pageParam, pageParam + pageSize - 1);
        data = primaryRes.data;
        error = primaryRes.error;
        count = primaryRes.count;

        if (error) {
          if (error.code === '42703' || error.message?.includes('gst_rate') || error.message?.includes('column')) {
            console.warn("[useProductsCatalog] Stale PostgREST cache detected on primary query. Falling back to star select.", error.message);
            const fallbackRes = await buildQuery("*").range(pageParam, pageParam + pageSize - 1);
            data = fallbackRes.data;
            error = fallbackRes.error;
            count = fallbackRes.count;
          }
        }
      } catch (err) {
        console.warn("[useProductsCatalog] Exception in primary query. Falling back to star select.", err);
        try {
          const fallbackRes = await buildQuery("*").range(pageParam, pageParam + pageSize - 1);
          data = fallbackRes.data;
          error = fallbackRes.error;
          count = fallbackRes.count;
        } catch (fbErr) {
          throw err;
        }
      }

      if (error) throw error;

      const mappedData = (data || []).map(item => {
        const resolvedCompany = item.company_id ? companyMap.get(item.company_id) : null;
        const normCat = normalizeDivisionCategory(item.division_category, item.name, item.hsn);
        const normDiv = item.division || inferTaxonomyDivision(normCat);
        
        let resolvedBrand = item.brand;
        if (!resolvedBrand || resolvedBrand === "General / Independent Brand" || resolvedBrand === "General") {
          if (resolvedCompany) {
            resolvedBrand = resolvedCompany.name;
          }
        }

        const isDoz = isProductDozenPackaging({
          ...item,
          division_category: normCat,
          brand: resolvedBrand,
          company: resolvedCompany ? {
            id: resolvedCompany.id,
            name: resolvedCompany.name,
            short_code: resolvedCompany.short_code,
            accent_hex: resolvedCompany.accent_hex,
            logo_url: null,
            is_active: true,
            sort_order: 10,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          } : undefined
        });

        return {
          ...item,
          division_category: normCat,
          division: normDiv,
          brand: resolvedBrand,
          preferred_sell_unit: isDoz ? ((item.preferred_sell_unit && item.preferred_sell_unit !== 'unit') ? item.preferred_sell_unit : 'doz') : item.preferred_sell_unit,
          company_id: item.company_id || null,
          company: resolvedCompany ? {
            id: resolvedCompany.id,
            name: resolvedCompany.name,
            short_code: resolvedCompany.short_code,
            accent_hex: resolvedCompany.accent_hex,
            logo_url: null,
            is_active: true,
            sort_order: 10,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          } : (resolvedBrand ? {
            id: item.company_id || "brand-" + resolvedBrand,
            name: resolvedBrand,
            short_code: resolvedBrand.slice(0, 3).toUpperCase(),
            accent_hex: "#6366F1",
            logo_url: null,
            is_active: true,
            sort_order: 99,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          } : undefined),
          inventory: { 
            quantity: item.stock_base_units, 
            avg_landed_cost: item.avg_landed_cost 
          }
        };
      });

      return {
        data: mappedData,
        count: count || 0,
        nextPage: (data?.length || 0) === pageSize ? pageParam + pageSize : undefined
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}
