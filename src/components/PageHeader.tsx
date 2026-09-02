import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { useIsMobile, useIsTablet } from "@/lib/responsive";
import { TeleportAction } from "@/components/TeleportAction";

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  onAction?: () => void;
  onBack?: () => void;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  className?: string;
  disableTeleport?: boolean;
  titleColor?: string;
  titleClassName?: string;
}

export function PageHeader({ 
  title, 
  subtitle, 
  action, 
  onAction, 
  onBack,
  actionLabel, 
  actionIcon, 
  className,
  disableTeleport = false,
  titleColor,
  titleClassName
}: PageHeaderProps) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  const ActionButton = ({ compact = false }: { compact?: boolean } = {}) => {
    if (action) return <>{action}</>;
    if (!actionLabel || !onAction) return null;

    return (
      <Button 
        onClick={onAction} 
        size={compact ? "sm" : "lg"}
        variant={compact ? "glass" : "default"}
        className={cn(
          "transition-all active:scale-95",
          compact 
            ? "rounded-xl h-10 md:h-11 lg:h-9 border-border font-bold text-xs px-4"
            : "font-black shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-[1.02] items-center px-8"
        )}
      >
        {actionIcon && (
          <span className={cn(
            "shrink-0",
            compact ? "mr-1.5 h-4 w-4" : "mr-2"
          )}>
            {actionIcon}
          </span>
        )}
        <span className="truncate">{actionLabel}</span>
      </Button>
    );
  };

  const HeaderTitleContent = () => (
    <div className="flex flex-col animate-in fade-in slide-in-from-left-4 duration-500">
      <div 
        className={cn(
          "text-lg md:text-xl font-black tracking-tight line-clamp-1 leading-tight",
          titleClassName
        )}
        style={{ color: titleColor }}
      >
        {title}
      </div>
      {subtitle && (
        <div className="hidden">
          {subtitle}
        </div>
      )}
    </div>
  );

  return (
    <>
      {!disableTeleport && (
        <TeleportAction to="header-title-portal">
          <HeaderTitleContent />
        </TeleportAction>
      )}

      <div className={cn(
        "flex flex-col gap-4 mb-3 px-1",
        "sm:flex-row sm:items-start sm:justify-between lg:items-center",
        !disableTeleport && "hidden", // Hide on desktop/mobile if teleported
        className
      )}>
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex flex-col gap-1 min-w-0">
            {onBack && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onBack} 
                className="h-8 w-fit rounded-lg -ml-2 text-muted-foreground hover:text-primary transition-all flex items-center gap-1.5 group mb-0.5 hover:bg-primary/5 px-2"
              >
                <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span className="text-xs font-medium tracking-tight opacity-70 group-hover:opacity-100">Back</span>
              </Button>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-nowrap">
                 <h1 className={cn(
                   "font-black tracking-tight text-foreground leading-tight truncate px-1",
                   isMobile ? "text-xl md:text-2xl flex-1" : "text-3xl lg:text-3xl xl:text-4xl shrink-0"
                 )}>
                  {title}
                </h1>
                {!isMobile && subtitle && (
                  <div className="h-6 w-px bg-border/60 mx-2 hidden lg:block" />
                )}
              </div>
              {/* subtitle removed as requested */}
            </div>
          </div>
        </div>

        {/* Action teleporting */}
        {(action || (actionLabel && onAction)) && (
          disableTeleport ? (
            <div className={cn("flex shrink-0 gap-3 md:pt-2 lg:pt-0", isMobile && "items-center")}>
              <ActionButton compact={isMobile} />
            </div>
          ) : (
            <TeleportAction>
              <ActionButton compact />
            </TeleportAction>
          )
        )}
      </div>
    </>
  );
}

