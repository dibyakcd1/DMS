import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { useCompanies } from '@/hooks/useCompanies';
import { useProductsCatalog } from '@/hooks/useProductsCatalog';
import { useActiveSchemes } from '@/hooks/useSchemes';
import { ProductCard } from '@/components/products/ProductCard';
import { SchemeBadge } from '@/components/schemes/SchemeBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProductDrawer } from '@/components/products/ProductDrawer';
import { useAuth } from '@/context/AuthContextCore';
import { ArrowLeft, Loader2, Search, Percent, Plus, Settings, Sparkles, Building2, LayoutGrid, Info, Package, CheckCircle2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { formatDivisionCategory } from '@/lib/format';

export default function CompanyProducts() {
  const { id: companyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isAdmin = roles.includes('admin') || roles.includes('owner');

  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

  // Debounce search
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load companies to find current
  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const company = companies?.find((c) => c.id === companyId);

  // Load products catalog
  const {
    data: catalogData,
    isLoading: productsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchProducts,
  } = useProductsCatalog({
    companyId,
    search: debouncedSearch,
    showInactive: true, // Show all products of the company
  });

  // Load active schemes
  const { data: activeSchemes, isLoading: schemesLoading } = useActiveSchemes(companyId);

  const products = catalogData?.pages?.flatMap((page) => page.data) || [];

  const handleProductClick = (productId: string) => {
    setSelectedProductId(productId);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setSelectedProductId(null);
    refetchProducts();
  };

  if (companiesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate('/catalog')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> FMCG Catalog
        </Button>
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-sm">
          Target company not found. It might be inactive or deleted.
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto px-4 py-8">
      {/* Back to FmcgCatalog picker */}
      <Button 
        variant="ghost" 
        onClick={() => navigate('/catalog')} 
        className="mb-6 hover:bg-slate-100 rounded-lg text-slate-600 px-3 py-1.5 h-auto text-xs font-semibold"
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Companies
      </Button>

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8 p-6 rounded-2xl border border-slate-100 bg-white shadow-sm relative overflow-hidden">
        <div 
          className="absolute top-0 left-0 bottom-0 w-1.5"
          style={{ backgroundColor: company.accent_hex }}
        />
        <div className="flex items-center gap-4">
          <div 
            className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 border shadow-sm"
            style={{ backgroundColor: company.accent_hex + '10', borderColor: company.accent_hex + '20' }}
          >
            <Building2 
              className="h-7 w-7" 
              style={{ color: company.accent_hex }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-slate-900 leading-tight">
                {company.name}
              </h1>
              <span 
                className="text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider shadow-sm border border-transparent whitespace-nowrap"
                style={{ 
                  backgroundColor: company.accent_hex + '18', 
                  color: company.accent_hex,
                  borderColor: company.accent_hex + '25'
                }}
              >
                {company.short_code}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl">
              Browsing {company.name} catalog and active marketing incentive campaigns.
            </p>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2.5 mt-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs">
                <Package className="h-3.5 w-3.5 text-slate-500" />
                <span>{company.product_count ?? products.length} {company.product_count === 1 ? 'Product' : 'Products'}</span>
              </span>

              <span className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold",
                (company.in_stock_count ?? 0) > 0 
                  ? "bg-emerald-50 text-emerald-700" 
                  : "bg-slate-50 text-slate-400"
              )}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{company.in_stock_count ?? 0} In Stock</span>
              </span>

              {(company.active_schemes_count ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                  <Tag className="h-3 w-3" />
                  <span>{company.active_schemes_count} Active {company.active_schemes_count === 1 ? 'Scheme' : 'Schemes'}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {isAdmin && (
          <Button
            onClick={() => navigate('/settings?tab=schemes')}
            className="shrink-0 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 text-white gap-2 flex items-center shadow-lg"
          >
            <Settings className="h-4 w-4" />
            Manage Schemes
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left 3 columns: Catalog List */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-slate-400" />
                Company Products
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {products.length} {products.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Live Search */}
            <div className="relative w-full max-w-xs shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 rounded-xl border-slate-200 focus:ring-slate-900 font-medium text-sm w-full h-9 shadow-sm bg-white"
              />
            </div>
          </div>

          {productsLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading products...</span>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 text-slate-500 bg-slate-50 border rounded-2xl flex flex-col items-center gap-3">
              <Search className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold">No products found for this query in the catalog.</p>
              <p className="text-xs text-slate-400">Try adjusting your search criteria or check that products are linked to {company.name}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {products.map((item) => (
                <ProductCard
                  key={item.id}
                  product={item}
                  onClick={() => handleProductClick(item.id)}
                  viewMode="grid"
                />
              ))}
            </div>
          )}

          {/* Load More Button */}
          {hasNextPage && (
            <div className="flex items-center justify-center pt-4">
              <Button
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
                className="rounded-xl px-6 py-2 border-slate-200 text-slate-800 hover:bg-slate-50 h-auto font-bold text-xs uppercase"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More Products'
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Right 1 column: Schemes Panel */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex flex-col min-h-[400px]">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b pb-4 mb-4">
              <Percent className="h-4 w-4 text-emerald-500" />
              Currently Active Schemes
            </h3>

            {schemesLoading ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Loading...</span>
              </div>
            ) : !activeSchemes || activeSchemes.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 py-12 text-center text-slate-400 gap-3">
                <div className="h-10 w-10 bg-slate-50 rounded-full flex items-center justify-center">
                  <Percent className="h-5 w-5 text-slate-300" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">No Active Campaigns</p>
                  <p className="text-[11px] text-slate-400 max-w-[200px] mx-auto">
                    There are no current trade schemes configured for {company.name} at this time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex-1 overflow-y-auto max-h-[450px] pr-1">
                {activeSchemes.map((scheme) => (
                  <div 
                    key={scheme.id} 
                    className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/50 transition-all text-xs relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-2.5 mb-1.5">
                      <p className="font-bold text-slate-900 pr-1 leading-tight">{scheme.name}</p>
                      <SchemeBadge scheme={scheme} />
                    </div>

                    {scheme.product && (
                      <p className="text-[10px] font-semibold text-slate-500 mb-1">
                        Product: <span className="text-slate-800">{scheme.product.name}</span>
                      </p>
                    )}

                    {scheme.category && (
                      <p className="text-[10px] font-semibold text-slate-500 mb-1">
                        Category: <span className="text-slate-800 uppercase tracking-tight">{scheme.category}</span>
                      </p>
                    )}

                    {scheme.notes && (
                      <p className="text-[10px] text-slate-400 italic mt-2.5 bg-white/60 p-2 rounded-lg border border-slate-200/40">
                        {scheme.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-200/40 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      <span>Until:</span>
                      <span className="text-slate-600">
                        {new Date(scheme.valid_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Drawer inside catalog for details/editing */}
      {selectedProductId && (
        <ProductDrawer
          productId={selectedProductId}
          isOpen={isDrawerOpen}
          onClose={handleDrawerClose}
        />
      )}
    </div>
  );
}
