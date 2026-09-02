import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const pIds = ["eedd383b-2a3e-4635-b58b-4701977fe2c3", "2fd087ca-2006-4d54-b843-9449d1a13e9e"];

  const { data: stockView, error: viewErr } = await supabase
    .from("v_product_stock")
    .select("*")
    .in("product_id", pIds);

  console.log("v_product_stock view rows for selected products:", stockView);
  console.log("Error if any:", viewErr);
}

run();
