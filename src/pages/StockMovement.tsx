import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/AuthContextCore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowRightLeft, 
  X, 
  Download, 
  RefreshCw,
  Building2,
  FileText,
  Truck,
  Store,
  Warehouse as WarehouseIcon,
  ChevronLeft,
  ChevronRight,
  Package,
  Layers,
  UserCheck
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fmtDate, fmtINR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StockTabs } from "@/components/stock/StockTabs";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";
import { useQuery } from "@tanstack/react-query";
import { downloadCSV } from "@/lib/exportUtils";
import { fetchUnifiedStockMovements, type LedgerEntry } from "@/services/stockMovementService";
import { getCompactStockString } from "@/lib/packaging";
import { type Product } from "@/types";

export default function StockMovement() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const currentFilterParam = searchParams.get("filter") || "all";
  const [typeFilter, setTypeFilter] = useState<string>(currentFilterParam);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Sync state if URL query parameter changes
  useEffect(() => {
    const urlFilter = searchParams.get("filter") || "all";
    if (urlFilter !== typeFilter) {
      setTypeFilter(urlFilter);
      setPage(1);
    }
  }, [searchParams, typeFilter]);

  const handleFilterChange = (newFilter: string) => {
    setTypeFilter(newFilter);
    setPage(1);
    if (newFilter === "all") {
      searchParams.delete("filter");
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ filter: newFilter }, { replace: true });
    }
  };

  const {
    data,
    isLoading,
    isRefetching,
    refetch
  } = useQuery({
    queryKey: ["stock-movement"],
    queryFn: fetchUnifiedStockMovements,
    staleTime: 5000,
    refetchOnMount: "always",
  });

  const rawEntries = useMemo(() => data?.entries || [], [data?.entries]);
  const counts = data?.counts || { all: 0, purchase: 0, dispatch: 0, adjustment: 0, reversal: 0, transfer: 0 };

  // Filter entries based on typeFilter and search
  const filteredEntries = useMemo(() => {
    let list = rawEntries;

    if (typeFilter && typeFilter !== "all") {
      list = list.filter(e => e.entry_type.toLowerCase() === typeFilter.toLowerCase());
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(e =>
        e.product_name?.toLowerCase().includes(q) ||
        e.product_sku?.toLowerCase().includes(q) ||
        (e.batch_number && e.batch_number.toLowerCase().includes(q)) ||
        (e.purchase_invoice_number && e.purchase_invoice_number.toLowerCase().includes(q)) ||
        (e.supplier_name && e.supplier_name.toLowerCase().includes(q)) ||
        (e.order_number && e.order_number.toLowerCase().includes(q)) ||
        (e.shop_name && e.shop_name.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q))
      );
    }

    return list;
  }, [rawEntries, typeFilter, search]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredEntries.length / pageSize) || 1;
  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, page, pageSize]);

  if (!isAdmin) {
    return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;
  }

  const getEntryBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case 'purchase':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold text-[10px] tracking-wide">PURCHASE</Badge>;
      case 'dispatch':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-bold text-[10px] tracking-wide">DISPATCH</Badge>;
      case 'adjustment':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-bold text-[10px] tracking-wide">ADJUSTMENT</Badge>;
      case 'reversal':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-bold text-[10px] tracking-wide">REVERSAL</Badge>;
      case 'transfer':
        return <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200 font-bold text-[10px] tracking-wide">TRANSFER</Badge>;
      default:
        return <Badge variant="outline" className="font-bold text-[10px]">{type.toUpperCase()}</Badge>;
    }
  };

  const filterOptions = [
    { key: 'all', label: 'ALL', count: counts.all },
    { key: 'purchase', label: 'PURCHASE', count: counts.purchase },
    { key: 'dispatch', label: 'DISPATCH', count: counts.dispatch },
    { key: 'adjustment', label: 'ADJUSTMENT', count: counts.adjustment },
    { key: 'reversal', label: 'REVERSAL', count: counts.reversal },
  ];

  return (
    <div className="pb-32 md:pb-24">
      <PageHeader 
        title="Stock History"
        subtitle="Complete Transactional Audit Trail"
        onBack={() => navigate("/stock")}
      />

      <ResponsiveContainer className="space-y-4 md:space-y-6 mt-1 md:mt-4">
        <StockTabs />

        {/* Search & Filter Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="flex-1 relative group min-w-[260px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search by Product, SKU, Batch, Invoice #, Supplier, Shop..."
              className="pl-10 pr-10 h-11 rounded-xl border border-border bg-card font-medium text-sm shadow-xs focus:border-primary/30 focus:ring-0 transition-all w-full"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl px-3.5 h-11 border border-border font-bold text-[11px] uppercase tracking-wider gap-1.5 bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
              onClick={() => refetch()}
              disabled={isLoading || isRefetching}
              title="Refresh history"
            >
              <RefreshCw className={cn("h-4 w-4", (isLoading || isRefetching) && "animate-spin text-primary")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="rounded-xl px-3.5 h-11 border border-border font-bold text-[11px] uppercase tracking-wider gap-2 bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
              onClick={() => {
                if (filteredEntries.length === 0) return;
                const exportData = filteredEntries.map(e => ({
                  Date: new Date(e.created_at).toLocaleDateString(),
                  Time: new Date(e.created_at).toLocaleTimeString(),
                  Product: e.product_name,
                  SKU: e.product_sku,
                  Type: e.entry_type.toUpperCase(),
                  Quantity: e.qty_transacted,
                  Batch: e.batch_number || '-',
                  Invoice_Number: e.purchase_invoice_number || '-',
                  Supplier: e.supplier_name || '-',
                  Order_Number: e.order_number || '-',
                  Shop: e.shop_name || '-',
                  Shop_Location: e.shop_location || '-',
                  Warehouse: e.to_warehouse_name || e.from_warehouse_name || 'Central Warehouse',
                  Landed_Cost: e.landed_cost ? `₹${e.landed_cost.toFixed(2)}` : '-',
                  User: e.created_by_name || 'SYSTEM',
                  Notes: e.notes || ''
                }));
                downloadCSV(exportData, `Stock_Movement_${typeFilter}_${new Date().toISOString().split('T')[0]}`);
              }}
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {filterOptions.map(f => {
            const isSelected = typeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => handleFilterChange(f.key)}
                className={cn(
                  "h-9 px-3.5 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all whitespace-nowrap border flex items-center gap-2",
                  isSelected
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                )}
              >
                <span>{f.label}</span>
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                  isSelected ? "bg-white/20 text-white" : "bg-muted text-slate-600"
                )}>
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main Content Container */}
        <Card className="rounded-2xl border border-border/70 shadow-xs overflow-hidden bg-card">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/35 border-b border-border/70">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[140px] font-bold text-[11px] uppercase tracking-wider text-muted-foreground py-3.5 pl-6">
                    Date & Time
                  </TableHead>
                  <TableHead className="w-[110px] font-bold text-[11px] uppercase tracking-wider text-muted-foreground py-3.5">
                    Type
                  </TableHead>
                  <TableHead className="min-w-[220px] font-bold text-[11px] uppercase tracking-wider text-muted-foreground py-3.5">
                    Product & SKU
                  </TableHead>
                  <TableHead className="min-w-[240px] font-bold text-[11px] uppercase tracking-wider text-muted-foreground py-3.5">
                    Reference / Source / Shop
                  </TableHead>
                  <TableHead className="text-right w-[150px] font-bold text-[11px] uppercase tracking-wider text-muted-foreground py-3.5 pr-6">
                    Quantity
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5} className="py-4 px-6">
                        <div className="h-8 w-full bg-muted/30 rounded-lg animate-pulse" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : paginatedEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16 px-6">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground/60">
                          <ArrowRightLeft className="h-5 w-5" />
                        </div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-1">
                          No transactions found
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                          {search ? "No records match your search criteria." : "Stock transactions will appear here as orders or GRNs are processed."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedEntries.map((entry) => {
                    const qTrans = entry.qty_transacted;
                    const isPositive = qTrans > 0;
                    const absQty = Math.abs(qTrans);

                    const mockProduct: Partial<Product> = {
                      id: entry.product_id,
                      name: entry.product_name,
                      sku: entry.product_sku,
                      units_per_packet: entry.units_per_packet || 1,
                      packets_per_case: entry.packets_per_case || 1,
                      units_per_case: (entry.units_per_packet || 1) * (entry.packets_per_case || 1),
                      unit_type: 'pcs'
                    };

                    const packagingSummary = getCompactStockString(absQty, mockProduct);

                    return (
                      <TableRow 
                        key={entry.id}
                        className="hover:bg-muted/15 border-b border-border/40 transition-colors"
                      >
                        {/* 1. Date & Time */}
                        <TableCell className="py-3.5 pl-6 align-top">
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs text-foreground">
                              {new Date(entry.created_at).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric"
                              })}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              {new Date(entry.created_at).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </span>
                          </div>
                        </TableCell>

                        {/* 2. Type Badge */}
                        <TableCell className="py-3.5 align-top">
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {getEntryBadge(entry.entry_type)}
                          </div>
                        </TableCell>

                        {/* 3. Product & SKU & Batch */}
                        <TableCell className="py-3.5 align-top">
                          <div className="flex flex-col max-w-[280px]">
                            <span className="font-bold text-xs text-foreground leading-snug truncate" title={entry.product_name}>
                              {entry.product_name}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[10px] font-mono font-bold bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded border border-border/40">
                                {entry.product_sku}
                              </span>
                              {entry.batch_number && (
                                <span className="text-[10px] font-mono font-medium bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded">
                                  Batch: {entry.batch_number}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* 4. Reference / Source / Destination */}
                        <TableCell className="py-3.5 align-top">
                          <div className="flex flex-col gap-1 text-xs">
                            {/* Invoice details */}
                            {entry.purchase_invoice_number && (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-[11px] text-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/40">
                                  INV #{entry.purchase_invoice_number}
                                </span>
                                {entry.supplier_name && (
                                  <span className="text-muted-foreground text-xs truncate max-w-[200px]" title={entry.supplier_name}>
                                    via {entry.supplier_name}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Order details */}
                            {entry.order_number && (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-[11px] text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                  {entry.order_number}
                                </span>
                                {entry.shop_name && (
                                  <span className="font-semibold text-foreground text-xs truncate max-w-[200px]" title={entry.shop_name}>
                                    {entry.shop_name}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Warehouse name */}
                            {(entry.to_warehouse_name || entry.from_warehouse_name) && (
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <WarehouseIcon className="h-3 w-3 text-muted-foreground/60" />
                                <span>{entry.to_warehouse_name || entry.from_warehouse_name}</span>
                              </div>
                            )}

                            {/* Notes if applicable */}
                            {entry.notes && !entry.purchase_invoice_number && !entry.order_number && (
                              <span className="text-[11px] text-muted-foreground italic truncate max-w-[220px]">
                                {entry.notes}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* 5. Quantity */}
                        <TableCell className="py-3.5 pr-6 text-right align-top">
                          <div className="flex flex-col items-end">
                            <span className={cn(
                              "font-black text-sm tabular-nums",
                              isPositive ? "text-emerald-600" : "text-destructive"
                            )}>
                              {isPositive ? '+' : ''}{qTrans.toLocaleString()} PCS
                            </span>
                            {/* Packaging Breakdown */}
                            {(entry.units_per_packet > 1 || entry.packets_per_case > 1) && (
                              <span className="text-[10px] font-medium text-muted-foreground mt-0.5 bg-muted/50 px-1.5 py-0.5 rounded">
                                {packagingSummary}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card List View */}
          <div className="block md:hidden divide-y divide-border/40">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2">
                  <div className="h-5 w-3/4 bg-muted/40 rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-muted/30 rounded animate-pulse" />
                </div>
              ))
            ) : paginatedEntries.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  No records found
                </p>
              </div>
            ) : (
              paginatedEntries.map((entry) => {
                const qTrans = entry.qty_transacted;
                const isPositive = qTrans > 0;
                const absQty = Math.abs(qTrans);

                const mockProduct: Partial<Product> = {
                  id: entry.product_id,
                  name: entry.product_name,
                  sku: entry.product_sku,
                  units_per_packet: entry.units_per_packet || 1,
                  packets_per_case: entry.packets_per_case || 1,
                  units_per_case: (entry.units_per_packet || 1) * (entry.packets_per_case || 1),
                  unit_type: 'pcs'
                };

                const packagingSummary = getCompactStockString(absQty, mockProduct);

                return (
                  <div key={entry.id} className="p-4 space-y-2.5">
                    {/* Header: Type, Date, Quantity */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getEntryBadge(entry.entry_type)}
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(entry.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short"
                          })}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={cn(
                          "font-black text-sm tabular-nums",
                          isPositive ? "text-emerald-600" : "text-destructive"
                        )}>
                          {isPositive ? '+' : ''}{qTrans.toLocaleString()} PCS
                        </span>
                      </div>
                    </div>

                    {/* Product & SKU */}
                    <div>
                      <div className="font-bold text-xs text-foreground leading-snug">
                        {entry.product_name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] font-mono font-bold bg-muted/60 text-muted-foreground px-1.5 py-0.2 rounded border border-border/40">
                          {entry.product_sku}
                        </span>
                        {entry.batch_number && (
                          <span className="text-[10px] font-mono bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded">
                            {entry.batch_number}
                          </span>
                        )}
                        {(entry.units_per_packet > 1 || entry.packets_per_case > 1) && (
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted/40 px-1.5 py-0.2 rounded">
                            {packagingSummary}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata Footer */}
                    {(entry.purchase_invoice_number || entry.order_number || entry.supplier_name || entry.shop_name || entry.to_warehouse_name) && (
                      <div className="flex items-center gap-2 pt-1 border-t border-border/30 text-[11px] text-muted-foreground flex-wrap">
                        {entry.purchase_invoice_number && (
                          <span className="font-mono font-bold text-foreground">
                            INV #{entry.purchase_invoice_number}
                          </span>
                        )}
                        {entry.order_number && (
                          <span className="font-mono font-bold text-blue-800 bg-blue-50 px-1 rounded">
                            {entry.order_number}
                          </span>
                        )}
                        {entry.supplier_name && (
                          <span className="truncate max-w-[140px]">{entry.supplier_name}</span>
                        )}
                        {entry.shop_name && (
                          <span className="font-medium text-foreground truncate max-w-[140px]">{entry.shop_name}</span>
                        )}
                        {(entry.to_warehouse_name || entry.from_warehouse_name) && (
                          <span className="text-[10px] opacity-70">
                            • {entry.to_warehouse_name || entry.from_warehouse_name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          {filteredEntries.length > 0 && (
            <div className="p-4 border-t border-border/60 bg-muted/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
              <div>
                Showing <span className="font-bold text-foreground">{Math.min(filteredEntries.length, (page - 1) * pageSize + 1)}</span> to{" "}
                <span className="font-bold text-foreground">{Math.min(filteredEntries.length, page * pageSize)}</span> of{" "}
                <span className="font-bold text-foreground">{filteredEntries.length}</span> records
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-lg"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-bold text-foreground px-2">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-lg"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </ResponsiveContainer>
    </div>
  );
}
