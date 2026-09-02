import { supabase } from "@/integrations/supabase/client";
import { Shop } from "@/types";

export async function createInstantCustomer(name: string, phone?: string): Promise<Shop> {
  const cleanName = (name || "").trim();
  if (!cleanName) {
    throw new Error("Please enter a valid customer or shop name");
  }

  try {
    // Check if shop with same name already exists
    const { data: existing } = await supabase
      .from("shops")
      .select("*")
      .ilike("name", cleanName)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return existing as Shop;
    }

    const payload = {
      name: cleanName,
      phone: phone?.trim() || null,
      shop_type: "basic",
      is_active: true,
      credit_limit: 0,
      discount_pct: 0,
      address: "Direct Counter / Quick Sale"
    };

    const { data: created, error } = await supabase
      .from("shops")
      .insert(payload)
      .select()
      .single();

    if (error) {
      // Fallback minimal insert
      const minimalPayload = {
        name: cleanName,
        phone: phone?.trim() || null,
        is_active: true,
        address: "Direct Counter / Quick Sale"
      };
      const { data: retryCreated, error: retryError } = await supabase
        .from("shops")
        .insert(minimalPayload)
        .select()
        .single();
      if (retryError) throw retryError;
      return retryCreated as Shop;
    }

    return created as Shop;
  } catch (err) {
    console.error("Failed to create instant customer:", err);
    throw err;
  }
}

export async function getOrCreateCounterShop(): Promise<Shop> {
  try {
    const { data: existing } = await supabase
      .from("shops")
      .select("*")
      .or("name.eq.Walk-in Customer / Counter Sale,name.eq.Counter Sale,name.eq.Walk-in Customer,name.ilike.%Counter Sale%")
      .limit(1)
      .maybeSingle();

    if (existing) {
      return existing as Shop;
    }

    // Try creating with standard columns
    const standardPayload = {
      name: "Walk-in Customer / Counter Sale",
      shop_type: "basic",
      is_active: true,
      credit_limit: 0,
      discount_pct: 0,
      address: "Counter Sale / Walk-in"
    };

    let { data: created, error } = await supabase
      .from("shops")
      .insert(standardPayload)
      .select()
      .single();

    if (error) {
      // Retry with minimal columns if custom columns fail
      const minimalPayload = {
        name: "Walk-in Customer / Counter Sale",
        is_active: true,
        address: "Counter Sale / Walk-in"
      };

      const retryRes = await supabase
        .from("shops")
        .insert(minimalPayload)
        .select()
        .single();

      created = retryRes.data;
      error = retryRes.error;
    }

    if (error) {
      const { data: fallback } = await supabase
        .from("shops")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (fallback) return fallback as Shop;
      throw error;
    }

    return created as Shop;
  } catch (err) {
    console.error("Failed to get/create counter shop:", err);
    throw err;
  }
}

