import { describe, it, expect } from 'vitest';
import { normalizeNameForGate, matchProduct, buildNormalizedCatalog } from '../grnMatcher';
import { Product } from '@/types';

describe('GRN Matcher Library', () => {
  describe('normalizeNameForGate', () => {
    it('applies Hindi to English aliases', () => {
      expect(normalizeNameForGate('HALDI POWDER')).toBe('TURMERIC POWDER');
      expect(normalizeNameForGate('MIRCH 200G')).toBe('CHILLI'); // 200G is stripped
    });

    it('strips numbers and units', () => {
      expect(normalizeNameForGate('CUMIN 100G POUCH')).toBe('CUMIN');
      expect(normalizeNameForGate('TURMERIC 1KG BAG')).toBe('TURMERIC');
    });

    it('normalizes spacing and case', () => {
      expect(normalizeNameForGate('  hello   world  ')).toBe('HELLO WORLD');
    });
  });

  describe('matchProduct', () => {
    const mockCatalog = buildNormalizedCatalog([
      {
        id: '1',
        name: 'Turmeric Powder',
        sku: 'TP-100',
        pack_size_value: 100,
        pack_size_unit: 'g',
        units_per_packet: 1,
        packets_per_case: 50
      } as unknown as Product,
      {
        id: '2',
        name: 'Chilli Powder Special',
        sku: 'CPS-200',
        pack_size_value: 200,
        pack_size_unit: 'g',
        units_per_packet: 1,
        packets_per_case: 50
      } as unknown as Product
    ]);

    it('matches exactly by name and weight', () => {
      const line = 'HALDI POWDER 100G [50]';
      const result = matchProduct(line, mockCatalog);
      expect(result.match_status).toBe('MATCHED');
      expect(result.matched_product?.name).toBe('Turmeric Powder');
    });

    it('rejects completely unrelated items', () => {
      const line = 'UNRECOGNIZED SPICE 500G';
      const result = matchProduct(line, mockCatalog);
      expect(result.match_status).toBe('UNMATCHED');
      expect(result.matched_product).toBeNull();
    });

    it('handles low confidence matches (ambiguity) and fuzzy weights', () => {
      // If two items are very similar, it should mark as LOW_CONFIDENCE
      const similarCatalog = buildNormalizedCatalog([
        { id: '1', name: 'Salt 100g', pack_size_value: 100, pack_size_unit: 'g' } as unknown as Product,
        { id: '2', name: 'Salt 105g', pack_size_value: 105, pack_size_unit: 'g' } as unknown as Product
      ]);
      const result = matchProduct('SALT 102G', similarCatalog);
      expect(result.match_status).toBe('LOW_CONFIDENCE');
    });

    it('identifies weight from strings correctly', () => {
      const weightCatalog = buildNormalizedCatalog([
        { id: 'w1', name: 'Cumin Pouch', pack_size_value: 250, pack_size_unit: 'g' } as unknown as Product
      ]);
      const result = matchProduct('JEERA 250G', weightCatalog); // JEERA = Cumin
      expect(result.match_status).toBe('MATCHED');
      expect(result.matched_product?.id).toBe('w1');
    });

    it('matches even with brand prefixes', () => {
      const result = matchProduct('BHARAT HALDI 100G', mockCatalog);
      expect(result.match_status).toBe('MATCHED');
      expect(result.matched_product?.name).toBe('Turmeric Powder');
    });
  });
});
