import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  console.log("--- Inspecting v_inventory_batch_details ---");
  const { data: vData, error: vError } = await supabase
    .from("v_inventory_batch_details")
    .select("*")
    .limit(1);
  console.log("v_inventory_batch_details sample:", vData);
  console.log("v_inventory_batch_details error:", vError);

  console.log("\n--- Inspecting shop_product_price_overrides ---");
  const { data: oData, error: oError } = await supabase
    .from("shop_product_price_overrides")
    .select("*")
    .limit(1);
  console.log("shop_product_price_overrides sample:", oData);
  console.log("shop_product_price_overrides error:", oError);
}

run();
