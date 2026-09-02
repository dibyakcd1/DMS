import React from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  HeroCard, 
  StatCard, 
  AlertCard, 
  SectionLabel
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
  Cell
} from "recharts";
import { 
  Store, 
  Building2, 
  ShoppingCart, 
  PlusCircle,
  PackageCheck,
  Truck,
  RotateCcw,
  Clock
} from "lucide-react";

export const SalesTab = ({ data, periodLabel }: { data: ReportData, periodLabel: string }) => {
  const navigate = useNavigate();
  // Chart data: 30 bars
  const chartData = data.dailySales.map(d => ({
    name: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    value: d.amount / 1000 // In thousands
  }));

  const shopTypeIcons: Record<string, React.ElementType> = {
    retail: Store,
    wholesale: Building2,
    supermarket: ShoppingCart,
    new: PlusCircle
  };

  const statusColors: Record<string, string> = {
    Delivered: "#10b981",
    Dispatched: "#3b82f6",
    Pending: "#f59e0b",
    Cancelled: "#ef4444"
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Main Hero & Chart Section */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <HeroCard 
            label={`Sales performance (${periodLabel})`}
            amount={fmtINR(data.monthlyRevenue.value)}
            columns={[
              { value: data.orders.value.toString(), label: "Total orders" },
              { value: fmtINR(data.avgOrderValue.value), label: "Avg order" },
              { value: "94%", label: "Fill rate" }
            ]}
            tag={`  ${data.orders.value} orders dispatched`}
            color="#0c4a6e"
          />

          <div className="bg-white rounded-3xl border-[0.5px] border-black/10 p-6 flex-1 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="text-[15px] font-bold text-slate-800 tracking-tight">Revenue trend</h4>
                <p className="text-[11px] text-slate-400 font-medium">{periodLabel} visualization of revenue flow</p>
              </div>
              <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm border border-emerald-100">{periodLabel} Bar</div>
            </div>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }}
                    interval={window.innerWidth > 1024 ? 2 : 5}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }}
                    tickFormatter={(val) => `₹${val}k`}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc', radius: 4 }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px', padding: '12px' }}
                    formatter={(value: number) => [`₹${(value * 1000).toLocaleString('en-IN')}`, "Revenue"]}
                  />
                  <Bar 
                    dataKey="value" 
                    fill="#0c4a6e" 
                    radius={[6, 6, 0, 0]} 
                    barSize={window.innerWidth > 1024 ? 20 : 12}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#0369a1' : '#0c4a6e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Sidebar Logic for Status & Insights */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <SectionLabel>Fulfillment pulse</SectionLabel>
          <div className="bg-white rounded-3xl border-[0.5px] border-black/10 p-6 shadow-sm">
            <div className="grid grid-cols-2 gap-6 mb-6">
              {data.orderStatusBreakdown.map((s, i) => (
                <div key={i} className="flex flex-col">
                  <div className="text-[20px] font-bold text-slate-800 tracking-tighter leading-none">{s.count}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColors[s.status] || "#94a3b8" }} />
                    {s.status}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100 shadow-inner">
              {data.orderStatusBreakdown.map((s, i) => (
                <div 
                  key={i} 
                  style={{ 
                    width: `${s.percentage}%`, 
                    backgroundColor: statusColors[s.status] || "#94a3b8" 
                  }} 
                />
              ))}
            </div>
            <p className="text-[10px] text-slate-400 font-medium mt-4 leading-relaxed">
              Order lifecycle efficiency is currently at <span className="text-emerald-600 font-bold">92.4%</span> across all dispatch centers.
            </p>
          </div>

          <SectionLabel>Category Insights</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            {data.shopTypeSales.map((t, i) => (
              <StatCard 
                key={i}
                icon={shopTypeIcons[t.type.toLowerCase()] || Store}
                iconBg={i % 2 === 0 ? "#eff6ff" : "#fef3c7"}
                label={`${t.type} channels`}
                value={fmtINR(t.amount)}
                delta={`${t.percent.toFixed(0)}% contribution`}
                deltaType="up"
              />
            ))}
          </div>
          
          <div className="space-y-3 mt-2">
            <AlertCard 
              variant="danger"
              title="Inventory Attention"
              sub="⚠ 12 products with 0 orders in last 30 days"
              ctaLabel="Optimize Stock"
              onCta={() => navigate("/stock")}
            />
            <AlertCard 
              variant="info"
              title="Demand Forecast"
              sub={`Highest activity on ${data.peakInsight.day}s. Adjust fleet capacity.`}
              icon={Clock}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
