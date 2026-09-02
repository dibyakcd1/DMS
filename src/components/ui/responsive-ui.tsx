
import React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile, useIsTablet, useIsCompact } from "@/lib/responsive";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ResponsiveContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function ResponsiveContainer({ children, className, ...props }: ResponsiveContainerProps) {
  return (
    <div 
      className={cn("w-full px-4 md:px-6 lg:px-8", className)} 
      {...props}
    >
      {children}
    </div>
  );
}

interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  cols?: {
    base?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
    "2xl"?: number;
  };
}

export function ResponsiveGrid({ children, className, cols = { base: 1, md: 2, lg: 3 }, ...props }: ResponsiveGridProps) {
  const baseCols: Record<number, string> = {
    1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4",
    5: "grid-cols-5", 6: "grid-cols-6", 7: "grid-cols-7", 8: "grid-cols-8"
  };
  const smCols: Record<number, string> = {
    1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4",
    5: "sm:grid-cols-5", 6: "sm:grid-cols-6", 7: "sm:grid-cols-7", 8: "sm:grid-cols-8"
  };
  const mdCols: Record<number, string> = {
    1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4",
    5: "md:grid-cols-5", 6: "md:grid-cols-6", 7: "md:grid-cols-7", 8: "md:grid-cols-8"
  };
  const lgCols: Record<number, string> = {
    1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4",
    5: "lg:grid-cols-5", 6: "lg:grid-cols-6", 7: "lg:grid-cols-7", 8: "lg:grid-cols-8"
  };
  const xlCols: Record<number, string> = {
    1: "xl:grid-cols-1", 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4",
    5: "xl:grid-cols-5", 6: "xl:grid-cols-6", 7: "xl:grid-cols-7", 8: "xl:grid-cols-8"
  };
  const xl2Cols: Record<number, string> = {
    1: "2xl:grid-cols-1", 2: "2xl:grid-cols-2", 3: "2xl:grid-cols-3", 4: "2xl:grid-cols-4",
    5: "2xl:grid-cols-5", 6: "2xl:grid-cols-6", 7: "2xl:grid-cols-7", 8: "2xl:grid-cols-8"
  };

  const responsiveClasses = cn(
    "grid gap-4 md:gap-6 w-full",
    cols.base && baseCols[cols.base],
    cols.sm && smCols[cols.sm],
    cols.md && mdCols[cols.md],
    cols.lg && lgCols[cols.lg],
    cols.xl && xlCols[cols.xl],
    cols["2xl"] && xl2Cols[cols["2xl"]],
    className
  );

  return (
    <div className={responsiveClasses} {...props}>
      {children}
    </div>
  );
}

interface AdaptiveTableProps<T> {
  data: T[];
  columns: {
    header: string;
    accessorKey?: keyof T;
    id?: string;
    render?: (item: T) => React.ReactNode;
    className?: string;
    mobileLabel?: string;
    hideOnMobile?: boolean;
  }[];
  renderMobileCard?: (item: T) => React.ReactNode;
  keyExtractor?: (item: T) => string;
  onRowClick?: (item: T) => void;
  className?: string;
  minWidth?: string;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function AdaptiveTable<T>({ 
  data, 
  columns, 
  renderMobileCard, 
  keyExtractor, 
  onRowClick,
  className,
  minWidth = "800px",
  isLoading,
  emptyMessage = "No items found."
}: AdaptiveTableProps<T>) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const getRowKey = keyExtractor || ((item: T) => {
    const i = item as T & { id?: string; uuid?: string };
    return i.id || i.uuid || JSON.stringify(item);
  });

  if (isLoading && data.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 md:h-16 w-full animate-pulse bg-slate-50 rounded-2xl ring-1 ring-slate-100" />
        ))}
      </div>
    );
  }

  if (!isLoading && data.length === 0) {
    return (
      <Card className="rounded-2xl border-none shadow-sm bg-slate-50/50 py-24 flex flex-col items-center justify-center text-center mx-auto max-w-lg ring-1 ring-slate-100/50">
        <div className="h-20 w-20 rounded-3xl bg-white shadow-xl flex items-center justify-center mb-8 ring-1 ring-slate-100">
           <div className="h-3 w-3 rounded-full bg-brand-primary animate-pulse" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] leading-none mb-1">List is Empty</p>
          <p className="text-lg font-black text-slate-900 tracking-tight">{emptyMessage}</p>
        </div>
      </Card>
    );
  }

  // Tablet Grid Layout (1 column of spacious cards)
  if (isTablet && renderMobileCard) {
    return (
      <div className={cn("grid grid-cols-1 gap-4", className)}>
        {data.map((item) => (
          <div key={getRowKey(item)} onClick={() => onRowClick?.(item)} className={cn(onRowClick && "cursor-pointer active:scale-[0.98] transition-transform h-full")}>
            {renderMobileCard(item)}
          </div>
        ))}
      </div>
    );
  }

  if (isMobile && renderMobileCard) {
    return (
      <div className={cn("space-y-4 px-1", className)}>
        {data.map((item) => (
          <div key={getRowKey(item)} onClick={() => onRowClick?.(item)} className={cn(onRowClick && "cursor-pointer active:scale-[0.98] transition-transform")}>
            {renderMobileCard(item)}
          </div>
        ))}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className={cn("space-y-4", className)}>
        {data.map((item) => (
          <Card key={getRowKey(item)} onClick={() => onRowClick?.(item)} className={cn("p-6 border-none shadow-sm rounded-2xl bg-white ring-1 ring-slate-100", onRowClick && "cursor-pointer active:scale-95 transition-transform")}>
            <div className="space-y-4">
              {columns.map((col, idx) => (
                !col.hideOnMobile && (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">
                      {col.mobileLabel || col.header}
                    </span>
                    <div className="text-sm font-bold text-slate-900">
                      {col.render ? col.render(item) : col.accessorKey ? String(item[col.accessorKey]) : null}
                    </div>
                  </div>
                )
              ))}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Card className={cn("rounded-2xl border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] bg-white overflow-hidden ring-1 ring-slate-100", className)}>
      <div className="overflow-x-auto no-scrollbar touch-pan-x">
        <table className="w-full text-left border-collapse" style={{ minWidth: minWidth }}>
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              {columns.map((col, idx) => (
                <th 
                  key={idx} 
                  className={cn(
                    "px-4 sm:px-6 md:px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.25em] whitespace-nowrap",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.map((item) => (
              <tr 
                key={getRowKey(item)} 
                onClick={() => onRowClick?.(item)}
                className={cn(
                  "group transition-all hover:bg-slate-50/50", 
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((col, idx) => (
                  <td key={idx} className={cn("px-4 sm:px-6 md:px-8 py-5 text-xs sm:text-sm font-bold text-slate-700 whitespace-normal group-hover:text-slate-900 transition-colors", col.className)}>
                    {col.render ? col.render(item) : col.accessorKey ? String(item[col.accessorKey]) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function MobileDrawer({ 
  children, 
  trigger, 
  title,
  open,
  onOpenChange 
}: { 
  children: React.ReactNode; 
  trigger?: React.ReactNode; 
  title?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  
  if (!isMobile) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent side="bottom" className="rounded-t-3xl px-6 pb-12 pt-4 h-[85vh] overflow-hidden flex flex-col">
        <SheetTitle className="sr-only">{title || "Menu"}</SheetTitle>
        <div className="mx-auto w-12 h-1.5 bg-muted rounded-full mb-6 shrink-0" />
        {title && (
          <SheetHeader className="text-left mb-6 shrink-0">
            <SheetTitle className="text-2xl font-black tracking-tighter text-primary">{title}</SheetTitle>
          </SheetHeader>
        )}
        <div className="flex-1 overflow-y-auto space-y-6 pb-20">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ResponsiveDialog({
  children,
  trigger,
  title,
  description,
  open,
  onOpenChange,
  className
}: {
  children: React.ReactNode;
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
        <SheetContent side="bottom" className={cn("rounded-t-3xl h-[90vh] p-0 flex flex-col overflow-hidden", className)}>
          <SheetTitle className="sr-only">{title || "Dialog Content"}</SheetTitle>
          <div className="mx-auto w-12 h-1.5 bg-muted-foreground/20 rounded-full my-4 shrink-0" />
          <SheetHeader className="px-6 text-left shrink-0">
            {title && <SheetTitle className="text-xl font-black text-primary">{title}</SheetTitle>}
            {description && <div className="text-sm text-muted-foreground font-medium italic opacity-70">{description}</div>}
          </SheetHeader>
          <div className={cn("flex-1 min-h-0 flex flex-col", !className?.includes('p-0') && "px-6 py-6 pb-20 overflow-y-auto")}>
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={cn("max-w-xl rounded-3xl p-8", className)}>
        <DialogTitle className="sr-only">{title || "Dialog Content"}</DialogTitle>
        {title && (
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-black text-primary">{title}</DialogTitle>
            {description && <DialogDescription className="text-muted-foreground font-medium italic">{description}</DialogDescription>}
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
