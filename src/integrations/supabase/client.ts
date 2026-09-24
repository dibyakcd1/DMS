import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const DEFAULT_SUPABASE_URL = "https://qnpmwyslsgtxunmyhisj.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable__1iBcCiqwAWCTfohCQF31g_muQQIu4a";

const getSupabaseUrl = (): string => {
  if (typeof window !== "undefined") {
    try {
      const customUrl = localStorage.getItem("dms_supabase_url");
      if (customUrl && customUrl.trim()) return customUrl.trim();
    } catch {
      // Ignore localStorage read errors
    }
  }
  return import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
};

const getSupabaseKey = (): string => {
  if (typeof window !== "undefined") {
    try {
      const customKey = localStorage.getItem("dms_supabase_key");
      if (customKey && customKey.trim()) return customKey.trim();
    } catch {
      // Ignore localStorage read errors
    }
  }
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY;
};

const supabaseUrl = getSupabaseUrl();
const supabaseKey = getSupabaseKey();

// Generate a unique storage key based on the project URL to prevent 
// "Invalid Refresh Token" errors when multiple projects use the same origin (localhost)
const storageKey = supabaseUrl && !supabaseUrl.includes("placeholder")
  ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token` 
  : 'supabase.auth.token';

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("placeholder") || supabaseKey.includes("placeholder")) {
  const errorMsg = "Supabase configuration is missing or contains placeholder values. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment variables.";
  console.warn(errorMsg);
}

export const supabase = createClient<Database>(
  supabaseUrl, 
  supabaseKey,
  {
    auth: {
      storageKey,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    }
  }
);

// Graceful health check to detect configuration issues early
if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.warn("Supabase session check notice:", error.message);
    } else {
      console.info("Supabase connected successfully. Session status:", !!data.session);
    }
  }).catch(err => {
    console.warn("Supabase connectivity notice:", err instanceof Error ? err.message : err);
  });
}
