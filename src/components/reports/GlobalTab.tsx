import React from "react";
import { cn } from "@/lib/utils";
import { 
  HeroCard, 
  StatCard, 
  AlertCard, 
  TargetProgressCard, 
  ComparisonTable, 
  LeaderboardRow, 
  InsightRow,
  SectionLabel
} from "./ReportShared";
import { ReportData } from "@/hooks/useReportsData";
import { fmtINR } from "@/lib/format";
import { FileText, Receipt, LayoutDashboard, ShoppingBag, IndianRupee } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const GlobalTab = ({ data, revenueTarget, periodLabel }: { data: ReportData, revenueTarget: number, periodLabel: string }) => {
  const navigate = useNavigate();
  
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Section: Hero & Target */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
        <div className="md:col-span-2 lg:col-span-2 xl:col-span-2">
          <HeroCard 
            label={`Total delivered — ${periodLabel}`}
            amount={fmtINR(data.monthlyRevenue.value)}
            columns={[
              { value: fmtINR(data.monthlyRevenue.value), label: "Gross revenue" },
              { value: `${data.monthlyRevenue.delta > 0 ? "▲" : "▼"}${Math.abs(data.monthlyRevenue.delta).toFixed(1)}%`, label: `vs prev ${periodLabel}` },
              { value: `${data.targetHitRate.toFixed(1)}%`, label: "Target hit" }
            ]}
            tag="▲ Operations normal"
          />
        </div>
        <div className="md:col-span-1 lg:col-span-1 xl:col-span-1 flex flex-col gap-4">
          <TargetProgressCard 
            title="Monthly goal progress"
            current={data.monthlyRevenue.value}
            target={revenueTarget}
            footer={`${((data.monthlyRevenue.value / revenueTarget) * 100).toFixed(0)}% filled`}
            status={data.targetHitRate >= 80 ? "On-track" : "Lagging"}
          />
        </div>
        <div className="md:col-span-1 lg:col-span-3 xl:col-span-1">
          {(data.outstanding.overdue > 0 || data.outstanding.pending > 0) && (
            <AlertCard 
              title="Outstanding collections"
              sub={`Pending: ${fmtINR(data.outstanding.pending)}`}
              onCta={() => navigate("/collections")}
              ctaLabel="View details"
              variant="warning"
            />
          )}
        </div>
      </div>

      <SectionLabel>Core Analytics</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-6 mb-8 mt-2">
        <StatCard 
          icon={FileText}
          iconBg="#eff6ff"
          label={`Tax invoices (${periodLabel})`}
          value={fmtINR(data.taxInv.val)}
          delta={`${data.taxInv.delta.toFixed(1)}%`}
          deltaType={data.taxInv.delta >= 0 ? 'up' : 'down'}
        />
        <StatCard 
          icon={Receipt}
          iconBg="#fff7ed"
          label={`Cash memos (${periodLabel})`}
          value={fmtINR(data.cashMemo.val)}
          delta={`${data.cashMemo.delta.toFixed(1)}%`}
          deltaType={data.cashMemo.delta >= 0 ? 'up' : 'down'}
        />
        <StatCard 
          icon={LayoutDashboard}
          iconBg="#f5f3ff"
          label="Avg order value"
          value={fmtINR(data.avgOrderValue.value)}
          delta="—"
          deltaType="up"
        />
        <StatCard 
          icon={IndianRupee}
          iconBg="#fdf4ff"
          label={`Expected profit (${periodLabel})`}
          value={fmtINR(data.grossProfit.value)}
          delta={`${data.profitMargin.value.toFixed(1)}% MGN`}
          deltaType={data.profitMargin.value >= 15 ? 'up' : 'down'}
        />
        <StatCard 
          icon={ShoppingBag}
          iconBg="#f0fdf4"
          label="Orders closed"
          value={data.orders.value.toString()}
          delta={`${data.orders.delta.toFixed(1)}%`}
          deltaType={data.orders.delta >= 0 ? 'up' : 'down'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Comparison Table */}
        <div className="space-y-3">
          <SectionLabel>Growth perspective</SectionLabel>
          <ComparisonTable 
            title="Performance Delta"
            rows={data.comparisonTable}
          />
          
          <SectionLabel>Smart insights</SectionLabel>
          <div className="bg-white rounded-2xl border-[0.5px] border-black/10 p-4 mb-2.5">
            {data.smartInsights.map((insight, i) => (
              <InsightRow 
                key={i}
                type={insight.type}
                text={insight.description}
                label={insight.label}
              />
            ))}
          </div>
        </div>

        {/* Leaderboard Column */}
        <div className="space-y-3">
           <SectionLabel>Field force efficiency</SectionLabel>
           <div className="bg-white rounded-2xl border-[0.5px] border-black/10 overflow-hidden mb-2.5">
            <div className="bg-slate-50/50 px-4 py-3 border-b border-black/5 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Top Performers</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Delivered vol.</span>
            </div>
            {data.spList.slice(0, 7).map((sp, i) => (
              <LeaderboardRow 
                key={i}
                rank={i + 1}
                name={sp.name}
                value={fmtINR(sp.delivered)}
                sub={`${sp.orders} orders fulfilled`}
                progress={Math.min(100, (sp.delivered / (data.spList[0]?.delivered || 1)) * 100)}
                delta={`${Math.abs(sp.delta || 0).toFixed(1)}%`}
                deltaType={(sp.delta || 0) >= 0 ? 'up' : 'down'}
                onClick={() => navigate(`/orders?q=${encodeURIComponent(sp.name)}`)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
