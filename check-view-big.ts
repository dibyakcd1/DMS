import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const { data, error } = await supabase
    .from("v_product_stock")
    .select("stock_base_units, id, name")
    .eq("id", "eedd383b-2a3e-4635-b58b-4701977fe2c3");

  console.log("View data for selected product:", data);
}

run();
