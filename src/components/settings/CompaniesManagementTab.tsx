import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Company } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Loader2, Save, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export function CompaniesManagementTab() {
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = React.useState(false);
  const [editingCompany, setEditingCompany] = React.useState<Company | null>(null);

  // Form State
  const [name, setName] = React.useState('');
  const [shortCode, setShortCode] = React.useState('');
  const [accentHex, setAccentHex] = React.useState('#4F46E5');
  const [isActive, setIsActive] = React.useState(true);
  const [sortOrder, setSortOrder] = React.useState(0);

  // Fetch Companies
  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ['companies-all'], // load all companies including inactive ones for management
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data as Company[];
    },
  });

  const resetForm = () => {
    setName('');
    setShortCode('');
    setAccentHex('#4F46E5');
    setIsActive(true);
    setSortOrder(companies ? companies.length * 10 : 0);
    setEditingCompany(null);
  };

  React.useEffect(() => {
    if (editingCompany) {
      setName(editingCompany.name);
      setShortCode(editingCompany.short_code);
      setAccentHex(editingCompany.accent_hex || '#4F46E5');
      setIsActive(editingCompany.is_active);
      setSortOrder(editingCompany.sort_order);
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCompany]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        short_code: shortCode.trim().toUpperCase(),
        accent_hex: accentHex,
        is_active: isActive,
        sort_order: sortOrder,
      };

      if (editingCompany) {
        const { error } = await supabase
          .from('companies')
          .update(payload)
          .eq('id', editingCompany.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('companies')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['companies-all'] });
      toast.success(editingCompany ? 'Company updated' : 'Company added');
      setIsOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // 1. Delete associated schemes for this company
      try {
        await supabase.from('schemes').delete().eq('company_id', id);
      } catch (e) {
        console.warn('Could not delete schemes for company:', e);
      }

      // 2. Unlink any products referencing this company
      try {
        await supabase.from('products').update({ company_id: null }).eq('company_id', id);
      } catch (e) {
        console.warn('Could not unlink products for company:', e);
      }

      // 3. Unlink purchase invoices referencing this company
      try {
        await supabase.from('purchase_invoices').update({ company_id: null } as Record<string, unknown>).eq('company_id', id);
      } catch (e) {
        console.warn('Could not unlink purchase invoices for company:', e);
      }

      // 4. Delete the company record
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['companies-all'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Company deleted successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not delete company');
    },
  });

  const handleEditClick = (company: Company) => {
    setEditingCompany(company);
    setIsOpen(true);
  };

  const handleCreateClick = () => {
    setEditingCompany(null);
    setIsOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">FMCG Distribution Partners</h3>
          <p className="text-xs text-slate-400 mt-0.5">Configure company divisions, short codes, and visual branding accents.</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreateClick} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase flex items-center justify-center gap-1.5 h-10 sm:h-9 w-full sm:w-auto shrink-0">
              <Plus className="h-4 w-4" /> Add Company
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-md bg-white p-4 sm:p-6 rounded-2xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="font-bold text-lg text-slate-900">
                {editingCompany ? 'Edit Distribution Partner' : 'Add New Partner'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Visual brand presets dictate the display badges and accents of catalog lists globally.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-name" className="text-xs font-bold text-slate-500">Company Name</Label>
                <Input
                  id="c-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Tata Consumer Products"
                  required
                  className="rounded-xl border-slate-200"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="c-code" className="text-xs font-bold text-slate-500">Short Code (Unique)</Label>
                  <Input
                    id="c-code"
                    value={shortCode}
                    onChange={(e) => setShortCode(e.target.value)}
                    placeholder="e.g. TATA"
                    required
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-accent" className="text-xs font-bold text-slate-500">Accent color (Hex)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="c-accent"
                      type="color"
                      value={accentHex}
                      onChange={(e) => setAccentHex(e.target.value)}
                      className="w-10 h-10 p-1 border rounded-lg shrink-0 cursor-pointer"
                    />
                    <Input
                      value={accentHex}
                      onChange={(e) => setAccentHex(e.target.value)}
                      placeholder="#4F46E5"
                      required
                      className="rounded-xl border-slate-200 font-mono text-xs uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="c-order" className="text-xs font-bold text-slate-500">Sort Order</Label>
                  <Input
                    id="c-order"
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2 sm:pt-6">
                  <input
                    id="c-active"
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <Label htmlFor="c-active" className="text-xs font-bold text-slate-700 cursor-pointer">Is Active</Label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="rounded-xl text-slate-500">
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold px-5">
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Partner'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : !companies || companies.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-50 border rounded-2xl border-dashed px-4 text-xs">
          No companies registered. Click 'Add Company' to register the first partner.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          {companies.map((co) => (
            <Card key={co.id} className="border border-slate-200/60 bg-white hover:shadow-sm transition-all rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 bottom-0 left-0 w-1.5" style={{ backgroundColor: co.accent_hex }} />
              <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div 
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{ backgroundColor: co.accent_hex + '10', borderColor: co.accent_hex + '20' }}
                  >
                    <Building2 className="h-5 w-5" style={{ color: co.accent_hex }} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900 text-sm truncate">{co.name}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span 
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ backgroundColor: co.accent_hex + '15', color: co.accent_hex }}
                      >
                        {co.short_code}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">Order: {co.sort_order}</span>
                      {!co.is_active && (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-400 font-bold border-none text-[8px] h-4">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => handleEditClick(co)} className="h-8 w-8 text-slate-500 hover:text-slate-800 rounded-lg">
                    <Edit size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm('Are you sure you want to delete this partner?')) deleteMutation.mutate(co.id); }} className="h-8 w-8 text-slate-400 hover:text-rose-600 rounded-lg">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
