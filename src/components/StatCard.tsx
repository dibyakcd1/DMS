import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { useIsMobile } from "@/lib/responsive";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
    label?: string;
  };
  color?: "primary" | "success" | "warning" | "destructive" | "info" | "brand";
  className?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, icon: Icon, trend, color = "primary", className, onClick }: StatCardProps) {
  const isMobile = useIsMobile();
  const colorMap = {
    primary: "bg-primary/20 text-primary border-primary/30",
    success: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
    warning: "bg-amber-500/20 text-amber-600 border-amber-500/30",
    destructive: "bg-rose-500/20 text-rose-600 border-rose-500/30",
    info: "bg-blue-500/20 text-blue-600 border-blue-500/30",
    brand: "bg-brand-primary/20 text-brand-primary border-brand-primary/30",
  };

  return (
    <Card 
      onClick={onClick}
      className={cn(
        "border-border glass-card shadow-sm overflow-hidden h-full group hover:border-primary/40 transition-all md:rounded-3xl", 
        onClick && "cursor-pointer hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:scale-[0.98]",
        className
      )}
    >
      <CardContent className="p-4 md:p-5 lg:p-6 h-full flex flex-col md:flex-row items-center md:items-start justify-center md:justify-start text-center md:text-left gap-3 md:gap-4">
        <div className={cn("h-11 w-11 md:h-10 md:w-10 rounded-[1.25rem] md:rounded-xl flex items-center justify-center mb-0 md:mb-0 border shadow-sm transition-transform group-hover:scale-110 shrink-0", colorMap[color])}>
          <Icon size={isMobile ? 20 : 18} />
        </div>
        
        <div className="space-y-1 w-full min-w-0">
          <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-muted-foreground/60 truncate">{label}</p>
          <div className="flex flex-col md:flex-row md:items-baseline md:gap-2">
            <h3 className="text-lg md:text-xl font-bold tracking-tight text-foreground tabular-nums leading-none pb-0.5 break-all">
              {value}
            </h3>
            
            {trend && (
              <div className={cn(
                "flex items-center justify-center md:justify-start gap-1 text-[10px] font-medium",
                trend.isPositive ? "text-status-delivered" : "text-status-cancelled"
              )}>
                {trend.isPositive ? <TrendingUp size={10} strokeWidth={2} /> : <TrendingDown size={10} strokeWidth={2} />}
                <span>{trend.value}%</span>
                {trend.label && <span className="text-muted-foreground/40 font-medium ml-0.5 lowercase hidden lg:inline">vs {trend.label}</span>}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
