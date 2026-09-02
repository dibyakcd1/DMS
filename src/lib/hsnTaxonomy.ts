/**
 * Comprehensive Indian GST HSN Code to FMCG Category & Tax Rate Master Dictionary
 * 
 * Provides automated taxonomy classification, default GST rates, and descriptions
 * based on standard Harmonized System of Nomenclature (HSN) codes used across FMCG,
 * Spices, Food, Beverages, Personal Care, and Household items in India.
 */

export interface HsnMasterEntry {
  hsnPrefix: string; // 2, 4, 6, or 8 digits
  category: string;
  subCategory?: string;
  division: string;
  defaultGstRate: number;
  description: string;
}

export const HSN_TAXONOMY_MASTER: HsnMasterEntry[] = [
  // -------------------------------------------------------------
  // CHAPTER 09: COFFEE, TEA, SPICES & SEASONINGS
  // -------------------------------------------------------------
  {
    hsnPrefix: "0901",
    category: "Beverages",
    subCategory: "Coffee",
    division: "Beverages & Drinks",
    defaultGstRate: 5,
    description: "Coffee, whether or not roasted or decaffeinated; coffee husks and skins"
  },
  {
    hsnPrefix: "0902",
    category: "Beverages",
    subCategory: "Tea (Chai)",
    division: "Beverages & Drinks",
    defaultGstRate: 5,
    description: "Tea, whether or not flavored (Black tea, Green tea, CTC)"
  },
  {
    hsnPrefix: "0904",
    category: "Spices",
    subCategory: "Chilli (Mirch) & Pepper",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Pepper of the genus Piper; dried or crushed or ground fruits of the genus Capsicum or Pimenta"
  },
  {
    hsnPrefix: "0905",
    category: "Spices",
    subCategory: "Vanilla",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Vanilla beans and extracts"
  },
  {
    hsnPrefix: "0906",
    category: "Spices",
    subCategory: "Cinnamon (Dalchini)",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Cinnamon and cinnamon-tree flowers"
  },
  {
    hsnPrefix: "0907",
    category: "Spices",
    subCategory: "Cloves (Laung)",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Cloves (whole fruit, cloves and stems)"
  },
  {
    hsnPrefix: "0908",
    category: "Spices",
    subCategory: "Cardamom (Elaichi) & Nutmeg",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Nutmeg, mace and cardamoms (Large/Small elaichi)"
  },
  {
    hsnPrefix: "0909",
    category: "Spices",
    subCategory: "Cumin (Jeera), Coriander & Fennel",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Seeds of anise, badian, fennel, coriander, cumin or caraway; juniper berries"
  },
  {
    hsnPrefix: "091011",
    category: "Spices",
    subCategory: "Ginger (Adrak/Sonth)",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Ginger fresh or dried"
  },
  {
    hsnPrefix: "091012",
    category: "Spices",
    subCategory: "Ginger Powder",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Crushed or ground dry ginger powder"
  },
  {
    hsnPrefix: "091020",
    category: "Spices",
    subCategory: "Saffron (Kesar)",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Saffron"
  },
  {
    hsnPrefix: "091030",
    category: "Spices",
    subCategory: "Turmeric (Haldi)",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Turmeric (curcuma) whole and ground"
  },
  {
    hsnPrefix: "091091",
    category: "Blended Spice",
    subCategory: "Mixed / Blended Masala",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Mixtures of spices, Curry powder, Garam Masala, Meat Masala, Kitchen King, Sambhar, etc."
  },
  {
    hsnPrefix: "091099",
    category: "Spices",
    subCategory: "Fenugreek (Methi), Mustard (Rai) & Hing",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Other spices including fenugreek seeds, mustard seeds, dill, hing"
  },
  {
    hsnPrefix: "0910",
    category: "Spices",
    subCategory: "Spices & Seasonings",
    division: "Spices & Seasonings",
    defaultGstRate: 5,
    description: "Ginger, saffron, turmeric (curcuma), thyme, bay leaves, curry and other spices"
  },

  // -------------------------------------------------------------
  // CHAPTER 33: ESSENTIAL OILS, PERFUMERY, COSMETICS, INCENSE / AGARBATTI
  // -------------------------------------------------------------
  {
    hsnPrefix: "33074100",
    category: "Household Care",
    subCategory: "Incense Sticks & Agarbatti",
    division: "Household Care & Pooja",
    defaultGstRate: 5,
    description: "Agarbatti, dhoop sticks, sambrani and other odoriferous preparations which operate by burning"
  },
  {
    hsnPrefix: "330741",
    category: "Household Care",
    subCategory: "Incense Sticks & Agarbatti",
    division: "Household Care & Pooja",
    defaultGstRate: 5,
    description: "Agarbatti and other incense preparations"
  },
  {
    hsnPrefix: "33074900",
    category: "Household Care",
    subCategory: "Air Fresheners",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Room perfuming or deodorizing preparations, car fresheners"
  },
  {
    hsnPrefix: "330510",
    category: "Personal Care",
    subCategory: "Hair Care & Shampoos",
    division: "Personal Care & Hygiene",
    defaultGstRate: 18,
    description: "Shampoos for hair"
  },
  {
    hsnPrefix: "330590",
    category: "Personal Care",
    subCategory: "Hair Oils & Conditioners",
    division: "Personal Care & Hygiene",
    defaultGstRate: 18,
    description: "Hair oils, hair creams, hair dyes"
  },
  {
    hsnPrefix: "330610",
    category: "Personal Care",
    subCategory: "Oral Care & Toothpaste",
    division: "Personal Care & Hygiene",
    defaultGstRate: 18,
    description: "Dentifrices, toothpaste, tooth powder"
  },
  {
    hsnPrefix: "3304",
    category: "Personal Care",
    subCategory: "Skin Care & Lotions",
    division: "Personal Care & Hygiene",
    defaultGstRate: 18,
    description: "Beauty or make-up preparations, skin creams, moisturizers, talcum powders"
  },
  {
    hsnPrefix: "3307",
    category: "Personal Care",
    subCategory: "Deodorants & Grooming",
    division: "Personal Care & Hygiene",
    defaultGstRate: 18,
    description: "Pre-shave, shaving or after-shave preparations, personal deodorants, bath salts"
  },

  // -------------------------------------------------------------
  // CHAPTER 34: SOAPS, DETERGENTS, WASHING PREPARATIONS
  // -------------------------------------------------------------
  {
    hsnPrefix: "34011190",
    category: "Personal Care",
    subCategory: "Toilet Soaps (Bars & Cakes)",
    division: "Personal Care & Hygiene",
    defaultGstRate: 5,
    description: "Toilet soaps (bars, cakes, moulded shapes) & bath soaps (Lifebuoy, Lux, Dove, Dettol, etc.)"
  },
  {
    hsnPrefix: "34011110",
    category: "Personal Care",
    subCategory: "Medicated Bath Soaps",
    division: "Personal Care & Hygiene",
    defaultGstRate: 5,
    description: "Medicated toilet soaps in bars/cakes"
  },
  {
    hsnPrefix: "34011120",
    category: "Personal Care",
    subCategory: "Toilet Soaps",
    division: "Personal Care & Hygiene",
    defaultGstRate: 5,
    description: "Toilet soaps, cakes and moulded shapes"
  },
  {
    hsnPrefix: "340111",
    category: "Personal Care",
    subCategory: "Toilet Soaps (Bars & Cakes)",
    division: "Personal Care & Hygiene",
    defaultGstRate: 5,
    description: "Toilet soaps (bars, cakes, moulded shapes) & bath soaps"
  },
  {
    hsnPrefix: "34011900",
    category: "Household Care",
    subCategory: "Laundry Soaps & Washing Bars",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Laundry soaps, washing bars (Rin bar, Wheel bar, etc.)"
  },
  {
    hsnPrefix: "340119",
    category: "Household Care",
    subCategory: "Detergent Bars & Laundry Soaps",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Laundry soaps, washing bars"
  },
  {
    hsnPrefix: "34012000",
    category: "Personal Care",
    subCategory: "Liquid Handwash & Body Wash",
    division: "Personal Care & Hygiene",
    defaultGstRate: 18,
    description: "Liquid soap and organic surface-active products in liquid/gel form"
  },
  {
    hsnPrefix: "340120",
    category: "Personal Care",
    subCategory: "Liquid Handwash & Body Wash",
    division: "Personal Care & Hygiene",
    defaultGstRate: 18,
    description: "Liquid soap and organic surface-active products in liquid/gel form"
  },
  {
    hsnPrefix: "340130",
    category: "Personal Care",
    subCategory: "Skin Cleansing Preparations",
    division: "Personal Care & Hygiene",
    defaultGstRate: 18,
    description: "Organic surface-active products for skin washing"
  },
  {
    hsnPrefix: "34025000",
    category: "Household Care",
    subCategory: "Retail Detergents & Washing Preparations",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Cleaning & retail washing preparations (detergents, powders, Surf Excel, Ariel, Tide)"
  },
  {
    hsnPrefix: "340250",
    category: "Household Care",
    subCategory: "Retail Detergents & Cleaners",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Cleaning & retail washing preparations (detergents)"
  },
  {
    hsnPrefix: "340220",
    category: "Household Care",
    subCategory: "Detergent Powders & Liquids",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Washing powders, liquid detergents, surface cleaners"
  },
  {
    hsnPrefix: "34029010",
    category: "Household Care",
    subCategory: "Dishwash Bars & Liquids",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Dishwashing pastes, bars (Vim, Pril, Exo)"
  },
  {
    hsnPrefix: "34029020",
    category: "Household Care",
    subCategory: "Surface & Floor Cleaners",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Floor cleaning preparations, phenyl, surface disinfectants"
  },
  {
    hsnPrefix: "340290",
    category: "Household Care",
    subCategory: "Dishwash & Cleaning Preparations",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Dishwashing pastes, liquids, floor cleaning preparations (phenyl, etc.)"
  },
  {
    hsnPrefix: "3402",
    category: "Household Care",
    subCategory: "Detergent & Cleaners",
    division: "Household Care & Pooja",
    defaultGstRate: 18,
    description: "Organic surface-active agents, washing and cleaning preparations"
  },

  // -------------------------------------------------------------
  // CHAPTER 19: PREPARATIONS OF CEREALS, FLOUR, BISCUITS & NOODLES
  // -------------------------------------------------------------
  {
    hsnPrefix: "190531",
    category: "Food Items",
    subCategory: "Biscuits & Cookies",
    division: "Food & Snacks",
    defaultGstRate: 18,
    description: "Sweet biscuits, cookies"
  },
  {
    hsnPrefix: "190532",
    category: "Food Items",
    subCategory: "Waffles & Wafers",
    division: "Food & Snacks",
    defaultGstRate: 18,
    description: "Waffles and wafers"
  },
  {
    hsnPrefix: "190540",
    category: "Food Items",
    subCategory: "Rusks & Toasts",
    division: "Food & Snacks",
    defaultGstRate: 5,
    description: "Rusks, toasted bread and similar toasted products"
  },
  {
    hsnPrefix: "190590",
    category: "Food Items",
    subCategory: "Bread, Cakes & Pastries",
    division: "Food & Snacks",
    defaultGstRate: 18,
    description: "Pastries, cakes, pizza bread, bread without sweetening (0% or 18%)"
  },
  {
    hsnPrefix: "190230",
    category: "Food Items",
    subCategory: "Noodles & Pasta",
    division: "Food & Snacks",
    defaultGstRate: 18,
    description: "Instant noodles (Maggi, Yippee), macaroni, pasta, vermicelli"
  },
  {
    hsnPrefix: "190410",
    category: "Food Items",
    subCategory: "Breakfast Cereals & Puffed Grains",
    division: "Food & Snacks",
    defaultGstRate: 18,
    description: "Corn flakes, breakfast cereals, puffed rice preps"
  },

  // -------------------------------------------------------------
  // CHAPTER 21: MISCELLANEOUS EDIBLE PREPARATIONS (SAUCES, NAMKEEN, TEA EXTRACTS)
  // -------------------------------------------------------------
  {
    hsnPrefix: "210320",
    category: "Food Items",
    subCategory: "Sauces & Condiments",
    division: "Food & Snacks",
    defaultGstRate: 12,
    description: "Tomato ketchup and other tomato sauces"
  },
  {
    hsnPrefix: "210390",
    category: "Food Items",
    subCategory: "Sauces, Seasonings & Mayonnaise",
    division: "Food & Snacks",
    defaultGstRate: 12,
    description: "Mixed condiments and mixed seasonings; mustard flour and meal"
  },
  {
    hsnPrefix: "210690",
    category: "Food Items",
    subCategory: "Namkeen & Snacks",
    division: "Food & Snacks",
    defaultGstRate: 12,
    description: "Bhujia, mixture, namkeens, snack pellets, sweets (mithai)"
  },
  {
    hsnPrefix: "2101",
    category: "Beverages",
    subCategory: "Instant Coffee & Tea Extracts",
    division: "Beverages & Drinks",
    defaultGstRate: 18,
    description: "Extracts, essences and concentrates of coffee, tea or mate"
  },

  // -------------------------------------------------------------
  // CHAPTER 15: ANIMAL OR VEGETABLE FATS AND OILS, GHEE
  // -------------------------------------------------------------
  {
    hsnPrefix: "1514",
    category: "Oil & Ghee",
    subCategory: "Mustard Oil",
    division: "Dairy & Edible Oils",
    defaultGstRate: 5,
    description: "Rape, colza or mustard oil and fractions thereof"
  },
  {
    hsnPrefix: "1507",
    category: "Oil & Ghee",
    subCategory: "Soybean Oil",
    division: "Dairy & Edible Oils",
    defaultGstRate: 5,
    description: "Soya-bean oil and its fractions"
  },
  {
    hsnPrefix: "1512",
    category: "Oil & Ghee",
    subCategory: "Sunflower Oil",
    division: "Dairy & Edible Oils",
    defaultGstRate: 5,
    description: "Sunflower-seed, safflower or cotton-seed oil"
  },
  {
    hsnPrefix: "1516",
    category: "Oil & Ghee",
    subCategory: "Vanaspati Ghee",
    division: "Dairy & Edible Oils",
    defaultGstRate: 5,
    description: "Animal or vegetable fats and oils hydrogenated (Vanaspati)"
  },
  {
    hsnPrefix: "040590",
    category: "Dairy",
    subCategory: "Pure Desi Ghee & Butter",
    division: "Dairy & Edible Oils",
    defaultGstRate: 12,
    description: "Desi Ghee, butter, dairy spreads"
  },
  {
    hsnPrefix: "0402",
    category: "Dairy",
    subCategory: "Milk Powders & Whiteners",
    division: "Dairy & Edible Oils",
    defaultGstRate: 5,
    description: "Milk and cream, concentrated or containing added sugar or other sweetening matter, dairy whiteners"
  },
  {
    hsnPrefix: "0406",
    category: "Dairy",
    subCategory: "Packaged Paneer & Cheese",
    division: "Dairy & Edible Oils",
    defaultGstRate: 12,
    description: "Cheese and curd / branded paneer"
  },

  // -------------------------------------------------------------
  // CHAPTER 10 & 11: CEREALS, GRAINS, FLOURS, PULSES & DALS
  // -------------------------------------------------------------
  {
    hsnPrefix: "1006",
    category: "Grains & Flours",
    subCategory: "Rice (Basmati & Non-Basmati)",
    division: "Grains, Pulses & Staples",
    defaultGstRate: 5,
    description: "Rice (paddy, husked, semi-milled, broken, pre-packaged branded)"
  },
  {
    hsnPrefix: "1001",
    category: "Grains & Flours",
    subCategory: "Wheat",
    division: "Grains, Pulses & Staples",
    defaultGstRate: 5,
    description: "Wheat and meslin"
  },
  {
    hsnPrefix: "1101",
    category: "Grains & Flours",
    subCategory: "Atta (Wheat Flour)",
    division: "Grains, Pulses & Staples",
    defaultGstRate: 5,
    description: "Wheat or meslin flour (Atta, Maida)"
  },
  {
    hsnPrefix: "1102",
    category: "Grains & Flours",
    subCategory: "Cereal Flours & Besan",
    division: "Grains, Pulses & Staples",
    defaultGstRate: 5,
    description: "Cereal flours other than wheat or meslin (Besan, Corn flour, Rice flour)"
  },
  {
    hsnPrefix: "1103",
    category: "Grains & Flours",
    subCategory: "Suji & Daliya",
    division: "Grains, Pulses & Staples",
    defaultGstRate: 5,
    description: "Cereal groats, meal and pellets (Suji, Rava, Daliya)"
  },
  {
    hsnPrefix: "0713",
    category: "Pulses & Dals",
    subCategory: "Pulses, Dals & Grams",
    division: "Grains, Pulses & Staples",
    defaultGstRate: 5,
    description: "Dried leguminous vegetables, shelled (Toor, Moong, Chana, Urad, Masoor, Rajma)"
  },

  // -------------------------------------------------------------
  // CHAPTER 22: BEVERAGES, SPIRITS AND VINEGAR
  // -------------------------------------------------------------
  {
    hsnPrefix: "2201",
    category: "Beverages",
    subCategory: "Packaged Water",
    division: "Beverages & Drinks",
    defaultGstRate: 18,
    description: "Waters, including natural or artificial mineral waters and aerated waters"
  },
  {
    hsnPrefix: "220210",
    category: "Beverages",
    subCategory: "Carbonated Soft Drinks & Soda",
    division: "Beverages & Drinks",
    defaultGstRate: 28,
    description: "Waters, including mineral waters and aerated waters, containing added sugar or other sweetening matter or flavored"
  },
  {
    hsnPrefix: "220290",
    category: "Beverages",
    subCategory: "Fruit Juices & Health Drinks",
    division: "Beverages & Drinks",
    defaultGstRate: 12,
    description: "Other non-alcoholic beverages, fruit based drinks (Frooti, Maaza, Real)"
  },

  // -------------------------------------------------------------
  // CHAPTER 17 & 18: SUGARS, CONFECTIONERY & CHOCOLATES
  // -------------------------------------------------------------
  {
    hsnPrefix: "1701",
    category: "Food Items",
    subCategory: "Sugar",
    division: "Food & Snacks",
    defaultGstRate: 5,
    description: "Cane or beet sugar and chemically pure sucrose in solid form"
  },
  {
    hsnPrefix: "1704",
    category: "Food Items",
    subCategory: "Sugar Confectionery & Candies",
    division: "Food & Snacks",
    defaultGstRate: 18,
    description: "Sugar confectionery (including white chocolate), not containing cocoa (toffees, gums)"
  },
  {
    hsnPrefix: "1806",
    category: "Food Items",
    subCategory: "Chocolates",
    division: "Food & Snacks",
    defaultGstRate: 18,
    description: "Chocolate and other food preparations containing cocoa"
  },

  // -------------------------------------------------------------
  // CHAPTER 39, 48: PACKAGING MATERIAL
  // -------------------------------------------------------------
  {
    hsnPrefix: "4819",
    category: "Packaging Material",
    subCategory: "Corrugated Boxes & Cartons",
    division: "Packaging & Logistics",
    defaultGstRate: 18,
    description: "Cartons, boxes, cases, bags and other packing containers, of paper, paperboard, cellulose wadding"
  },
  {
    hsnPrefix: "3923",
    category: "Packaging Material",
    subCategory: "Plastic Pouches, Bottles & Bags",
    division: "Packaging & Logistics",
    defaultGstRate: 18,
    description: "Articles for the conveyance or packing of goods, of plastics; stoppers, lids, caps"
  },
  {
    hsnPrefix: "3919",
    category: "Packaging Material",
    subCategory: "Adhesive Tapes",
    division: "Packaging & Logistics",
    defaultGstRate: 18,
    description: "Self-adhesive plates, sheets, film, foil, tape, strip and other flat shapes, of plastics"
  }
];

/**
 * Searches the master taxonomy for a given HSN code.
 * Matches by longest prefix match (8-digit, 6-digit, 4-digit, then 2-digit).
 */
export function lookupHsnTaxonomy(hsnCode?: string | null): HsnMasterEntry | null {
  if (!hsnCode) return null;
  const clean = String(hsnCode).replace(/[^0-9]/g, "").trim();
  if (clean.length < 2) return null;

  // Try exact match or descending prefix lengths
  for (let len = Math.min(8, clean.length); len >= 2; len--) {
    const prefix = clean.substring(0, len);
    const found = HSN_TAXONOMY_MASTER.find(m => m.hsnPrefix === prefix);
    if (found) return found;
  }

  // General Chapter fallbacks (2 digits)
  const chapter = clean.substring(0, 2);
  switch (chapter) {
    case "09":
      return {
        hsnPrefix: "09",
        category: "Spices",
        subCategory: "Spices & Seasonings",
        division: "Spices & Seasonings",
        defaultGstRate: 5,
        description: "Coffee, tea, mate and spices"
      };
    case "33":
      return {
        hsnPrefix: "33",
        category: "Personal Care",
        subCategory: "Cosmetics & Toiletries",
        division: "Personal Care & Hygiene",
        defaultGstRate: 18,
        description: "Essential oils, perfumery, cosmetic or toilet preparations"
      };
    case "34":
      return {
        hsnPrefix: "34",
        category: "Household Care",
        subCategory: "Soap & Cleaners",
        division: "Household Care & Pooja",
        defaultGstRate: 18,
        description: "Soap, organic surface-active agents, washing preparations"
      };
    case "19":
      return {
        hsnPrefix: "19",
        category: "Food Items",
        subCategory: "Bakery & Biscuits",
        division: "Food & Snacks",
        defaultGstRate: 18,
        description: "Preparations of cereals, flour, starch or milk; pastrycooks' products"
      };
    case "21":
      return {
        hsnPrefix: "21",
        category: "Food Items",
        subCategory: "Snacks & Namkeen",
        division: "Food & Snacks",
        defaultGstRate: 12,
        description: "Miscellaneous edible preparations"
      };
    case "15":
      return {
        hsnPrefix: "15",
        category: "Oil & Ghee",
        subCategory: "Edible Oils",
        division: "Dairy & Edible Oils",
        defaultGstRate: 5,
        description: "Animal or vegetable fats and oils"
      };
    case "10":
    case "11":
      return {
        hsnPrefix: chapter,
        category: "Grains & Flours",
        subCategory: "Grains & Flours",
        division: "Grains, Pulses & Staples",
        defaultGstRate: 5,
        description: "Cereals and products of the milling industry"
      };
    case "07":
      return {
        hsnPrefix: "07",
        category: "Pulses & Dals",
        subCategory: "Dals & Pulses",
        division: "Grains, Pulses & Staples",
        defaultGstRate: 5,
        description: "Edible vegetables, pulses and tertentu roots and tubers"
      };
    case "22":
      return {
        hsnPrefix: "22",
        category: "Beverages",
        subCategory: "Beverages",
        division: "Beverages & Drinks",
        defaultGstRate: 18,
        description: "Beverages, spirits and vinegar"
      };
    case "39":
    case "48":
      return {
        hsnPrefix: chapter,
        category: "Packaging Material",
        subCategory: "Packaging",
        division: "Packaging & Logistics",
        defaultGstRate: 18,
        description: "Plastics, paper, paperboard and packaging materials"
      };
    default:
      return null;
  }
}
