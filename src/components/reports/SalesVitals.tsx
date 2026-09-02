import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { CustomTooltip } from "./CustomTooltip";
import { cn } from "@/lib/utils";
import { fmtCompactINR } from "@/lib/format";
import { ReportData } from "@/hooks/useReportsData";

interface SalesVitalsProps {
  data: ReportData;
}

export function SalesVitals({ data }: SalesVitalsProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8 rounded-[2rem] border border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-8">
            <CardTitle className="text-xl font-black text-slate-800 tracking-tight">Daily Sales Velocity</CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-0">
             <div className="h-96 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={data.dailySales}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      tickFormatter={(val) => `\u20B9${(val/1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="amount" 
                      fill="#a85511" 
                      radius={[6, 6, 0, 0]} 
                      barSize={32}
                      animationDuration={2000}
                    />
                 </BarChart>
               </ResponsiveContainer>
             </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 rounded-[2rem] border border-slate-200 shadow-sm bg-white p-8">
          <h3 className="text-xl font-black text-slate-800 tracking-tight mb-8">Executive Leaderboard</h3>
          <div className="space-y-6">
            {data.spList.map((sp, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-400 text-xs">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-[15px] font-black text-slate-800 tracking-tight">{sp.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sp.orders} Orders processed</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[16px] font-black text-slate-900 tracking-tighter">{fmtCompactINR(sp.delivered)}</p>
                  <div className={cn("text-[10px] font-bold", (sp.delta ?? 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {(sp.delta ?? 0) >= 0 ? '+' : ''}{(sp.delta ?? 0).toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
