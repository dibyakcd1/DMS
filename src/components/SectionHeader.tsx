import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useIsMobile } from "@/lib/responsive";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction, className, children }: SectionHeaderProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn("mb-4 flex items-end justify-between", className)}>
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {/* {subtitle && !isMobile && <p className="text-sm font-medium text-muted-foreground">{subtitle}</p>} */}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {actionLabel && onAction && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onAction}
            className="h-8 gap-0.5 text-xs font-bold text-primary hover:bg-primary/5"
          >
            {actionLabel}
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
