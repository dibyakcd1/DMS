import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

async function inspectProducts() {
  const { data, error } = await supabase.from("products").select("*").limit(1);
  if (error) {
    console.error("Error products:", error);
  } else {
    console.log("Raw products columns:", data.length > 0 ? Object.keys(data[0]) : "No products");
  }
}

inspectProducts();
