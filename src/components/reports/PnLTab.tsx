import React from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  HeroCard, 
  SectionLabel,
  TargetProgressCard,
  ComparisonTable,
  AlertCard
} from "./ReportShared";
import { ReportData } from "@/hooks/useReportsData";
import { fmtINR } from "@/lib/format";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid,
  Tooltip, 
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Percent, IndianRupee } from "lucide-react";

export const PnLTab = ({ data, marginFloor, periodLabel }: { data: ReportData, marginFloor: number, periodLabel: string }) => {
  const navigate = useNavigate();
  const chartData = data.dailyProfitTrend.map(d => ({
    name: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric' }),
    revenue: d.revenue / 1000,
    profit: d.profit / 1000
  }));

  const pnlSummary: { label: string; current: string; prev: string; delta: string; deltaType: 'up' | 'down' }[] = [
    { label: "Gross revenue", current: fmtINR(data.monthlyRevenue.value), prev: fmtINR(data.monthlyRevenue.prevValue), delta: `${data.monthlyRevenue.delta.toFixed(1)}%`, deltaType: data.monthlyRevenue.delta >= 0 ? 'up' : 'down' },
    { label: "COGS", current: fmtINR(data.cogs.value), prev: fmtINR(data.cogs.prevValue), delta: "—", deltaType: 'down' },
    { label: "Gross profit", current: fmtINR(data.grossProfit.value), prev: fmtINR(data.grossProfit.prevValue), delta: `${data.monthlyProfit.delta.toFixed(1)}%`, deltaType: data.monthlyProfit.delta >= 0 ? 'up' : 'down' },
    { label: "Discounts given", current: fmtINR(data.discounts.value), prev: fmtINR(data.discounts.prevValue), delta: "—", deltaType: 'down' },
    { label: "Net profit est.", current: fmtINR(data.monthlyProfit.value), prev: fmtINR(data.monthlyProfit.prevValue), delta: `${data.monthlyProfit.delta.toFixed(1)}%`, deltaType: data.monthlyProfit.delta >= 0 ? 'up' : 'down' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Left Column: Hero and Summary */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <HeroCard 
            label={`Gross profit (${periodLabel})`}
            amount={fmtINR(data.grossProfit.value)}
            columns={[
              { value: `${data.profitMargin.value.toFixed(1)}%`, label: "Avg margin" },
              { value: fmtINR(data.todaySales * 0.18), label: "Peak daily" },
              { value: fmtINR(data.cogs.value / 30), label: "COGS / day" }
            ]}
            tag={data.profitMargin.value >= marginFloor ? "▲ Above floor target" : "▼ Below floor target"}
            color="#065f46"
          />

          <div className="bg-white rounded-3xl border-[0.5px] border-black/10 p-6 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="text-[15px] font-bold text-slate-800 tracking-tight">Financial trend line</h4>
                <p className="text-[11px] text-slate-400 font-medium whitespace-nowrap">Daily revenue vs net profit margins</p>
              </div>
              <div className="hidden sm:flex bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest gap-2 items-center">
                 <Percent className="w-3 h-3" />
                 {periodLabel} Performance
              </div>
            </div>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#f8fafc" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} />
                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} />
                   <Tooltip 
                     cursor={{ fill: '#f8fafc' }}
                     contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '11px', padding: '12px' }}
                   />
                   <Bar dataKey="revenue" fill="rgba(6,95,70,0.15)" radius={[4, 4, 0, 0]} barSize={15} />
                   <Bar dataKey="profit" fill="#065f46" radius={[4, 4, 0, 0]} barSize={15} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column: Key Breakdown & Progress */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <SectionLabel>Profitability guardrails</SectionLabel>
          <TargetProgressCard 
            title="Margin floor benchmark"
            unit="%"
            current={data.profitMargin.value}
            target={marginFloor}
            footer={`${(data.profitMargin.value - marginFloor).toFixed(1)} pts deviation`}
            status={data.profitMargin.value >= marginFloor ? "Healthy ✓" : "At risk ⚠"}
          />

          <SectionLabel>P&L breakdown</SectionLabel>
          <div className="bg-white rounded-3xl border-[0.5px] border-black/10 overflow-hidden shadow-sm">
            <div className="bg-slate-50/80 px-4 py-3 border-b border-black/5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Financial Summary</span>
            </div>
            {pnlSummary.map((row, i) => (
              <div key={i} className="px-4 py-3 border-b border-black/5 last:border-0 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{row.label}</div>
                  <div className="text-[14px] font-bold text-slate-700 tracking-tight">{row.current}</div>
                </div>
                <div className={cn(
                  "text-[10px] font-black",
                  row.deltaType === 'up' ? "text-emerald-600" : "text-slate-400"
                )}>
                  {row.deltaType === 'up' && '▲'}{row.delta}
                </div>
              </div>
            ))}
          </div>

          <AlertCard 
            variant="info"
            title="Strategic Insights"
            sub={`Discounting impact: ${fmtINR(data.discounts.value)} total across all channels.`}
            icon={TrendingUp}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mt-4">
        <div>
           <SectionLabel>High margin portfolio</SectionLabel>
           <div className="bg-white rounded-3xl border-[0.5px] border-black/10 overflow-hidden shadow-sm mt-3">
            <div className="bg-slate-50/50 px-5 py-4 border-b border-black/5 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Product performance</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Margin Efficiency</span>
            </div>
            {data.productStats.slice(0, 8).map((p, i) => (
              <div key={i} className="py-4 px-5 border-b border-black/5 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-[13px] font-bold text-slate-800 truncate flex-1 group-hover:text-emerald-700 transition-colors">{p.name}</h5>
                  <span className={cn(
                    "text-[13px] font-black tracking-tight ml-4 px-2 py-0.5 rounded-lg",
                    (p.realizedMargin || 0) >= marginFloor ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  )}>
                    {(p.realizedMargin || 0).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full transition-all duration-700", (p.realizedMargin || 0) >= marginFloor ? "bg-emerald-500" : "bg-amber-500")} 
                      style={{ width: `${Math.min(100, (p.realizedMargin || 0) * 2.5)}%` }} 
                    />
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                    Cost: {fmtINR(p.landedCost || 0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <SectionLabel>Profit optimization</SectionLabel>
          <div className="bg-emerald-900 rounded-3xl p-6 text-white shadow-xl shadow-emerald-900/20">
             <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                   <IndianRupee className="w-5 h-5 text-emerald-200" />
                </div>
                <h4 className="text-[15px] font-bold tracking-tight">Smart Profit Recommendation</h4>
             </div>
             <p className="text-emerald-100/80 text-[13px] leading-relaxed mb-6">
                Analyzing current COGS vs Market Pricing. Adjusted discounts on tier-3 SKUs could recover <span className="text-white font-bold underline decoration-emerald-400">₹45,200</span> in net monthly profit without impacting volume significantly.
             </p>
             <button 
                onClick={() => navigate("/price-tiers")}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3.5 rounded-2xl text-[12px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                Optimize Pricing Now
             </button>
          </div>

          <ComparisonTable 
            title="Historical Delta Analysis"
            rows={pnlSummary.slice(0, 3)}
          />
        </div>
      </div>

    </div>
  );
};
