import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://qnpmwyslsgtxunmyhisj.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable__1iBcCiqwAWCTfohCQF31g_muQQIu4a";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("*")
    .limit(5);

  const { data: userRoles, error: rErr } = await supabase
    .from("user_roles")
    .select("*")
    .limit(5);

  console.log("Some profiles:", profiles, "error:", pErr);
  console.log("Some user_roles:", userRoles, "error:", rErr);
}

run();
