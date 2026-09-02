import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { 
  Layers, 
  History as HistoryIcon, 
  Settings2, 
  ArrowRightLeft, 
  ClipboardList, 
  Warehouse 
} from "lucide-react";

export function StockTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const tabs = React.useMemo(() => [
    { id: "stocks", label: "Stocks", path: "/stock", icon: Layers },
    { id: "history", label: "History", path: "/stock/movement", icon: HistoryIcon },
    { id: "adjustments", label: "Adjustments", path: "/stock/adjustments", icon: Settings2 },
    { id: "transfers", label: "Move Stock", path: "/stock/warehouse-transfers", icon: ArrowRightLeft },
    { id: "audits", label: "Check Stock", path: "/stock/audits", icon: ClipboardList },
    { id: "warehouses", label: "Warehouses", path: "/stock/warehouses", icon: Warehouse },
  ], []);

  // Determine active tab identifier based on path
  const activeTab = React.useMemo(() => {
    if (path === "/stock" || path === "/stock/") return "stocks";
    if (path.startsWith("/stock/movement")) return "history";
    if (path.startsWith("/stock/adjustments")) return "adjustments";
    if (path.startsWith("/stock/warehouse-transfers") || path.startsWith("/stock/transfers")) return "transfers";
    if (path.startsWith("/stock/audits")) return "audits";
    if (path.startsWith("/stock/warehouses")) return "warehouses";
    return "stocks";
  }, [path]);

  return (
    <div className="sticky top-0 z-25 bg-white/95 backdrop-blur-md border-b border-black/[0.04] p-1 shadow-sm -mx-4 px-4">
      <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar py-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
            return (
              <button
                id={`stock-tab-${tab.id}`}
                key={tab.id}
                onClick={() => {
                  navigate(tab.path);
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 px-3 pt-2.5 pb-1.5 transition-all cursor-pointer relative flex-1 shrink-0 select-none focus:outline-none",
                  isActive ? "opacity-100" : "opacity-50 hover:opacity-100"
                )}
              >
                <Icon className={cn("w-4 h-4 transition-all duration-300", isActive ? "text-primary scale-110" : "text-slate-600")} />
                <span className={cn(
                  "text-[9px] sm:text-[10px] font-black uppercase tracking-tight transition-colors whitespace-nowrap",
                  isActive ? "text-primary" : "text-slate-500"
                )}>
                  {tab.label}
                </span>
                {isActive && (
                  <motion.div 
                    layoutId="activeStockNavigationTabPanel"
                    className="absolute bottom-0 left-2 right-2 h-[2.5px] bg-primary rounded-t-full z-10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
        })}
      </div>
    </div>
  );
}
