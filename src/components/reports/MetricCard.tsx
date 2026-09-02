import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  delta: number;
  color: string;
  onClick?: () => void;
}

export const MetricCard = ({ icon, label, value, delta, color, onClick }: MetricCardProps) => (
  <Card 
    className={cn(
      "rounded-[1.5rem] md:rounded-2xl border border-slate-100 shadow-sm bg-white p-4 md:p-5 transition-all duration-300",
      onClick ? "cursor-pointer hover:bg-slate-50 hover:shadow-md" : ""
    )}
    onClick={onClick}
  >
    <div className="flex flex-col md:flex-row md:items-start gap-4">
      <div className={cn(
        "h-8 w-8 md:h-7 md:w-7 rounded-lg flex items-center justify-center shrink-0",
        color === 'blue' ? "bg-blue-50 text-blue-500" :
        color === 'amber' ? "bg-amber-50 text-amber-500" :
        color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
        color === 'orange' ? "bg-orange-50 text-orange-500" :
        color === 'emerald' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
      )}>
        {icon}
      </div>
      
      <div className="space-y-1 min-w-0 flex-1">
        <p className="text-[10px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none truncate">{label}</p>
        <div className="flex md:items-baseline gap-2">
          <h4 className="text-lg md:text-base lg:text-lg font-black text-slate-900 tracking-tight leading-none">{value}</h4>
          {delta !== 0 && (
            <p className={cn(
              "text-[10px] font-bold flex items-center gap-0.5",
              delta >= 0 ? "text-emerald-600" : "text-red-500"
            )}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
            </p>
          )}
        </div>
      </div>
    </div>
  </Card>
);
