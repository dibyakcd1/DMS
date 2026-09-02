import * as React from "react";

export interface PinSession {
  profile_id: string;
  full_name: string | null;
  phone: string | null;
  role: 'salesperson';
  session_token: string;
  warehouse_id: string | null;
  expires_at: number; // Unix timestamp ms
}

export interface PinAuthCtx {
  pinUser: PinSession | null;
  pinLoading: boolean;
  loginWithPin: (profileId: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  pinSignOut: () => void;
}

export const PinAuthContext = React.createContext<PinAuthCtx | undefined>(undefined);

export const usePinAuth = () => {
  const context = React.useContext(PinAuthContext);
  if (context === undefined) {
    throw new Error("usePinAuth must be used within a PinAuthProvider");
  }
  return context;
};
