/**
 * Unified SKU Generator for Products and GRN Import
 * Generates concise, clean, deterministic SKUs containing company short code to differentiate products.
 */

/**
 * Resolves a normalized company short code (e.g. MK, BM, PARLE, HUL, ITC, JYOTHY, GEN)
 * from company object, company name, brand, or product name.
 */
export function resolveCompanyShortCode(
  companyOrBrand?: string | null,
  productName?: string | null
): string {
  const compStr = (companyOrBrand || '').trim().toUpperCase().replace(/[-_]+$/, '');
  const prodStr = (productName || '').trim().toUpperCase();

  // 1. Check known explicit company / brand codes and keywords
  if (
    ['MK', 'MADHUKUNJ', 'MADHUKUNJ AGARBATTI', 'MADHUKUNJ PRODUCTS'].includes(compStr) || 
    compStr.includes('MADHUKUNJ') ||
    prodStr.includes('MADHUKUNJ') ||
    prodStr.startsWith('MK ') ||
    prodStr.includes(' MK') ||
    /\b(BHOLA|RADHE\s*RADHE|REAL\s*100|NATURE\s*SERIES|ZIPPER)\b/i.test(prodStr)
  ) {
    return 'MK';
  }

  if (
    ['BM', 'BHARAT', 'BHARAT MASALA', 'BHARAT SPICES'].includes(compStr) || 
    compStr.includes('BHARAT') ||
    prodStr.includes('BHARAT MASALA') ||
    /\b(GARAM MASALA|HALDI POWDER|MIRCH POWDER|DHANIYA POWDER|JEERA POWDER)\b/i.test(prodStr)
  ) {
    return 'BM';
  }

  if (
    ['PARLE', 'PARLE PRODUCTS', 'PARLE-G'].includes(compStr) || 
    compStr.includes('PARLE') ||
    /\b(PARLE|KRACKJACK|MONACO|HIDE & SEEK|20-20|MILANO)\b/i.test(prodStr)
  ) {
    return 'PARLE';
  }

  if (
    ['HUL', 'HINDUSTAN UNILEVER', 'UNILEVER'].includes(compStr) || 
    compStr.includes('UNILEVER') ||
    /\b(SURF EXCEL|RIN|VIM|LUX|DOVE|LIFEBUOY|PEPSODENT|CLOSE UP)\b/i.test(prodStr)
  ) {
    return 'HUL';
  }

  if (
    ['ITC', 'ITC LIMITED'].includes(compStr) || 
    compStr.includes('ITC') ||
    /\b(AASHIRVAAD|SUNFEAST|YIPPEE|BINGO|CANDYMAN|CLASSMATE)\b/i.test(prodStr)
  ) {
    return 'ITC';
  }

  if (
    ['JYOTHY', 'JYOTHY LABS', 'JYOTHY LABORATORIES'].includes(compStr) || 
    compStr.includes('JYOTHY') ||
    /\b(UJALA|MAXO|PRIL|EXO|MARGO|HENKO)\b/i.test(prodStr)
  ) {
    return 'JYOTHY';
  }

  if (
    ['NESTLE', 'MAGGI'].includes(compStr) || compStr.includes('NESTLE') || prodStr.includes('MAGGI')
  ) {
    return 'NESTLE';
  }

  if (
    ['MDH', 'MDH SPICES'].includes(compStr) || compStr.includes('MDH') || prodStr.includes('MDH')
  ) {
    return 'MDH';
  }

  if (
    ['EVEREST', 'EVEREST SPICES'].includes(compStr) || compStr.includes('EVEREST') || prodStr.includes('EVEREST')
  ) {
    return 'EVEREST';
  }

  if (
    ['TATA', 'TATA CONSUMER', 'TATA TEA', 'TATA SAMPANN'].includes(compStr) || compStr.includes('TATA') || prodStr.includes('TATA')
  ) {
    return 'TATA';
  }

  if (
    ['FORTUNE', 'ADANI WILMAR'].includes(compStr) || compStr.includes('FORTUNE') || prodStr.includes('FORTUNE')
  ) {
    return 'FORTUNE';
  }

  // 2. If short code given already (2-5 alphanumeric chars) and not generic
  const cleaned = compStr.replace(/[^A-Z0-9]/g, '');
  if (cleaned.length >= 2 && cleaned.length <= 5 && !['GEN', 'ITEM', 'PROD', 'SKU'].includes(cleaned)) {
    return cleaned;
  }

  // 3. Multi-word acronym (e.g. "Ramdev Masala" -> "RM", "Shree Ganesh" -> "SG")
  const words = compStr.split(/[\s_-]+/).filter(w => w && !['PVT', 'LTD', 'PRIVATE', 'LIMITED', 'INC', 'CORP', 'CO'].includes(w));
  if (words.length > 1) {
    const acronym = words.map(w => w[0]).join('').slice(0, 4);
    if (acronym.length >= 2 && !['GEN', 'ITEM'].includes(acronym)) {
      return acronym;
    }
  }

  // 4. If single word company/brand name, take first 3-4 chars
  if (cleaned.length > 2 && !['GEN', 'ITEM', 'GENERAL', 'DEFAULT', 'PRODUCT', 'UNKNOWN'].includes(cleaned)) {
    return cleaned.slice(0, 4);
  }

  return 'GEN';
}

export function generateSku(
  name: string,
  companyCode?: string | null,
  category?: string | null,
  brand?: string | null
): string {
  const compShort = resolveCompanyShortCode(companyCode || brand, name);

  if (!name || !name.trim()) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${compShort}-${rand}`;
  }

  // 1. Clean product name words (removing company name redundancy if present)
  let clean = name
    .trim()
    .toUpperCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');

  // If name starts with company prefix (e.g. "MK REAL 100" or "MADHUKUNJ REAL 100"), clean up for concise acronym
  if (compShort === 'MK') {
    clean = clean.replace(/^(MK|MADHUKUNJ)\s+/, '');
  } else if (compShort === 'BM') {
    clean = clean.replace(/^(BM|BHARAT|BHARAT\s*MASALA)\s+/, '');
  } else if (compShort === 'PARLE') {
    clean = clean.replace(/^(PARLE|PARLE-G)\s+/, '');
  }

  const words = clean.split(' ').filter(Boolean);

  let acronym = '';
  if (words.length === 0) {
    acronym = 'ITEM';
  } else if (words.length === 1) {
    acronym = words[0].slice(0, 6);
  } else if (words.length === 2) {
    acronym = words[0].slice(0, 3) + words[1].slice(0, 3);
  } else {
    // 3 or more words: take first 2 chars of first 2 words + 1st char of subsequent words
    acronym = words[0].slice(0, 2) + words[1].slice(0, 2) + words.slice(2, 5).map(w => w[0]).join('');
  }

  // Extract weight/pack numbers if present in name (e.g. 500G, 1KG, 100P, 20GM, 10/-)
  const weightMatch = name.match(/(\d+(?:\.\d+)?)\s*(G|GM|KG|ML|L|LTR|PCS|PKT|POUCH|P|\/-|\/)?/i);
  let weightSuffix = '';
  if (weightMatch && weightMatch[1]) {
    const val = weightMatch[1].replace('.', '_');
    const rawU = weightMatch[2] ? weightMatch[2].toUpperCase().replace(/[^\w]/g, '').slice(0, 2) : '';
    const u = rawU === 'GM' ? 'G' : rawU;
    weightSuffix = `-${val}${u}`;
  }

  const randSuffix = Math.floor(100 + Math.random() * 900);
  
  const baseSku = `${compShort}-${acronym}${weightSuffix}-${randSuffix}`;

  // Keep under 30 chars, uppercase, alphanumeric and dashes only, avoiding double dashes
  return baseSku.replace(/--+/g, '-').replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
}

/**
 * Validates or ensures a valid SKU exists.
 */
export function ensureSku(
  existingSku?: string | null,
  name?: string,
  companyCode?: string | null,
  brand?: string | null
): string {
  const compShort = resolveCompanyShortCode(companyCode || brand, name);

  if (existingSku && existingSku.trim().length >= 2) {
    let s = existingSku.trim().toUpperCase().replace(/--+/g, '-');
    // If existing SKU starts with ITEM- or PROD- or is generic, prefix or replace with company short code
    if (s.startsWith('ITEM-') || s.startsWith('PROD-')) {
      s = s.replace(/^(ITEM|PROD)-+/, `${compShort}-`);
    } else if (!s.includes('-') && compShort && !s.startsWith(compShort)) {
      s = `${compShort}-${s}`;
    }
    return s.replace(/--+/g, '-').slice(0, 30);
  }
  return generateSku(name || 'Product', companyCode || brand, undefined, brand);
}

