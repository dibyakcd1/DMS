import { supabase } from "@/integrations/supabase/client";
import { AppRole } from "@/types";
import { withRetry } from "@/lib/retryUtils";
import type { Session, User } from "@supabase/supabase-js";

export type ProfileData = { 
  id: string; 
  full_name: string | null; 
  email: string | null; 
  warehouse_id: string | null;
  role?: string | null;
};

export interface AuthData {
  profile: ProfileData | null;
  roles: AppRole[];
}

export const authService = {
  /**
   * Layer 1: Session bootstrap
   * Fast only. Returns the current session status.
   */
  async getSession(): Promise<{ session: Session | null; user: User | null; error: Error | null }> {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, user: session?.user ?? null, error: error as Error | null };
  },

  /**
   * Layer 2: Profile loading
   * Background async.
   */
  async loadProfile(uid: string): Promise<ProfileData | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, warehouse_id, role")
      .eq("id", uid)
      .maybeSingle();
    
    if (error) {
      console.error("[AuthService] Profile load error:", error);
      throw error;
    }
    return data as ProfileData | null;
  },

  /**
   * Layer 3: Roles/permissions
   * Lazy loaded.
   */
  async loadRoles(uid: string): Promise<AppRole[]> {
    // 1. Try reading role from profiles first
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      if (prof?.role) {
        return [prof.role as AppRole];
      }
    } catch {
      // Ignore profile select error
    }

    // 2. Fallback: try user_roles table if it exists
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      
      if (!error && data && data.length > 0) {
        return data.map(r => r.role as AppRole);
      }
    } catch {
      // Ignore user_roles error if table doesn't exist
    }

    return ["salesperson"];
  },

  /**
   * Combined call for legacy support or comprehensive refresh
   */
  async getAuthData(uid: string, signal?: AbortSignal): Promise<AuthData> {
    return await withRetry(async (retrySignal) => {
      // Step 1: Try the streamlined RPC
      const { data, error: rpcError } = await supabase.rpc("get_user_auth_data", { p_uid: uid });

      if (!rpcError && data) {
        const { profile: p, roles: r } = data as { profile: ProfileData, roles: string[] };
        const combinedRoles = (r && r.length > 0) ? r : (p?.role ? [p.role] : ["salesperson"]);
        return { profile: p, roles: combinedRoles as AppRole[] };
      }

      if (retrySignal.aborted) throw new Error("Aborted");

      // Step 2: Fallback to direct parallel table queries
      const profile = await this.loadProfile(uid);
      const roles = profile?.role ? [profile.role as AppRole] : await this.loadRoles(uid);

      return { profile, roles };
    }, {
      maxRetries: 2,
      initialDelayMs: 800,
      signal,
    });
  },

  async signOut() {
    return await supabase.auth.signOut();
  },

  async setupFirstOwner(user: User): Promise<boolean> {
    try {
      // Use RPC instead of direct upsert to avoid privilege escalation
      const { data, error } = await supabase.rpc("setup_first_owner", {
        p_uid: user.id,
        p_full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner",
        p_email: user.email
      });
      
      if (error) throw error;
      return !!data;
    } catch (err) {
      console.error("[AuthService] setupFirstOwner failed:", err);
      return false;
    }
  }
};
