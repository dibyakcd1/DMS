import { lookupHsnTaxonomy } from "./hsnTaxonomy";

export interface CategoryTaxonomy {
  id: string;
  name: string;
  code?: string;
  description?: string;
  subcategories?: string[];
}

export const PRODUCT_TAXONOMY: CategoryTaxonomy[] = [
  {
    id: "spices",
    name: "Spices",
    code: "SPC",
    description: "Pure whole and ground spices (Haldi, Mirch, Dhaniya, Jeera, etc.)",
    subcategories: ["Turmeric (Haldi)", "Chilli (Mirch)", "Coriander (Dhaniya)", "Cumin (Jeera)", "Mustard (Rai)", "Whole Spices", "Basic Spices"]
  },
  {
    id: "blended_spice",
    name: "Blended Spice",
    code: "BLN",
    description: "Mixed spice formulations (Garam Masala, Meat Masala, Kitchen King, etc.)",
    subcategories: ["Garam Masala", "Meat Masala", "Chicken Masala", "Kitchen King", "Chaat Masala", "Pav Bhaji Masala", "Sambhar Masala", "Chole Masala", "Biryani Masala", "Sabji Masala"]
  },
  {
    id: "personal_care",
    name: "Personal Care",
    code: "PC",
    description: "Personal hygiene, soaps, shampoos, skin care, oral care",
    subcategories: ["Bath Soaps", "Hair Care & Shampoos", "Oral Care & Toothpaste", "Skin Care & Lotions", "Hair Oils", "Deodorants & Perfumes", "Shaving & Grooming"]
  },
  {
    id: "household_care",
    name: "Household Care",
    code: "HC",
    description: "Cleaning products, detergents, dishwash, surface cleaners, incense & agarbatti",
    subcategories: ["Detergent Powders & Bars", "Dishwash Bars & Liquids", "Surface Cleaners", "Incense Sticks & Agarbatti", "Dhoop & Sambrani", "Air Fresheners", "Mosquito Repellents"]
  },
  {
    id: "food_items",
    name: "Food Items",
    code: "FOOD",
    description: "Packaged foods, snacks, biscuits, confectionery, noodles, pasta",
    subcategories: ["Biscuits & Cookies", "Namkeen & Snacks", "Noodles & Pasta", "Confectionery & Chocolates", "Ready to Eat", "Breakfast Cereals", "Sauces & Condiments"]
  },
  {
    id: "beverages",
    name: "Beverages",
    code: "BEV",
    description: "Tea, coffee, packaged juices, carbonated drinks, syrups, mineral water",
    subcategories: ["Tea (Chai)", "Coffee", "Fruit Juices", "Soft Drinks & Soda", "Packaged Water", "Health Drinks & Syrups"]
  },
  {
    id: "dairy",
    name: "Dairy",
    code: "DAIRY",
    description: "Dairy products, milk, curd, paneer, butter, cheese, dairy whiteners",
    subcategories: ["Ghee", "Butter & Cheese", "Milk Powders & Whiteners", "Packaged Paneer", "Condensed Milk"]
  },
  {
    id: "oil_ghee",
    name: "Oil & Ghee",
    code: "OIL",
    description: "Edible cooking oils, mustard oil, refined oils, vanaspati, pure ghee",
    subcategories: ["Mustard Oil", "Refined Sunflower Oil", "Soybean Oil", "Groundnut Oil", "Palm Oil", "Pure Desi Ghee", "Vanaspati Ghee"]
  },
  {
    id: "pulses_dals",
    name: "Pulses & Dals",
    code: "PULSES",
    description: "Lentils, whole and split grams, pulses, beans",
    subcategories: ["Toor Dal (Arhar)", "Moong Dal", "Chana Dal & Whole Chana", "Urad Dal", "Masoor Dal", "Rajma & Kabuli Chana"]
  },
  {
    id: "grains_flours",
    name: "Grains & Flours",
    code: "GRAIN",
    description: "Wheat flour (Atta), rice, maida, suji, besan, poha, grain commodities",
    subcategories: ["Atta (Wheat Flour)", "Rice (Basmati & Non-Basmati)", "Maida & Suji", "Besan (Gram Flour)", "Poha & Daliya"]
  },
  {
    id: "packaging_material",
    name: "Packaging Material",
    code: "PKG",
    description: "Bags, pouches, corrugated boxes, packaging tapes, shrink wraps, containers",
    subcategories: ["Printed Pouches & Bags", "Corrugated Boxes", "Adhesive Tapes", "Plastic Containers & Bottles", "Poly Bags & Sacks"]
  },
  {
    id: "other",
    name: "Other",
    code: "OTH",
    description: "Miscellaneous items, general merchandise",
    subcategories: ["General Merchandise", "Specialty Items", "Sundries"]
  }
];

export const DEFAULT_CATEGORY_NAMES: string[] = PRODUCT_TAXONOMY.map(t => t.name);

/**
 * Normalizes any category string into the canonical FMCG taxonomy category.
 * Fully supports all standard product categories and handles HSN / title inference.
 */
export function normalizeDivisionCategoryForDb(rawCategory?: string | null, productName?: string, hsnCode?: string | null): string {
  const trimmed = (rawCategory || "").trim();
  const lower = trimmed.toLowerCase();
  
  // If explicitly generic, legacy placeholder, or mismatched spices for pooja/cleaners
  const isGeneric = !trimmed || lower === "general" || lower === "other" || lower === "uncategorized" || 
    lower === "special products" || lower === "basic spices" || lower === "blended spices" ||
    (lower === "spices" && (hsnCode === "33074100" || hsnCode === "3307" || (productName && /agarbatti|incense|dhoop|pooja|madhukunj|bhola|radhe\s*radhe|real\s*100|zipper/i.test(productName))));

  if (isGeneric && (productName || hsnCode)) {
    return inferTaxonomyCategory(productName || "", undefined, hsnCode);
  }

  // If already matches a known canonical category name (case-insensitive)
  const directMatch = DEFAULT_CATEGORY_NAMES.find(c => c.toLowerCase() === trimmed.toLowerCase());
  if (directMatch && !isGeneric) return directMatch;

  return normalizeDivisionCategory(trimmed, productName, hsnCode);
}

/**
 * Normalizes any category string into one of the user-facing canonical categories.
 */
export function normalizeDivisionCategory(rawCategory?: string | null, productName?: string, hsnCode?: string | null): string {
  const trimmed = (rawCategory || "").trim();
  const lower = trimmed.toLowerCase();

  // If provided as "General", "Other", or legacy placeholder, derive from product name and HSN if available
  const isGeneric = !trimmed || lower === "general" || lower === "other" || lower === "uncategorized" || 
    lower === "special products" || (lower === "spices" && (hsnCode === "33074100" || hsnCode === "3307" || (productName && /agarbatti|incense|dhoop|pooja|madhukunj|bhola|radhe\s*radhe|real\s*100|zipper/i.test(productName))));

  if (isGeneric && (productName || hsnCode)) {
    return inferTaxonomyCategory(productName || "", undefined, hsnCode);
  }

  // Check HSN code first if provided
  if (hsnCode) {
    const hsnMatch = lookupHsnTaxonomy(hsnCode);
    if (hsnMatch && hsnMatch.category) return hsnMatch.category;
  }

  // Exact or case-insensitive match with canonical categories
  const directMatch = DEFAULT_CATEGORY_NAMES.find(c => c.toLowerCase() === lower);
  if (directMatch) return directMatch;

  // Legacy mappings from old constraints
  if (lower === "basic spices" || lower === "basic spice") return "Spices";
  if (lower === "blended spices" || lower === "blended spice") return "Blended Spice";

  if (/blended|mix|kitchen\s*king|meat\s*masala|garam\s*masala|curry\s*powder/i.test(lower)) return "Blended Spice";
  if (/household|home|detergent|dishwash|clean|pooja|agarbatti|incense|dhoop|sambrani|phenyl|harpic|surf|madhukunj|bhola|zipper|radhe\s*radhe|real\s*100/i.test(lower)) return "Household Care";
  if (/spice|pure\s*spice|whole\s*spice|haldi|mirch|dhaniya|jeera|turmeric|chilli|coriander/i.test(lower)) return "Spices";
  if (/personal|hygiene|soap|shampoo|toothpaste|groom|lotion|skin|hair|oral/i.test(lower)) return "Personal Care";
  if (/food|biscuit|cookie|snack|namkeen|confectionery|chocolate|noodle|pasta|sauce|jam|pickle/i.test(lower)) return "Food Items";
  if (/beverage|drink|tea|chai|coffee|juice|water|soda/i.test(lower)) return "Beverages";
  if (/dairy|milk|paneer|butter|cheese|curd|ghee/i.test(lower)) return "Dairy";
  if (/oil|mustard\s*oil|refined|vanaspati|edible\s*oil/i.test(lower)) return "Oil & Ghee";
  if (/pulse|dal|lentil|chana|moong|arhar|urad|rajma/i.test(lower)) return "Pulses & Dals";
  if (/grain|flour|atta|rice|maida|suji|besan|poha/i.test(lower)) return "Grains & Flours";
  if (/pack|box|carton|pouch|bag|tape|container|packaging/i.test(lower)) return "Packaging Material";

  if (productName || hsnCode) {
    return inferTaxonomyCategory(productName || "", undefined, hsnCode);
  }

  return "Spices";
}

export const FMCG_DIVISIONS: string[] = [
  "Spices & Seasonings",
  "Food & Snacks",
  "Beverages & Drinks",
  "Personal Care & Hygiene",
  "Household Care & Pooja",
  "Dairy & Edible Oils",
  "Grains, Pulses & Staples",
  "Packaging & Logistics",
  "General FMCG"
];

/**
 * Maps a category name to the most fitting FMCG business division
 */
export function inferTaxonomyDivision(categoryOrName: string): string {
  if (!categoryOrName) return "Spices & Seasonings";
  const s = categoryOrName.toLowerCase();
  
  if (s.includes("spice") || s.includes("masala") || s.includes("seasoning")) return "Spices & Seasonings";
  if (s.includes("personal") || s.includes("soap") || s.includes("shampoo") || s.includes("paste") || s.includes("skin") || s.includes("hair")) return "Personal Care & Hygiene";
  if (s.includes("house") || s.includes("clean") || s.includes("pooja") || s.includes("incense") || s.includes("agarbatti") || s.includes("detergent")) return "Household Care & Pooja";
  if (s.includes("beverag") || s.includes("tea") || s.includes("coffee") || s.includes("juice") || s.includes("drink")) return "Beverages & Drinks";
  if (s.includes("dairy") || s.includes("oil") || s.includes("ghee") || s.includes("butter") || s.includes("milk")) return "Dairy & Edible Oils";
  if (s.includes("grain") || s.includes("flour") || s.includes("pulse") || s.includes("dal") || s.includes("atta") || s.includes("rice")) return "Grains, Pulses & Staples";
  if (s.includes("packag") || s.includes("box") || s.includes("carton") || s.includes("pouch")) return "Packaging & Logistics";
  if (s.includes("food") || s.includes("snack") || s.includes("biscuit") || s.includes("noodle") || s.includes("chocolate")) return "Food & Snacks";

  return "General FMCG";
}

/**
 * Infer the subcategory from product text within a given category
 */
export function inferSubCategory(name: string, category: string): string | null {
  if (!name) return null;
  const tax = PRODUCT_TAXONOMY.find(t => t.name.toLowerCase() === category.toLowerCase() || t.id.toLowerCase() === category.toLowerCase());
  if (!tax || !tax.subcategories) return null;
  
  const s = name.toLowerCase();
  for (const sub of tax.subcategories) {
    const subClean = sub.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
    const keywords = subClean.split(' ').filter(w => w.length > 2);
    if (keywords.some(k => s.includes(k))) {
      return sub;
    }
  }
  return tax.subcategories[0] || null;
}

export interface CompanyCandidate {
  id: string;
  name: string;
  short_code?: string;
  brand_name?: string;
}

/**
 * Matches product title/brand to a registered FMCG company
 */
export function inferCompanyMatch(productName: string, brand: string | null | undefined, companies: CompanyCandidate[]): CompanyCandidate | null {
  if (!companies || companies.length === 0) return null;
  const target = `${brand || ''} ${productName || ''}`.toLowerCase();

  // 1. Direct short_code or name match
  for (const c of companies) {
    if (c.short_code && target.includes(c.short_code.toLowerCase())) return c;
    if (c.name && target.includes(c.name.toLowerCase())) return c;
    if (c.brand_name && target.includes(c.brand_name.toLowerCase())) return c;
  }

  // 2. Known brand keywords to company names
  const BRAND_CORRELATIONS: Record<string, string[]> = {
    "bharat": ["bharat masala", "tatvisha", "bharat", "bm"],
    "tata": ["tata", "tetley", "sampann", "himalayan"],
    "itc": ["itc", "aashirvaad", "sunfeast", "bingo", "yippee", "savlon", "classmate"],
    "hul": ["hul", "hindustan unilever", "surf excel", "sfxl", "sfx", "surf", "easy wash", "rin", "wheel", "lux", "lifebuoy", "dove", "clinic plus", "sunsilk", "pepsodent", "close up", "red label", "taj mahal", "bru", "kissan", "horlicks", "boost", "comfort", "vim", "ponds", "vaseline", "glow & lovely", "fair & lovely", "domex", "cif"],
    "nestle": ["nestle", "maggi", "kitkat", "nescafe", "everyday", "barone", "munch", "milkmaid"],
    "britannia": ["britannia", "good day", "marie gold", "50-50", "bourbon", "nutrichoice", "treat", "tiger", "winkin cow"],
    "parle": ["parle", "parle-g", "monaco", "krackjack", "hide & seek", "20-20", "frooti", "appy"],
    "dabur": ["dabur", "chyawanprash", "hajmola", "real juice", "vatika", "red paste", "meswak", "gulabari"],
    "marico": ["marico", "parachute", "saffola", "nihar", "livon", "set wet", "mediker"],
    "patanjali": ["patanjali", "dant kanti", "kesh kanti"],
    "amul": ["amul", "gcmmf", "taaza", "gold", "masti", "kool"],
    "adani": ["adani", "fortune", "wilmar", "kohinoor"],
    "wagh bakri": ["wagh bakri", "mili", "good morning"],
    "mdh": ["mdh", "mahasiyan di hatti"],
    "everest": ["everest"],
    "catch": ["catch", "ds group"],
    "haldiram": ["haldiram", "haldirams"],
    "bikaji": ["bikaji"],
  };

  for (const [key, keywords] of Object.entries(BRAND_CORRELATIONS)) {
    const hasKeyword = keywords.some(k => target.includes(k));
    if (hasKeyword) {
      const matched = companies.find(c => 
        c.name.toLowerCase().includes(key) || 
        (c.short_code && c.short_code.toLowerCase().includes(key))
      );
      if (matched) return matched;
    }
  }

  // 3. Fallback: if Bharat Masala or Tatvisha is present in company list, check for spice products
  if (/masala|haldi|mirch|dhaniya|jeera|garam|meat\s*masala/i.test(target)) {
    const defaultSpicesCompany = companies.find(c => 
      c.name.toLowerCase().includes("bharat") || 
      c.name.toLowerCase().includes("tatvisha") ||
      c.name.toLowerCase().includes("masala")
    );
    if (defaultSpicesCompany) return defaultSpicesCompany;
  }

  return null;
}

/**
 * Computes GST, CGST, SGST, IGST tax breakdown
 */
export function computeTaxBreakdown(gstRateInput?: number | null, isInterState: boolean = false): {
  gst_rate: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
} {
  const gst = Number(gstRateInput) || 0;
  if (isInterState) {
    return {
      gst_rate: gst,
      cgst_rate: 0,
      sgst_rate: 0,
      igst_rate: gst
    };
  }
  const half = Math.round((gst / 2) * 100) / 100;
  return {
    gst_rate: gst,
    cgst_rate: half,
    sgst_rate: half,
    igst_rate: 0
  };
}

/**
 * Infer the best matching taxonomy category name based on raw product text, optional HSN code, and optional available categories
 */
export function inferTaxonomyCategory(name: string, availableCategories?: string[], hsnCode?: string | null): string {
  // If HSN code is provided, use standard GST HSN mapping first
  if (hsnCode) {
    const hsnMatch = lookupHsnTaxonomy(hsnCode);
    if (hsnMatch && hsnMatch.category) {
      if (availableCategories && availableCategories.length > 0) {
        const exact = availableCategories.find(c => c.toLowerCase() === hsnMatch.category.toLowerCase());
        if (exact) return exact;
        const partial = availableCategories.find(c => c.toLowerCase().includes(hsnMatch.category.toLowerCase()) || hsnMatch.category.toLowerCase().includes(c.toLowerCase()));
        if (partial) return partial;
      }
      return hsnMatch.category;
    }
  }

  if (!name || typeof name !== "string") return "Spices";
  const s = name.toLowerCase().trim();

  let inferred = "Other";

  // Blended Spices / Mixed Seasonings
  if (
    /garam\s*masala|meat\s*masala|chicken\s*masala|kitchen\s*king|pav\s*bhaji|chaat\s*masala|chole\s*masala|biryani\s*masala|sabji\s*masala|sabzi\s*masala|sambar\s*masala|sambhar|rasam|panipuri|jaljeera|fish\s*curry|egg\s*curry|paneer\s*masala|curry\s*powder|dal\s*tadka\s*masala|chana\s*masala|shahi\s*paneer|korma|mutton\s*masala|tandoori\s*masala|pasta\s*masala|noodle\s*masala|maggi\s*masala|blended/i.test(s)
  ) {
    inferred = "Blended Spice";
  }
  // Pure / Basic Spices
  else if (
    /haldi|turmeric|mirch|chilli|chili|red\s*chilli|kashmiri\s*mirch|deggi\s*mirch|dhaniya|coriander|jeera|cumin|rai|mustard|sarson|hing|asafoetida|methi|fenugreek|black\s*pepper|golki|kali\s*mirch|clove|laung|elaichi|cardamom|tejpatta|bay\s*leaf|dalchini|cinnamon|saunf|fennel|ajwain|carom|kasuri\s*methi|amchur|amchoor|dry\s*mango|posto|poppy|nutmeg|jaiphal|mace|javitri|star\s*anise|chakra\s*phool|spice|masala/i.test(s)
  ) {
    inferred = "Spices";
  }
  // Personal Care & Toiletries (Bath soaps, Lifebuoy, Lux, Dove, Shampoos, Toothpastes)
  else if (
    /bath\s*soap|toilet\s*soap|beauty\s*soap|bathing\s*bar|body\s*wash|handwash|hand\s*wash|lifebuoy|lux|dettol|dove|santoor|cinthol|pears|medimix|margo|hamam|liril|savlon|fiama|vivel|godrej\s*no\s*1|shampoo|clinic\s*plus|sunsilk|head\s*&\s*shoulders|pantene|tresemme|toothpaste|colgate|pepsodent|dabur\s*red|sensodyne|close\s*up|closeup|hair\s*oil|parachute|nihar|bajaj\s*almond|vaseline|fair\s*&\s*lovely|glow\s*&\s*lovely|creme|cream|lotion|talc|powder|face\s*wash|facewash|himalaya|garnier|shaving|gillette|deodorant|perfume|axe|fogg|body\s*spray|sanitary|whisper|stayfree/i.test(s)
  ) {
    inferred = "Personal Care";
  }
  // Incense & Dhoop
  else if (
    /agarbatti|incense|dhoop|sambrani|camphor|kapoor|pooja|puja|havan|loban|gugal|kasturi|madhukunj|radhe\s*radhe|nature\s*series|mk\s*bhola|zipper\s*real|real\s*100/i.test(s)
  ) {
    inferred = "Incense & Dhoop";
  }
  // Household Care & Detergents (Detergents, Surf Excel, Rin, Wheel, Ariel, Tide, Dishwash, Surface cleaners)
  else if (
    /sfxl|sfx|surf\s*excel|easy\s*wash|detergent|surf|wheel|tide|ariel|ghadi|ghari|rin|vim|pril|dishwash|phenyl|harpic|lizol|domex|cleaner|matchbox|mosquito|good\s*knight|all\s*out|comfort|fabric\s*conditioner|pouch/i.test(s)
  ) {
    inferred = "Household Care";
  }
  // Food Items & Snacks & Confectionery
  else if (
    /parle|biscuit|cookie|good\s*day|marie|monaco|krackjack|hide\s*&\s*seek|bourbon|20-20|rusk|toast|namkeen|bhujia|mixture|sev|chips|kurkure|lays|bingo|maggi|noodle|yippee|pasta|macaroni|vermicelli|sewai|sewain|snack|chocolate|cadbury|dairy\s*milk|5\s*star|perk|kitkat|candy|toffee|eclairs|jam|kissan|ketchup|sauce|soya\s*chunks|nutrela|pickle|achar/i.test(s)
  ) {
    inferred = "Food Items";
  }
  // Beverages
  else if (
    /tea|chai|wagh\s*bakri|red\s*label|tata\s*tea|taj\s*mahal|society|coffee|nescafe|bru|juice|frooti|maaza|slice|appy|real\s*juice|coke|pepsi|thums\s*up|sprite|7up|fanta|limca|mountain\s*dew|sting|red\s*bull|energy\s*drink|water|kinley|aquafina|bisleri|glucon|rooh\s*afza|sharbat|tang|rasna/i.test(s)
  ) {
    inferred = "Beverages";
  }
  // Oil & Ghee
  else if (
    /mustard\s*oil|sarson\s*tel|refined\s*oil|soyabean\s*oil|sunflower\s*oil|groundnut\s*oil|fortune|dhara|emami|engine|mahawash|saffola|edible\s*oil|ghee|desi\s*ghee|amul\s*ghee|gowardhan|patanjali\s*ghee|vanaspati|dalda|ruchi/i.test(s)
  ) {
    inferred = "Oil & Ghee";
  }
  // Dairy
  else if (
    /milk|amul|mother\s*dairy|curd|dahi|paneer|butter|cheese|whitener|everyday|nestle|milkmaid|condensed\s*milk|lassi|chaas|buttermilk/i.test(s)
  ) {
    inferred = "Dairy";
  }
  // Pulses & Dals
  else if (
    /toor|arhar|moong|chana\s*dal|kala\s*chana|kabuli\s*chana|urad|masoor|dal|lentil|rajma|chole|matar|lobia/i.test(s)
  ) {
    inferred = "Pulses & Dals";
  }
  // Grains & Flours
  else if (
    /atta|wheat\s*flour|aashirvaad|rice|chawal|basmati|miniket|govindobhog|sona\s*masoori|maida|suji|sooji|rava|besan|gram\s*flour|poha|chuda|daliya|sattu|sabudana|grain|paddy/i.test(s)
  ) {
    inferred = "Grains & Flours";
  }
  // Packaging Material
  else if (
    /corrugated|box|carton|pouch|polybag|poly\s*bag|tape|cello\s*tape|sack|bardana|shrink\s*film|shipper|container|plastic\s*jar/i.test(s)
  ) {
    inferred = "Packaging Material";
  }

  // If available categories provided, find the closest matching category string in the user's database / list
  if (availableCategories && availableCategories.length > 0) {
    // Exact match case-insensitive
    const exactMatch = availableCategories.find(c => c.toLowerCase() === inferred.toLowerCase());
    if (exactMatch) return exactMatch;

    // Substring match
    const partialMatch = availableCategories.find(c => 
      c.toLowerCase().includes(inferred.toLowerCase()) || inferred.toLowerCase().includes(c.toLowerCase())
    );
    if (partialMatch) return partialMatch;

    // Handle "Spices" vs "Basic Spices"
    if (inferred === "Spices") {
      const basicSpices = availableCategories.find(c => /basic|spices|spice/i.test(c));
      if (basicSpices) return basicSpices;
    }
    if (inferred === "Blended Spice") {
      const blendSpices = availableCategories.find(c => /blend|masala/i.test(c));
      if (blendSpices) return blendSpices;
    }
  }

  return inferred;
}
