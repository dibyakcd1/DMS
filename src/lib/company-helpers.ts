import { Line, Company, Product } from "@/types";
import { formatDivisionCategory } from "@/lib/format";

export function resolveProductDivisionCategory(p: Partial<Product> | null | undefined): string {
  if (!p) return "Household Care";
  
  // 1. Check explicit division_category or category fields on product
  const rawCat = p.division_category || (p as Record<string, unknown>).category as string || (p as Record<string, unknown>).category_name as string;
  if (rawCat && typeof rawCat === "string" && rawCat.trim()) {
    const raw = rawCat.trim();
    if (raw.toLowerCase() !== "general" && raw.toLowerCase() !== "uncategorized" && raw.toLowerCase() !== "other") {
      return formatDivisionCategory(raw);
    }
  }
  
  // 2. Intelligent classification from product name, SKU and HSN
  const name = (p.name || "").toLowerCase();
  const sku = (p.sku || "").toUpperCase();
  const hsn = (p.hsn || "").trim();
  
  // Incense & Dhoop / Puja Samagri
  if (
    sku.startsWith("MK-") || 
    sku.startsWith("MAD-") || 
    sku.startsWith("CY-") ||
    name.includes("agarbatti") || 
    name.includes("dhoop") || 
    name.includes("incense") || 
    name.includes("bhola") || 
    name.includes("radhe radhe") || 
    name.includes("shanti") || 
    name.includes("hawan") ||
    name.includes("champa") ||
    name.includes("mogra") ||
    name.includes("sambrani") ||
    name.includes("loban") ||
    name.includes("gugal") ||
    name.includes("kasturi") ||
    name.includes("camphor") ||
    name.includes("kapoor") ||
    name.includes("puja") ||
    name.includes("pooja") ||
    name.includes("diya") ||
    name.includes("batti") ||
    hsn === "33074100" ||
    hsn.startsWith("330741")
  ) {
    return "Incense & Dhoop";
  }

  // Personal Care & Hygiene (Toilet Soaps, Bath Soaps, Shampoos, Toothpastes, Lotions)
  if (
    name.includes("bath soap") ||
    name.includes("toilet soap") ||
    name.includes("beauty soap") ||
    name.includes("bathing bar") ||
    name.includes("body wash") ||
    name.includes("handwash") ||
    name.includes("hand wash") ||
    name.includes("lifebuoy") ||
    name.includes("lux") ||
    name.includes("dove") ||
    name.includes("pears") ||
    name.includes("cinthol") ||
    name.includes("godrej no 1") ||
    name.includes("hamam") ||
    name.includes("liril") ||
    name.includes("margo") ||
    name.includes("medimix") ||
    name.includes("santoor") ||
    name.includes("savlon") ||
    name.includes("fiama") ||
    name.includes("vivel") ||
    name.includes("dettol") ||
    name.includes("shampoo") || 
    name.includes("paste") || 
    name.includes("colgate") || 
    name.includes("pepsodent") || 
    name.includes("close up") ||
    name.includes("closeup") ||
    name.includes("sensodyne") ||
    name.includes("clinic") || 
    name.includes("sunsilk") ||
    name.includes("pantene") ||
    name.includes("head & shoulders") ||
    name.includes("tresemme") ||
    name.includes("hair") || 
    name.includes("lotion") || 
    name.includes("cream") ||
    name.includes("creme") ||
    name.includes("fair & lovely") ||
    name.includes("glow & lovely") ||
    name.includes("axe") ||
    name.includes("deodorant") ||
    name.includes("talc") ||
    name.includes("vaseline") ||
    name.includes("ponds") ||
    name.includes("nivea") ||
    name.includes("facewash") ||
    name.includes("face wash") ||
    name.includes("gillette") ||
    name.includes("shaving") ||
    name.includes("sanitary") ||
    name.includes("whisper") ||
    name.includes("stayfree") ||
    hsn.startsWith("340111") ||
    hsn.startsWith("340120") ||
    hsn.startsWith("340130") ||
    hsn.startsWith("3304") ||
    hsn.startsWith("3305") ||
    hsn.startsWith("3306")
  ) {
    return "Personal Care";
  }

  // Spices & Masala
  if (
    sku.startsWith("BM-") ||
    sku.startsWith("TAT-") ||
    sku.startsWith("TM-") ||
    name.includes("masala") || 
    name.includes("mirch") || 
    name.includes("haldi") || 
    name.includes("dhaniya") || 
    name.includes("jeera") || 
    name.includes("garam") || 
    name.includes("spice") || 
    name.includes("hing") || 
    name.includes("chana masala") || 
    name.includes("meat masala") || 
    name.includes("chicken masala") ||
    name.includes("kitchen king") || 
    name.includes("amchur") || 
    name.includes("powder") ||
    name.includes("turmeric") ||
    name.includes("chilli") ||
    name.includes("coriander") ||
    name.includes("cumin") ||
    name.includes("mustard") ||
    name.includes("rai") ||
    name.includes("methi") ||
    name.includes("saunf") ||
    name.includes("ajwain") ||
    name.includes("sabji masala") ||
    name.includes("sambhar") ||
    name.includes("pav bhaji") ||
    name.includes("biryani masala") ||
    name.includes("chat masala") ||
    name.includes("chaat masala") ||
    hsn.startsWith("0910") || 
    hsn.startsWith("0904") ||
    hsn.startsWith("0906") ||
    hsn.startsWith("0907") ||
    hsn.startsWith("0908") ||
    hsn.startsWith("0909")
  ) {
    return "Spices & Masala";
  }

  // Household Care & Detergents (includes SFXL, Surf Excel, Easy Wash, Rin, Wheel, Fabric & Surface Cleaners)
  if (
    name.includes("sfxl") ||
    name.includes("sfx") ||
    name.includes("surf excel") ||
    name.includes("surf") ||
    name.includes("easy wash") ||
    name.includes(" ew ") ||
    name.startsWith("ew ") ||
    name.endsWith(" ew") ||
    name.includes("detergent") || 
    name.includes("washing powder") ||
    name.includes("washing bar") ||
    name.includes("laundry bar") ||
    name.includes("laundry soap") ||
    name.includes("rin") || 
    name.includes("vim") || 
    name.includes("wheel") || 
    name.includes("ariel") || 
    name.includes("tide") || 
    name.includes("ujala") || 
    name.includes("exo") ||
    name.includes("pril") ||
    name.includes("dishwash") ||
    name.includes("henko") ||
    name.includes("ghari") ||
    name.includes("nirma") ||
    name.includes("comfort") ||
    name.includes("fabric") ||
    name.includes("harpic") ||
    name.includes("lizol") ||
    name.includes("colin") ||
    name.includes("domex") ||
    name.includes("cif") ||
    name.includes("mortein") ||
    name.includes("hit") ||
    name.includes("good knight") ||
    name.includes("maxo") ||
    name.includes("bleach") ||
    name.includes("cleaner") ||
    name.includes("scrub") ||
    hsn.startsWith("340119") ||
    hsn.startsWith("3402") ||
    hsn.startsWith("3808")
  ) {
    return "Household Care";
  }

  // Snacks & Packaged Foods
  if (
    name.includes("biscuit") || 
    name.includes("parle") || 
    name.includes("rusk") || 
    name.includes("cookie") || 
    name.includes("snack") || 
    name.includes("namkeen") || 
    name.includes("chips") || 
    name.includes("wafer") || 
    name.includes("noodle") || 
    name.includes("maggi") || 
    name.includes("pasta") ||
    name.includes("kurkure") ||
    name.includes("lays") ||
    name.includes("bingo") ||
    name.includes("yippee") ||
    name.includes("sunfeast") ||
    name.includes("dark fantasy") ||
    name.includes("good day") ||
    name.includes("marie") ||
    name.includes("monaco") ||
    name.includes("krackjack") ||
    name.includes("hide & seek") ||
    name.includes("20-20") ||
    name.includes("bourbon") ||
    name.includes("chocolate") ||
    name.includes("cadbury") ||
    name.includes("kitkat") ||
    name.includes("munch") ||
    name.includes("perk") ||
    name.includes("ketchup") ||
    name.includes("sauce") ||
    name.includes("jam") ||
    name.includes("kissan")
  ) {
    return "Snacks & Foods";
  }

  // Beverages
  if (
    name.includes("tea") || 
    name.includes("coffee") || 
    name.includes("beverage") || 
    name.includes("juice") || 
    name.includes("drink") ||
    name.includes("bournvita") ||
    name.includes("horlicks") ||
    name.includes("boost") ||
    name.includes("complan") ||
    name.includes("red label") ||
    name.includes("taj mahal") ||
    name.includes("taaza") ||
    name.includes("tetley") ||
    name.includes("wagh bakri") ||
    name.includes("bru") ||
    name.includes("nescafe") ||
    name.includes("frooti") ||
    name.includes("appy") ||
    name.includes("maaza") ||
    name.includes("slice") ||
    name.includes("real juice") ||
    name.includes("tang") ||
    name.includes("rasna") ||
    hsn.startsWith("0901") ||
    hsn.startsWith("0902") ||
    hsn.startsWith("2202")
  ) {
    return "Beverages";
  }

  // Dairy & Edible Oils
  if (
    name.includes("ghee") ||
    name.includes("butter") ||
    name.includes("paneer") ||
    name.includes("cheese") ||
    name.includes("milk") ||
    name.includes("amul") ||
    name.includes("fortune") ||
    name.includes("saffola") ||
    name.includes("mustard oil") ||
    name.includes("refined oil") ||
    name.includes("soybean oil") ||
    name.includes("sunflower oil") ||
    name.includes("vanaspati") ||
    hsn.startsWith("0401") ||
    hsn.startsWith("0402") ||
    hsn.startsWith("0405") ||
    hsn.startsWith("1507") ||
    hsn.startsWith("1508") ||
    hsn.startsWith("1512") ||
    hsn.startsWith("1514") ||
    hsn.startsWith("1515")
  ) {
    return "Dairy & Edible Oils";
  }

  // Grains, Pulses & Staples
  if (
    name.includes("atta") ||
    name.includes("flour") ||
    name.includes("maida") ||
    name.includes("suji") ||
    name.includes("besan") ||
    name.includes("rice") ||
    name.includes("dal") ||
    name.includes("toor") ||
    name.includes("moong") ||
    name.includes("chana") ||
    name.includes("urad") ||
    name.includes("masoor") ||
    name.includes("rajma") ||
    name.includes("poha") ||
    name.includes("sugar") ||
    name.includes("salt") ||
    hsn.startsWith("1006") ||
    hsn.startsWith("1101") ||
    hsn.startsWith("1102") ||
    hsn.startsWith("0713") ||
    hsn.startsWith("1701") ||
    hsn.startsWith("2501")
  ) {
    return "Grains & Flours";
  }

  return "Household Care";
}

export interface CompanySummary {
  id: string;
  name: string;
  short_code: string;
  accent_hex: string;
  items_count: number;
  total_quantity: number;
  subtotal: number;
  gst: number;
  total: number;
  percentage_of_total: number;
  lines: Line[];
}

export const FALLBACK_COMPANY_DEFAULTS: Record<string, { id: string; name: string; short_code: string; accent_hex: string }> = {
  BM: { id: "fdf3157b-7ba0-4ae6-bc92-435b2ec599d4", name: "Bharat Masala", short_code: "BM", accent_hex: "#E11D48" },
  PARLE: { id: "b1b59a6d-e4ef-47da-8da1-807a51fb023c", name: "Parle Products", short_code: "PARLE", accent_hex: "#0284C7" },
  JYOTHY: { id: "c8d17277-2fe9-4e78-bc5a-cb26faef74ea", name: "Jyothy Labs", short_code: "JYOTHY", accent_hex: "#16A34A" },
  HUL: { id: "d2b18422-777a-4a8e-bc2f-e89a5c888d3d", name: "Hindustan Unilever (HUL)", short_code: "HUL", accent_hex: "#4F46E5" },
  ITC: { id: "ea812456-9a2f-410a-81a1-cf5011bd2aa0", name: "ITC Limited", short_code: "ITC", accent_hex: "#D97706" },
  MAD: { id: "madhukunj-company-id", name: "Madhukunj", short_code: "MAD", accent_hex: "#7C3AED" },
  MK: { id: "madhukunj-company-id", name: "Madhukunj", short_code: "MAD", accent_hex: "#7C3AED" },
  CYCLE: { id: "cycle-pure-id", name: "Cycle Pure (NRRS)", short_code: "CYCLE", accent_hex: "#059669" },
  TATVISHA: { id: "tatvisha-masala-id", name: "Tatvisha Masala", short_code: "TATVISHA", accent_hex: "#EA580C" }
};

function isGenericBrandOrCompany(val: string | null | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim().toLowerCase();
  return (
    trimmed === "" ||
    trimmed === "general" ||
    trimmed === "general / independent brand" ||
    trimmed === "general supplier" ||
    trimmed === "independent brand" ||
    trimmed === "unknown" ||
    trimmed === "unknown product" ||
    trimmed === "uncategorized" ||
    trimmed === "n/a" ||
    trimmed === "null" ||
    trimmed === "undefined"
  );
}

export function inferCompanyFromProductAttributes(item: {
  sku?: string | null;
  name?: string | null;
  brand?: string | null;
  hsn?: string | null;
  division_category?: string | null;
}): { id: string; name: string; short_code: string; accent_hex: string } | null {
  const name = (item.name || "").toLowerCase();
  const sku = (item.sku || "").toUpperCase();
  const brand = (item.brand || "").toLowerCase();
  const hsn = (item.hsn || "").trim();
  const cat = (item.division_category || "").toLowerCase();

  // 1. Madhukunj (Incense / Agarbatti / Dhoop / Maa Shantilaxmi / Bhola / Radhe Radhe)
  if (
    sku.startsWith("MK-") ||
    sku.startsWith("MAD-") ||
    brand.includes("madhukunj") ||
    brand === "mk" ||
    brand.includes("shanti") ||
    brand.includes("shantilaxmi") ||
    name.includes("madhukunj") ||
    name.startsWith("mk ") ||
    name.includes(" mk") ||
    name.includes("bhola") ||
    name.includes("radhe radhe") ||
    name.includes("shanti") ||
    name.includes("shantilaxmi") ||
    name.includes("agarbatti") ||
    name.includes("dhoop") ||
    name.includes("incense") ||
    name.includes("hawan") ||
    name.includes("champa") ||
    name.includes("mogra") ||
    name.includes("kasturi") ||
    name.includes("gugal") ||
    name.includes("loban") ||
    name.includes("sambrani") ||
    name.includes("real 100") ||
    name.includes("nature series") ||
    hsn === "33074100" ||
    cat === "puja samagri" ||
    cat === "incense & dhoop"
  ) {
    return {
      id: "madhukunj",
      name: "Madhukunj",
      short_code: "MAD",
      accent_hex: "#7C3AED"
    };
  }

  // 2. Bharat Masala / Tatvisha (Spices / Blended Spices)
  if (
    sku.startsWith("BM-") ||
    sku.startsWith("TM-") ||
    brand.includes("bharat masala") ||
    brand.includes("bharat") ||
    brand.includes("tatvisha") ||
    name.includes("bharat masala") ||
    name.includes("tatvisha") ||
    name.includes("garam masala") ||
    name.includes("sabji masala") ||
    name.includes("meat masala") ||
    name.includes("chicken masala") ||
    name.includes("turmeric") ||
    name.includes("coriander") ||
    name.includes("cumin") ||
    name.includes("chilli powder") ||
    name.includes("haldi") ||
    name.includes("jeera") ||
    name.includes("dhaniya")
  ) {
    return {
      id: "bm",
      name: "Bharat Masala",
      short_code: "BM",
      accent_hex: "#E11D48"
    };
  }

  // 3. Parle
  if (
    sku.startsWith("PL-") ||
    brand.includes("parle") ||
    name.includes("parle") ||
    name.includes("monaco") ||
    name.includes("krackjack") ||
    name.includes("hide & seek") ||
    name.includes("melody") ||
    name.includes("mango bite")
  ) {
    return {
      id: "parle",
      name: "Parle Products",
      short_code: "PARLE",
      accent_hex: "#0284C7"
    };
  }

  // 4. Jyothy Labs
  if (
    sku.startsWith("JL-") ||
    brand.includes("jyothy") ||
    brand.includes("ujala") ||
    brand.includes("exo") ||
    brand.includes("pril") ||
    name.includes("jyothy") ||
    name.includes("ujala") ||
    name.includes("exo") ||
    name.includes("pril") ||
    name.includes("margo") ||
    name.includes("henko") ||
    name.includes("maxo")
  ) {
    return {
      id: "jyothy",
      name: "Jyothy Labs",
      short_code: "JYOTHY",
      accent_hex: "#16A34A"
    };
  }

  // 5. Hindustan Unilever (HUL) - Surf Excel (SFXL), Rin, Wheel, Lux, Dove, Vim, Horlicks, etc.
  if (
    sku.startsWith("HU-") ||
    sku.startsWith("HUL-") ||
    sku.startsWith("SFX") ||
    sku.startsWith("SFXL") ||
    sku.startsWith("SURF") ||
    [
      "sfxl", "sfx", "surf excel", "surf", "easy wash", "matic", "quick wash",
      "lux", "dove", "knorr", "vim", "hul", "unilever", "hindustan unilever", 
      "lifebuoy", "rin", "wheel", "ponds", "vaseline", "clinic plus", "sunsilk",
      "tresemme", "pepsodent", "close up", "closeup", "axe", "rexona", "bru",
      "kissan", "horlicks", "boost", "taj mahal", "red label", "taaza", "3 roses",
      "glow & lovely", "fair & lovely", "hamam", "liril", "breeze", "cif", 
      "domex", "comfort", "sunlight", "indulekha", "pears", "lakme"
    ].some(kw => brand.includes(kw) || name.includes(kw))
  ) {
    return {
      id: "hul",
      name: "Hindustan Unilever (HUL)",
      short_code: "HUL",
      accent_hex: "#4F46E5"
    };
  }

  // 6. ITC Limited
  if (
    sku.startsWith("IT-") ||
    sku.startsWith("ITC-") ||
    [
      "ashirvaad", "aashirvaad", "yippee", "sunfeast", "itc", "bingo", 
      "dark fantasy", "mom's magic", "tedhe medhe", "mad angles", "fiama", 
      "vivel", "savlon", "classmate", "mangaldip", "b natural"
    ].some(kw => brand.includes(kw) || name.includes(kw))
  ) {
    return {
      id: "itc",
      name: "ITC Limited",
      short_code: "ITC",
      accent_hex: "#D97706"
    };
  }

  // 7. Cycle Pure
  if (
    sku.startsWith("CY-") ||
    sku.startsWith("CYCLE-") ||
    ["cycle pure", "cycle", "nrrs", "lia", "flute", "woods", "parampara", "vasu", "om shanthi"].some(
      kw => brand.includes(kw) || name.includes(kw)
    )
  ) {
    return {
      id: "cycle",
      name: "Cycle Pure (NRRS)",
      short_code: "CYCLE",
      accent_hex: "#059669"
    };
  }

  // 8. Nestlé India
  if (
    sku.startsWith("NES-") ||
    ["nestle", "maggi", "kitkat", "nescafe", "everyday", "munch", "barone", "milkmaid", "cerelac", "nestea"].some(
      kw => brand.includes(kw) || name.includes(kw)
    )
  ) {
    return {
      id: "nestle",
      name: "Nestlé India",
      short_code: "NESTLE",
      accent_hex: "#E11D48"
    };
  }

  // 9. Britannia Industries
  if (
    sku.startsWith("BR-") ||
    sku.startsWith("BRIT-") ||
    ["britannia", "good day", "marie gold", "50-50", "50 50", "bourbon", "nutrichoice", "treat", "tiger", "little hearts", "jim jam", "milk bikis"].some(
      kw => brand.includes(kw) || name.includes(kw)
    )
  ) {
    return {
      id: "britannia",
      name: "Britannia Industries",
      short_code: "BRIT",
      accent_hex: "#DC2626"
    };
  }

  // 10. Dabur India
  if (
    sku.startsWith("DAB-") ||
    ["dabur", "chyawanprash", "hajmola", "real juice", "real fruit", "vatika", "red paste", "meswak", "babool", "gulabari", "badam tail", "honitus", "pudinhara"].some(
      kw => brand.includes(kw) || name.includes(kw)
    )
  ) {
    return {
      id: "dabur",
      name: "Dabur India",
      short_code: "DABUR",
      accent_hex: "#15803D"
    };
  }

  // 11. Reckitt Benckiser
  if (
    sku.startsWith("RB-") ||
    ["dettol", "harpic", "lizol", "colin", "veet", "mortein", "strepsils", "disprin", "moov"].some(
      kw => brand.includes(kw) || name.includes(kw)
    )
  ) {
    return {
      id: "reckitt",
      name: "Reckitt Benckiser",
      short_code: "RB",
      accent_hex: "#0D9488"
    };
  }

  // 12. Procter & Gamble (P&G)
  if (
    sku.startsWith("PG-") ||
    ["ariel", "tide", "head & shoulders", "pantene", "whisper", "gillette", "oral-b", "oral b", "vicks", "ambipur", "olay", "pampers"].some(
      kw => brand.includes(kw) || name.includes(kw)
    )
  ) {
    return {
      id: "pg",
      name: "Procter & Gamble (P&G)",
      short_code: "P&G",
      accent_hex: "#2563EB"
    };
  }

  // 13. Cadbury / Mondelez
  if (
    sku.startsWith("CAD-") ||
    ["cadbury", "dairy milk", "5 star", "perk", "bournvita", "oreo", "gems", "tang"].some(
      kw => brand.includes(kw) || name.includes(kw)
    )
  ) {
    return {
      id: "cadbury",
      name: "Mondelez (Cadbury)",
      short_code: "CAD",
      accent_hex: "#4C1D95"
    };
  }

  // 14. Godrej Consumer
  if (
    sku.startsWith("GC-") ||
    ["good knight", "goodknight", "hit spray", "godrej", "godrej no 1", "cinthol", "expert rich", "aer pocket"].some(
      kw => brand.includes(kw) || name.includes(kw)
    )
  ) {
    return {
      id: "godrej",
      name: "Godrej Consumer",
      short_code: "GODREJ",
      accent_hex: "#047857"
    };
  }

  // 15. Tata Consumer
  if (
    sku.startsWith("TAT-") ||
    ["tata salt", "tata tea", "tetley", "tata sampann", "tata coffee"].some(
      kw => brand.includes(kw) || name.includes(kw)
    )
  ) {
    return {
      id: "tata",
      name: "Tata Consumer Products",
      short_code: "TATA",
      accent_hex: "#1E40AF"
    };
  }

  return null;
}

export function resolveCompanyInfo(item: {
  company?: Company | { id?: string; name?: string; short_code?: string; accent_hex?: string } | null;
  company_id?: string | null;
  company_name?: string | null;
  company_short_code?: string | null;
  company_accent_hex?: string | null;
  brand?: string | null;
  sku?: string | null;
  name?: string | null;
  id?: string | null;
  hsn?: string | null;
  division_category?: string | null;
}): { id: string; name: string; short_code: string; accent_hex: string } {
  // 1. If explicit valid company object attached
  if (item.company && item.company.name && !isGenericBrandOrCompany(item.company.name)) {
    return {
      id: item.company.id || item.company_id || "gen",
      name: item.company.name,
      short_code: item.company.short_code || item.company.name.slice(0, 3).toUpperCase(),
      accent_hex: item.company.accent_hex || "#7C3AED"
    };
  }

  // 2. If explicit non-generic company_name is stored
  if (item.company_name && !isGenericBrandOrCompany(item.company_name)) {
    return {
      id: item.company_id || "comp-" + item.company_name.toLowerCase().replace(/\s+/g, '-'),
      name: item.company_name,
      short_code: item.company_short_code || item.company_name.substring(0, 3).toUpperCase(),
      accent_hex: item.company_accent_hex || "#7C3AED"
    };
  }

  // 3. If explicit non-generic brand is stored
  if (item.brand && !isGenericBrandOrCompany(item.brand)) {
    const brandTrimmed = item.brand.trim();
    const inferred = inferCompanyFromProductAttributes({
      brand: brandTrimmed,
      sku: item.sku,
      name: item.name,
      hsn: item.hsn,
      division_category: item.division_category
    });

    if (inferred) {
      return {
        ...inferred,
        id: item.company_id || inferred.id
      };
    }

    return {
      id: item.company_id || ("brand-" + brandTrimmed.toLowerCase().replace(/\s+/g, '-')),
      name: brandTrimmed,
      short_code: brandTrimmed.length <= 4 ? brandTrimmed.toUpperCase() : brandTrimmed.substring(0, 3).toUpperCase(),
      accent_hex: "#7C3AED"
    };
  }

  // 4. Infer from product attributes (SKU prefix, item name keywords, HSN, taxonomy)
  const inferred = inferCompanyFromProductAttributes({
    sku: item.sku,
    name: item.name,
    brand: item.brand,
    hsn: item.hsn,
    division_category: item.division_category
  });
  if (inferred) {
    return {
      ...inferred,
      id: item.company_id || inferred.id
    };
  }

  // 5. Check if company_id matches predefined fallback defaults
  if (item.company_id) {
    const matched = Object.values(FALLBACK_COMPANY_DEFAULTS).find(c => c.id === item.company_id);
    if (matched) return matched;
  }

  // Default to General only if truly unknown
  return {
    id: item.company_id || "general",
    name: "General",
    short_code: "GEN",
    accent_hex: "#64748B"
  };
}

export function resolveEffectiveGstRate(item?: {
  gst_rate?: number | string | null;
  cgst_rate?: number | string | null;
  sgst_rate?: number | string | null;
  igst_rate?: number | string | null;
  hsn?: string | null;
  sku?: string | null;
  name?: string | null;
  product?: {
    gst_rate?: number | string | null;
    cgst_rate?: number | string | null;
    sgst_rate?: number | string | null;
    igst_rate?: number | string | null;
    hsn?: string | null;
  } | null;
} | null): number {
  if (!item) return 0;
  
  const parseNum = (v: unknown): number => {
    if (typeof v === "number") return isNaN(v) ? 0 : v;
    if (typeof v === "string") {
      const p = parseFloat(v);
      return isNaN(p) ? 0 : p;
    }
    return 0;
  };

  // 1. Explicit item gst_rate > 0
  const itemGst = parseNum(item.gst_rate);
  if (itemGst > 0) return itemGst;

  // 2. Sum of item CGST + SGST (e.g., 2.5% + 2.5% = 5%)
  const itemCgst = parseNum(item.cgst_rate);
  const itemSgst = parseNum(item.sgst_rate);
  if (itemCgst + itemSgst > 0) return Math.round((itemCgst + itemSgst) * 100) / 100;

  // 3. Item IGST
  const itemIgst = parseNum(item.igst_rate);
  if (itemIgst > 0) return itemIgst;

  // 4. Product explicit gst_rate > 0
  const prodGst = parseNum(item.product?.gst_rate);
  if (prodGst > 0) return prodGst;

  // 5. Product CGST + SGST
  const prodCgst = parseNum(item.product?.cgst_rate);
  const prodSgst = parseNum(item.product?.sgst_rate);
  if (prodCgst + prodSgst > 0) return Math.round((prodCgst + prodSgst) * 100) / 100;

  // 6. Product IGST
  const prodIgst = parseNum(item.product?.igst_rate);
  if (prodIgst > 0) return prodIgst;

  // 7. Fallback based on HSN code
  const hsn = (item.hsn || item.product?.hsn || "").trim().replace(/[^0-9]/g, "");
  if (hsn === "33074100" || hsn.startsWith("330741") || hsn.startsWith("3307")) return 5; // Agarbatti / Dhoop
  if (hsn.startsWith("09")) return 5; // Spices / Tea
  if (hsn.startsWith("190540")) return 5; // Rusks / Toasts
  if (hsn.startsWith("1905")) return 18; // Biscuits / Confectionery
  if (hsn.startsWith("340111")) return 5; // Toilet soaps (bars, cakes, moulded shapes - e.g. 34011190, 34011110)
  if (hsn.startsWith("3401") || hsn.startsWith("3402")) return 18; // Detergents & Washing preparations (e.g. 34025000)

  // 8. Heuristics based on name/sku
  const name = (item.name || "").toLowerCase();
  const sku = (item.sku || "").toUpperCase();
  if (
    sku.startsWith("MK-") || sku.startsWith("MAD-") ||
    name.includes("agarbatti") || name.includes("dhoop") || name.includes("incense") ||
    name.includes("madhukunj") || name.includes("bhola") || name.includes("radhe radhe") ||
    name.includes("masala") || name.includes("haldi") || name.includes("mirch")
  ) {
    return 5;
  }

  return 0;
}

export function getCanonicalCompanyKey(comp: { id: string; name: string; short_code?: string }): string {
  const normName = (comp.name || "").trim().toLowerCase();
  if (normName.includes("madhukunj") || normName === "mad" || normName === "mk") return "madhukunj";
  if (normName.includes("bharat") || normName.includes("tatvisha") || normName === "bm" || normName === "tm") return "bharat_masala";
  if (normName.includes("parle") || normName === "pl") return "parle";
  if (normName.includes("jyothy") || normName === "jl") return "jyothy";
  if (normName.includes("itc")) return "itc";
  if (normName.includes("hul") || normName.includes("unilever")) return "hul";
  if (normName.includes("cycle")) return "cycle";
  return normName || (comp.short_code || comp.id).trim().toLowerCase();
}

export function groupLinesByCompany(lines: Line[]): CompanySummary[] {
  const activeLines = lines.filter(l => !l.isRemoved);
  if (activeLines.length === 0) return [];

  const overallSubtotal = activeLines.reduce(
    (s, l) => s + (parseFloat(String(l.unit_price)) || 0) * (parseFloat(String(l.quantity)) || 0),
    0
  );

  const groupsMap = new Map<string, {
    info: { id: string; name: string; short_code: string; accent_hex: string };
    lines: Line[];
  }>();

  for (const line of activeLines) {
    const comp = resolveCompanyInfo(line);
    const key = getCanonicalCompanyKey(comp);
    
    if (!groupsMap.has(key)) {
      groupsMap.set(key, { info: comp, lines: [] });
    } else {
      // If the existing entry has a generic or fallback ID and this line has a real UUID, upgrade info
      const existing = groupsMap.get(key)!;
      if (comp.id && comp.id.length > 20 && (!existing.info.id || existing.info.id.length <= 20)) {
        existing.info = comp;
      }
    }
    groupsMap.get(key)!.lines.push(line);
  }

  // Consolidation: If there's an orphan "General" group and exactly one legitimate company group present,
  // merge the orphan "General" items into the dominant company group so they don't split inappropriately.
  if (groupsMap.size > 1 && (groupsMap.has("general") || groupsMap.has("gen"))) {
    const nonGeneralEntries = Array.from(groupsMap.entries()).filter(([k]) => k !== "general" && k !== "gen");
    if (nonGeneralEntries.length === 1) {
      const [, dominantVal] = nonGeneralEntries[0];
      const genKey = groupsMap.has("general") ? "general" : "gen";
      const genVal = groupsMap.get(genKey);
      if (genVal) {
        dominantVal.lines.push(...genVal.lines);
        groupsMap.delete(genKey);
      }
    }
  }

  const result: CompanySummary[] = [];

  groupsMap.forEach(({ info, lines: groupLines }) => {
    const subtotal = groupLines.reduce(
      (s, l) => s + (parseFloat(String(l.unit_price)) || 0) * (parseFloat(String(l.quantity)) || 0),
      0
    );
    const gst = groupLines.reduce((s, l) => {
      const price = parseFloat(String(l.unit_price)) || 0;
      const qty = parseFloat(String(l.quantity)) || 0;
      const rate = resolveEffectiveGstRate(l);
      return s + (price * qty * (rate / 100));
    }, 0);
    const totalQuantity = groupLines.reduce((s, l) => s + (parseFloat(String(l.quantity)) || 0), 0);
    const total = subtotal + gst;
    const percentage = overallSubtotal > 0 ? (subtotal / overallSubtotal) * 100 : 0;

    result.push({
      id: info.id,
      name: info.name,
      short_code: info.short_code,
      accent_hex: info.accent_hex,
      items_count: groupLines.length,
      total_quantity: totalQuantity,
      subtotal,
      gst,
      total,
      percentage_of_total: percentage,
      lines: groupLines
    });
  });

  return result;
}

export interface GenericCompanyItemGroup<T> {
  id: string;
  name: string;
  short_code: string;
  accent_hex: string;
  items_count: number;
  total_quantity: number;
  subtotal: number;
  gst: number;
  total: number;
  percentage_of_total: number;
  items: T[];
}

export function groupOrderItemsByCompany<T extends {
  product?: {
    id?: string;
    name?: string;
    sku?: string;
    company_id?: string | null;
    company?: Company | { id?: string; name?: string; short_code?: string; accent_hex?: string } | null;
    brand?: string | null;
    hsn?: string | null;
    division_category?: string | null;
    gst_rate?: number | null;
    cgst_rate?: number | null;
    sgst_rate?: number | null;
    igst_rate?: number | null;
  } | null;
  product_id?: string;
  unit_price?: number;
  quantity?: number;
  gst_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  line_total?: number;
  pack_type?: string;
}>(items: T[]): GenericCompanyItemGroup<T>[] {
  if (!items || items.length === 0) return [];

  const overallSubtotal = items.reduce((s, it) => {
    const price = Number(it.unit_price || 0);
    const qty = Number(it.quantity || 0);
    return s + (price * qty);
  }, 0);

  const groupsMap = new Map<string, {
    info: { id: string; name: string; short_code: string; accent_hex: string };
    items: T[];
  }>();

  for (const it of items) {
    const comp = resolveCompanyInfo({
      company: it.product?.company,
      company_id: it.product?.company_id,
      brand: it.product?.brand,
      sku: it.product?.sku,
      name: it.product?.name,
      id: it.product?.id || it.product_id,
      hsn: it.product?.hsn,
      division_category: it.product?.division_category
    });

    const key = getCanonicalCompanyKey(comp);

    if (!groupsMap.has(key)) {
      groupsMap.set(key, { info: comp, items: [] });
    } else {
      const existing = groupsMap.get(key)!;
      if (comp.id && comp.id.length > 20 && (!existing.info.id || existing.info.id.length <= 20)) {
        existing.info = comp;
      }
    }
    groupsMap.get(key)!.items.push(it);
  }

  // Consolidation for orphan "General"
  if (groupsMap.size > 1 && (groupsMap.has("general") || groupsMap.has("gen"))) {
    const nonGeneralEntries = Array.from(groupsMap.entries()).filter(([k]) => k !== "general" && k !== "gen");
    if (nonGeneralEntries.length === 1) {
      const [, dominantVal] = nonGeneralEntries[0];
      const genKey = groupsMap.has("general") ? "general" : "gen";
      const genVal = groupsMap.get(genKey);
      if (genVal) {
        dominantVal.items.push(...genVal.items);
        groupsMap.delete(genKey);
      }
    }
  }

  const result: GenericCompanyItemGroup<T>[] = [];

  groupsMap.forEach(({ info, items: grpItems }) => {
    let subtotal = 0;
    let gst = 0;
    let totalQty = 0;

    for (const it of grpItems) {
      const price = Number(it.unit_price || 0);
      const qty = Number(it.quantity || 0);
      const itRec = it as unknown as Record<string, unknown>;
      const rate = resolveEffectiveGstRate({
        gst_rate: it.gst_rate,
        cgst_rate: (itRec.cgst_rate as number | undefined) ?? it.product?.cgst_rate,
        sgst_rate: (itRec.sgst_rate as number | undefined) ?? it.product?.sgst_rate,
        igst_rate: (itRec.igst_rate as number | undefined) ?? it.product?.igst_rate,
        hsn: it.product?.hsn,
        sku: it.product?.sku,
        name: it.product?.name,
        product: it.product
      });
      const lineSubtotal = price * qty;
      const lineGst = lineSubtotal * (rate / 100);

      subtotal += lineSubtotal;
      gst += lineGst;
      totalQty += qty;
    }

    const total = subtotal + gst;
    const percentage = overallSubtotal > 0 ? (subtotal / overallSubtotal) * 100 : 0;

    result.push({
      id: info.id,
      name: info.name,
      short_code: info.short_code,
      accent_hex: info.accent_hex,
      items_count: grpItems.length,
      total_quantity: totalQty,
      subtotal,
      gst,
      total,
      percentage_of_total: percentage,
      items: grpItems
    });
  });

  return result;
}
