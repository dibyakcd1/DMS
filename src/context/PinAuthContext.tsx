import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { PinAuthContext, PinSession, type PinAuthCtx } from "./PinAuthContextCore";

const PIN_SESSION_KEY = 'bm_pin_session';

export function PinAuthProvider({ children }: { children: React.ReactNode }) {
  const [pinUser, setPinUser] = React.useState<PinSession | null>(null);
  const [pinLoading, setPinLoading] = React.useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const pinSignOut = React.useCallback(() => {
    localStorage.removeItem(PIN_SESSION_KEY);
    setPinUser(null);
  }, []);

  const checkPinSession = React.useCallback(async () => {
    const stored = localStorage.getItem(PIN_SESSION_KEY);
    if (stored) {
      try {
        const session: PinSession = JSON.parse(stored);
        if (session.expires_at > Date.now()) {
          // Fix: Validate session token against server-side session table
          const { data, error } = await supabase.rpc('verify_staff_session_v2', {
            p_session_token: session.session_token
          });
            
          if (error || !data) {
            console.warn("PIN session invalid or revoked. Signing out.");
            pinSignOut();
          } else {
            setPinUser(prev => {
              if (prev && prev.profile_id === session.profile_id && prev.session_token === session.session_token && prev.expires_at === session.expires_at) {
                return prev;
              }
              return session;
            });
          }
        } else {
          pinSignOut();
        }
      } catch (e) {
        pinSignOut();
      }
    } else {
      setPinUser(null);
    }
    setPinLoading(false);
  }, [pinSignOut]);

  React.useEffect(() => {
    checkPinSession();
    
    // Fix: Re-validate on tab focus
    window.addEventListener('focus', checkPinSession);
    return () => window.removeEventListener('focus', checkPinSession);
  }, [checkPinSession]);

  // Handle session expiry on navigation
  React.useEffect(() => {
    if (pinUser && pinUser.expires_at < Date.now()) {
      pinSignOut();
      navigate('/pin-login');
    }
  }, [location, pinUser, pinSignOut, navigate]);

  const loginWithPin = async (profileId: string, pin: string) => {
    try {
      const { data, error } = await supabase.rpc('verify_staff_pin_v2', {
        p_profile_id: profileId,
        p_pin: pin
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; session_token?: string; profile?: { id: string, full_name: string, phone: string, role: string } };

      if (!result.success) {
        return { success: false, error: result.error || 'Login failed' };
      }

      // Fetch additional profile data (like warehouse_id) that is not in the RPC response
      const { data: profileData } = await supabase
        .from('profiles')
        .select('warehouse_id')
        .eq('id', result.profile!.id)
        .single();

      const newSession: PinSession = {
        profile_id: result.profile!.id,
        full_name: result.profile!.full_name,
        phone: result.profile!.phone,
        role: result.profile!.role as 'salesperson',
        session_token: result.session_token!,
        warehouse_id: profileData?.warehouse_id || null,
        expires_at: Date.now() + 12 * 60 * 60 * 1000 // 12 hours
      };

      localStorage.setItem(PIN_SESSION_KEY, JSON.stringify(newSession));
      setPinUser(newSession);
      return { success: true };
    } catch (e: unknown) {
      console.error('PIN Login Error:', e);
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : (e instanceof Error ? e.message : 'An unexpected error occurred');
      return { success: false, error: msg };
    }
  };

  return (
    <PinAuthContext.Provider value={{ pinUser, pinLoading, loginWithPin, pinSignOut }}>
      {children}
    </PinAuthContext.Provider>
  );
}
