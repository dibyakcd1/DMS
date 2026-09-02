import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { useCompanies } from '@/hooks/useCompanies';
import { Building2, ChevronRight, Loader2, Package, CheckCircle2, Tag, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

export default function FmcgCatalog() {
  const navigate = useNavigate();
  const { data: companies, isLoading, error } = useCompanies();

  return (
    <div className="container max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="FMCG Company Catalog"
        description="Select a distribution partner company to browse their catalog and manage scheme parameters."
      />

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-sm">
          Failed to load FMCG companies: {error.message}
        </div>
      ) : !companies || companies.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-50 border rounded-2xl">
          No FMCG companies are configured or active.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {companies.map((company) => {
            const productCount = company.product_count || 0;
            const inStockCount = company.in_stock_count || 0;
            const schemesCount = company.active_schemes_count || 0;

            return (
              <motion.div
                key={company.id}
                whileHover={{ y: -4 }}
                onClick={() => navigate(`/catalog/${company.id}`)}
                className="group flex flex-col justify-between p-6 rounded-2xl border border-slate-200 bg-white shadow-sm cursor-pointer hover:shadow-md transition-all relative overflow-hidden min-h-[190px]"
              >
                {/* Highlight ribbon with company's accent color */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1.5 transition-colors"
                  style={{ backgroundColor: company.accent_hex }}
                />

                <div>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div 
                        className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border"
                        style={{ 
                          backgroundColor: company.accent_hex + '12',
                          borderColor: company.accent_hex + '25'
                        }}
                      >
                        <Building2 
                          className="h-6 w-6" 
                          style={{ color: company.accent_hex }}
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 group-hover:text-slate-800 transition-colors text-base break-words leading-tight">
                          {company.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span 
                            className="inline-flex text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap"
                            style={{ 
                              backgroundColor: company.accent_hex + '18', 
                              color: company.accent_hex 
                            }}
                          >
                            {company.short_code}
                          </span>
                          {schemesCount > 0 && (
                            <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 border-amber-200 bg-amber-50 text-amber-800 flex items-center gap-1">
                              <Tag className="h-2.5 w-2.5" />
                              {schemesCount} {schemesCount === 1 ? 'Scheme' : 'Schemes'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all shrink-0">
                      <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>

                {/* Stat pills & Product count metrics */}
                <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs">
                      <Package className="h-3.5 w-3.5 text-slate-500" />
                      <span>{productCount} {productCount === 1 ? 'Product' : 'Products'}</span>
                    </span>
                    
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold",
                      inStockCount > 0 
                        ? "bg-emerald-50 text-emerald-700" 
                        : "bg-slate-50 text-slate-400"
                    )}>
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{inStockCount} In Stock</span>
                    </span>
                  </div>

                  <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-900 transition-colors uppercase tracking-wider flex items-center gap-0.5 shrink-0">
                    Browse
                    <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
