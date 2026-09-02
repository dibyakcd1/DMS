import * as React from "react";
import { NavLink, Outlet, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Home, Store, Package, ClipboardList, FileText, LogOut, BarChart3, 
  Users, Boxes, Wallet, Tag, ChevronDown, User, Settings, Settings2, 
  LayoutGrid, Sparkles, Printer, UserCircle, History as HistoryIcon, 
  Warehouse, ArrowRightLeft, Loader2, Sun, Menu, X, ChevronRight, 
  Search, PanelLeftClose, PanelLeft, Layers
} from "lucide-react";
import { useAuth } from "@/context/AuthContextCore";
import { usePinAuth, PinSession } from "@/context/PinAuthContextCore";
import { useCurrentUser, UnifiedUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { usePrinter } from "@/printer/PrinterContextCore";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile, useIsTablet, useIsLaptop } from "@/lib/responsive";
import { DesktopSidebar } from "@/components/layout/DesktopSidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";

const navItemsSales = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/my-day", label: "Day", icon: Sun },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/shops", label: "Shops", icon: Store },
  { to: "/products", label: "Products", icon: Package },
  { to: "/catalog", label: "Catalogs", icon: Layers },
];

const navItemsAdmin = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/catalog", label: "Catalogs", icon: Layers },
  { to: "/collections", label: "Collections", icon: Wallet },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

const adminNavItems = [
  { to: "/stock", icon: Boxes, label: "Stock" },
  { to: "/products", icon: Package, label: "Products" },
  { to: "/shops", icon: Store, label: "Shops" },
  { to: "/users", icon: Users, label: "Users" },
  { to: "/invoices", icon: FileText, label: "Invoices" },
  { to: "/settings", icon: Settings2, label: "Settings" },
];

export default function AppLayout() {
  const { signOut, isAdmin, loadingData, roles } = useAuth();
  const { pinUser, pinSignOut } = usePinAuth();
  const currentUser = useCurrentUser();
  
  const { data: dashboardData } = useDashboardStats(currentUser?.warehouse_id);
  // Casting to a partial object with 'pending' field to avoid 'any'
  const pendingCount = (dashboardData as { pending?: number } | null)?.pending || 0;

  const { state: printerState, connectedDevice } = usePrinter();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isLaptop = useIsLaptop();
  
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar');
      if (saved !== null) return saved === '1';
    }
    // Expanded by default on tablet and desktop
    return false;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // Update localStorage when state changes
  React.useEffect(() => {
    localStorage.setItem('sidebar', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  // Sync sidebar collapse with screen size only if user hasn't explicitly set it or it's a fresh load
  React.useEffect(() => {
    const saved = localStorage.getItem('sidebar');
    if (saved === null) {
      if (isTablet) {
        setSidebarCollapsed(true);
      } else {
        setSidebarCollapsed(false);
      }
    }
  }, [isTablet]);

  const userInitial = currentUser?.full_name?.[0].toUpperCase() ?? currentUser?.role?.[0].toUpperCase() ?? "U";
  
  const hasAdmin = roles.includes("admin") || roles.includes("owner");
  const hasSales = roles.includes("salesperson");
  const isStrictlySales = hasSales && !hasAdmin;
  const isPinUser = !!pinUser;
  
  const viewParam = searchParams.get("view");
  const isSalesTerminal = isPinUser || isStrictlySales || viewParam === "sales";
  
  const showAdminMenu = isAdmin && !isPinUser && viewParam !== "sales";

  const isSpecialOrderPage = isMobile && (
    location.pathname.startsWith('/orders/new') || 
    (location.pathname.startsWith('/orders/') && location.pathname !== '/orders')
  );

  const injectBadges = (items: typeof navItemsSales) => {
    return items.map(item => {
      if (item.to === "/orders") return { ...item, badge: pendingCount };
      return item;
    });
  };

  const navItems = injectBadges(isSalesTerminal ? navItemsSales : navItemsAdmin);

  const warnedRef = React.useRef(false);
  const idleTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = React.useRef<number>(Date.now());

  React.useEffect(() => {
    if (isPinUser && pinUser?.expires_at) {
      const timeLeft = pinUser.expires_at - Date.now();
      if (timeLeft > 0 && timeLeft < 30 * 60 * 1000 && !warnedRef.current) {
        warnedRef.current = true;
        toast.error("Session Expiring", {
          description: `Your PIN session will expire in ${Math.round(timeLeft / 60000)} minutes. Save your work and re-login soon.`,
        });
      }
    }
  }, [isPinUser, pinUser?.expires_at]);

  // Idle Timeout for Admin/Sensitive roles
  React.useEffect(() => {
    if (!isAdmin || isPinUser) return;

    let lastInteraction = Date.now();
    
    const resetIdleTimer = () => {
      const now = Date.now();
      // Throttle to once every 2 seconds
      if (now - lastInteraction < 2000) return;
      
      lastInteraction = now;
      lastActivityRef.current = now;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      
      idleTimerRef.current = setTimeout(async () => {
        const inactiveTime = Date.now() - lastActivityRef.current;
        if (inactiveTime >= 30 * 60 * 1000) {
          console.warn("[AppLayout] Idle timeout reached. Signing out.");
          await signOut();
          navigate("/auth", { replace: true });
          toast.warning("Session Timeout", {
            description: "You have been logged out due to inactivity."
          });
        }
      }, 30 * 60 * 1000);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(name => document.addEventListener(name, resetIdleTimer));
    resetIdleTimer();

    return () => {
      events.forEach(name => document.removeEventListener(name, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isAdmin, isPinUser, signOut, navigate]);

  const toggleTerminalMode = () => {
    const newView = isSalesTerminal ? "admin" : "sales";
    if (newView === "sales") {
      setSearchParams({ view: "sales" });
    } else {
      const { view: _, ...rest } = Object.fromEntries(searchParams.entries());
      setSearchParams(rest);
    }
    navigate("/");
    toast.success(`View Updated`, {
      description: `Switched to ${newView === 'admin' ? 'Admin Console' : 'Sales Terminal'}.`
    });
  };

  const handleSignOut = async () => {
    if (pinUser) {
      pinSignOut();
      navigate("/pin-login", { replace: true });
    } else {
      await signOut();
      navigate("/auth", { replace: true });
    }
  };

  const ProfileDropdown = (
    <ProfileDropdownContent 
      isSalesTerminal={isSalesTerminal} 
      isAdmin={isAdmin} 
      pinUser={pinUser} 
      toggleTerminalMode={toggleTerminalMode} 
      handleSignOut={handleSignOut} 
      navigate={navigate} 
      currentUser={currentUser} 
      printerState={printerState} 
      connectedDevice={connectedDevice} 
    />
  );

  return (
    <div className="flex h-dvh flex-col md:flex-row bg-background antialiased selection:bg-brand-primary/10 overflow-hidden">
      <DesktopSidebar 
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        navItems={navItems}
        showAdminMenu={showAdminMenu}
        adminNavItems={adminNavItems}
        currentUser={currentUser}
        userInitial={userInitial}
        ProfileDropdownContent={ProfileDropdown}
        onNavigate={navigate}
        loadingData={loadingData}
        isSalesTerminal={isSalesTerminal}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Universal Header */}
        <header className="sticky top-0 z-30 border-b border-border glass-panel safe-pt transition-all duration-300">
          <div className="mx-auto flex h-16 items-center justify-between px-4 lg:px-6 border-border/50">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 rounded-xl bg-muted/30 md:hidden hover:bg-muted/50 transition-colors"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>

              <div className="flex flex-col min-w-0 flex-1 ml-2 md:ml-0">
                 <div id="header-title-portal" className="flex flex-col" />
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {!isSpecialOrderPage && (
                <div id="header-action-portal" className="flex items-center gap-2 mr-2" />
              )}

              <NotificationBell />
              
              {!isSpecialOrderPage && (
                <>
                  <div className="h-8 w-[1px] bg-border mx-1 hidden sm:block" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                       <Avatar className={cn(
                         "h-9 w-9 border-2 border-white shadow-sm cursor-pointer transition-transform active:scale-90",
                          loadingData && "animate-pulse"
                       )}>
                        <AvatarFallback className="bg-primary/10 text-primary font-black text-xs">
                          {userInitial}
                        </AvatarFallback>
                      </Avatar>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 mt-2 rounded-2xl border-border shadow-2xl p-2">
                      {ProfileDropdown}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              {isSpecialOrderPage && (
                <div id="header-action-portal" className="flex items-center gap-2" />
              )}
            </div>
          </div>
        </header>

        <MobileMenu 
          open={mobileMenuOpen}
          onOpenChange={setMobileMenuOpen}
          navItems={navItems}
          showAdminMenu={showAdminMenu}
          adminNavItems={adminNavItems}
          currentUser={currentUser}
          userInitial={userInitial}
          isSalesTerminal={isSalesTerminal}
          onSignOut={handleSignOut}
          onNavigate={navigate}
          toggleTerminalMode={toggleTerminalMode}
          isAdmin={isAdmin}
        />

        <main 
          className="flex-1 overflow-y-auto overflow-x-hidden pt-4 pb-8 md:pb-6 scroll-smooth touch-pan-y"
          style={{ 
            paddingBottom: isMobile && !location.pathname.includes('/orders/new') ? '160px' : undefined 
          }}
        >
          <div className="w-full h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="w-full h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {isMobile && <MobileNav navItems={navItems} />}
      </div>
    </div>
  );
}

interface ProfileDropdownProps {
  isSalesTerminal: boolean;
  isAdmin: boolean;
  pinUser: PinSession | null;
  toggleTerminalMode: () => void;
  handleSignOut: () => Promise<void>;
  navigate: (path: string) => void;
  currentUser: UnifiedUser | null;
  printerState: string;
  connectedDevice: { name: string } | null;
}

function ProfileDropdownContent({ 
  isSalesTerminal, isAdmin, pinUser, toggleTerminalMode, handleSignOut, navigate, currentUser, printerState, connectedDevice 
}: ProfileDropdownProps) {
  return (
    <>
      <div className="flex flex-col space-y-1.5 p-3">
        <p className="text-sm font-black tracking-tight leading-snug break-words">{currentUser?.full_name || "Profile"}</p>
        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">
          {isAdmin ? "Administrator" : "Sales Team"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="status-badge bg-primary/10 text-primary text-[10px] py-1 px-3 font-black uppercase tracking-tighter">
            {isSalesTerminal ? "Sales View" : "Admin View"}
          </span>
          {printerState === 'connected' && (
            <span className="status-badge bg-emerald-50 text-emerald-600 text-[10px] py-1 px-3 flex items-center gap-1.5 font-black uppercase tracking-tighter">
              <Printer className="h-3 w-3" /> {connectedDevice?.name || 'Connected'}
            </span>
          )}
        </div>
      </div>
      
      <DropdownMenuSeparator className="my-1 opacity-50" />
      
      {isAdmin && !pinUser && (
        <>
          <div className="px-1 py-1">
            <DropdownMenuItem 
              className="gap-3 py-3 px-3 cursor-pointer rounded-xl font-bold text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10"
              onClick={toggleTerminalMode}
            >
              {!isSalesTerminal ? (
                <><Sparkles className="h-4 w-4" /> <span>Switch to Sales View</span></>
              ) : (
                <><LayoutGrid className="h-4 w-4" /> <span>Switch to Admin View</span></>
              )}
            </DropdownMenuItem>
          </div>
        </>
      )}

      <div className="px-1 py-1">
        <DropdownMenuLabel className="px-3 py-1.5 text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Account Activities</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => navigate("/my-day")} className="gap-3 py-2.5 px-3 cursor-pointer rounded-xl font-bold">
          <UserCircle className="h-4 w-4 text-brand-primary/70" /> <span>My Day</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-3 py-2.5 px-3 cursor-pointer rounded-xl font-bold">
          <Settings2 className="h-4 w-4 text-brand-primary/70" /> <span>System Settings</span>
        </DropdownMenuItem>
      </div>
      
      <DropdownMenuSeparator className="my-1 opacity-50" />
      <div className="px-1 py-1">
        <DropdownMenuItem 
          className="gap-3 py-3 px-3 text-destructive focus:bg-destructive/5 focus:text-destructive cursor-pointer rounded-xl font-black uppercase tracking-widest text-[11px]"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" /> <span>Logout</span>
        </DropdownMenuItem>
      </div>
    </>
  );
}
