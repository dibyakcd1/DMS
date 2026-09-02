import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const pIds = ["eedd383b-2a3e-4635-b58b-4701977fe2c3", "2fd087ca-2006-4d54-b843-9449d1a13e9e"];

  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, is_active")
    .in("id", pIds);

  const { data: batches } = await supabase
    .from("inventory_batches")
    .select("*")
    .in("product_id", pIds);

  const { data: inventory } = await supabase
    .from("inventory")
    .select("*")
    .in("product_id", pIds);

  console.log("Current Products:", products);
  console.log("Current Batches:", batches);
  console.log("Current Inventory Rows:", inventory);
}

run();
