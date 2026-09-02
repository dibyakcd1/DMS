import { 
  TrendingUp, 
  FileText, 
  Wallet, 
  Activity, 
  BarChart3, 
  Package,
  TrendingUp as TrendingUpIcon,
  Check,
  AlertTriangle,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell 
} from "recharts";
import { MetricCard } from "./MetricCard";
import { CustomTooltip } from "./CustomTooltip";
import { cn } from "@/lib/utils";
import { fmtCompactINR, fmtINR } from "@/lib/format";
import { ReportData } from "@/hooks/useReportsData";
import { useIsMobile, useIsTablet, useIsLaptop } from "@/lib/responsive";
import { ResponsiveGrid } from "@/components/ui/responsive-ui";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

interface AnalyticsOverviewProps {
  data: ReportData;
  activeRange: string;
}

export function AnalyticsOverview({ data, activeRange }: AnalyticsOverviewProps) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isLaptop = useIsLaptop();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 md:space-y-8 lg:space-y-10">
      {/* Metrics Grid: Adaptive based on screen size */}
      <ResponsiveGrid 
        cols={{ base: 2, sm: 3, md: 3, lg: 6 }} 
        gap="md"
        className="px-0"
      >
        <MetricCard 
          icon={<FileText className="h-4 w-4" />}
          label="Tax Invoices"
          value={fmtCompactINR(data.taxInv?.val ?? 0)}
          delta={data.taxInv?.delta ?? 0}
          color="blue"
        />
        <MetricCard 
          icon={<Wallet className="h-4 w-4" />}
          label="Cash Memos"
          value={fmtCompactINR(data.cashMemo?.val ?? 0)}
          delta={data.cashMemo?.delta ?? 0}
          color="amber"
        />
        <MetricCard 
          icon={<BarChart3 className="h-4 w-4" />}
          label="Avg Order"
          value={fmtINR(data.avgOrderValue.value)}
          delta={data.avgOrderValue.delta}
          color="indigo"
        />
        <MetricCard 
          icon={<Package className="h-4 w-4" />}
          label="Orders"
          value={data.orders.value}
          delta={data.orders.delta}
          color="orange"
        />
        <MetricCard 
          icon={<TrendingUp className="h-4 w-4" />}
          label="Gross Profit"
          value={fmtCompactINR(data.grossProfit.value)}
          delta={data.grossProfit.delta}
          color="emerald"
        />
        <MetricCard 
          icon={<Activity className="h-4 w-4" />}
          label="Growth"
          value={`${data.growthRate.toFixed(1)}%`}
          delta={0}
          color="rose"
        />
      </ResponsiveGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8 xl:gap-10">
        <div className="xl:col-span-8 space-y-6 md:space-y-8 lg:space-y-10">
          {/* Main Hero Performance Card */}
          <Card className="border-0 bg-primary text-white shadow-2xl rounded-2xl overflow-hidden relative min-h-[220px] md:min-h-[280px] lg:min-h-[320px] flex flex-col justify-center">
            <CardContent className="p-8 md:p-12 lg:p-16 relative z-10">
              <div className="space-y-6 md:space-y-8 lg:space-y-10">
                <div className="flex items-center gap-2.5 text-white/70 font-black text-[10px] md:text-[11px] uppercase tracking-widest whitespace-nowrap overflow-hidden text-ellipsis">
                  <Activity className="h-4 w-4 text-white/50 shrink-0" />
                  Delivered Performance — {activeRange === 'today' ? 'Today' : 'Latest period'}
                </div>
                <div className="space-y-2">
                  <h2 className={cn(
                    "font-black tracking-tighter leading-none break-all",
                    isMobile ? "text-4xl" : "text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
                  )}>
                    {fmtINR(data.monthlyRevenue.value)}
                  </h2>
                </div>
                <div className="flex items-center gap-6 md:gap-10 lg:gap-14">
                  <div className="space-y-1">
                    <p className="text-2xl md:text-3xl lg:text-4xl font-black tabular-nums tracking-tighter">{data.targetHitRate.toFixed(0)}%</p>
                    <p className="text-[10px] text-white/50 font-black uppercase tracking-widest leading-none">Target Hit</p>
                  </div>
                  <div className="h-10 lg:h-12 w-px bg-white/10" />
                  <div className="space-y-1">
                    <p className="text-2xl md:text-3xl lg:text-4xl font-black tabular-nums tracking-tighter">+{data.growthRate.toFixed(1)}%</p>
                    <p className="text-[10px] text-white/50 font-black uppercase tracking-widest leading-none">Growth</p>
                  </div>
                </div>
              </div>
            </CardContent>
            {/* Background elements */}
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <Sparkles className="h-32 w-32 md:h-48 md:w-48 lg:h-64 lg:w-64 text-white" />
            </div>
            <div className="absolute -bottom-16 -right-16 h-64 w-64 md:h-96 md:w-96 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute top-1/2 -left-20 h-40 w-40 bg-brand-primary-dark/20 rounded-full blur-3xl" />
          </Card>

          {/* Revenue Trend Chart */}
          <Card className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
            <CardHeader className="p-8 pb-0">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="text-lg font-black text-slate-800 tracking-tight uppercase tracking-wider truncate">Revenue Trend</CardTitle>
                  <p className="text-[10px] md:text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1 truncate">Daily realization correlation</p>
                </div>
                <div className="hidden sm:block shrink-0">
                   <Button variant="outline" size="sm" className="rounded-xl font-bold h-9 bg-slate-50 border-none group hover:bg-slate-100">
                     Detail View <ChevronRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
                   </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 md:p-8 lg:p-10">
              <div className="h-64 md:h-80 lg:h-96 w-full -ml-4 sm:ml-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.dailySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a85511" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#a85511" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }}
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return isMobile ? `${d.getDate()}` : `${d.getDate()}/${d.getMonth() + 1}`;
                      }}
                      minTickGap={20}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }}
                      tickFormatter={(val) => `\u20B9${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#a85511" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorRev)" 
                      animationDuration={2000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Analytics Panels */}
        <div className="xl:col-span-4 space-y-6 lg:space-y-8 xl:space-y-10">
          {/* Smart Insights */}
          <Card className="rounded-[2.5rem] border border-slate-200 shadow-sm bg-white p-6 md:p-8 lg:p-10 transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[12px] md:text-[13px] font-black text-slate-800 tracking-widest uppercase">Smart Insights</h3>
              <div className="bg-amber-50 px-3 py-1 rounded-lg text-[9px] font-black text-amber-600 border border-amber-100 flex items-center gap-1.5 shrink-0">
                <Sparkles className="h-3 w-3" />
                AI ENGINE
              </div>
            </div>
            <div className="space-y-5">
              {data.smartInsights.map((insight, idx) => (
                <div key={idx} className="flex items-start gap-4 p-5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-300 transition-all group cursor-default">
                  <div className={cn(
                    "h-10 w-10 md:h-11 md:w-11 lg:h-12 lg:w-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                    insight.type === 'positive' ? "bg-emerald-500 text-white" : 
                    insight.type === 'urgent' ? "bg-red-500 text-white" : "bg-amber-500 text-white"
                  )}>
                    {insight.type === 'positive' ? <Check className="h-5 w-5" /> : 
                     insight.type === 'urgent' ? <AlertTriangle className="h-5 w-5" /> : <TrendingUpIcon className="h-5 w-5" />}
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">{insight.label}</p>
                    <h4 className="text-sm font-black text-slate-800 tracking-tight leading-tight group-hover:text-primary transition-colors truncate">{insight.title}</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed opacity-80 line-clamp-2 md:line-clamp-none">{insight.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Sales Concentration */}
          <Card className="rounded-[2.5rem] border border-slate-200 shadow-sm bg-white p-6 md:p-8 lg:p-10 transition-all hover:shadow-md">
            <h3 className="text-[12px] md:text-[13px] font-black text-slate-800 tracking-widest uppercase mb-8">Sales Concentration</h3>
            <div className={cn(
              "flex flex-col items-center gap-8",
              isTablet && !isLaptop ? "sm:flex-row lg:flex-row" : "sm:flex-row xl:flex-col"
            )}>
              <div className="h-48 w-48 lg:h-56 lg:w-56 shrink-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={data.shopTypeSales}
                      innerRadius={isMobile ? 60 : 70}
                      outerRadius={isMobile ? 90 : 100}
                      paddingAngle={5}
                      dataKey="amount"
                      stroke="none"
                    >
                      {data.shopTypeSales.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 flex-1 w-full">
                {data.shopTypeSales.map((entry, index) => (
                  <div key={index} className="space-y-1.5 p-3 rounded-xl bg-slate-50/50 border border-slate-100 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight truncate">{entry.type}</span>
                    </div>
                    <div className="flex items-end justify-between">
                       <p className="text-lg md:text-xl font-black text-slate-900 leading-none tracking-tighter">{entry.percent.toFixed(0)}%</p>
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">SHARE</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
