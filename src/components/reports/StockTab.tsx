import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  StatCard, 
  SectionLabel,
  AlertCard
} from "./ReportShared";
import { ReportData } from "@/hooks/useReportsData";
import { fmtINR } from "@/lib/format";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
} from "recharts";
import { 
  Box, 
  CheckCircle2, 
  AlertTriangle, 
  Slash,
  Search,
  Filter,
  FileDown,
  Printer,
  RotateCcw,
  IndianRupee,
  Clock
} from "lucide-react";
import { motion } from "motion/react";
import { downloadInventoryPDF } from "@/lib/inventory-pdf";
import { downloadCSV } from "@/lib/exportUtils";
import { toast } from "sonner";

export const StockTab = ({ data }: { data: ReportData }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");

  const healthCounts = data.inventoryReport.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = [
    { name: "In stock", value: healthCounts['HEALTHY'] || 0, color: "#059669" },
    { name: "Low", value: healthCounts['LOW'] || 0, color: "#ca8a04" },
    { name: "Out", value: healthCounts['OOS'] || 0, color: "#dc2626" }
  ];

  const inStockTotal = (healthCounts['HEALTHY'] || 0);
  const totalItems = data.inventoryReport.length;
  const healthPercent = totalItems > 0 ? Math.round((inStockTotal / totalItems) * 100) : 0;

  const filterMapping: Record<string, string> = {
    "All": "All",
    "Low stock": "LOW",
    "Out of stock": "OOS",
    "Healthy": "HEALTHY"
  };

  const filtered = data.inventoryReport.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(q.toLowerCase()) || item.sku.toLowerCase().includes(q.toLowerCase());
    const targetFilter = filterMapping[filter] || "All";
    const matchesFilter = targetFilter === "All" || item.status === targetFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* Overview Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-6">
        <StatCard 
          icon={Box}
          iconBg="#f1f5f9"
          label="Total active SKUs"
          value={data.inventoryReport.length.toString()}
        />
        <StatCard 
          icon={CheckCircle2}
          iconBg="#f0fdf4"
          label="In stock"
          value={healthCounts['HEALTHY']?.toString() || "0"}
          delta="Stable"
          deltaType="up"
        />
        <StatCard 
          icon={AlertTriangle}
          iconBg="#fffbeb"
          label="Low stock"
          value={healthCounts['LOW']?.toString() || "0"}
          delta="Priority"
          deltaType="down"
        />
        <StatCard 
          icon={Slash}
          iconBg="#fff1f2"
          label="Out of stock"
          value={(healthCounts['OOS'] || 0).toString()}
          delta="Action Req"
          deltaType="down"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch mb-6">
        {/* Health Chart Section */}
        <div className="lg:col-span-7 bg-white rounded-3xl border-[0.5px] border-black/10 p-6 lg:p-8 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-[17px] font-bold text-slate-800 tracking-tight">Availability Landscape</h4>
              <p className="text-[12px] text-slate-400 font-medium tracking-wide">Overall inventory health score across SKU portfolio</p>
            </div>
            <div className="bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full text-[14px] font-black uppercase tracking-widest border border-emerald-100 shadow-sm">{healthPercent}%</div>
          </div>

          <div className="relative h-[240px] md:h-[280px] w-full flex items-center justify-center my-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={85}
                    outerRadius={115}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[42px] font-black text-slate-800 tracking-tighter leading-none">{healthPercent}%</span>
                <span className="text-[12px] font-bold text-emerald-600 uppercase tracking-widest mt-2">Operational</span>
              </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-4 px-6 bg-slate-50/50 py-5 rounded-3xl border border-dashed border-slate-200">
             {pieData.map((d, i) => (
               <div key={i} className="flex flex-col items-center gap-1">
                  <div className="text-[16px] font-black text-slate-700">{d.value}</div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d.name}</span>
                  </div>
               </div>
             ))}
          </div>
        </div>

        {/* Secondary Stats & Actions */}
        <div className="lg:col-span-5 flex flex-col gap-5">
           <div className="grid grid-cols-2 gap-5">
              <StatCard 
                icon={IndianRupee}
                iconBg="#eff6ff"
                label="Procurement Need"
                value="₹2.12L"
                delta="Restock Estimate"
                deltaType="down"
              />
              <StatCard 
                icon={RotateCcw}
                iconBg="#f0fdf4"
                label="Stock Rotation"
                value="4.2x"
                delta="▲ 0.3x Growth"
                deltaType="up"
              />
           </div>
           
           <AlertCard 
            variant="danger"
            title="Critical Stock Warning"
            sub="⚠ 5 high-velocity SKUs are currently at zero capacity."
            ctaLabel="Initiate Purchase GRN"
            onCta={() => navigate("/stock/grns")}
          />

          <div className="bg-slate-900 rounded-3xl p-6 text-white flex-1 shadow-xl shadow-slate-900/10 min-h-[160px] flex flex-col justify-center">
             <SectionLabel><span className="text-white">Inventory Management</span></SectionLabel>
             <div className="grid grid-cols-3 gap-3 mt-4">
                <button 
                  onClick={() => {
                    const exportData = data.inventoryReport.map(item => ({
                      id: item.id,
                      sku: item.sku,
                      name: item.name,
                      cases: item.cases,
                      packets: item.packets,
                      units: item.units,
                      weight: item.weight
                    }));
                    downloadInventoryPDF(exportData);
                    toast.success("PDF report generated");
                  }}
                  className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-all group"
                >
                   <FileDown className="h-6 w-6 text-amber-200 group-hover:scale-110 transition-transform" />
                   <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">PDF</span>
                </button>
                <button 
                  onClick={() => {
                    const exportData = data.inventoryReport.map(item => ({
                      SKU: item.sku,
                      Name: item.name,
                      Cases: item.cases,
                      Packets: item.packets,
                      Units: item.units,
                      Weight: item.weight,
                      Status: item.status
                    }));
                    downloadCSV(exportData, `Inventory_Report_${new Date().toISOString().split('T')[0]}`);
                    toast.success("CSV export complete");
                  }}
                  className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-all group"
                >
                   <FileDown className="h-6 w-6 text-emerald-200 group-hover:scale-110 transition-transform" />
                   <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">CSV</span>
                </button>
                <button 
                  onClick={() => {
                    window.print();
                  }}
                  className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-all group"
                >
                   <Printer className="h-6 w-6 text-blue-200 group-hover:scale-110 transition-transform" />
                   <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Print</span>
                </button>
             </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
             <SectionLabel>SKU Ledger (All Warehouses)</SectionLabel>
          </div>

          {/* Individual row for Search */}
          <div className="w-full bg-white rounded-2xl border-[0.5px] border-black/10 px-5 py-3 flex items-center gap-4 shadow-sm">
             <Search className="h-5 w-5 text-slate-400" />
             <input 
               className="bg-transparent border-none text-[14px] font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-0 w-full"
               placeholder="Master SKU search..."
               value={q}
               onChange={e => setQ(e.target.value)}
             />
          </div>

          {/* Individual row for Filter Chips */}
          <div className="w-full">
             <div className="flex gap-1.5 w-full">
                {["All", "Low stock", "Out of stock", "Healthy"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "flex-1 whitespace-nowrap px-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-tight border transition-all cursor-pointer shadow-sm group active:scale-95 min-w-0 truncate",
                      filter === f 
                        ? "bg-white border-black/10 text-amber-900 shadow-md ring-1 ring-black/5" 
                        : "bg-white border-black/5 text-slate-500 opacity-70 hover:opacity-100 hover:shadow-md"
                    )}
                  >
                    {f}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* SKU List: One entity per row */}
        <div className="flex flex-col gap-4 mb-10">
          {filtered.map((item, i) => (
            <div 
              key={i} 
              onClick={() => navigate(`/stock?q=${item.sku}`)}
              className="group bg-white rounded-3xl border-[0.5px] border-black/10 p-6 shadow-sm hover:shadow-md hover:border-amber-700/30 transition-all cursor-pointer w-full"
            >
               <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                 <div className="flex items-center gap-4 flex-1">
                   <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-amber-50 transition-colors shrink-0">
                      <Box className="w-6 h-6 text-slate-400 group-hover:text-amber-600" />
                   </div>
                   <div className="min-w-0">
                     <div className="text-[15px] font-bold text-slate-800 truncate group-hover:text-amber-700 transition-colors">{item.name}</div>
                     <div className="text-[11px] font-mono font-bold text-slate-400 mt-1 uppercase tracking-widest">{item.sku}</div>
                   </div>
                 </div>

                 <div className="flex flex-wrap items-center gap-4 lg:gap-8 grow justify-between lg:justify-end">
                    <div className="flex items-center gap-8 bg-slate-50/50 px-6 py-3 rounded-2xl border border-slate-100 min-w-[200px]">
                      <div className="text-center">
                         <div className="text-[14px] font-black text-slate-800">{item.cases}</div>
                         <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Cases</div>
                      </div>
                      <div className="h-6 w-px bg-slate-200" />
                      <div className="text-center">
                         <div className="text-[14px] font-black text-slate-800">{item.packets}</div>
                         <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Packs</div>
                      </div>
                      {item.weight && item.weight !== '—' && (
                        <>
                          <div className="h-6 w-px bg-slate-200" />
                          <div className="text-center">
                             <div className="text-[14px] font-black text-slate-800">{item.weight}</div>
                             <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Volume</div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 min-w-[120px]">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full",
                        item.status === 'HEALTHY' ? "bg-emerald-50 text-emerald-600" : item.status === 'LOW' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                      )}>
                        {item.status}
                      </span>
                      <div className="text-[12px] font-black text-slate-700">{item.units} <span className="text-[9px] text-slate-400 uppercase font-bold ml-0.5">Loose Unit{item.units === 1 ? '' : 's'}</span></div>
                    </div>
                 </div>
               </div>

               {/* Full progress bar below for each row */}
               <div className="mt-6 space-y-2">
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner relative">
                    <motion.div 
                      className={cn("h-full rounded-full transition-all duration-1000", item.status === 'HEALTHY' ? "bg-amber-700" : item.status === 'LOW' ? "bg-amber-500" : "bg-red-500")} 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (item.base_qty / 100) * 100)}%` }} 
                    />
                  </div>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
