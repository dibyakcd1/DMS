import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const supabase = createClient(supabaseUrl, key);

async function checkStockAuditsColumns() {
  const { data: whs } = await supabase.from("warehouses").select("id").limit(1);
  if (!whs || whs.length === 0) {
    console.log("No warehouses found.");
    return;
  }
  const whId = whs[0].id;
  console.log("Using warehouse ID:", whId);

  const { data, error } = await supabase.from("stock_audits").insert({
    warehouse_id: whId,
    status: 'draft'
  }).select();

  if (error) {
    console.log("Insert failed:", error);
  } else if (data && data.length > 0) {
    console.log("Inserted dummy successfully, keys are:", Object.keys(data[0]));
    console.log("Record content:", data[0]);
    // Clean it up
    await supabase.from("stock_audits").delete().eq("id", data[0].id);
  }
}

checkStockAuditsColumns();
