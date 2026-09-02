import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ override: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, key);

const companies = [
  {
    id: "fdf3157b-7ba0-4ae6-bc92-435b2ec599d4",
    name: "Bharat Masala",
    short_code: "BM",
    accent_hex: "#E11D48",
    logo_url: null,
    is_active: true,
    sort_order: 10
  },
  {
    id: "b1b59a6d-e4ef-47da-8da1-807a51fb023c",
    name: "Parle Products",
    short_code: "PARLE",
    accent_hex: "#0284C7",
    logo_url: null,
    is_active: true,
    sort_order: 20
  },
  {
    id: "c8d17277-2fe9-4e78-bc5a-cb26faef74ea",
    name: "Jyothy Labs",
    short_code: "JYOTHY",
    accent_hex: "#16A34A",
    logo_url: null,
    is_active: true,
    sort_order: 30
  }
];

const parleProducts = [
  {
    id: "e29cb1bc-0731-4a4c-8822-0ef3d1b919a0",
    name: "Parle-G Gold Biscuits [1 Kg Pouch]",
    sku: "PL-SN-PGGOLD-1K",
    brand: "Parle",
    division_category: "SPECIAL PRODUCTS",
    pack_category: "POUCH",
    pack_size_value: 1000,
    pack_size_unit: "g",
    units_per_packet: 1,
    packets_per_case: 10,
    units_per_case: 10,
    mrp: 120.00,
    selling_price: 120.00,
    rbp_unit: 100.00,
    rbp_carton: 1000.00,
    weight_per_unit_grams: 1000,
    is_active: true,
    min_stock: 5,
    company_id: "fdf3157b-7ba0-4ae6-bc92-435b2ec599d4",
    unit_type: "pieces",
    unit: "packet"
  },
  {
    id: "aee5bc79-bd3d-4c31-beef-9a5c888d3e60",
    name: "Hide & Seek Chocolate Cookies [250g]",
    sku: "PL-SN-HIDESEEK-250G",
    brand: "Parle",
    division_category: "SPECIAL PRODUCTS",
    pack_category: "POUCH",
    pack_size_value: 250,
    pack_size_unit: "g",
    units_per_packet: 1,
    packets_per_case: 20,
    units_per_case: 20,
    mrp: 50.00,
    selling_price: 50.00,
    rbp_unit: 40.00,
    rbp_carton: 800.00,
    weight_per_unit_grams: 250,
    is_active: true,
    min_stock: 10,
    company_id: "fdf3157b-7ba0-4ae6-bc92-435b2ec599d4",
    unit_type: "pieces",
    unit: "packet"
  }
];

const jyothyProducts = [
  {
    id: "cfa5be10-8bda-4cae-90aa-f166113b2fa0",
    name: "Ujala Supreme Liquid Whitener [250ml]",
    sku: "JL-HH-UJALA-250ML",
    brand: "Ujala",
    division_category: "SPECIAL PRODUCTS",
    pack_category: "BOTTLE",
    pack_size_value: 250,
    pack_size_unit: "ml",
    units_per_packet: 1,
    packets_per_case: 24,
    units_per_case: 24,
    mrp: 65.00,
    selling_price: 65.00,
    rbp_unit: 55.00,
    rbp_carton: 1320.00,
    weight_per_unit_grams: 250,
    is_active: true,
    min_stock: 15,
    company_id: "fdf3157b-7ba0-4ae6-bc92-435b2ec599d4",
    unit_type: "pieces",
    unit: "packet"
  },
  {
    id: "fb8e7a6b-ed3d-4952-b91c-843ac5bb2e00",
    name: "Exo Dishwash Bar [250g]",
    sku: "JL-HH-EXOBAR-250G",
    brand: "Exo",
    division_category: "SPECIAL PRODUCTS",
    pack_category: "POUCH",
    pack_size_value: 250,
    pack_size_unit: "g",
    units_per_packet: 1,
    packets_per_case: 36,
    units_per_case: 36,
    mrp: 30.00,
    selling_price: 30.00,
    rbp_unit: 25.00,
    rbp_carton: 900.00,
    weight_per_unit_grams: 250,
    is_active: true,
    min_stock: 20,
    company_id: "fdf3157b-7ba0-4ae6-bc92-435b2ec599d4",
    unit_type: "pieces",
    unit: "packet"
  }
];

async function seed() {
  console.log("Starting Seeds...");

  // 1. Seed companies
  for (const comp of companies) {
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("id", comp.id)
      .maybeSingle();

    if (!existing) {
      console.log(`Inserting company ${comp.name}...`);
      const { error } = await supabase.from("companies").insert(comp);
      if (error) {
        console.error(`Error inserting company ${comp.name}:`, error.message);
      } else {
        console.log(`Company ${comp.name} inserted!`);
      }
    } else {
      console.log(`Company ${comp.name} already exists.`);
    }
  }

  // Ensure ALL products are mapped to Bharat Masala if company_id is null
  console.log("Ensuring existing products are linked to Bharat Masala...");
  const { error: updateErr } = await supabase
    .from("products")
    .update({ company_id: "fdf3157b-7ba0-4ae6-bc92-435b2ec599d4" })
    .is("company_id", null);
  if (updateErr) {
    console.warn("Update existing products warning:", updateErr.message);
  }

  // 2. Seed Parle Products
  for (const prod of parleProducts) {
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("id", prod.id)
      .maybeSingle();

    if (!existing) {
      console.log(`Inserting Parle product ${prod.name}...`);
      const { error } = await supabase.from("products").insert(prod);
      if (error) {
        console.error(`Error inserting ${prod.name}:`, error.message);
      } else {
        console.log(`Product ${prod.name} inserted!`);
      }
    } else {
      console.log(`Product ${prod.name} already exists.`);
    }
  }

  // 3. Seed Jyothy Labs Products
  for (const prod of jyothyProducts) {
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("id", prod.id)
      .maybeSingle();

    if (!existing) {
      console.log(`Inserting Jyothy product ${prod.name}...`);
      const { error } = await supabase.from("products").insert(prod);
      if (error) {
        console.error(`Error inserting ${prod.name}:`, error.message);
      } else {
        console.log(`Product ${prod.name} inserted!`);
      }
    } else {
      console.log(`Product ${prod.name} already exists.`);
    }
  }

  // 4. Seed Inventory Batches
  console.log("Seeding inventory batches for new products...");
  
  // Find or create dummy invoice
  const { data: existingInvoices } = await supabase
    .from("purchase_invoices")
    .select("id")
    .limit(1);

  let invoiceIdToUse = "";
  if (existingInvoices && existingInvoices.length > 0) {
    invoiceIdToUse = existingInvoices[0].id;
  } else {
    // Create direct purchase invoice
    const { data: newInvoice, error: createInvErr } = await supabase
      .from("purchase_invoices")
      .insert({
        invoice_number: "MT-SEED-01",
        supplier_name: "Multi-Brand Factory Outlet",
        total_amount: 50000.00,
        warehouse_id: "f35d6f5b-ed36-44c1-8399-ac33d2ee5373", // Central Warehouse
        status: "approved"
      })
      .select("id")
      .maybeSingle();
      
    if (createInvErr || !newInvoice) {
      console.error("Failed to create multi-company purchase invoice:", createInvErr?.message);
    } else {
      invoiceIdToUse = newInvoice.id;
    }
  }

  if (invoiceIdToUse) {
    const newProductIds = [
      "e29cb1bc-0731-4a4c-8822-0ef3d1b919a0", // Parle G
      "aee5bc79-bd3d-4c31-beef-9a5c888d3e60", // Hide Seek
      "cfa5be10-8bda-4cae-90aa-f166113b2fa0", // Ujala
      "fb8e7a6b-ed3d-4952-b91c-843ac5bb2e00"  // Exo
    ];

    const centralWarehouseId = "f35d6f5b-ed36-44c1-8399-ac33d2ee5373";
    const northRegionalDepotId = "cf7911be-28f3-4a9c-817b-f503dfbfc001";

    for (const pId of newProductIds) {
      // Check if batches are already seeded for this product
      const { count } = await supabase
        .from("inventory_batches")
        .select("id", { count: "exact", head: true })
        .eq("product_id", pId);

      if (count === 0) {
        console.log(`Seeding batches for product ${pId}...`);
        
        const { data: prodData } = await supabase.from("products").select("mrp, selling_price, rbp_unit").eq("id", pId).single();
        const baseCost = prodData ? (prodData.rbp_unit ? prodData.rbp_unit * 0.8 : (prodData.mrp ? prodData.mrp * 0.65 : 40)) : 40;
        const centralLc = Math.round(baseCost * 100) / 100;
        const northLc = Math.round(baseCost * 1.07 * 100) / 100;

        // Insert into central warehouse
        const { error: batchErr1 } = await supabase
          .from("inventory_batches")
          .insert({
            purchase_invoice_id: invoiceIdToUse,
            product_id: pId,
            warehouse_id: centralWarehouseId,
            batch_number: `B1-${pId.slice(0, 4).toUpperCase()}-NEW`,
            manufactured_date: "2026-02-10",
            expiry_date: "2027-02-10",
            initial_qty: 1200,
            remaining_qty: 850,
            landed_cost: centralLc
          });

        if (batchErr1) {
          console.error(`Error inserting central batch for ${pId}:`, batchErr1.message);
        }

        // Insert into North Regional Depot
        const { error: batchErr2 } = await supabase
          .from("inventory_batches")
          .insert({
            purchase_invoice_id: invoiceIdToUse,
            product_id: pId,
            warehouse_id: northRegionalDepotId,
            batch_number: `B2-${pId.slice(0, 4).toUpperCase()}-NEW`,
            manufactured_date: "2026-03-15",
            expiry_date: "2027-03-15",
            initial_qty: 600,
            remaining_qty: 400,
            landed_cost: northLc
          });

        if (batchErr2) {
          console.error(`Error inserting north batch for ${pId}:`, batchErr2.message);
        }
      } else {
        console.log(`Batches already exist for product ${pId}`);
      }
    }
  }

  // 5. Trigger inventory recomputation!
  console.log("Triggering recompute_all_inventory to refresh stock levels...");
  const { error: rpcErr } = await supabase.rpc("recompute_all_inventory");
  if (rpcErr) {
    console.error("Recompute error:", rpcErr.message);
  } else {
    console.log("Inventory database successfully recomputed!");
  }

  console.log("Seeds Done!");
}

seed();
