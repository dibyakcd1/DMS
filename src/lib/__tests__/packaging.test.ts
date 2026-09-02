import { describe, it, expect } from 'vitest';
import { 
  derivePackaging, 
  convertToBaseUnits, 
  getDetailedStockBreakdown,
  normalizePackUnit,
  resolveUnitProfile,
  detectPackagingConflicts,
  isProductDozenPackaging,
  toDbPackType
} from '../packaging';
import { Product } from '@/types';

describe('Packaging Library', () => {
  const mockProduct: Partial<Product> = {
    id: 'p1',
    name: 'Tej Patta',
    unit_type: 'pcs',
    units_per_packet: 1,
    packets_per_case: 50,
    units_per_case: 50,
    pack_size_value: 10,
    pack_size_unit: 'g'
  };

  describe('normalizePackUnit', () => {
    it('normalizes dozen variants', () => {
      expect(normalizePackUnit('dz')).toBe('doz');
      expect(normalizePackUnit('doz')).toBe('doz');
      expect(normalizePackUnit('DOZEN')).toBe('doz');
      expect(normalizePackUnit('dozens')).toBe('doz');
    });

    it('normalizes case and carton variants', () => {
      expect(normalizePackUnit('cs')).toBe('case');
      expect(normalizePackUnit('case')).toBe('case');
      expect(normalizePackUnit('CTN')).toBe('case');
      expect(normalizePackUnit('carton')).toBe('case');
      expect(normalizePackUnit('box')).toBe('box');
      expect(normalizePackUnit('boxes')).toBe('box');
    });

    it('normalizes packet variants', () => {
      expect(normalizePackUnit('pkt')).toBe('packet');
      expect(normalizePackUnit('packet')).toBe('packet');
      expect(normalizePackUnit('pack')).toBe('packet');
      expect(normalizePackUnit('pkgs')).toBe('packet');
      expect(normalizePackUnit('pouch')).toBe('pouch');
    });

    it('normalizes weight & volume variants', () => {
      expect(normalizePackUnit('kg')).toBe('kg');
      expect(normalizePackUnit('kgs')).toBe('kg');
      expect(normalizePackUnit('gms')).toBe('g');
      expect(normalizePackUnit('gram')).toBe('g');
      expect(normalizePackUnit('ml')).toBe('ml');
      expect(normalizePackUnit('ltr')).toBe('ltr');
    });

    it('falls back gracefully to pcs for null/empty/unknown', () => {
      expect(normalizePackUnit('')).toBe('pcs');
      expect(normalizePackUnit(null)).toBe('pcs');
      expect(normalizePackUnit(undefined)).toBe('pcs');
    });
  });

  describe('resolveUnitProfile', () => {
    it('resolves FMCG dozen products with correct base multiplier and sync payload', () => {
      const dozenProduct: Partial<Product> = {
        id: 'd1',
        name: 'MK Radhe Radhe Agarbatti',
        brand: 'Madhukunj',
        hsn: '33074100'
      };

      const profile = resolveUnitProfile('doz', dozenProduct);
      expect(profile.canonicalUnit).toBe('doz');
      expect(profile.baseMultiplier).toBe(12);
      expect(profile.units_per_packet).toBe(12);
      expect(profile.syncPayload.preferred_sell_unit).toBe('doz');
      expect(profile.syncPayload.units_per_packet).toBe(12);
      expect(profile.dbPackType).toBe('doz');
      expect(profile.displayConversion).toBe('1 Doz = 12 Pcs');
    });

    it('resolves multi-tier case items with nested packet hierarchy', () => {
      const caseProduct: Partial<Product> = {
        id: 'c1',
        name: 'Chandan Premium Pouch',
        units_per_packet: 10,
        packets_per_case: 5,
        units_per_case: 50
      };

      const profile = resolveUnitProfile('case', caseProduct);
      expect(profile.canonicalUnit).toBe('case');
      expect(profile.tier).toBe('top');
      expect(profile.baseMultiplier).toBe(50);
      expect(profile.units_per_case).toBe(50);
      expect(profile.displayConversion).toContain('50 Pcs');
    });

    it('resolves discrete packet item correctly', () => {
      const packetProduct: Partial<Product> = {
        id: 'pk1',
        name: 'Hing Pouch 50g',
        units_per_packet: 20
      };

      const profile = resolveUnitProfile('packet', packetProduct);
      expect(profile.canonicalUnit).toBe('packet');
      expect(profile.baseMultiplier).toBe(20);
      expect(profile.tier).toBe('mid');
    });

    it('resolves weight-based items with pack size conversion', () => {
      const spiceProduct: Partial<Product> = {
        id: 'sp1',
        name: 'Haldi Powder 250g',
        pack_size_value: 250,
        pack_size_unit: 'g',
        unit_type: 'kg_g'
      };

      // 1 kg of 250g packs = 4 packs
      const profile = resolveUnitProfile('kg', spiceProduct);
      expect(profile.canonicalUnit).toBe('kg');
      expect(profile.baseMultiplier).toBe(4);
      expect(profile.unit_type).toBe('kg_g');
    });

    it('resolves liquid-based items with ml/ltr conversion', () => {
      const liquidProduct: Partial<Product> = {
        id: 'lq1',
        name: 'Pooja Rose Water 500ml',
        pack_size_value: 500,
        pack_size_unit: 'ml',
        unit_type: 'kg_g'
      };

      // 1 Ltr of 500ml bottles = 2 bottles
      const profile = resolveUnitProfile('ltr', liquidProduct);
      expect(profile.canonicalUnit).toBe('ltr');
      expect(profile.baseMultiplier).toBe(2);
    });

    it('prioritizes extracted invoice multipliers when resolving unconfigured products', () => {
      const rawProduct: Partial<Product> = {
        id: 'new1',
        name: 'New Camphor Jar'
      };

      const profile = resolveUnitProfile('case', rawProduct, {
        units_per_packet: 6,
        packets_per_case: 12,
        units_per_case: 72
      });

      expect(profile.units_per_packet).toBe(6);
      expect(profile.packets_per_case).toBe(12);
      expect(profile.units_per_case).toBe(72);
      expect(profile.baseMultiplier).toBe(72);
      expect(profile.syncPayload.units_per_packet).toBe(6);
      expect(profile.syncPayload.units_per_case).toBe(72);
    });
  });

  describe('detectPackagingConflicts', () => {
    it('flags mismatch when invoice units_per_packet differs from master', () => {
      const existingProduct: Partial<Product> = {
        id: 'p1',
        name: 'Test Product',
        units_per_packet: 12
      };

      const warnings = detectPackagingConflicts(existingProduct, {
        unitsPerPacket: 24
      });

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].field).toBe('units_per_packet');
      expect(warnings[0].severity).toBe('warning');
    });

    it('flags mismatch when invoice total units per case differs from master', () => {
      const existingProduct: Partial<Product> = {
        id: 'p1',
        name: 'Test Product',
        units_per_case: 100
      };

      const warnings = detectPackagingConflicts(existingProduct, {
        unitsPerCase: 50
      });

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].field).toBe('units_per_case');
    });

    it('returns empty warnings when packaging matches', () => {
      const existingProduct: Partial<Product> = {
        id: 'p1',
        name: 'Matching Product',
        units_per_packet: 10,
        units_per_case: 100
      };

      const warnings = detectPackagingConflicts(existingProduct, {
        unitsPerPacket: 10,
        unitsPerCase: 100
      });

      expect(warnings.length).toBe(0);
    });
  });

  describe('derivePackaging', () => {
    it('derives correctly for pcs type', () => {
      const info = derivePackaging(mockProduct);
      expect(info.baseUnit).toBe('pcs');
      expect(info.topUnit).toBe('Case');
      expect(info.totalItemsInTop).toBe(50);
    });

    it('derives correctly for packet type', () => {
      const packetProd = { ...mockProduct, unit_type: 'packet' as const, units_per_packet: 10, units_per_case: 500 };
      const info = derivePackaging(packetProd);
      expect(info.midUnit).toBe('Packet');
      expect(info.midMultiplier).toBe(10);
      expect(info.totalItemsInTop).toBe(500);
    });

    it('derives correctly for weight-based products (kg_g)', () => {
      const kgProd = { 
        ...mockProduct, 
        unit_type: 'kg_g' as const, 
        pack_size_value: 500, 
        pack_size_unit: 'g' 
      };
      const info = derivePackaging(kgProd);
      expect(info.baseUnit).toBe('g');
      expect(info.allowKg).toBe(true);
    });

    it('derives correctly for dozen-based products (e.g. Radhe Radhe 10)', () => {
      const dozenProd = {
        id: 'p2',
        name: 'MK Radhe Radhe 10',
        unit_type: 'pcs' as const,
        units_per_packet: 12,
        units_per_case: 12,
        preferred_sell_unit: 'doz'
      };
      const info = derivePackaging(dozenProd);
      expect(info.baseUnit).toBe('pcs');
      expect(info.topUnit).toBe('Doz');
      expect(info.totalItemsInTop).toBe(12);
    });
  });

  describe('convertToBaseUnits', () => {
    it('identifies case conversion correctly', () => {
      const base = convertToBaseUnits(2, 'case', mockProduct);
      expect(base).toBe(100); // 2 cases * 50 units
    });

    it('identifies packet conversion correctly', () => {
      const packetProd = { ...mockProduct, units_per_packet: 10 };
      const base = convertToBaseUnits(3, 'packet', packetProd);
      expect(base).toBe(30); // 3 packets * 10 units
    });

    it('handles kg to grams conversion for loose items', () => {
      const kgProd = { unit_type: 'kg_g' as const };
      const base = convertToBaseUnits(2.5, 'kg', kgProd);
      expect(base).toBe(2500);
    });

    it('handles kg based on pack size for discrete items', () => {
      const kgProd = { 
        unit_type: 'kg_g' as const, 
        pack_size_value: 250, 
        pack_size_unit: 'g' 
      };
      // 1kg = (1000/250) = 4 units
      // 2kg = 8 units
      const base = convertToBaseUnits(2, 'kg', kgProd);
      expect(base).toBe(8);
    });
  });

  describe('getDetailedStockBreakdown', () => {
    it('breaks down stock into cases and units', () => {
      const breakdown = getDetailedStockBreakdown(125, mockProduct);
      expect(breakdown.cases).toBe(2); // 100 units
      expect(breakdown.units).toBe(25); // remainder
    });

    it('includes packets if available', () => {
      const packetProd = { ...mockProduct, units_per_packet: 10, packets_per_case: 5 }; // 50 units per case
      const breakdown = getDetailedStockBreakdown(73, packetProd);
      expect(breakdown.cases).toBe(1);
      expect(breakdown.packets).toBe(2);
      expect(breakdown.units).toBe(3);
    });
  });

  describe('toDbPackType', () => {
    it('maps unit strings to valid PostgreSQL enum values', () => {
      expect(toDbPackType('pcs')).toBe('unit');
      expect(toDbPackType('doz')).toBe('doz');
      expect(toDbPackType('case')).toBe('case');
      expect(toDbPackType('pouch')).toBe('pouch');
      expect(toDbPackType('box')).toBe('box');
      expect(toDbPackType('jar')).toBe('jar');
      expect(toDbPackType('bottle')).toBe('bottle');
      expect(toDbPackType('kg')).toBe('kg');
      expect(toDbPackType('ltr')).toBe('ltr');
      expect(toDbPackType('g')).toBe('g');
      expect(toDbPackType('ml')).toBe('ml');
      expect(toDbPackType(null)).toBe('unit');
    });
  });
});
