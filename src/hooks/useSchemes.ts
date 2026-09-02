import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Scheme } from '@/types';
import { toast } from 'sonner';

export function useSchemes(companyId?: string) {
  return useQuery<Scheme[]>({
    queryKey: ['schemes', companyId],
    queryFn: async () => {
      try {
        let q = supabase
          .from('schemes')
          .select(`*, company:companies(*), product:products(id,name,sku)`)
          .order('valid_from', { ascending: false });

        if (companyId) q = q.eq('company_id', companyId);

        const { data, error } = await q;
        if (error) {
          console.warn("[useSchemes] Table query error:", error.message);
          return [];
        }
        return (data || []) as Scheme[];
      } catch (err) {
        console.warn("[useSchemes] Query failed:", err);
        return [];
      }
    },
  });
}

export function useActiveSchemes(companyId?: string) {
  const today = new Date().toISOString().split('T')[0];
  return useQuery<Scheme[]>({
    queryKey: ['schemes', 'active', companyId],
    queryFn: async () => {
      try {
        let q = supabase
          .from('schemes')
          .select(`*, company:companies(*), product:products(id,name,sku)`)
          .eq('is_active', true)
          .lte('valid_from', today)
          .gte('valid_to', today);

        if (companyId) q = q.eq('company_id', companyId);

        const { data, error } = await q;
        if (error) {
          console.warn("[useActiveSchemes] Table query error:", error.message);
          return [];
        }
        return (data || []) as Scheme[];
      } catch (err) {
        console.warn("[useActiveSchemes] Query failed:", err);
        return [];
      }
    },
    staleTime: 60 * 1000,
  });
}

export function useSchemesMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async (scheme: {
      name: string;
      company_id: string | null;
      scheme_type: 'buy_x_get_y' | 'discount_pct' | 'discount_flat';
      product_id: string | null;
      category: string | null;
      buy_qty: number | null;
      get_qty: number | null;
      discount_value: number | null;
      min_order_value: number | null;
      min_order_qty: number | null;
      valid_from: string;
      valid_to: string;
      is_active: boolean;
      notes: string | null;
      created_by?: string | null;
    }) => {
      const cleanData: Record<string, unknown> = { ...scheme };
      delete cleanData.company;
      delete cleanData.product;
      delete cleanData.id;

      const { data, error } = await supabase
        .from('schemes')
        .insert(cleanData as never)
        .select(`*, company:companies(*), product:products(id,name,sku)`)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['schemes'] }); 
      toast.success('Trade scheme created successfully'); 
    },
    onError: (e: Error) => toast.error(`Failed to create scheme: ${e.message}`),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Scheme> & { id: string }) => {
      const cleanData: Record<string, unknown> = { ...rest };
      delete cleanData.company;
      delete cleanData.product;
      delete cleanData.created_at;
      delete cleanData.id;

      const isFallbackId = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      if (isFallbackId) {
        // Convert client-side fallback into a real persisted scheme
        const { data, error } = await supabase
          .from('schemes')
          .insert(cleanData as never)
          .select(`*, company:companies(*), product:products(id,name,sku)`)
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from('schemes')
        .update({ ...cleanData, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
        .select(`*, company:companies(*), product:products(id,name,sku)`)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        // Fallback insert if not found
        const { data: inserted, error: insErr } = await supabase
          .from('schemes')
          .insert(cleanData as never)
          .select(`*, company:companies(*), product:products(id,name,sku)`)
          .single();
        if (insErr) throw insErr;
        return inserted;
      }
      return data;
    },
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['schemes'] }); 
      toast.success('Trade scheme updated successfully'); 
    },
    onError: (e: Error) => toast.error(`Failed to update scheme: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const isFallbackId = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (!isFallbackId) {
        const { error } = await supabase.from('schemes').delete().eq('id', id);
        if (error) {
          console.warn("[useSchemesMutations] Delete returned error:", error.message);
        }
      }
      return id;
    },
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['schemes'] }); 
      toast.success('Trade scheme deleted'); 
    },
    onError: (e: Error) => toast.error(`Failed to delete scheme: ${e.message}`),
  });

  return { create, update, remove };
}
