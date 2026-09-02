import { MetricCard } from "./MetricCard";
import { TrendingUp, Users, ShoppingBag, FileText, Wallet, Package } from "lucide-react";
import { fmtCompactINR, fmtINR } from "@/lib/format";
import { ReportData } from "@/hooks/useReportsData";

interface MetricGridProps {
  data: ReportData;
}

export const MetricGrid = ({ data }: MetricGridProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      <MetricCard 
        icon={<TrendingUp size={18} />} 
        label="Revenue realized" 
        value={fmtCompactINR(data.monthlyRevenue.value)} 
        delta={data.monthlyRevenue.delta} 
        color="blue"
      />
      <MetricCard 
        icon={<TrendingUp size={18} />} 
        label="Gross Profit" 
        value={fmtCompactINR(data.grossProfit.value)} 
        delta={data.grossProfit.delta} 
        color="emerald"
      />
      <MetricCard 
        icon={<ShoppingBag size={18} />} 
        label="Orders processed" 
        value={data.orders.value} 
        delta={data.orders.delta} 
        color="amber"
      />
      <MetricCard 
        icon={<Wallet size={18} />} 
        label="Est. Profit Margin" 
        value={`${data.profitMargin.value.toFixed(1)}%`} 
        delta={data.profitMargin.delta} 
        color="indigo"
      />
    </div>
  );
};
