import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function run() {
  const { data: colData, error: colError } = await supabase.rpc('get_column_definitions_v1', { p_table_name: 'schemes' });
  if (colError) {
    // If no helper RPC exists, query a dummy row to inspect returned object fields
    const { data, error } = await supabase.from('schemes').select('*').limit(1);
    if (error) {
      console.log("Error querying schemes:", error.message);
    } else {
      console.log("Schemes table columns:", data && data.length > 0 ? Object.keys(data[0]) : "Empty table (doing fallback table info query)");
    }
  } else {
    console.log("Schemes columns via RPC:", colData);
  }

  // Let's also do a PostgreSQL information_schema query via a direct select or from a table we know
  // Since we don't have a direct SQL executor, we can insert a dummy row or fetch a single row or use postgrest metadata
  const { data: companiesData } = await supabase.from('companies').select('*').limit(1);
  console.log("Companies sample row fields:", companiesData);
}

run();
