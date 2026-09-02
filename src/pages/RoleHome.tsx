import * as React from "react";
import { useAuth } from "@/context/AuthContextCore";
import { usePinAuth } from "@/context/PinAuthContextCore";
import MyDay from "./MyDay";
import Home from "./Home";
import { User, ShieldAlert, KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { useSearchParams } from "react-router-dom";

export default function RoleHome() {
  const { roles, isAdmin, loading, setupFirstOwner, signOut, user } = useAuth();
  const { pinUser } = usePinAuth();
  const [busy, setBusy] = React.useState(false);
  const [searchParams] = useSearchParams();
  
  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isSalesView = searchParams.get("view") === "sales";

  // If logged in via PIN, we are always in sales mode
  if (pinUser) {
    return <MyDay />;
  }

  // Admin and Owner roles see the global Dashboard
  if (isAdmin || roles.includes("owner") || roles.includes("admin")) {
    // If specifically viewing as sales, show MyDay
    if (isSalesView) return <MyDay />;
    return <Home />;
  }
  
  // Salespeople see their MyDay view
  if (roles.includes("salesperson")) {
    return <MyDay />;
  }
  
  // If we have a user but no roles yet, and we are not loading, show a specific error
  if (roles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-fade-in">
        <div className="relative mb-8">
          <div className="h-24 w-24 bg-brand-primary/10 rounded-full flex items-center justify-center">
            <User className="h-10 w-10 text-brand-primary" />
          </div>
          <div className="absolute -bottom-2 -right-2 h-10 w-10 bg-white shadow-lg border border-border rounded-full flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
          </div>
        </div>
        
        <h2 className="text-2xl font-black tracking-tight text-foreground mb-2">No Roles Assigned</h2>
        <p className="text-muted-foreground text-sm max-w-xs mb-8 leading-relaxed">
          Your account is active, but doesn't have permissions to access the dashboard. 
          Contact an administrator or initialize the system if you are the owner.
        </p>

        <div className="w-full max-w-sm space-y-3 pb-8 border-b border-border/40 mb-8">
          <Button 
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await setupFirstOwner();
              if (ok) {
                toast.success("System initialized! You are now the Owner.");
              } else {
                console.error('[Context] System initialization failed');
                toast.error(friendlyError("Initialization failed. Check console for details."));
              }
              setBusy(false);
            }}
            className="w-full h-14 rounded-2xl bg-brand-primary font-black uppercase tracking-widest text-xs shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <KeyRound className="h-4 w-4" />
            Claim System Ownership
          </Button>

          <Button 
            variant="ghost" 
            onClick={signOut}
            className="w-full h-12 rounded-xl text-muted-foreground font-bold hover:text-foreground flex items-center justify-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>

        <div className="text-left w-full max-w-sm p-4 bg-muted/30 rounded-xl space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Diagnostic Info</p>
          <div className="text-[9px] font-mono break-all space-y-1">
            <div className="flex justify-between border-b border-border/20 py-1">
              <span className="text-muted-foreground">User ID:</span>
              <span>{user?.id || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-border/20 py-1">
              <span className="text-muted-foreground">Email:</span>
              <span>{user?.email || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Auth Ready:</span>
              <span className={loading ? "text-amber-500" : "text-green-500"}>{loading ? "Initializing..." : "Ready"}</span>
            </div>
          </div>
        </div>

        <p className="mt-8 text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/40">
          Distribution Management OS v1.0
        </p>
      </div>
    );
  }

  // Default fallback
  return <MyDay />;
}
