import * as React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContextCore";
import { usePinAuth } from "@/context/PinAuthContextCore";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProtectedRouteProps = {
  children: React.ReactNode;
  adminOnly?: boolean;
};

export default function ProtectedRoute({ children, adminOnly }: ProtectedRouteProps) {
  const { user, loading: authLoading, loadingData, isAdmin, roles, authError, refreshRoles } = useAuth();
  const { pinUser, pinLoading } = usePinAuth();

  // Wait for initial auth loading
  if (authLoading || pinLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  // If session is active but roles haven't finished background loading, wait.
  // BUT: don't wait forever if it's not a fresh install (we should have a timeout or a way out)
  // We only wait if loadingData is true AND we don't have roles yet.
  if (user && loadingData && roles.length === 0) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-12 h-12">
            <Loader2 className="h-12 w-12 animate-spin text-brand-primary" />
            <div className="absolute inset-0 bg-brand-primary/10 rounded-full animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold tracking-tight uppercase">Verifying Permissions</p>
            <p className="text-xs text-muted-foreground animate-pulse">Establishing secure context...</p>
          </div>
        </div>
      </div>
    );
  }

  // If session exists but roles are still empty AND loadingData is false, 
  // we let it pass through to the page component (like RoleHome) which handles "no roles" UI.

  // Handle Auth query errors (timeouts, etc)
  if (authError && roles.length === 0) {
    const isTimeout = authError.message?.toLowerCase().includes("timeout");
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl border-2 p-8 text-center space-y-6 shadow-xl shadow-slate-200/50">
          <div className="mx-auto w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-amber-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black uppercase tracking-tight">Connection Issue</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isTimeout 
                ? "The database is taking too long to respond. This usually happens on initial load." 
                : "We couldn't verify your permissions. Please check your connection."}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={() => refreshRoles()} className="h-12 rounded-xl font-bold bg-brand-primary text-white shadow-lg shadow-brand-primary/20">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="ghost" onClick={() => window.location.reload()} className="h-10 text-xs font-bold uppercase opacity-60">
              Refresh App
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // PIN users are always salesperson, block admin routes
  if (pinUser) {
    if (adminOnly) return <Navigate to="/" replace />;
    return <>{children}</>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If it's an admin-only route, verify status
  if (adminOnly) {
    if (!isAdmin) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
