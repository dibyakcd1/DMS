import { supabase } from "@/integrations/supabase/client";
import { persistProductToSupabase } from "@/lib/productPersistence";

export const PREDEFINED_COMPANIES = [
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
  },
  {
    id: "d2b18422-777a-4a8e-bc2f-e89a5c888d3d",
    name: "Hindustan Unilever (HUL)",
    short_code: "HUL",
    accent_hex: "#4F46E5",
    logo_url: null,
    is_active: true,
    sort_order: 40
  },
  {
    id: "ea812456-9a2f-410a-81a1-cf5011bd2aa0",
    name: "ITC Limited",
    short_code: "ITC",
    accent_hex: "#D97706",
    logo_url: null,
    is_active: true,
    sort_order: 50
  }
];

export const PREDEFINED_PRODUCTS = [
  {
    id: "e29cb1bc-0731-4a4c-8822-0ef3d1b919a0",
    name: "Parle-G Gold Biscuits [1 Kg Pouch]",
    sku: "PL-SN-PGGOLD-1K",
    brand: "Parle",
    division_category: "Food Items",
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
    company_id: "b1b59a6d-e4ef-47da-8da1-807a51fb023c",
    unit_type: "pieces",
    unit: "packet"
  },
  {
    id: "aee5bc79-bd3d-4c31-beef-9a5c888d3e60",
    name: "Hide & Seek Chocolate Cookies [250g]",
    sku: "PL-SN-HIDESEEK-250G",
    brand: "Parle",
    division_category: "Food Items",
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
    company_id: "b1b59a6d-e4ef-47da-8da1-807a51fb023c",
    unit_type: "pieces",
    unit: "packet"
  },
  {
    id: "cfa5be10-8bda-4cae-90aa-f166113b2fa0",
    name: "Ujala Supreme Liquid Whitener [250ml]",
    sku: "JL-HH-UJALA-250ML",
    brand: "Ujala",
    division_category: "Household Care",
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
    company_id: "c8d17277-2fe9-4e78-bc5a-cb26faef74ea",
    unit_type: "pieces",
    unit: "packet"
  },
  {
    id: "fb8e7a6b-ed3d-4952-b91c-843ac5bb2e00",
    name: "Exo Dishwash Bar [250g]",
    sku: "JL-HH-EXOBAR-250G",
    brand: "Exo",
    division_category: "Household Care",
    pack_category: "POUCH",
    pack_size_value: 250,
    pack_size_unit: "g",
    units_per_packet: 1,
    packets_per_case: 30,
    units_per_case: 30,
    mrp: 30.00,
    selling_price: 30.00,
    rbp_unit: 24.00,
    rbp_carton: 720.00,
    weight_per_unit_grams: 250,
    is_active: true,
    min_stock: 20,
    company_id: "c8d17277-2fe9-4e78-bc5a-cb26faef74ea",
    unit_type: "pieces",
    unit: "packet"
  },
  {
    id: "e2cb1bc0-7314-4c88-220e-f3d1b919a2e0",
    name: "Vim Lemon Dishwash Liquid [250ml]",
    sku: "HU-HH-VIMDISHL-250ML",
    brand: "Vim",
    division_category: "Household Care",
    pack_category: "BOTTLE",
    pack_size_value: 250,
    pack_size_unit: "ml",
    units_per_packet: 1,
    packets_per_case: 24,
    units_per_case: 24,
    mrp: 55.00,
    selling_price: 52.00,
    rbp_unit: 45.00,
    rbp_carton: 1080.00,
    weight_per_unit_grams: 250,
    is_active: true,
    min_stock: 10,
    company_id: "d2b18422-777a-4a8e-bc2f-e89a5c888d3d",
    unit_type: "pieces",
    unit: "packet"
  },
  {
    id: "ea812456-9a2f-410a-81a1-cf5011bd2aa1",
    name: "Aashirvaad Whole Wheat Atta [10 Kg Bag]",
    sku: "IT-SN-AASHIRVAAD-10K",
    brand: "Aashirvaad",
    division_category: "Grains & Flours",
    pack_category: "BAG",
    pack_size_value: 10,
    pack_size_unit: "kg",
    units_per_packet: 1,
    packets_per_case: 4,
    units_per_case: 4,
    mrp: 460.00,
    selling_price: 450.00,
    rbp_unit: 390.00,
    rbp_carton: 1560.00,
    weight_per_unit_grams: 10000,
    is_active: true,
    min_stock: 10,
    company_id: "ea812456-9a2f-410a-81a1-cf5011bd2aa0",
    unit_type: "pieces",
    unit: "packet"
  },
  {
    id: "ea812456-9a2f-410a-81a1-cf5011bd2aa2",
    name: "Sunfeast Dark Fantasy Choco Fills [250g]",
    sku: "IT-SN-DARKFANTASY-250G",
    brand: "Sunfeast",
    division_category: "Food Items",
    pack_category: "POUCH",
    pack_size_value: 250,
    pack_size_unit: "g",
    units_per_packet: 1,
    packets_per_case: 24,
    units_per_case: 24,
    mrp: 120.00,
    selling_price: 115.00,
    rbp_unit: 95.00,
    rbp_carton: 2280.00,
    weight_per_unit_grams: 250,
    is_active: true,
    min_stock: 12,
    company_id: "ea812456-9a2f-410a-81a1-cf5011bd2aa0",
    unit_type: "pieces",
    unit: "packet"
  }
];

export async function seedSampleDatabaseData(): Promise<{ success: boolean; message: string }> {
  try {
    const finalCompanyIds = new Map<string, string>();
    
    // 1. Seed all predefined companies
    for (const company of PREDEFINED_COMPANIES) {
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .or(`id.eq.${company.id},short_code.eq.${company.short_code}`)
        .maybeSingle();

      if (!existing) {
        const { data: inserted } = await supabase
          .from("companies")
          .insert(company)
          .select("id")
          .maybeSingle();
        if (inserted?.id) {
          finalCompanyIds.set(company.short_code.toUpperCase(), inserted.id);
        }
      } else if (existing?.id) {
        finalCompanyIds.set(company.short_code.toUpperCase(), existing.id);
      }
    }

    // 2. Seed sample products
    for (const prod of PREDEFINED_PRODUCTS) {
      const matchedPredefinedCompany = PREDEFINED_COMPANIES.find(c => c.id === prod.company_id);
      let realCompanyId = prod.company_id;
      if (matchedPredefinedCompany) {
        const mappedId = finalCompanyIds.get(matchedPredefinedCompany.short_code.toUpperCase());
        if (mappedId) {
          realCompanyId = mappedId;
        }
      }

      const productPayload = {
        ...prod,
        company_id: realCompanyId
      };

      const { data: existingProd } = await supabase
        .from("products")
        .select("id")
        .or(`id.eq.${prod.id},sku.eq.${prod.sku}`)
        .maybeSingle();

      if (!existingProd) {
        await persistProductToSupabase(productPayload, prod.id);
      }
    }

    return {
      success: true,
      message: "Sample portfolio (companies & products) seeded successfully."
    };
  } catch (err: unknown) {
    console.error("Error in seedSampleDatabaseData:", err);
    throw err;
  }
}
