import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  console.log("Checking schema functions...");
  
  // Try to recompute Soya Big
  const { data: resBig, error: errBig } = await supabase.rpc('recompute_inventory', { 
    _product_id: "eedd383b-2a3e-4635-b58b-4701977fe2c3" 
  });
  console.log("Recompute Big result:", { resBig, errBig });

  // Try to recompute Soya Mini
  const { data: resMini, error: errMini } = await supabase.rpc('recompute_inventory', { 
    _product_id: "2fd087ca-2006-4d54-b843-9449d1a13e9e" 
  });
  console.log("Recompute Mini result:", { resMini, errMini });
}

run();
