import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const supabase = createClient(supabaseUrl, key);

async function run() {
  console.log("=== DB INSPECTION ===");
  
  // 1. Fetch all companies
  const { data: companies, error: compErr } = await supabase
    .from("companies")
    .select("*");
  
  if (compErr) {
    console.error("Error fetching companies:", compErr);
  } else {
    console.log(`Companies in DB: ${companies?.length}`);
    companies?.forEach(c => {
      console.log(`- ID: ${c.id} | Name: ${c.name} | Code: ${c.short_code} | Active: ${c.is_active}`);
    });
  }

  // 2. Fetch all products
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, name, sku, company_id, division_category, is_active");
  
  if (prodErr) {
    console.error("Error fetching products:", prodErr);
  } else {
    console.log(`\nProducts in DB: ${products?.length}`);
    products?.forEach(p => {
      console.log(`- ID: ${p.id} | Name: ${p.name} | SKU: ${p.sku} | Company ID: ${p.company_id} | Cat: ${p.division_category}`);
    });
  }
}

run();
