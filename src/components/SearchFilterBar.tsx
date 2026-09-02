import * as React from "react";
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface FilterOption {
  id: string;
  label: string;
  icon?: 'sort' | 'filter' | 'user';
  options: string[];
  optionLabels?: Record<string, string>;
}

interface SearchFilterBarProps {
  categories: { id?: string; label: string; count?: number }[];
  filters: FilterOption[];
  totalCount: number;
  currentSearch: string;
  currentCategory: string;
  currentFilters: Record<string, string>;
  onSearchChange: (search: string) => void;
  onCategoryChange: (category: string) => void;
  onFilterChange: (id: string, value: string) => void;
  onClearFilters: () => void;
  hideSearch?: boolean;
  placeholder?: string;
  showInactive?: boolean;
  onShowInactiveChange?: (v: boolean) => void;
}

export function SearchFilterBar({
  categories,
  filters,
  totalCount,
  currentSearch,
  currentCategory,
  currentFilters,
  onSearchChange,
  onCategoryChange,
  onFilterChange,
  onClearFilters,
  hideSearch = false,
  placeholder = "Search data...",
  showInactive,
  onShowInactiveChange,
}: SearchFilterBarProps) {
  const hasActiveFilters = currentSearch !== '' || currentCategory !== 'All' || Object.keys(currentFilters).length > 0;

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      // Use 2px tolerance for subpixel discrepancies
      setCanScrollLeft(scrollLeft > 2);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
    }
  }, []);

  // Sync scroll positions and add resize/scroll listeners
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      
      // Perform initial check with a small timeout to allow layout settlement
      checkScroll();
      const timer = setTimeout(checkScroll, 100);
      
      return () => {
        container.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
        clearTimeout(timer);
      };
    }
  }, [categories, checkScroll]);

  // Translate vertical scroll to horizontal scroll on the category list
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheelEvent = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollLeft += e.deltaY * 1.2; // slight acceleration factor for mouse wheel
      }
    };

    container.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheelEvent);
    };
  }, []);

  const handleScroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (container) {
      const scrollAmount = 300;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 w-full max-w-full px-4 lg:px-0">
        {!hideSearch && (
          <div className="relative flex-1 group lg:max-w-xl">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 md:h-5 md:w-5 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors pointer-events-none" />
            <Input
              placeholder={placeholder}
              className="pl-9 md:pl-13 pr-9 md:pr-14 h-9 md:h-14 border border-white/20 glass-card focus-visible:ring-0 focus-visible:border-brand-primary/30 rounded-lg md:rounded-[22px] transition-all text-slate-700 placeholder:text-slate-400 font-bold text-xs md:text-base shadow-sm w-full"
              value={currentSearch}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {currentSearch && (
              <button 
                onClick={() => onSearchChange("")}
                className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 h-6 w-6 md:h-10 md:w-10 flex items-center justify-center text-slate-300 hover:text-slate-600 transition-colors"
                title="Clear search"
              >
                <X className="h-3 w-3 md:h-5 md:w-5" />
              </button>
            )}
          </div>
        )}

        {onShowInactiveChange && (
          <div className="hidden sm:flex items-center gap-3 bg-white px-4 h-9 md:h-14 rounded-lg md:rounded-[20px] border border-black/[0.04] md:border-[#e8dfd5] shadow-sm">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] whitespace-nowrap">Show Inactive</span>
            <Switch 
              checked={showInactive} 
              onCheckedChange={onShowInactiveChange}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        )}
        
        {filters.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className={cn(
                  "h-9 w-9 md:h-14 md:w-14 rounded-lg md:rounded-[20px] bg-white md:bg-[#fdfaf6] border border-black/[0.04] md:border-[#e8dfd5] shadow-sm transition-all hover:bg-amber-50 active:scale-95 shrink-0 flex items-center justify-center text-slate-500 md:text-[#a8522b] group",
                  hasActiveFilters && "ring-2 ring-amber-700/10 border-amber-700/20"
                )}
              >
                <SlidersHorizontal className="h-4 w-4 md:h-6 md:w-6 transition-transform group-hover:rotate-12" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-[2rem] p-3 glass-panel shadow-2xl border border-white/30 animate-in zoom-in-95 duration-300">
              <DropdownMenuLabel className="text-[10px] font-black text-muted-foreground/40 px-3 py-2 uppercase tracking-[0.2em]">Filter & sort</DropdownMenuLabel>
              <DropdownMenuSeparator className="mx-2 opacity-50" />
              {filters.map(f => (
                <div key={f.id} className="p-1">
                   <p className="px-3 py-1.5 text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">{f.label}</p>
                   {f.options.map(opt => (
                     <DropdownMenuItem
                       key={opt}
                       className={cn(
                        "py-3 px-3 rounded-2xl cursor-pointer text-sm font-bold transition-all",
                        currentFilters[f.id] === opt 
                          ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" 
                          : "hover:bg-white/40"
                       )}
                       onClick={() => onFilterChange(f.id, opt)}
                     >
                       <span className="flex-1">{f.optionLabels ? (f.optionLabels[opt] || opt) : opt}</span>
                       {currentFilters[f.id] === opt && <X className="h-3 w-3 opacity-100" />}
                     </DropdownMenuItem>
                   ))}
                </div>
              ))}
              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator className="mx-2 opacity-50" />
                  <DropdownMenuItem 
                    className="py-3 px-3 rounded-xl cursor-pointer text-xs font-black uppercase tracking-widest text-destructive hover:bg-destructive/5 justify-center"
                    onClick={onClearFilters}
                  >
                    Reset all parameters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      
      {categories.length > 1 && (
        <div className="w-full relative group/filters px-1">
          {/* Left Arrow Button */}
          {canScrollLeft && (
            <button
              onClick={() => handleScroll('left')}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 md:h-10 md:w-10 rounded-full bg-white/95 hover:bg-white shadow-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all hover:scale-105 active:scale-95"
              title="Scroll Left"
            >
              <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          )}

          {/* Right Arrow Button */}
          {canScrollRight && (
            <button
              onClick={() => handleScroll('right')}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 md:h-10 md:w-10 rounded-full bg-white/95 hover:bg-white shadow-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all hover:scale-105 active:scale-95"
              title="Scroll Right"
            >
              <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          )}

          {/* Left subtle gradient cover (when scrollable left) */}
          {canScrollLeft && (
            <div className="absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-slate-50 to-transparent pointer-events-none z-10" />
          )}

          {/* Right subtle gradient cover (when scrollable right) */}
          {canScrollRight && (
            <div className="absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-slate-50 to-transparent pointer-events-none z-10" />
          )}

          <div 
            ref={scrollContainerRef}
            className="overflow-x-auto no-scrollbar scroll-smooth"
          >
            <div className="flex items-center gap-1.5 px-4 py-2 min-w-max">
              {categories.map((cat) => {
                const catValue = cat.id || cat.label;
                return (
                  <button
                    key={cat.label}
                    onClick={() => onCategoryChange(catValue)}
                    className={cn(
                      "h-8 md:h-11 rounded-xl px-4 md:px-6 text-[10px] md:text-[13px] font-bold transition-all whitespace-nowrap border shadow-sm group active:scale-95 flex items-center justify-center min-w-[70px] md:min-w-[100px] gap-2.5",
                      currentCategory === catValue 
                        ? "bg-slate-900 border-slate-900 text-white shadow-md ring-1 ring-slate-900/10" 
                        : "bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:shadow-md"
                    )}
                  >
                    {cat.label !== 'All' && (
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full ring-2 ring-white/20",
                        cat.label === 'Pending' ? "bg-amber-500" :
                        cat.label === 'Approved' ? "bg-blue-500" :
                        cat.label === 'Dispatched' ? "bg-violet-600" :
                        cat.label === 'Delivered' ? "bg-emerald-500" :
                        cat.label === 'Rejected' ? "bg-rose-500" :
                        cat.label === 'Cancelled' ? "bg-slate-400" :
                        "bg-slate-300"
                      )} />
                    )}
                    {cat.label} {cat.count !== undefined && <span className={cn("ml-0.5 tabular-nums opacity-60", currentCategory === catValue ? "text-white" : "text-slate-400")}>{cat.count}</span>}
                  </button>
                );
              })}
              {/* Horizontal padding spacer to guarantee full scroll reachability */}
              <div className="w-16 md:w-32 shrink-0" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
