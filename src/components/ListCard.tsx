import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import { useIsMobile } from "@/lib/responsive";

interface ListCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}

export function ListCard({ 
  title, 
  subtitle, 
  meta, 
  badge, 
  icon, 
  onClick, 
  className,
  active 
}: ListCardProps) {
  const isMobile = useIsMobile();

  return (
    <Card 
      className={cn(
        "group border-white/30 glass-card shadow-sm transition-all duration-300 active:scale-[0.98] overflow-hidden rounded-3xl",
        onClick && "cursor-pointer hover:border-primary/40 hover:shadow-2xl",
        active && "border-primary/40 bg-white/40",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 sm:p-5 flex items-center gap-4">
        {icon && (
          <div className={cn(
            "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border border-white/20 bg-white/20 backdrop-blur-md transition-all duration-300 shadow-inner",
            active ? "bg-primary text-white border-primary/20 shadow-lg shadow-primary/20" : "text-slate-400 group-hover:bg-primary/20 group-hover:text-primary group-hover:border-primary/10 group-hover:scale-105"
          )}>
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3 className={cn(
              "font-bold text-sm tracking-tight text-foreground transition-colors whitespace-normal leading-tight break-words",
              onClick && "group-hover:text-primary"
            )}>
              {title}
            </h3>
            {badge}
          </div>
          {subtitle && (
            <div className="text-[10px] md:text-[11px] font-medium text-muted-foreground/80 leading-relaxed break-words">
              {subtitle}
            </div>
          )}
          {meta && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              {meta}
            </div>
          )}
        </div>
        {onClick && (
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all border border-transparent shadow-sm",
            active ? "bg-primary text-white" : "bg-white/40 text-slate-400 group-hover:bg-primary group-hover:text-white group-hover:shadow-2xl group-hover:shadow-primary/20 group-hover:scale-110"
          )}>
            <ChevronRight size={18} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
