import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const pId = "eedd383b-2a3e-4635-b58b-4701977fe2c3";

  const { data: inventory, error } = await supabase
    .from("inventory")
    .select("*")
    .eq("product_id", pId);

  console.log("Inventory row for Big:", inventory);
  console.log("Error if any:", error);
}

run();
