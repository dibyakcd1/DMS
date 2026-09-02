import React from "react";
import { ChevronRight, ChevronDown, Boxes, Warehouse, Package, Store, Users, FileText, History as HistoryIcon, Settings2, LogOut, UserCircle } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { UnifiedUser } from "@/hooks/useCurrentUser";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
}

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navItems: NavItem[];
  showAdminMenu: boolean;
  adminNavItems: NavItem[];
  currentUser: UnifiedUser | null;
  userInitial: string;
  isSalesTerminal: boolean;
  onSignOut: () => void;
  onNavigate: (to: string) => void;
  toggleTerminalMode: () => void;
  isAdmin: boolean;
}

export function MobileMenu({
  open,
  onOpenChange,
  navItems,
  showAdminMenu,
  adminNavItems,
  currentUser,
  userInitial,
  isSalesTerminal,
  onSignOut,
  onNavigate,
  toggleTerminalMode,
  isAdmin
}: MobileMenuProps) {
  const handleLinkClick = (to: string) => {
    onNavigate(to);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-[300px] border-r-0 flex flex-col h-full bg-background overflow-hidden font-sans">
        <SheetHeader className="sr-only">
          <SheetTitle>Mobile Navigation Menu</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-8 pb-32 scrollbar-none pt-8">
          <div className="flex items-center gap-3 px-3 mb-8">
             <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white shadow-brand">
              <span className="text-base font-black tracking-tighter">TE</span>
            </div>
            <p className="text-lg font-black tracking-tighter text-slate-900 uppercase">Tatvisha</p>
          </div>

          <div className="space-y-1.5">
            <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">Navigation</p>
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <MobileNavLink 
                key={to} 
                to={to} 
                label={label} 
                icon={Icon} 
                end={end} 
                onClick={() => handleLinkClick(to)} 
              />
            ))}
          </div>

          {showAdminMenu && (
            <div className="space-y-1.5">
              <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">Management</p>
              {adminNavItems.map(({ to, label, icon: Icon }) => (
                <MobileNavLink 
                  key={to} 
                  to={to} 
                  label={label} 
                  icon={Icon} 
                  onClick={() => handleLinkClick(to)} 
                />
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">Account</p>
            {isAdmin && (
              <button 
                onClick={toggleTerminalMode}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm text-primary bg-primary/5 hover:bg-primary/10"
              >
                <Boxes className="h-4.5 w-4.5" />
                <span>Switch to {isSalesTerminal ? 'Admin' : 'Sales'} View</span>
                <ChevronRight className="ml-auto h-4 w-4 opacity-40" />
              </button>
            )}
            <MobileNavLink to="/settings" label="Settings" icon={Settings2} onClick={() => handleLinkClick("/settings")} />
            <button 
              onClick={onSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm text-destructive hover:bg-destructive/5"
            >
              <LogOut className="h-4.5 w-4.5" />
              <span>Logout</span>
              <ChevronRight className="ml-auto h-4 w-4 opacity-40" />
            </button>
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-border/50 bg-card/50">
          <div className="flex items-center gap-3 p-2">
            <Avatar className="h-10 w-10 border border-border">
              <AvatarFallback className="bg-primary/10 font-bold text-primary">{userInitial}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground break-words leading-tight">{currentUser?.full_name}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60 break-all">{currentUser?.email}</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavLink({ to, label, icon: Icon, onClick, end }: { to: string, label: string, icon: React.ElementType, onClick: () => void, end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm",
          isActive 
            ? "bg-primary text-white shadow-lg shadow-primary/20" 
            : "text-muted-foreground hover:bg-muted"
        )
      }
    >
      <Icon className="h-4.5 w-4.5" />
      <span>{label}</span>
      <ChevronRight className="ml-auto h-4 w-4 opacity-20" />
    </NavLink>
  );
}
