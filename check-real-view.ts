import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const { data, error } = await supabase
    .from("v_product_stock")
    .select("*")
    .limit(1);

  // Since we can't query information_schema directly via postgrest if it's protected,
  // let's try calling RPC or view pg_views using supabase.rpc or a SQL query if possible.
  // Wait, does Postgrest let us query pg_views? Let's check!
  const { data: views, error: viewErr } = await supabase
    .from("pg_views")
    .select("*")
    .eq("viewname", "v_product_stock");

  console.log("View data:", views, viewErr);
}

run();
