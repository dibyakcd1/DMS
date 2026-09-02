import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

console.log("Connecting to:", supabaseUrl);
const supabase = createClient(supabaseUrl, key);

async function run() {
  const tables = ['companies', 'schemes', 'products', 'orders', 'shops', 'warehouses', 'inventory_batches', 'inventory'];
  for (const table of tables) {
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.log(`Table "${table}": Error ->`, error.message);
    } else {
      console.log(`Table "${table}": OK (count: ${count})`);
    }
  }
}

run();
