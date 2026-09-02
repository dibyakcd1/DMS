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

  console.log("Single row of v_product_stock view:", data);
  console.log("Error:", error);
}

run();
