import React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  navItems: { to: string; label: string; icon: React.ElementType; end?: boolean }[];
}

export function MobileNav({ navItems }: MobileNavProps) {
  return (
    <nav className="fixed inset-x-4 bottom-6 z-30 md:hidden animate-in fade-in slide-in-from-bottom-8 duration-500 delay-300">
      <div className="mx-auto flex max-w-md items-center justify-around gap-1 p-2 rounded-3xl glass-panel shadow-2xl border border-border/50 safe-pb shadow-brand/10">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "relative flex flex-col items-center gap-1 min-w-[64px] py-2 transition-all duration-300 rounded-xl",
                isActive ? "text-primary" : "text-muted-foreground hover:bg-muted/50",
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-300",
                  isActive ? "bg-primary/10" : ""
                )}>
                  <Icon className={cn("h-5 w-5 transition-transform duration-300", isActive ? "scale-110 stroke-[2.5px]" : "stroke-2")} />
                </div>
                <span className={cn(
                  "text-[9px] font-black transition-colors uppercase tracking-widest leading-none",
                  isActive ? "text-primary opacity-100" : "text-muted-foreground opacity-40"
                )}>
                  {label}
                </span>
                {isActive && (
                  <div className="absolute -bottom-1 h-1 w-4 bg-primary rounded-full animate-in zoom-in duration-300" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
