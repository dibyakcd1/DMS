import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  RefreshCcw, 
  ChevronDown,
  AlertTriangle,
  Clock,
  Calendar,
  Globe,
  TrendingUp,
  IndianRupee,
  Box,
  SlidersHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useReportsData } from "@/hooks/useReportsData";
import { 
  startOfDay, 
  endOfDay, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  startOfQuarter, 
  endOfQuarter,
  format
} from "date-fns";
import { PeriodType } from "@/components/reports/ReportShared";
import { PageHeader } from "@/components/PageHeader";
import { GlobalTab } from "@/components/reports/GlobalTab";
import { SalesTab } from "@/components/reports/SalesTab";
import { PnLTab } from "@/components/reports/PnLTab";
import { StockTab } from "@/components/reports/StockTab";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Reports() {
  const [period, setPeriod] = useState<PeriodType>('30d');
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<'global' | 'sales' | 'pnl' | 'stock'>('global');
  const [revenueTarget, setRevenueTarget] = useState(1500000);
  const [marginFloor, setMarginFloor] = useState(15);
  
  const { loading, data, loadData } = useReportsData();
  const navigate = useNavigate();

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'custom' && customRange) {
      return { from: startOfDay(customRange.from), to: endOfDay(customRange.to) };
    }
    switch (period) {
      case 'today': return { from: startOfDay(now), to: endOfDay(now) };
      case '7d': return { from: subDays(now, 7), to: now };
      case '30d': return { from: subDays(now, 30), to: now };
      case 'mtd': return { from: startOfMonth(now), to: now };
      case 'qtd': return { from: startOfQuarter(now), to: now };
      default: return { from: subDays(now, 30), to: now };
    }
  }, [period, customRange]);

  useEffect(() => {
    loadData(dateRange.from, dateRange.to, revenueTarget, marginFloor);
  }, [loadData, dateRange.from, dateRange.to, revenueTarget, marginFloor]);

  const handleRefresh = async () => {
    await loadData(dateRange.from, dateRange.to, revenueTarget, marginFloor);
    toast.success("Data refreshed", {
      style: { backgroundColor: '#1e293b', color: 'white', borderRadius: '10px' },
      duration: 2200
    });
  };

  const tabs = [
    { id: 'global', label: 'General', icon: Globe, color: 'text-emerald-600' },
    { id: 'sales', label: 'Sales', icon: TrendingUp, color: 'text-blue-600' },
    { id: 'pnl', label: 'Profit', icon: IndianRupee, color: 'text-indigo-600' },
    { id: 'stock', label: 'Stock', icon: Box, color: 'text-amber-600' },
  ];

  const periods: { id: PeriodType; label: string }[] = useMemo(() => [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: 'mtd', label: 'This month' },
    { id: 'qtd', label: 'Quarter' },
    { id: 'custom', label: 'Custom ↗' },
  ], []);

  const periodLabel = useMemo(() => {
    if (period === 'custom' && customRange) {
      return `${format(customRange.from, 'dd MMM')} - ${format(customRange.to, 'dd MMM')}`;
    }
    return periods.find(p => p.id === period)?.label || '30 days';
  }, [period, periods, customRange]);

  return (
    <div className="space-y-6 pb-24">
      <PageHeader 
        title="Report" 
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/")}
      />

      <div className="space-y-4">
        {/* Metric Focus Tabs - Integrated into Navigation Style */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-black/[0.04] p-1 shadow-sm -mx-4 px-4">
          <div className="flex items-center justify-between">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as 'global' | 'sales' | 'pnl' | 'stock');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1 px-2 pt-2.5 pb-1.5 transition-all cursor-pointer relative flex-1",
                      isActive ? "opacity-100" : "opacity-50 hover:opacity-100"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", isActive ? "text-amber-700" : "text-slate-600")} />
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-tight transition-colors",
                      isActive ? "text-amber-700" : "text-slate-600"
                    )}>
                      {tab.label}
                    </span>
                    {isActive && (
                      <motion.div 
                        layoutId="activeTabPanel"
                        className="absolute bottom-0 left-2 right-2 h-[2px] bg-amber-700 rounded-t-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {/* Date Filters (Time Horizon) */}
            {activeTab !== 'stock' ? (
              <div className="w-full bg-white p-4 rounded-3xl border border-black/[0.06] shadow-sm flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#fff8f1] flex items-center justify-center text-[#a8522b] border border-[#f5e1d3] shadow-sm shrink-0">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Time Period</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-lg font-black text-slate-800 tracking-tight truncate">{periodLabel}</span>
                    </div>
                  </div>
                </div>
                               <div className="flex items-center gap-2 shrink-0">
                  {/* Buttons moved to FAB */}
                </div>
              </div>
            ) : (
              <div className="w-full bg-white p-4 rounded-3xl border border-black/[0.06] shadow-sm flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#e6f4ea] flex items-center justify-center text-[#1e8e3e] border border-emerald-100/30 shadow-sm shrink-0">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Inventory Status</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-lg font-black text-slate-800 tracking-tight">Real-time</span>
                    </div>
                  </div>
                </div>
                {/* Refresh button moved to FAB */}
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <main className="pb-12 animate-in fade-in slide-in-from-bottom-2 duration-700">
            {loading && !data ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Skeleton className="h-[160px] w-full rounded-2xl" />
                </div>
                <Skeleton className="h-[200px] w-full rounded-2xl" />
                <Skeleton className="h-[200px] w-full rounded-2xl" />
                <div className="grid grid-cols-2 gap-3 md:col-span-2">
                  <Skeleton className="h-32 rounded-2xl" />
                  <Skeleton className="h-32 rounded-2xl" />
                </div>
              </div>
            ) : data ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === 'global' && <GlobalTab data={data} revenueTarget={revenueTarget} periodLabel={periodLabel} />}
                  {activeTab === 'sales' && <SalesTab data={data} periodLabel={periodLabel} />}
                  {activeTab === 'pnl' && <PnLTab data={data} marginFloor={marginFloor} periodLabel={periodLabel} />}
                  {activeTab === 'stock' && <StockTab data={data} />}
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className="py-32 flex flex-col items-center justify-center bg-white rounded-3xl border-[0.5px] border-black/5 shadow-sm">
                 <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle className="h-8 w-8 text-red-500" />
                 </div>
                 <h3 className="text-lg font-bold text-slate-800">Connection Interrupted</h3>
                 <p className="text-slate-400 text-sm font-medium mt-1">We couldn't synchronize the latest analytics.</p>
                 <Button onClick={handleRefresh} className="mt-6 bg-amber-700 hover:bg-amber-800 text-white font-bold px-8 rounded-xl shadow-lg shadow-amber-700/20">
                  Try Again
                 </Button>
              </div>
            )}
          </main>
        </div>

      {/* Floating Action Buttons */}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2">
        <button 
          onClick={handleRefresh} 
          className="h-8 w-8 rounded-full bg-slate-100/50 backdrop-blur-sm border border-black/5 flex items-center justify-center text-amber-700 hover:bg-amber-100/50 transition-all active:scale-95 group"
        >
          <RefreshCcw className={cn("w-4 h-4 transition-transform group-hover:rotate-45", loading && "animate-spin")} />
        </button>

        {activeTab !== 'stock' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 rounded-full bg-amber-600/10 backdrop-blur-sm border border-amber-600/10 flex items-center justify-center text-amber-600 hover:bg-amber-600/20 transition-all active:scale-95 group">
                <SlidersHorizontal className="w-4 h-4 transition-transform group-hover:rotate-12" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px] rounded-2xl p-2 shadow-2xl border border-black/5 bg-white/95 backdrop-blur-xl mt-1">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-black px-3 py-2.5">Temporal Range</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-black/5 mx-1 mb-1" />
              {periods.map((p) => (
                <DropdownMenuItem 
                  key={p.id}
                  onClick={() => {
                    if (p.id === 'custom') {
                      setShowCustomPicker(true);
                    } else {
                      setPeriod(p.id);
                    }
                  }}
                  className={cn(
                    "rounded-xl px-3 py-3 text-[13px] font-bold cursor-pointer transition-all flex items-center justify-between group",
                    period === p.id 
                      ? "bg-amber-700 text-white shadow-lg shadow-amber-700/20" 
                      : "hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                  )}
                >
                  <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        period === p.id ? "bg-white" : "bg-slate-200 group-hover:bg-amber-600"
                      )} />
                      {p.label}
                  </div>
                  {period === p.id && <div className="text-[9px] font-black uppercase opacity-70">Current</div>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <ResponsiveDialog 
 
        open={showCustomPicker} 
        onOpenChange={setShowCustomPicker}
        title="Custom Date Range"
        description="Select a multi-day span for your analysis"
      >
        <div className="flex flex-col items-center gap-6 p-2">
          <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 w-full max-w-sm">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <p className="text-[10px] font-black uppercase text-slate-400">Start Date</p>
                   <Input 
                    type="date" 
                    className="h-12 rounded-xl bg-white border-slate-200"
                    onChange={(e) => {
                      const d = e.target.value ? new Date(e.target.value) : new Date();
                      setCustomRange(prev => ({ from: d, to: prev?.to || d }));
                    }}
                   />
                </div>
                <div className="space-y-1">
                   <p className="text-[10px] font-black uppercase text-slate-400">End Date</p>
                   <Input 
                    type="date" 
                    className="h-12 rounded-xl bg-white border-slate-200"
                    onChange={(e) => {
                      const d = e.target.value ? new Date(e.target.value) : new Date();
                      setCustomRange(prev => ({ from: prev?.from || d, to: d }));
                    }}
                   />
                </div>
             </div>
          </div>
          <Button 
            className="w-full h-14 rounded-2xl bg-amber-700 text-white font-black uppercase tracking-widest text-[10px] shadow-xl shadow-amber-700/20"
            disabled={!customRange?.from || !customRange?.to}
            onClick={() => {
              setPeriod('custom');
              setShowCustomPicker(false);
            }}
          >
            Apply Range
          </Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
