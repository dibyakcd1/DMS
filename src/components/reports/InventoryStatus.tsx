import { Package, Check, AlertTriangle, Ban, Search, Download, Printer as PrinterIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReportData, InventoryReportItem } from "@/hooks/useReportsData";
import { AdaptiveTable } from "@/components/ui/responsive-ui";

interface InventoryStatusProps {
  data: ReportData;
  filteredInventory: InventoryReportItem[];
  searchStock: string;
  setSearchStock: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  exportCSV: () => void;
  printReport: () => void;
}

export function InventoryStatus({ 
  data, 
  filteredInventory, 
  searchStock, 
  setSearchStock, 
  filterStatus, 
  setFilterStatus, 
  exportCSV, 
  printReport 
}: InventoryStatusProps) {
  const stats = [
    { label: 'Healthy SKUs', value: data.inventoryReport.filter(i => i.status === 'HEALTHY').length, icon: Check, color: 'emerald', border: 'border-emerald-100', bg: 'bg-[#f0fdf4]', iconBg: 'bg-emerald-500' },
    { label: 'Low stock', value: data.inventoryReport.filter(i => i.status === 'LOW').length, icon: AlertTriangle, color: 'amber', border: 'border-amber-100', bg: 'bg-[#fffbeb]', iconBg: 'bg-amber-500' },
    { label: 'Stock Out', value: data.inventoryReport.filter(i => i.status === 'OOS').length, icon: Ban, color: 'red', border: 'border-red-100', bg: 'bg-[#fef2f2]', iconBg: 'bg-red-500' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 md:pb-12">
      <div className="space-y-6">
        {/* Responsive Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border border-slate-100 shadow-sm bg-white p-5 flex flex-row sm:flex-col items-center sm:items-start gap-4">
              <div className="p-3 bg-slate-50 rounded-xl shrink-0">
                <Package className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Total active SKUs</p>
                <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter leading-none">{data.inventoryReport.length}</p>
              </div>
          </Card>

          {stats.map((stat) => (
            <Card key={stat.label} className={cn("rounded-2xl border shadow-sm overflow-hidden p-5 flex flex-row sm:flex-col items-center sm:items-start gap-4", stat.border, stat.bg)}>
                <div className={cn("p-3 rounded-xl shrink-0", stat.iconBg)}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className={cn("text-[10px] font-black uppercase tracking-widest leading-none mb-2", `text-${stat.color}-600/80`)}>{stat.label}</p>
                  <p className={cn("text-2xl md:text-3xl font-black tracking-tighter leading-none", `text-${stat.color}-700`)}>
                    {stat.value}
                  </p>
                </div>
            </Card>
          ))}
        </div>

        {/* Controls: Search & Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 transition-colors group-focus-within:text-brand-primary" />
            <Input 
              placeholder="Search product or SKU..." 
              className="h-12 md:h-11 pl-12 pr-4 bg-white border-slate-200 rounded-2xl shadow-sm focus:ring-brand-primary font-bold text-sm"
              value={searchStock}
              onChange={(e) => setSearchStock(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            {['All', 'Low', 'OOS', 'Healthy'].map((status) => (
              <Button 
                key={status}
                variant={filterStatus === status ? 'default' : 'outline'} 
                size="sm" 
                className={cn(
                  "rounded-full h-10 md:h-9 px-6 font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap",
                  filterStatus === status 
                    ? "bg-slate-900 text-white hover:bg-slate-800 shadow-md border-transparent scale-105" 
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                )}
                onClick={() => setFilterStatus(status)}
              >
                {status === 'OOS' ? 'Out of stock' : status === 'All' ? 'All' : status}
              </Button>
            ))}
          </div>
        </div>

        {/* Adaptive Data Presentation */}
        <AdaptiveTable
          data={filteredInventory}
          columns={[
            {
              header: "Product / SKU",
              accessorKey: "name",
              className: "w-[40%]",
              cell: (item) => (
                <div className="flex flex-col">
                  <span className="text-[13px] font-black text-slate-800 tracking-tight leading-tight truncate">{item.name}</span>
                  <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded self-start mt-1 leading-none uppercase tracking-widest">
                    {item.sku}
                  </span>
                </div>
              )
            },
            {
              header: "Cases",
              accessorKey: "cases",
              className: "text-center w-[15%] text-[13px] font-black text-slate-900 tabular-nums"
            },
            {
              header: "Packets",
              accessorKey: "packets",
              className: "text-center w-[15%] text-[13px] font-black text-slate-900 tabular-nums"
            },
            {
              header: "Weight",
              accessorKey: "weight",
              className: "text-center w-[15%] text-[13px] font-black text-slate-900 tabular-nums"
            },
            {
              header: "Status",
              accessorKey: "status",
              className: "text-center w-[15%]",
              cell: (item) => <InventoryBadge status={item.status} />
            }
          ]}
          emptyState={<NoResults />}
          mobileCard={(item) => (
            <div key={item.id} className="p-4 space-y-4">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black text-slate-900 truncate tracking-tight">{item.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.sku}</p>
                </div>
                <InventoryBadge status={item.status} />
              </div>

              <div className="grid grid-cols-3 gap-2 bg-white/80 p-3 rounded-xl border border-slate-100">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Cases</span>
                  <span className="text-sm font-black text-slate-900">{item.cases}</span>
                </div>
                <div className="flex flex-col items-center border-x border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Packets</span>
                  <span className="text-sm font-black text-slate-900">{item.packets}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Weight</span>
                  <span className="text-sm font-black text-slate-900">{item.weight}</span>
                </div>
              </div>
            </div>
          )}
        />

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch gap-4 pt-4">
          <Button 
            variant="outline" 
            className="flex-1 rounded-2xl h-14 border-slate-200 bg-white text-slate-800 font-extrabold uppercase tracking-widest text-[11px] hover:bg-slate-50 transition-all active:scale-95"
            onClick={exportCSV}
          >
            <Download className="h-4 w-4 mr-2 text-brand-primary" /> Download CSV
          </Button>
          <Button 
            className="flex-1 rounded-2xl h-14 bg-slate-900 text-white font-extrabold uppercase tracking-widest text-[11px] shadow-xl hover:bg-slate-800 transition-all active:scale-95"
            onClick={printReport}
          >
            <PrinterIcon className="h-4 w-4 mr-2" /> Print Full Report
          </Button>
        </div>
      </div>
    </div>
  );
}

function InventoryBadge({ status }: { status: string }) {
  const colors = {
    OOS: "bg-red-50 text-red-600 border-red-100",
    LOW: "bg-amber-50 text-amber-600 border-amber-100",
    HEALTHY: "bg-emerald-50 text-emerald-600 border-emerald-100"
  };
  
  return (
    <span className={cn(
      "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm",
      colors[status as keyof typeof colors] || colors.HEALTHY
    )}>
      {status === 'OOS' ? 'Stock Out' : status + ' Stock'}
    </span>
  );
}

function NoResults() {
  return (
    <div className="py-20 text-center">
      <div className="mx-auto h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
        <Package className="h-8 w-8 text-slate-200" />
      </div>
      <p className="text-sm font-black text-slate-300 uppercase tracking-[0.2em]">No products found</p>
      <p className="text-xs text-slate-400 mt-2">Try adjusting your filters or search terms</p>
    </div>
  );
}

