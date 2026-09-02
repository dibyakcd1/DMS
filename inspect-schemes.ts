import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const supabase = createClient(supabaseUrl, key);

async function run() {
  console.log("Fetching all schemes...");
  const { data: schemes, error } = await supabase.from("schemes").select("id, name, company_id, product_id, category");
  if (error) {
    console.error("Error fetching schemes:", error);
    return;
  }
  
  console.log(`Total schemes fetched: ${schemes?.length}`);
  schemes?.forEach((s, idx) => {
    console.log(`${idx + 1}. Scheme: ${s.name} | company_id: ${s.company_id} | product_id: ${s.product_id} | category: ${s.category}`);
  });
}

run();
