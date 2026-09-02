import { token_set_ratio, partial_ratio } from 'fuzzball';
import { supabase } from '@/integrations/supabase/client';
import { type Company } from '@/types';

export interface CompanyMatchResult {
  company: Company | null;
  score: number;
  isHighConfidence: boolean;
  matchType: 'exact_code' | 'exact_name' | 'alias' | 'fuzzy' | 'inferred' | 'none';
  suggestedName?: string;
  suggestedCode?: string;
}

export const COMMON_SUPPLIER_COMPANY_ALIASES: Record<string, string[]> = {
  HUL: ['hindustan unilever', 'lever', 'hul', 'unilever india', 'unilever', 'lux', 'dove', 'lifebuoy', 'surf excel', 'vim', 'rin', 'wheel', 'ponds', 'pepsodent', 'close up', 'vaseline', 'sunslik', 'clinic plus'],
  ITC: ['itc limited', 'itc', 'itc foods', 'sunfeast', 'aashirvaad', 'classmate', 'bingo', 'yippee', 'fiama', 'vivel', 'savlon', 'dark fantasy'],
  NESTLE: ['nestle india', 'nestle', 'maggi', 'nescafe', 'kitkat', 'munch', 'milkybar', 'everyday'],
  DABUR: ['dabur india', 'dabur', 'real juices', 'fem', 'hajmola', 'vatika', 'red paste', 'chyawanprash', 'honitus'],
  BRITANNIA: ['britannia industries', 'britannia', 'good day', 'tiger', 'bourbon', 'marie gold', 'milk bikis', '50-50', 'treat', 'nutrichoice', 'little hearts', 'winkies'],
  PARLE: ['parle products', 'parle', 'parle-g', 'monaco', 'krackjack', 'hide & seek', '20-20', 'melody', 'mango bite'],
  CYCLE: ['n. ranga rao & sons', 'n ranga rao', 'cycle pure', 'cycle pure agbarbathi', 'cycle agarbathi', 'cycle', 'lia', 'flute', 'woods', 'parampara', 'vasu'],
  TATVISHA: ['tatvisha enterprises', 'tatvisha', 'tatvisha ent', 'tatvisha masala', 'tatvisha spices'],
  MADHUKUNJ: ['shanti trading', 'maa shantilaxmi', 'shantilaxmi', 'madhukunj', 'radhe radhe', 'madhukunj spices'],
  TATA: ['tata consumer products', 'tata tea', 'tata salt', 'tata sampann', 'tata', 'tata soulfull', 'tetley', 'himalayan water'],
  MDH: ['mahajian di hatti', 'mdh', 'mdh masala', 'mdh spices', 'chunky chat', 'degsi mirch'],
  EVEREST: ['everest food products', 'everest', 'everest masala', 'everest spices', 'everest pav bhaji'],
  CATCH: ['dharampal satyapal', 'ds group', 'catch spices', 'catch masala', 'catch', 'pass pass', 'pulse'],
  CADBURY: ['mondelez india', 'cadbury india', 'cadbury', 'mondelez', 'dairy milk', 'oreo', 'bournvita', 'perk', '5 star', 'gems'],
  MARICO: ['marico limited', 'marico', 'saffola', 'parachute', 'livon', 'set wet', 'mediker'],
  AMUL: ['gcmmf', 'amul', 'anand milk union', 'amul butter', 'amul cheese', 'amul milk'],
  FORTUNE: ['adani wilmar', 'fortune', 'fortune oil', 'fortune chakki', 'raag', 'king'],
  COLGATE: ['colgate palmolive', 'colgate', 'plax', 'palmolive'],
  GODREJ: ['godrej consumer products', 'gcpl', 'godrej', 'goodknight', 'hit', 'cinthol', 'godrej no 1', 'aer'],
  RECKITT: ['reckitt benckiser', 'reckitt', 'rb india', 'dettol', 'harpic', 'lizol', 'mortein', 'vanish', 'veet', 'strepsils'],
  WIPRO: ['wipro enterprises', 'wipro consumer', 'wipro', 'santoor', 'yardley', 'chandrika', 'glitto', 'safewash'],
  EMAMI: ['emami limited', 'emami', 'boroplus', 'navratna', 'zandu', 'fair and handsome', 'kesh king'],
  HALDIRAM: ['haldiram foods', 'haldiram', 'haldirams', 'haldiram snacks', 'haldiram bhujia'],
  BIKAJI: ['bikaji foods', 'bikaji', 'bikaji bhujia', 'bikaji namkeen'],
  BALAJI: ['balaji wafers', 'balaji', 'balaji snacks'],
  PERFETTI: ['perfetti van melle', 'perfetti', 'center fresh', 'center fruit', 'happydent', 'alpenliebe', 'mentos', 'chupa chups']
};

/**
 * Infer the dominant brand name by analyzing the item names from an invoice
 */
export function inferBrandFromItems(items: { sku_or_name: string }[]): string | null {
  if (!items || items.length === 0) return null;

  const brandScores = new Map<string, number>();

  for (const item of items) {
    const raw = (item.sku_or_name || '').toLowerCase();
    
    // Check known alias map
    for (const [code, aliases] of Object.entries(COMMON_SUPPLIER_COMPANY_ALIASES)) {
      for (const alias of aliases) {
        if (raw.includes(alias)) {
          brandScores.set(code, (brandScores.get(code) || 0) + 1);
        }
      }
    }

    // Check first token as candidate brand
    const firstWord = raw.split(/\s+/)[0]?.trim();
    if (firstWord && firstWord.length >= 3 && !['item', 'pack', 'box', 'case', 'unit', 'general', 'super', 'best', 'new', 'pure'].includes(firstWord)) {
      const upperFirst = firstWord.toUpperCase();
      brandScores.set(upperFirst, (brandScores.get(upperFirst) || 0) + 0.5);
    }
  }

  let highestBrand: string | null = null;
  let maxScore = 0;

  brandScores.forEach((score, brand) => {
    if (score > maxScore && score >= Math.max(1, items.length * 0.2)) {
      maxScore = score;
      highestBrand = brand;
    }
  });

  return highestBrand;
}

export function resolveCompany(
  textToMatch: string | null | undefined,
  companies: Company[],
  items?: { sku_or_name: string }[]
): CompanyMatchResult {
  // If we have items, also try to infer brand from items
  const itemInferredBrand = items && items.length > 0 ? inferBrandFromItems(items) : null;

  if ((!textToMatch || !textToMatch.trim()) && !itemInferredBrand) {
    return {
      company: null,
      score: 0,
      isHighConfidence: false,
      matchType: 'none',
    };
  }

  const query = (textToMatch || '').trim().toLowerCase();
  const cleanQuery = query.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Exact match on short_code
  if (cleanQuery) {
    for (const company of companies) {
      if (company.short_code && company.short_code.toLowerCase() === query) {
        return {
          company,
          score: 100,
          isHighConfidence: true,
          matchType: 'exact_code',
        };
      }
    }

    // 2. Exact match on company name
    for (const company of companies) {
      const compName = company.name.toLowerCase().trim();
      if (compName === query || compName === cleanQuery) {
        return {
          company,
          score: 100,
          isHighConfidence: true,
          matchType: 'exact_name',
        };
      }
    }

    // 3. Known Aliases Match
    for (const company of companies) {
      const code = (company.short_code || '').toUpperCase();
      const aliases = COMMON_SUPPLIER_COMPANY_ALIASES[code] || [];
      for (const alias of aliases) {
        if (cleanQuery.includes(alias) || alias.includes(cleanQuery)) {
          return {
            company,
            score: 95,
            isHighConfidence: true,
            matchType: 'alias',
          };
        }
      }
    }
  }

  // 4. Inferred from items if direct query didn't yield exact/alias match
  if (itemInferredBrand) {
    const matchedByItem = companies.find(c => 
      (c.short_code && c.short_code.toUpperCase() === itemInferredBrand) ||
      c.name.toUpperCase().includes(itemInferredBrand)
    );
    if (matchedByItem) {
      return {
        company: matchedByItem,
        score: 90,
        isHighConfidence: true,
        matchType: 'inferred',
      };
    }
  }

  // 5. Fuzzy Match against all companies
  let bestCompany: Company | null = null;
  let bestScore = 0;

  if (cleanQuery) {
    for (const company of companies) {
      const compName = company.name.toLowerCase();
      const compCode = (company.short_code || '').toLowerCase();

      // Check token set ratio & partial ratio
      const nameScore = token_set_ratio(cleanQuery, compName);
      const partialScore = partial_ratio(cleanQuery, compName);
      const codeScore = compCode ? token_set_ratio(cleanQuery, compCode) : 0;

      const maxScore = Math.max(nameScore, partialScore, codeScore);
      if (maxScore > bestScore) {
        bestScore = maxScore;
        bestCompany = company;
      }
    }
  }

  const isHighConfidence = bestScore >= 70;

  // Clean suggestion for creating a brand if not matched
  const suggestedName = cleanQuery 
    ? cleanQuery.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : (itemInferredBrand || 'New Company');
  
  const suggestedCode = (itemInferredBrand || cleanQuery.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)).toUpperCase();

  return {
    company: isHighConfidence ? bestCompany : null,
    score: bestScore,
    isHighConfidence,
    matchType: isHighConfidence ? 'fuzzy' : 'none',
    suggestedName,
    suggestedCode: suggestedCode || 'BRAND'
  };
}

/**
 * Creates and catalogs a new Company directly in the database
 */
export async function createAndCatalogCompany(params: {
  name: string;
  short_code: string;
  accent_hex?: string;
  brand_color?: string;
  prefix?: string;
}): Promise<{ company: Company | null; error: Error | null }> {
  try {
    const cleanName = params.name.trim();
    const cleanCode = (params.short_code || cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)).toUpperCase().trim();
    
    // Check if already exists in DB
    const { data: existing } = await supabase
      .from('companies')
      .select('*')
      .or(`name.ilike.${cleanName},short_code.ilike.${cleanCode}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { company: existing as Company, error: null };
    }

    const { data, error } = await supabase
      .from('companies')
      .insert({
        name: cleanName,
        short_code: cleanCode,
        accent_hex: params.accent_hex || params.brand_color || '#2563EB',
        is_active: true,
        sort_order: 10
      })
      .select()
      .single();

    if (error) throw error;
    return { company: data as Company, error: null };
  } catch (err: unknown) {
    console.error('Failed to create company:', err);
    return { company: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

