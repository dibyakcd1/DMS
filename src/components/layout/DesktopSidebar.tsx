import React from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, PanelLeft, PanelLeftClose, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { UnifiedUser } from "@/hooks/useCurrentUser";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  badge?: number;
}

interface SidebarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  navItems: NavItem[];
  showAdminMenu: boolean;
  adminNavItems: NavItem[];
  currentUser: UnifiedUser | null;
  userInitial: string;
  ProfileDropdownContent: React.ReactNode;
  onNavigate: (to: string) => void;
  loadingData?: boolean;
  isSalesTerminal: boolean;
}

export function DesktopSidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
  navItems,
  showAdminMenu,
  adminNavItems,
  currentUser,
  userInitial,
  ProfileDropdownContent,
  onNavigate,
  loadingData,
  isSalesTerminal
}: SidebarProps) {
  return (
    <aside className={cn(
      "hidden md:flex flex-col border-r border-border glass-panel shadow-sm sticky top-0 h-dvh transition-all duration-300 ease-in-out z-40",
      sidebarCollapsed ? "w-16" : "w-64 lg:w-72"
    )}>
      <div className={cn(
        "flex items-center border-b border-border/50 transition-all duration-300",
        sidebarCollapsed ? "p-4 justify-center" : "p-6 gap-3"
      )}>
        <div 
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-brand cursor-pointer active:scale-95 transition-transform"
          onClick={() => onNavigate("/")}
        >
          <span className="text-xs font-black tracking-tighter">DMS</span>
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col animate-in fade-in slide-in-from-left-4 duration-300">
            <div className="flex items-center gap-2">
              <div className="text-sm font-extrabold tracking-tight text-primary leading-tight">DMSv1.0-pro</div>
              {loadingData && <div className="h-3 w-3 animate-spin border-2 border-primary/40 border-t-transparent rounded-full" />}
            </div>
            <div className="text-[10px] font-bold text-muted-foreground leading-none mt-1 uppercase tracking-widest opacity-60">
              {isSalesTerminal ? "Sales Mode" : "Admin Mode"}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin">
        <div className="flex flex-col h-full">
          <div className={cn("flex flex-col space-y-1.5", sidebarCollapsed && "items-center")}>
            <div className="w-full px-1.5 mb-2">
              {sidebarCollapsed ? (
                <button
                  onClick={() => onNavigate("/orders/new")}
                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary hover:bg-primary/95 text-white shadow-md shadow-primary/20 active:scale-95 transition-all duration-200"
                  title="New Order"
                >
                  <Plus className="h-5 w-5" />
                </button>
              ) : (
                <button
                  onClick={() => onNavigate("/orders/new")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 h-11 rounded-2xl bg-primary hover:bg-primary/95 text-white font-black text-xs shadow-md shadow-primary/25 active:scale-[0.98] transition-all duration-200 tracking-wide uppercase"
                >
                  <Plus className="h-4.5 w-4.5" />
                  <span>New Order</span>
                </button>
              )}
            </div>

            {!sidebarCollapsed && (
              <div className="px-3 mb-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">Navigation</p>
              </div>
            )}
            {navItems.map(({ to, label, icon: Icon, end, badge }) => (
              <SidebarLink 
                key={to} 
                to={to} 
                label={label} 
                icon={Icon} 
                end={end} 
                showLabel={!sidebarCollapsed} 
                badge={badge}
              />
            ))}

            {showAdminMenu && (
              <div className={cn("pt-6 space-y-1.5", sidebarCollapsed && "items-center")}>
                {!sidebarCollapsed && (
                  <div className="px-3 mb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">Management</p>
                  </div>
                )}
                {adminNavItems.map(({ to, label, icon: Icon }) => (
                  <SidebarLink 
                    key={to} 
                    to={to} 
                    label={label} 
                    icon={Icon} 
                    showLabel={!sidebarCollapsed} 
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-auto pt-6 border-t border-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  "w-full flex items-center transition-all text-left",
                  !sidebarCollapsed ? "gap-3 p-3 rounded-2xl hover:bg-muted" : "justify-center p-2 rounded-full hover:bg-muted"
                )}>
                  <Avatar className={cn("border-2 border-border/50", !sidebarCollapsed ? "h-10 w-10" : "h-12 w-12")}>
                    <AvatarFallback className="bg-primary/10 font-bold text-primary">{userInitial}</AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground break-words leading-snug">{currentUser?.full_name}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">My Profile</p>
                    </div>
                  )}
                  {!sidebarCollapsed && <ChevronDown className="h-4 w-4 opacity-30" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" className="w-64 mb-2 rounded-xl border-border shadow-2xl p-2 ml-2">
                {ProfileDropdownContent}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <button 
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute -right-3 top-20 bg-card border border-border rounded-full p-1 shadow-sm hover:shadow-md transition-all active:scale-90 z-50"
      >
        {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>
    </aside>
  );
}

function SidebarLink({ to, label, icon: Icon, showLabel, end, badge }: { to: string, label: string, icon: React.ElementType, showLabel: boolean, end?: boolean, badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center transition-all duration-200 group text-sm font-bold relative",
          showLabel ? "px-4 py-3 rounded-xl" : "p-3 rounded-2xl justify-center",
          isActive 
            ? "bg-primary/10 text-primary shadow-sm" 
            : "text-muted-foreground hover:bg-muted"
        )
      }
    >
      <Icon className={cn("transition-transform duration-200", showLabel ? "h-4.5 w-4.5" : "h-6 w-6 group-hover:scale-110")} />
      {showLabel && <span className="ml-3 flex-1">{label}</span>}
      {badge !== undefined && badge > 0 && (
        <span className={cn(
          "bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center min-w-[20px] h-5 px-1 shadow-lg shadow-primary/20",
          !showLabel && "absolute top-1 right-1 border-2 border-card"
        )}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}
