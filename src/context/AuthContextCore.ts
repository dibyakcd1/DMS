import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AppRole } from "@/types";
import { ProfileData } from "@/services/authService";

export type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  loadingData: boolean;
  roles: AppRole[];
  isAdmin: boolean;
  refreshRoles: () => Promise<void>;
  setupFirstOwner: () => Promise<boolean>;
  signOut: () => Promise<void>;
  profile: ProfileData | null;
  authError: Error | null;
};

export const Ctx = React.createContext<AuthCtx | undefined>(undefined);

export const useAuth = () => {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
};
