import * as React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Phone, MapPin, Edit2, MapPinned, Store, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { fmtINR } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { useFilters } from "@/hooks/useFilters";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { ListCard } from "@/components/ListCard";
import { ShopProfileContent } from "@/components/ShopProfileContent";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Shop = {
  id: string; name: string; owner_name: string | null; phone: string | null;
  address: string | null; gstin: string | null; credit_limit: number; is_active: boolean;
  shop_type: "premium" | "gold" | "silver" | "bronze" | "basic" | null;
  discount_pct: number;
};

const empty: Partial<Shop> = { name: "", owner_name: "", phone: "", address: "", gstin: "", credit_limit: 0, is_active: true, shop_type: "silver", discount_pct: 0 };

import { useShops } from "@/hooks/useShops";
import { useQueryClient } from "@tanstack/react-query";

import { useIsMobile } from "@/lib/responsive";
import { 
  ResponsiveContainer, 
  AdaptiveTable
} from "@/components/ui/responsive-ui";
import { AddShopDialog } from "@/components/AddShopDialog";

export default function Shops() {
  const { isAdmin, roles } = useAuth();
  const isSalesperson = roles.includes("salesperson");
  const canAdd = isAdmin || isSalesperson;
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showInactive, setShowInactive] = React.useState(false);
  const { data: shops, isLoading } = useShops(showInactive);

  const { 
    state, 
    debouncedSearch, 
    setSearch, 
    setCategory, 
    setFilter, 
    reset: clearFilters 
  } = useFilters({ category: 'All' });

  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [edit, setEdit] = React.useState<Partial<Shop> | undefined>(undefined);
  const [selectedShopId, setSelectedShopId] = React.useState<string | null>(null);

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["shops"] });
    setIsAddDialogOpen(false);
  };

  const filtered = (shops ?? []).filter(s => {
    const txt = debouncedSearch.toLowerCase();
    const matchesSearch = s.name.toLowerCase().includes(txt) || 
      (s.phone && s.phone.includes(txt)) || 
      (s.owner_name && s.owner_name.toLowerCase().includes(txt));
    
    const matchesCategory = state.category === 'All' || (s.shop_type && s.shop_type.toLowerCase() === state.category.toLowerCase());
    
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    const sort = state.filters.sort || 'Name (A-Z)';
    if (sort === 'Name (A-Z)') return a.name.localeCompare(b.name);
    if (sort === 'Name (Z-A)') return b.name.localeCompare(a.name);
    if (sort === 'Credit (Low)') return a.credit_limit - b.credit_limit;
    if (sort === 'Credit (High)') return b.credit_limit - a.credit_limit;
    return 0;
  });

  const shopCategories = [
    { label: 'All', count: shops?.length || 0 },
    { label: 'Premium', count: (shops ?? []).filter(s => s.shop_type === 'premium').length },
    { label: 'Gold', count: (shops ?? []).filter(s => s.shop_type === 'gold').length },
    { label: 'Silver', count: (shops ?? []).filter(s => s.shop_type === 'silver').length },
    { label: 'Bronze', count: (shops ?? []).filter(s => s.shop_type === 'bronze').length },
    { label: 'Basic', count: (shops ?? []).filter(s => s.shop_type === 'basic').length },
  ];

  const shopFilters = [
    { 
      id: 'sort', 
      label: 'Sort By', 
      icon: 'sort' as const, 
      options: ['Name (A-Z)', 'Name (Z-A)', 'Credit (Low)', 'Credit (High)'] 
    }
  ];

  return (
    <div className="pb-24">
      <PageHeader
        title="Shops"
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/")}
        actionLabel="Add shop"
        onAction={canAdd ? () => { setEdit(empty); setIsAddDialogOpen(true); } : undefined}
        actionIcon={<Plus className="mr-2 h-5 w-5" />}
      />
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-2">
        <div className="flex-1 w-full glass-panel rounded-3xl p-1.5 shadow-md border border-white/30">
          <SearchFilterBar
            categories={shopCategories}
            filters={shopFilters}
            totalCount={filtered.length}
            currentSearch={state.search}
            currentCategory={state.category}
            currentFilters={state.filters}
            onSearchChange={setSearch}
            onCategoryChange={setCategory}
            onFilterChange={setFilter}
            onClearFilters={clearFilters}
          />
        </div>
        <div className="flex items-center gap-2 glass-panel px-4 py-3 rounded-2xl border border-white/30 shadow-md shrink-0">
          <Label htmlFor="show-inactive-shops" className="text-[10px] font-black text-muted-foreground uppercase tracking-widest cursor-pointer whitespace-nowrap opacity-60">
            Show Inactive
          </Label>
          <Switch 
            id="show-inactive-shops" 
            checked={showInactive} 
            onCheckedChange={setShowInactive}
            className="scale-90 data-[state=checked]:bg-primary"
          />
        </div>
      </div>

      {!isLoading && shops?.length === 0 ? (
        <Card className="border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50 py-24 shadow-none">
          <CardContent className="flex flex-col items-center justify-center text-center space-y-6">
            <div className="h-20 w-20 rounded-full bg-white shadow-xl flex items-center justify-center text-slate-300">
              <Store size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900">No shops added yet.</h3>
              <p className="text-sm font-medium text-slate-500 max-w-xs mx-auto">
                Add your first shop to get started with distribution and orders.
              </p>
            </div>
            {canAdd && (
              <Button 
                onClick={() => { setEdit(empty); setIsAddDialogOpen(true); }}
                className="rounded-xl h-12 px-8 font-bold shadow-lg shadow-primary/20 bg-primary text-white"
              >
                <Plus className="mr-2 h-5 w-5" />
                Add your first shop
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <AdaptiveTable
          data={filtered}
          isLoading={isLoading}
          emptyMessage={debouncedSearch || state.category !== 'All' ? "No results found for your search." : "No shops found."}
          onRowClick={(s) => {
            if (window.innerWidth >= 1024) setSelectedShopId(s.id);
            else navigate(`/shops/${s.id}`);
          }}
          columns={[
            {
              header: "Shop Name",
              accessorKey: "name",
              className: "font-black text-slate-900 tracking-tight",
            },
            {
              header: "Owner",
              accessorKey: "owner_name",
              className: "text-muted-foreground font-medium",
              hideOnMobile: true,
            },
            {
              header: "Type",
              id: "type",
              render: (s) => (
                <Badge variant="outline" className={cn(
                  "capitalize py-0.5 px-2.5 text-[10px] font-black rounded-full border-none shadow-none",
                  s.shop_type === 'premium' ? "bg-violet-50 text-violet-700" :
                  s.shop_type === 'gold' ? "bg-amber-50 text-amber-700" :
                  s.shop_type === 'silver' ? "bg-slate-50 text-slate-700" : "bg-stone-50 text-stone-700"
                )}>
                  {s.shop_type || "basic"}
                </Badge>
              ),
            },
            {
              header: "Credit Limit",
              accessorKey: "credit_limit",
              className: "text-right font-black tabular-nums text-foreground",
              render: (s) => fmtINR(s.credit_limit),
            },
          ]}
          renderMobileCard={(s) => (
            <ShopCard 
              shop={s} 
              onEdit={isAdmin ? () => { setEdit(s); setIsAddDialogOpen(true); } : undefined} 
              onSelect={() => navigate(`/shops/${s.id}`)}
            />
          )}
        />
      )}

      <AddShopDialog 
        open={isAddDialogOpen} 
        onOpenChange={setIsAddDialogOpen} 
        initialData={edit} 
        onSuccess={handleSuccess} 
      />

      <Sheet open={!!selectedShopId} onOpenChange={(open) => !open && setSelectedShopId(null)}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("p-0 focus:outline-none border-l border-slate-100 shadow-2xl overflow-hidden flex flex-col", isMobile ? "h-[92dvh] rounded-t-[2.5rem]" : "w-full md:max-w-2xl")}>
           {selectedShopId && <ShopProfileContent id={selectedShopId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ShopCard({ shop: s, onEdit, onSelect }: { shop: Shop; onEdit?: () => void; onSelect?: () => void }) {
  const navigate = useNavigate();
  const tierColorMap = {
    premium: "bg-violet-50 text-violet-700 border-violet-100",
    gold: "bg-amber-50 text-amber-700 border-amber-100",
    silver: "bg-slate-50 text-slate-700 border-slate-100",
    bronze: "bg-orange-50 text-orange-700 border-orange-100",
    basic: "bg-stone-50 text-stone-700 border-stone-100",
  };

  return (
    <ListCard
      title={s.name}
      subtitle={s.owner_name || "No owner"}
      badge={
        <div className="flex gap-1">
          {!s.is_active && (
            <Badge variant="destructive" className="py-0 px-2 text-[9px] font-bold rounded-md border-none shadow-none">
              Inactive
            </Badge>
          )}
          <Badge variant="outline" className={cn(
            "capitalize py-0.5 px-2.5 text-[10px] font-bold rounded-full border-none shadow-none",
            tierColorMap[s.shop_type || "basic"]
          )}>
            {s.shop_type || "basic"}
          </Badge>
        </div>
      }
      meta={
        <div className="space-y-2 min-h-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 min-w-0">
              <Phone className="h-3 w-3 opacity-50 shrink-0" />
              <span className="whitespace-normal break-words">{s.phone || "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="h-3 w-3 opacity-50 shrink-0" />
              <span className="whitespace-normal break-words">{s.address || "—"}</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-40">Credit Limit</p>
              <p className="text-sm font-bold text-foreground">{fmtINR(s.credit_limit)}</p>
            </div>
            {onEdit && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-lg" 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
      }
      onClick={onSelect || (() => navigate(`/shops/${s.id}`))}
      className={cn(!s.is_active && "grayscale-[0.5] opacity-80")}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground ml-0.5">{label}</Label>
      {children}
    </div>
  );
}

function SheetHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("space-y-1.5 text-center sm:text-left", className)}>{children}</div>;
}
