import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppRole } from "@/types";
import { authService, ProfileData } from "@/services/authService";
import { toast } from "sonner";

import { Ctx, AuthCtx } from "./AuthContextCore";

const perfLog = (tag: string, message: string, startTime?: number) => {
  const duration = startTime ? ` (${(performance.now() - startTime).toFixed(1)}ms)` : "";
  console.log(`[Auth:${tag}] ${message}${duration}`);
};

const isOwnerEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  return lower.startsWith("dibyaprakashkcd") || 
         lower === "admin@tatvishaenterprises.com" || 
         lower === "owner@tatvishaenterprises.com";
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const initRef = React.useRef(false);

  // useQuery handles Layer 2 & 3 (Profile & Roles)
  const { data: authData, isLoading: loadingData, refetch: refreshRolesData, error: authError } = useQuery({
    queryKey: ["auth-data", user?.id],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      perfLog("Fetcher", `Loading layers for ${user.id}`);
      return await authService.getAuthData(user.id, signal);
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    gcTime: 1000 * 60 * 10, // 10 minutes persist
    retry: (failureCount, error: unknown) => {
      // Retry more aggressively for timeouts
      const err = error as Error;
      const msg = err?.message?.toLowerCase() || "";
      if (msg.includes("timeout") || msg.includes("fetch") || msg.includes("network")) {
        return failureCount < 4;
      }
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(Math.pow(2, attempt) * 1000, 10000),
    meta: {
      errorMessage: "Failed to load security profile"
    }
  });

  React.useEffect(() => {
    if (authError) {
      console.error("[Auth:Error] Profile/Roles loading failed:", authError);
      const isTimeout = authError.message?.toLowerCase().includes("timeout");
      if (isTimeout) {
        toast.error("Database connection is slow. Retrying profile load...", {
          id: "auth-timeout-toast",
          duration: 4000
        });
      }
    }
  }, [authError]);

  const profile = React.useMemo(() => authData?.profile ?? null, [authData?.profile]);
  const roles = React.useMemo(() => {
    const list = [...(authData?.roles ?? [])];
    const isOwner = isOwnerEmail(user?.email);
    if (isOwner && !list.includes("owner")) {
      list.push("owner");
    }
    return list;
  }, [authData?.roles, user?.email]);

  const refreshRolesDataFn = refreshRolesData;

  React.useEffect(() => {
    if (user && !loadingData && !profile) {
      console.log("[Auth] User logged in but profile is missing. Attempting auto-repair...", user.id);
      
      const repair = async () => {
        try {
          const defaultFullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Staff";
          
          // Try inserting standard salesperson profile
          const { error } = await supabase.from("profiles").insert([{
            id: user.id,
            email: user.email,
            full_name: defaultFullName,
            role: isOwnerEmail(user.email) ? 'owner' : 'salesperson'
          }]);
          
          if (error) {
            console.error("[Auth] Auto-repair profile insert failed:", error);
          } else {
            console.log("[Auth] Auto-repair profile insert succeeded");
            
            if (isOwnerEmail(user.email)) {
              await authService.setupFirstOwner(user);
            }
            
            // Refetch to get newly created profile
            await refreshRolesDataFn();
          }
        } catch (err) {
          console.error("[Auth] Auto-repair profiles catch error:", err);
        }
      };
      
      repair();
    }
  }, [user, loadingData, profile, refreshRolesDataFn]);

  const refreshRoles = async () => {
    await refreshRolesData();
  };

  const setupFirstOwner = async () => {
    if (!user) return false;
    const ok = await authService.setupFirstOwner(user);
    if (ok) await refreshRolesData();
    return ok;
  };

  React.useEffect(() => {
    perfLog("Init", "Starting Auth bootstrap");
    const initStart = performance.now();

    const bootstrap = async () => {
      if (initRef.current) return;
      initRef.current = true;

      try {
        const { session: s, error } = await authService.getSession();
        
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("refresh_token_not_found") || msg.includes("refresh token") || msg.includes("invalid refresh token")) {
            console.warn("[Auth:Init] Refresh token invalid, clearing session.");
            await authService.signOut();
            window.location.reload();
            return;
          }
          throw error;
        }

        if (s?.user) {
          perfLog("Init", `Session found for ${s.user.email}`);
          setSession(s);
          setUser(s.user);
        } else {
          perfLog("Init", "No session");
        }
      } catch (err) {
        console.error("[Auth:Init] Failed:", err);
      } finally {
        setLoading(false);
        perfLog("Init", "Bootstrap done", initStart);
      }
    };

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      perfLog("Event", `${evt}`);
      
      if (evt === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        queryClient.clear(); // Clear all cache on logout
        setLoading(false);
        return;
      }

      if (evt === "SIGNED_IN" || evt === "TOKEN_REFRESHED" || evt === "USER_UPDATED" || evt === "INITIAL_SESSION") {
        if (s?.user) {
          setSession(s);
          setUser(s.user);
          setLoading(false); // Ensure loading is false if we found a user via event
        }
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value: AuthCtx = {
    user,
    session,
    loading,
    loadingData,
    roles,
    refreshRoles,
    setupFirstOwner,
    profile,
    authError: authError as Error | null,
    isAdmin: roles.includes("admin") || roles.includes("owner") || isOwnerEmail(user?.email),
    signOut: async () => {
      setSession(null);
      setUser(null);
      queryClient.clear();
      await authService.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}


