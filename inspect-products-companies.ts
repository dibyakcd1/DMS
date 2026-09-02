import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function inspect() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, company_id, division_category, pack_category, mrp');

  if (error) {
    console.error("Error fetching products:", error.message);
  } else {
    console.log("Current Products in DB:", products);
  }
}

inspect();
