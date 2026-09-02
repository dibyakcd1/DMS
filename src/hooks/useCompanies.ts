import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Company } from '@/types';

export function useCompanies() {
  return useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: async () => {
      try {
        const [companiesRes, productsRes, schemesRes] = await Promise.all([
          supabase.from('companies').select('*').eq('is_active', true).order('sort_order'),
          supabase.from('v_product_stock').select('id, company_id, stock_base_units, is_active'),
          supabase.from('schemes').select('id, company_id, is_active')
        ]);

        const rawCompanies = (companiesRes.data || []) as Company[];
        if (rawCompanies.length === 0) {
          return [];
        }

        // Initialize stat tracking
        const statsMap: Record<string, { productCount: number; inStockCount: number; totalStockUnits: number; schemesCount: number }> = {};
        rawCompanies.forEach(c => {
          statsMap[c.id] = { productCount: 0, inStockCount: 0, totalStockUnits: 0, schemesCount: 0 };
        });

        // Aggregate products
        if (productsRes.data) {
          productsRes.data.forEach(item => {
            const typedItem = item as {
              id?: string;
              company_id?: string | null;
              stock_base_units?: number | null;
              is_active?: boolean | null;
            };

            if (typedItem.company_id && statsMap[typedItem.company_id]) {
              const stock = Number(typedItem.stock_base_units || 0);
              statsMap[typedItem.company_id].productCount += 1;
              if (stock > 0) {
                statsMap[typedItem.company_id].inStockCount += 1;
                statsMap[typedItem.company_id].totalStockUnits += stock;
              }
            }
          });
        }

        // Aggregate schemes
        if (schemesRes.data) {
          schemesRes.data.forEach(s => {
            const sc = s as { company_id?: string | null; is_active?: boolean | null };
            if (sc.is_active !== false && sc.company_id && statsMap[sc.company_id]) {
              statsMap[sc.company_id].schemesCount += 1;
            }
          });
        }

        return rawCompanies.map(c => ({
          ...c,
          product_count: statsMap[c.id]?.productCount ?? 0,
          in_stock_count: statsMap[c.id]?.inStockCount ?? 0,
          total_stock_units: statsMap[c.id]?.totalStockUnits ?? 0,
          active_schemes_count: statsMap[c.id]?.schemesCount ?? 0,
        })) as Company[];
      } catch (err) {
        console.warn("[useCompanies] Exception query failed:", err);
        return [];
      }
    },
    staleTime: 60 * 1000,
  });
}

