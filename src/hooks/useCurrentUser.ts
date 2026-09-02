import * as React from "react";
import { useAuth } from "@/context/AuthContextCore";
import { usePinAuth, PinSession } from "@/context/PinAuthContextCore";
import { AppRole } from "@/types";

export interface UnifiedUser {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: AppRole | null;
  warehouse_id: string | null;
  isPinUser: boolean;
  session_token?: string;
}

export function useCurrentUser(): UnifiedUser | null {
  const { user, roles, profile } = useAuth();
  const { pinUser } = usePinAuth();

  return React.useMemo(() => {
    if (pinUser) {
      return {
        id: pinUser.profile_id,
        full_name: pinUser.full_name,
        phone: pinUser.phone,
        role: 'salesperson' as AppRole,
        warehouse_id: pinUser.warehouse_id,
        isPinUser: true,
        session_token: pinUser.session_token
      };
    }

    if (user) {
      return {
        id: user.id,
        full_name: profile?.full_name || user.user_metadata?.full_name || null,
        phone: null, 
        role: roles[0] || null,
        warehouse_id: profile?.warehouse_id || null,
        isPinUser: false,
      };
    }

    return null;
  }, [user, roles, profile, pinUser]);
}
