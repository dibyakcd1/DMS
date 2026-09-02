import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const result = await supabase
    .from("inventory_batches")
    .insert([{
      id: "01e40328-5701-4e4b-a5df-17c52bf2d87b",
      product_id: "2fd087ca-2006-4d54-b843-9449d1a13e9e",
      batch_number: "PUR/2026/04/1-AUTO-f5ea-mini",
      mfg_date: "2026-04-30",
      expiry_date: "2027-04-30",
      received_qty: 1000,
      remaining_qty: 550, // 3 cases (450) + 10 packets (100) = 550 base units/sachets
      cost_price: 5.5,
      landed_cost: 5.5,
      notes: "Split from standard batch for Mini type",
      purchase_invoice_id: "76a403f4-48aa-47c1-9095-62db4b6c2297",
      unit_of_measure: "CARTOON",
      warehouse_id: "4bd0482b-5b5a-4a3f-9147-521e0814c86c"
    }]);

  console.log("Insert result:", result);
}

run();
