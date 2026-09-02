import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const { data: inventory, error: invErr } = await supabase
    .from("inventory")
    .select("*")
    .limit(5);

  const { data: activeBatches, error: batchErr } = await supabase
    .from("inventory_batches")
    .select("product_id, remaining_qty")
    .limit(5);

  console.log("Some general inventory rows:", inventory);
  console.log("Some general batches rows:", activeBatches);
  console.log("Errors if any:", { invErr, batchErr });
}

run();
