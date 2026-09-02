import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCompanies } from '@/hooks/useCompanies';
import { useSchemes, useSchemesMutations } from '@/hooks/useSchemes';
import { supabase } from '@/integrations/supabase/client';
import { Product, Scheme, SchemeType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SchemeBadge } from '@/components/schemes/SchemeBadge';
import { DEFAULT_CATEGORY_NAMES } from '@/lib/taxonomy';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Plus, 
  Edit3, 
  Loader2, 
  Trash2, 
  Calendar, 
  Target, 
  Building2, 
  Power, 
  Layers, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

export function SchemesManagementTab() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [editingScheme, setEditingScheme] = React.useState<Scheme | null>(null);
  const [deletingScheme, setDeletingScheme] = React.useState<Scheme | null>(null);

  // Form State
  const [name, setName] = React.useState('');
  const [companyId, setCompanyId] = React.useState<string>('none');
  const [schemeType, setSchemeType] = React.useState<SchemeType>('discount_pct');
  const [applyTo, setApplyTo] = React.useState<'product' | 'category' | 'global'>('global');
  const [productId, setProductId] = React.useState<string>('none');
  const [category, setCategory] = React.useState<string>('none');
  
  const [buyQty, setBuyQty] = React.useState<string>('');
  const [getQty, setGetQty] = React.useState<string>('');
  const [discountValue, setDiscountValue] = React.useState<string>('');
  const [minOrderValue, setMinOrderValue] = React.useState<string>('');
  const [minOrderQty, setMinOrderQty] = React.useState<string>('');
  
  const [validFrom, setValidFrom] = React.useState('');
  const [validTo, setValidTo] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [notes, setNotes] = React.useState('');

  // Fetch Companies
  const { data: companies } = useCompanies();

  // Fetch Schemes Catalog
  const { data: schemes, isLoading: schemesLoading } = useSchemes();
  const { create, update, remove } = useSchemesMutations();

  // Fetch Products (for dropdown mapping)
  const { data: products } = useQuery<Pick<Product, 'id' | 'name' | 'sku'>[]>({
    queryKey: ['products-minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Unique categories derived from taxonomy & products
  const { data: dbCategories } = useQuery<string[]>({
    queryKey: ['categories-distinct'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('division_category');
      const cats = (data?.map(d => d.division_category).filter(Boolean) as string[]) || [];
      return Array.from(new Set([...DEFAULT_CATEGORY_NAMES, ...cats])).sort();
    },
  });

  const categoriesList = dbCategories || DEFAULT_CATEGORY_NAMES;

  const resetForm = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().split('T')[0];

    setName('');
    setCompanyId('none');
    setSchemeType('discount_pct');
    setApplyTo('global');
    setProductId('none');
    setCategory('none');
    setBuyQty('');
    setGetQty('');
    setDiscountValue('');
    setMinOrderValue('');
    setMinOrderQty('');
    setValidFrom(todayStr);
    setValidTo(nextMonthStr);
    setIsActive(true);
    setNotes('');
    setEditingScheme(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsOpen(true);
  };

  const handleOpenEdit = (scheme: Scheme) => {
    setEditingScheme(scheme);
    setName(scheme.name || '');
    setCompanyId(scheme.company_id || 'none');
    setSchemeType(scheme.scheme_type || 'discount_pct');
    
    if (scheme.product_id) {
      setApplyTo('product');
      setProductId(scheme.product_id);
      setCategory('none');
    } else if (scheme.category && scheme.category !== 'all') {
      setApplyTo('category');
      setCategory(scheme.category);
      setProductId('none');
    } else {
      setApplyTo('global');
      setProductId('none');
      setCategory('none');
    }

    setBuyQty(scheme.buy_qty?.toString() || '');
    setGetQty(scheme.get_qty?.toString() || '');
    setDiscountValue(scheme.discount_value?.toString() || '');
    setMinOrderValue(scheme.min_order_value?.toString() || '');
    setMinOrderQty(scheme.min_order_qty?.toString() || '');
    setValidFrom(scheme.valid_from ? scheme.valid_from.split('T')[0] : new Date().toISOString().split('T')[0]);
    setValidTo(scheme.valid_to ? scheme.valid_to.split('T')[0] : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    setIsActive(scheme.is_active ?? true);
    setNotes(scheme.notes || '');
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: name.trim(),
      company_id: companyId === 'none' ? null : companyId,
      scheme_type: schemeType,
      product_id: applyTo === 'product' && productId !== 'none' ? productId : null,
      category: applyTo === 'category' && category !== 'none' ? category : (applyTo === 'global' ? 'all' : null),
      buy_qty: schemeType === 'buy_x_get_y' ? (parseInt(buyQty) || null) : null,
      get_qty: schemeType === 'buy_x_get_y' ? (parseInt(getQty) || null) : null,
      discount_value: schemeType !== 'buy_x_get_y' ? (parseFloat(discountValue) || null) : null,
      min_order_value: minOrderValue ? (parseFloat(minOrderValue) || null) : null,
      min_order_qty: minOrderQty ? (parseInt(minOrderQty) || null) : null,
      valid_from: validFrom,
      valid_to: validTo,
      is_active: isActive,
      notes: notes.trim() || null,
      created_by: null,
    };

    if (editingScheme) {
      update.mutate({ ...payload, id: editingScheme.id }, {
        onSuccess: () => {
          setIsOpen(false);
          resetForm();
        },
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          setIsOpen(false);
          resetForm();
        },
      });
    }
  };

  const handleConfirmDelete = () => {
    if (deletingScheme) {
      remove.mutate(deletingScheme.id, {
        onSuccess: () => {
          setDeletingScheme(null);
        },
        onSettled: () => {
          setDeletingScheme(null);
        }
      });
    }
  };

  const handleToggleStatus = (scheme: Scheme, e: React.MouseEvent) => {
    e.stopPropagation();
    update.mutate({
      id: scheme.id,
      is_active: !scheme.is_active
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Active Trade Schemes</h3>
          <p className="text-xs text-slate-500 mt-0.5">Manage promotional pricing, B2B wholesale schemes, and volume discount rules.</p>
        </div>

        <Button 
          id="btn-create-scheme"
          onClick={handleOpenCreate} 
          className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase flex items-center justify-center gap-1.5 h-10 sm:h-9 w-full sm:w-auto shrink-0 shadow-sm"
        >
          <Plus className="h-4 w-4" /> Create Scheme
        </Button>
      </div>

      {/* Scheme Form Dialog */}
      <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="w-[95vw] max-w-xl bg-white p-5 sm:p-6 rounded-2xl shadow-xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-bold text-lg text-slate-900">
              {editingScheme ? 'Edit Trade Scheme' : 'Create Trade Scheme'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Schemes are automatically evaluated and applied during order generation and billing when criteria match.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-name" className="text-xs font-bold text-slate-700">Scheme Display Title *</Label>
              <Input
                id="s-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Monsoon Bumper Buy-10-Get-1 or 5% Wholesale Off"
                required
                className="rounded-xl border-slate-200"
              />
            </div>

            {/* Company & Scheme Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Brand / Company Partner</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-10 bg-white">
                    <SelectValue placeholder="All Companies (Global)" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="none" className="text-xs">All Companies (Global)</SelectItem>
                    {companies?.map((co) => (
                      <SelectItem key={co.id} value={co.id} className="text-xs">
                        {co.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Incentive Mechanism *</Label>
                <Select value={schemeType} onValueChange={(v) => setSchemeType(v as SchemeType)}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-10 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="discount_pct" className="text-xs">Percentage Discount (% OFF)</SelectItem>
                    <SelectItem value="discount_flat" className="text-xs">Flat Direct Discount (₹ OFF)</SelectItem>
                    <SelectItem value="buy_x_get_y" className="text-xs">Product Freebie (Buy X Get Y Free)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Targeting Selection */}
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">Product Targeting Range</Label>
                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="applyTo"
                      checked={applyTo === 'global'}
                      onChange={() => setApplyTo('global')}
                      className="h-4 w-4 text-slate-900 border-slate-300 focus:ring-slate-900"
                    />
                    Global (Entire Catalog)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="applyTo"
                      checked={applyTo === 'category'}
                      onChange={() => setApplyTo('category')}
                      className="h-4 w-4 text-slate-900 border-slate-300 focus:ring-slate-900"
                    />
                    Category Broad
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="applyTo"
                      checked={applyTo === 'product'}
                      onChange={() => setApplyTo('product')}
                      className="h-4 w-4 text-slate-900 border-slate-300 focus:ring-slate-900"
                    />
                    Single SKU
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                {applyTo === 'product' && (
                  <>
                    <Label className="text-xs font-bold text-slate-700">Assigned Target SKU</Label>
                    <Select value={productId} onValueChange={setProductId}>
                      <SelectTrigger className="rounded-xl border-slate-200 text-xs h-10 bg-white">
                        <SelectValue placeholder="Select SKU..." />
                      </SelectTrigger>
                      <SelectContent className="bg-white max-h-[220px]">
                        <SelectItem value="none" className="text-xs">Select SKU...</SelectItem>
                        {products?.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name} ({p.sku})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}

                {applyTo === 'category' && (
                  <>
                    <Label className="text-xs font-bold text-slate-700">Assigned Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="rounded-xl border-slate-200 text-xs h-10 bg-white">
                        <SelectValue placeholder="Select Category..." />
                      </SelectTrigger>
                      <SelectContent className="bg-white max-h-[220px]">
                        <SelectItem value="none" className="text-xs">Select Category...</SelectItem>
                        {categoriesList.map((cat) => (
                          <SelectItem key={cat} value={cat} className="text-xs font-medium">
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </div>

            {/* Reward Configuration */}
            <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl space-y-3.5">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Scheme Benefit Rules</p>
              {schemeType === 'buy_x_get_y' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-buy" className="text-xs font-bold text-slate-700">Minimum Unit Purchase (X) *</Label>
                    <Input
                      id="s-buy"
                      type="number"
                      min="1"
                      value={buyQty}
                      onChange={(e) => setBuyQty(e.target.value)}
                      placeholder="e.g. 10"
                      required
                      className="rounded-xl border-slate-200 bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-get" className="text-xs font-bold text-slate-700">Free Bonus Reward (Y) *</Label>
                    <Input
                      id="s-get"
                      type="number"
                      min="1"
                      value={getQty}
                      onChange={(e) => setGetQty(e.target.value)}
                      placeholder="e.g. 1"
                      required
                      className="rounded-xl border-slate-200 bg-white"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-discount" className="text-xs font-bold text-slate-700">
                      {schemeType === 'discount_pct' ? 'Discount Percentage (%) *' : 'Flat Discount Value (₹ INR) *'}
                    </Label>
                    <Input
                      id="s-discount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={schemeType === 'discount_pct' ? 'e.g. 5 for 5%' : 'e.g. 50 for ₹50'}
                      required
                      className="rounded-xl border-slate-200 bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Additional criteria thresholds */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 border-t border-slate-200/60 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="s-minval" className="text-xs font-bold text-slate-600">Min Order Value (₹ Optional)</Label>
                  <Input
                    id="s-minval"
                    type="number"
                    step="0.01"
                    value={minOrderValue}
                    onChange={(e) => setMinOrderValue(e.target.value)}
                    placeholder="e.g. 5000"
                    className="rounded-xl border-slate-200 bg-white text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-minqty" className="text-xs font-bold text-slate-600">Min Order Units (Optional)</Label>
                  <Input
                    id="s-minqty"
                    type="number"
                    value={minOrderQty}
                    onChange={(e) => setMinOrderQty(e.target.value)}
                    placeholder="e.g. 10"
                    className="rounded-xl border-slate-200 bg-white text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Date Validity & Active state */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 border-t border-slate-100 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="s-from" className="text-xs font-bold text-slate-700">Valid From Date *</Label>
                <Input
                  id="s-from"
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  required
                  className="rounded-xl border-slate-200 bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-to" className="text-xs font-bold text-slate-700">Expiration Date *</Label>
                <Input
                  id="s-to"
                  type="date"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  required
                  className="rounded-xl border-slate-200 bg-white"
                />
              </div>
            </div>

            {/* Status and Notes */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <input
                  id="s-active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <Label htmlFor="s-active" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Scheme is Active and Tradable in Sales Orders
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="s-notes" className="text-xs font-bold text-slate-600">Notes & Terms (Optional)</Label>
                <textarea
                  id="s-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional eligibility conditions, retailer limits, or marketing campaign tags..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="rounded-xl text-slate-500">
                Cancel
              </Button>
              <Button 
                type="submit" 
                id="btn-save-scheme"
                disabled={create.isPending || update.isPending} 
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold px-5"
              >
                {create.isPending || update.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving...
                  </>
                ) : (
                  editingScheme ? 'Save Changes' : 'Launch Scheme'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={Boolean(deletingScheme)} onOpenChange={(open) => {
        if (!open) setDeletingScheme(null);
      }}>
        <AlertDialogContent className="bg-white rounded-2xl p-6 shadow-xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-600" />
              Delete Trade Scheme?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-slate-900">{deletingScheme?.name}</strong>? This action cannot be undone and will stop this incentive from applying to future orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="rounded-xl border-slate-200 text-xs font-semibold">
              Keep Scheme
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4"
            >
              {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, Delete Scheme'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schemes List */}
      {schemesLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-xs font-medium text-slate-400">Loading trade schemes...</p>
        </div>
      ) : !schemes || schemes.length === 0 ? (
        <div className="text-center py-16 text-slate-500 bg-slate-50 border rounded-2xl border-dashed border-slate-200 px-4 space-y-3">
          <Layers className="h-10 w-10 mx-auto text-slate-300" />
          <div>
            <p className="font-bold text-slate-700 text-sm">No Active Promotional Schemes</p>
            <p className="text-xs text-slate-400 mt-0.5">Click &apos;Create Scheme&apos; above to configure your first retailer trade incentive.</p>
          </div>
          <Button onClick={handleOpenCreate} variant="outline" className="rounded-xl text-xs font-bold border-slate-300">
            <Plus className="h-3.5 w-3.5 mr-1" /> Create Scheme Now
          </Button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {schemes.map((scheme) => (
            <Card 
              key={scheme.id} 
              id={`scheme-card-${scheme.id}`}
              className="border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm transition-all rounded-2xl relative overflow-hidden group cursor-pointer"
              onClick={() => handleOpenEdit(scheme)}
            >
              <div 
                className="absolute top-0 bottom-0 left-0 w-1.5" 
                style={{ backgroundColor: scheme.company?.accent_hex || (scheme.is_active ? '#059669' : '#94a3b8') }} 
              />
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between justify-start gap-3.5 text-xs">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900 text-sm leading-snug group-hover:text-indigo-600 transition-colors">
                      {scheme.name}
                    </p>
                    <SchemeBadge scheme={scheme} />
                    {!scheme.is_active ? (
                      <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none font-bold text-[9px] h-5 px-2">
                        Paused
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[9px] h-5 px-2 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-[11px] text-slate-500">
                    {scheme.company && (
                      <span className="flex items-center gap-1 shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-700">{scheme.company.name}</span>
                      </span>
                    )}

                    <span className="flex items-center gap-1 shrink-0">
                      <Target className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                        Targeting:{' '}
                        <span className="font-semibold text-slate-700">
                          {scheme.product
                            ? `SKU: ${scheme.product.name}`
                            : scheme.category && scheme.category !== 'all'
                            ? `Category: ${scheme.category}`
                            : 'All Catalog (Global)'}
                        </span>
                      </span>
                    </span>

                    <span className="flex items-center gap-1 shrink-0">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                        Valid:{' '}
                        <span className="font-semibold text-slate-700">
                          {new Date(scheme.valid_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>{' '}
                        to{' '}
                        <span className="font-semibold text-slate-700">
                          {new Date(scheme.valid_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </span>
                    </span>
                  </div>

                  {scheme.notes && (
                    <p className="text-[11px] text-slate-600 bg-slate-50/80 p-2 rounded-lg max-w-xl italic border border-slate-100 mt-1">
                      {scheme.notes}
                    </p>
                  )}
                </div>

                <div 
                  className="flex items-center gap-1.5 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Quick Toggle Active/Pause */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleToggleStatus(scheme, e)}
                    title={scheme.is_active ? 'Pause Scheme' : 'Activate Scheme'}
                    className={`h-8 px-2 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                      scheme.is_active 
                        ? 'text-slate-600 hover:text-amber-700 hover:bg-amber-50' 
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{scheme.is_active ? 'Pause' : 'Activate'}</span>
                  </Button>

                  {/* Edit Button */}
                  <Button 
                    id={`btn-edit-scheme-${scheme.id}`}
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleOpenEdit(scheme)} 
                    className="h-8 px-2.5 rounded-lg text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900 text-xs font-semibold flex items-center gap-1"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </Button>

                  {/* Delete Button */}
                  <Button 
                    id={`btn-delete-scheme-${scheme.id}`}
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setDeletingScheme(scheme)} 
                    title="Delete Scheme"
                    className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
