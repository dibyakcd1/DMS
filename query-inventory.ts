import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const pIds = ["eedd383b-2a3e-4635-b58b-4701977fe2c3", "2fd087ca-2006-4d54-b843-9449d1a13e9e"];

  // Query inventory table
  const { data: inventory, error: invErr } = await supabase
    .from("inventory")
    .select("*")
    .in("product_id", pIds);

  // Query any database views or tables containing stock/warehouse info
  const { data: warehouseInv, error: wInvErr } = await supabase
    .from("warehouse_inventory")
    .select("*")
    .in("product_id", pIds);

  console.log("Inventory table rows:", inventory);
  console.log("Warehouse Inventory table rows:", warehouseInv);
  console.log("Errors if any:", { invErr, wInvErr });
}

run();
