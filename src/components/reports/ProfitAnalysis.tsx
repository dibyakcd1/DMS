import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer 
} from "recharts";
import { cn } from "@/lib/utils";
import { fmtCompactINR } from "@/lib/format";
import { ReportData } from "@/hooks/useReportsData";

interface ProfitAnalysisProps {
  data: ReportData;
  marginFloor: number;
}

export function ProfitAnalysis({ data, marginFloor }: ProfitAnalysisProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div className="grid grid-cols-1 gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-[2rem] border border-slate-200 shadow-sm bg-white p-8 overflow-hidden relative">
             <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Realized Gross Profit</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Revenue - Direct Cost of Goods</p>
                </div>
                <div className="h-12 w-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
             </div>
             <div className="h-48 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={data.dailyProfitTrend}>
                    <defs>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} fill="url(#colorProfit)" />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
             <div className="pt-6 flex items-center justify-between">
               <div>
                 <p className="text-3xl font-black text-slate-900 tracking-tighter">{fmtCompactINR(data.grossProfit.value)}</p>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Period total contribution</p>
               </div>
               <div className="text-right">
                 <p className="text-2xl font-black text-emerald-600 tracking-tighter">{data.profitMargin.value.toFixed(1)}%</p>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Avg Margin Profile</p>
               </div>
             </div>
          </Card>

          <Card className="rounded-[2rem] border border-slate-200 shadow-sm bg-white p-0 overflow-hidden">
            <div className="p-8 bg-slate-900 text-white">
              <h3 className="text-lg font-black tracking-tight uppercase tracking-[0.1em] text-white/50 mb-2">Net Realization Analysis</h3>
              <p className="text-xs text-white/40">Financial health check across core metrics</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr>
                    <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Detail Item</th>
                    <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount (INR)</th>
                    <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">vs Prev</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-10 py-8 font-bold text-slate-800">Gross revenue realized</td>
                    <td className="px-10 py-8 text-right font-black text-slate-900 tabular-nums">{fmtCompactINR(data.monthlyRevenue.value)}</td>
                    <td className={cn("px-10 py-8 text-right font-black tabular-nums", data.monthlyRevenue.delta >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {data.monthlyRevenue.delta >= 0 ? '↑' : '↓'} {Math.abs(data.monthlyRevenue.delta).toFixed(1)}%
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-10 py-8 font-bold text-slate-800">COGS (Direct Product Cost)</td>
                    <td className="px-10 py-8 text-right font-black text-slate-900 tabular-nums">{fmtCompactINR(data.cogs.value)}</td>
                    <td className="px-10 py-8 text-right font-bold text-slate-400 tabular-nums">-{((data.cogs.value / (data.monthlyRevenue.value || 1)) * 100).toFixed(1)}% Rev</td>
                  </tr>
                  <tr className="bg-slate-900 text-white">
                    <td className="px-10 py-10 font-black text-white/50 uppercase tracking-[0.2em] text-[10px]">Net realization est.</td>
                    <td className="px-10 py-10 text-right font-black text-3xl tabular-nums tracking-tighter text-emerald-400">{fmtCompactINR(data.grossProfit.value - data.discounts.value)}</td>
                    <td className="px-10 py-10 text-right font-black text-white/20 tracking-widest text-[10px]">
                      {data.profitMargin.value >= marginFloor ? "OPTIMAL" : "CRITICAL"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="pt-12 space-y-6">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] px-4">Strategic Product Margins</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.productStats.slice(0, 6).map((prod, i) => (
              <Card key={i} className="rounded-[2.5rem] border border-slate-100 shadow-sm bg-white p-8 hover:shadow-xl transition-all duration-500 overflow-hidden relative group">
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-6">
                    <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center font-black text-slate-400 text-xl group-hover:bg-primary group-hover:text-white transition-colors">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="text-[18px] font-black text-slate-800 tracking-tight">{prod.name}</h4>
                      <div className="flex items-center gap-6 mt-2">
                        <p className="text-[15px] font-bold text-slate-900">Profit: {fmtCompactINR(prod.profit)}</p>
                        <div className="w-px h-4 bg-slate-100" />
                        <div className={cn(
                          "flex items-center gap-1 text-[13px] font-black",
                          (prod.realizedMargin ?? 0) >= marginFloor ? "text-emerald-600" : "text-amber-500"
                        )}>
                          {(prod.realizedMargin ?? 0).toFixed(1)}% MRG
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
