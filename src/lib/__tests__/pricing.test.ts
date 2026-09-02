import { describe, it, expect } from 'vitest';
import { 
  getPackMultiplier, 
  landedCostPerLevel, 
  sellingPrice, 
  getTargetMargin, 
  getAllocationInfo, 
  getItemWeightKg,
  calculateTierPrice, 
  autoCalcAllTiers, 
  resolvePrice,
  computeWacClient
} from '../pricing';
import { PricingProduct } from '../pricing';

describe('Pricing Library', () => {
  const mockProduct: PricingProduct = {
    id: 'test-1',
    units_per_packet: 10,
    packets_per_case: 50,
    mrp: 100,
    target_margin_premium: 3,
    target_margin_gold: 5,
    target_margin_silver: 7,
    target_margin_bronze: 10,
    target_margin_basic: 15,
    weight_per_unit_grams: 100,
    pack_size_value: 100,
    pack_size_unit: 'g'
  };

  describe('getPackMultiplier', () => {
    it('returns 1 for pcs type', () => {
      expect(getPackMultiplier(mockProduct, 'pcs')).toBe(1);
    });

    it('returns units_per_packet for packet type', () => {
      expect(getPackMultiplier(mockProduct, 'packet')).toBe(10);
    });

    it('returns total units for case type', () => {
      expect(getPackMultiplier(mockProduct, 'case')).toBe(500);
    });

    it('calculates kg multiplier based on weight_per_unit_grams', () => {
      // 1000g / 100g = 10 units per kg
      expect(getPackMultiplier(mockProduct, 'kg')).toBe(10);
    });

    it('calculates gram multiplier correctly', () => {
      // 1g / 100g = 0.01 units per gram
      expect(getPackMultiplier(mockProduct, 'g')).toBe(0.01);
    });
  });

  describe('landedCostPerLevel', () => {
    it('derives costs correctly when base is per case', () => {
      const costs = landedCostPerLevel(mockProduct, 5000, false); // 5000 per case
      expect(costs.case).toBe(5000);
      expect(costs.pcs).toBe(10); // 5000 / 500
      expect(costs.packet).toBe(100); // 10 * 10
    });

    it('derives costs correctly when base is per unit', () => {
      const costs = landedCostPerLevel(mockProduct, 10, true); // 10 per unit
      expect(costs.pcs).toBe(10);
      expect(costs.case).toBe(5000); // 10 * 500
      expect(costs.packet).toBe(100); // 10 * 10
    });

    it('derives costs correctly when base is per kg', () => {
      const costs = landedCostPerLevel(mockProduct, 100, 'kg'); // 100 per kg
      // Product is 100g per unit. So 100 per kg -> 10 per unit.
      expect(costs.pcs).toBe(10);
      expect(costs.kg).toBe(100);
      expect(costs.case).toBe(5000);
    });

    it('derives costs correctly for ml and ltr', () => {
      const liquidProduct: PricingProduct = {
        ...mockProduct,
        pack_size_value: 500,
        pack_size_unit: 'ml'
      };
      const costs = landedCostPerLevel(liquidProduct, 50, 'pcs'); // 50 per 500ml unit
      expect(costs.pcs).toBe(50);
      expect(costs.ml).toBe(0.1); // 50 / 500
      expect(costs.ltr).toBe(100); // 0.1 * 1000
    });
  });

  describe('sellingPrice', () => {
    it('calculates selling price with margin', () => {
      // landed / (1 - 0.2) = 100 / 0.8 = 125
      expect(sellingPrice(100, 20, 1)).toBe(125);
    });

    it('rounds to the specified increment', () => {
      // landed: 10, margin: 10% -> 10 / 0.9 = 11.11
      // Round to 0.5 -> 11.5
      expect(sellingPrice(10, 10, 0.5)).toBe(11.5);
    });

    it('returns landed cost if margin is invalid', () => {
      expect(sellingPrice(100, 100)).toBe(100);
      expect(sellingPrice(100, 110)).toBe(100);
    });
  });

  describe('getTargetMargin', () => {
    it('returns product specific margin if available', () => {
      expect(getTargetMargin(mockProduct, 'premium')).toBe(3);
    });

    it('returns default margin if product value is 0 or missing', () => {
      const poorProduct: PricingProduct = { id: '2', units_per_packet: 1, packets_per_case: 1 };
      expect(getTargetMargin(poorProduct, 'basic')).toBe(10);
    });
  });

  describe('getItemWeightKg', () => {
    it('calculates weight correctly for grams and ml', () => {
      // 10 units of 500g = 5kg
      expect(getItemWeightKg(10, 500, 'g')).toBe(5);
      expect(getItemWeightKg(10, 500, 'gm')).toBe(5);
      expect(getItemWeightKg(10, 500, 'gms')).toBe(5);
      expect(getItemWeightKg(10, 500, 'grams')).toBe(5);
      // 1 unit of 500ml = 0.5kg (ml ≈ g)
      expect(getItemWeightKg(1, 500, 'ml')).toBe(0.5);
    });

    it('calculates weight correctly for kg and litres', () => {
      // 5 units of 1kg = 5kg
      expect(getItemWeightKg(5, 1, 'kg')).toBe(5);
      expect(getItemWeightKg(5, 1, 'kilogram')).toBe(5);
      expect(getItemWeightKg(5, 1, 'kilograms')).toBe(5);
      // 2 units of 1 litre = 2kg
      expect(getItemWeightKg(2, 1, 'ltr')).toBe(2);
      expect(getItemWeightKg(2, 1, 'litre')).toBe(2);
      expect(getItemWeightKg(2, 1, 'liter')).toBe(2);
    });

    it('calculates weight correctly for dozen base units (2 doz = 24 pcs of 50g = 1.2kg)', () => {
      expect(getItemWeightKg(24, 50, 'g')).toBe(1.2);
    });

    it('returns 0 for missing or unrecognized units', () => {
      expect(getItemWeightKg(10, 500, undefined)).toBe(0);
      expect(getItemWeightKg(10, 0, 'g')).toBe(0);
      expect(getItemWeightKg(10, 500, 'boxes')).toBe(0);
    });
  });

  describe('getAllocationInfo', () => {
    it('allocates by weight if all lines have weight', () => {
      const result = getAllocationInfo({
        itemQty: 10,
        itemUnitCost: 100,
        itemBaseUnits: 10,
        itemWeightKg: 5,
        totalFreight: 1000,
        totalHandling: 200,
        totalWeightKG: 50,
        totalInvoiceValue: 10000,
        manifestLineCount: 2,
        allLinesHaveWeight: true
      });
      expect(result.method).toBe('⚖ Weight');
      expect(result.freightAmount).toBe(100); // (5 / 50) * 1000
      expect(result.handlingAmount).toBe(20); // (5 / 50) * 200 proportional to weight
    });

    it('falls back to value allocation for entire invoice if any line lacks weight', () => {
      const result = getAllocationInfo({
        itemQty: 10,
        itemUnitCost: 100,
        itemBaseUnits: 10,
        itemWeightKg: 5, // Even though this line has weight, invoice-wide flag is false
        totalFreight: 1000,
        totalHandling: 200,
        totalWeightKG: 0,
        totalInvoiceValue: 2000,
        manifestLineCount: 2,
        allLinesHaveWeight: false
      });
      expect(result.method).toBe('₹ Invoice');
      expect(result.freightAmount).toBe(500); // (1000 / 2000) * 1000
      expect(result.handlingAmount).toBe(100); // (1000 / 2000) * 200 proportional to value
    });

    it('allocates by value if weight is not available', () => {
      const result = getAllocationInfo({
        itemQty: 10,
        itemUnitCost: 100,
        itemBaseUnits: 10,
        itemWeightKg: 0,
        totalFreight: 1000,
        totalWeightKG: 0,
        totalInvoiceValue: 10000
      });
      expect(result.method).toBe('₹ Invoice');
      expect(result.freightAmount).toBe(100); // (1000 / 10000) * 1000
    });
  });

  describe('calculateTierPrice', () => {
    it('calculates expected price for a specific tier and pack', () => {
      // Landed pcs: 10. Margin Bronze: 10% -> 10 / 0.9 = 11.11. Round 0.5 -> 11.5
      const price = calculateTierPrice(mockProduct, 'bronze', 'pcs', 5000); // 5000 per case = 10 per unit
      expect(price).toBe(11.5);
    });
  });

  describe('autoCalcAllTiers', () => {
    it('generates a full matrix of prices', () => {
      const results = autoCalcAllTiers(mockProduct, 5000);
      // 5 shop types * 6 valid pack types (pcs, packet, case, kg, g, doz) = 30 entries
      // ml and ltr are 0 because mockProduct is grams based
      expect(results.length).toBe(30);
      expect(results[0]).toHaveProperty('shop_type');
      expect(results[0]).toHaveProperty('price');
    });
  });

  describe('resolvePrice', () => {
    it('prioritizes shop overrides', () => {
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium',
        shopOverride: 99
      });
      expect(result.price).toBe(99);
      expect(result.source).toBe('override');
    });

    it('uses saved tiers if no override', () => {
      const savedTiers = new Map();
      savedTiers.set('premium:pcs', 88);
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium',
        savedTiers
      });
      expect(result.price).toBe(88);
      expect(result.source).toBe('tier');
    });

    it('falls back to RBP if provided', () => {
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium',
        rbpFallback: 77
      });
      expect(result.price).toBe(77);
      expect(result.source).toBe('rbp');
    });

    it('auto-calculates from landed cost if available', () => {
      // Landed 10, Premium margin 3% -> 10 / 0.97 = 10.30 -> rounded 10.5
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium',
        landedCost: 10
      });
      expect(result.price).toBe(10.5);
      expect(result.source).toBe('auto');
    });

    it('falls back to MRP-based discount if all else fails', () => {
      // MRP 100, Premium discount 60% -> 60
      const result = resolvePrice({
        product: mockProduct,
        packType: 'pcs',
        shopType: 'premium'
      });
      expect(result.price).toBe(60);
      expect(result.source).toBe('auto');
    });

    it('correctly resolves pcs and doz prices for dozen products without inverted pricing', () => {
      const dozenProduct: PricingProduct = {
        id: 'madhukunj-100',
        name: 'Madhukunj 100 Pouch',
        units_per_packet: 12,
        preferred_sell_unit: 'doz',
        item_pack_type: 'doz',
        mrp: 120,
        target_margin_basic: 10
      };

      // When landed cost is 84.96 for the dozen
      const dozResult = resolvePrice({
        product: dozenProduct,
        packType: 'doz',
        shopType: 'basic',
        landedCost: 84.96
      });
      expect(dozResult.price).toBe(94.5); // 84.96 / 0.9 = 94.4 -> 94.5
      expect(dozResult.source).toBe('auto');

      const pcsResult = resolvePrice({
        product: dozenProduct,
        packType: 'pcs',
        shopType: 'basic',
        landedCost: 84.96
      });
      expect(pcsResult.price).toBe(8.0); // 7.08 / 0.9 = 7.86 -> 8.0 (round to 0.5)
      expect(pcsResult.price).toBeLessThan(dozResult.price);
      expect(pcsResult.source).toBe('auto');
    });

    it('correctly resolves piece price for Rs 10 MRP dozen product with unit landed cost of 6.75', () => {
      const radheProduct: PricingProduct = {
        id: 'radhe-10',
        name: 'RADHE RADHE 10/-',
        units_per_packet: 12,
        preferred_sell_unit: 'doz',
        item_pack_type: 'doz',
        mrp: 10,
        target_margin_basic: 10
      };

      // When batch landed cost is 6.75 per piece (from 81/doz)
      const pcsResult = resolvePrice({
        product: radheProduct,
        packType: 'pcs',
        shopType: 'basic',
        landedCost: 6.75
      });
      // 6.75 / (1 - 0.10) = 7.50
      expect(pcsResult.price).toBe(7.5);
      expect(pcsResult.source).toBe('auto');

      const dozResult = resolvePrice({
        product: radheProduct,
        packType: 'doz',
        shopType: 'basic',
        landedCost: 6.75
      });
      // (6.75 * 12) / (1 - 0.10) = 81 / 0.90 = 90
      expect(dozResult.price).toBe(90.0);
      expect(dozResult.source).toBe('auto');
    });

    it('rejects corrupt saved pcs tier when doz tier exists for dozen products', () => {
      const dozenProduct: PricingProduct = {
        id: 'madhukunj-100',
        name: 'Madhukunj 100 Pouch',
        units_per_packet: 12,
        preferred_sell_unit: 'doz',
        item_pack_type: 'doz',
        mrp: 120
      };

      const savedTiers = new Map<string, number>();
      savedTiers.set('basic:doz', 94.5);
      savedTiers.set('basic:pcs', 114.0); // Corrupt: 1 pcs cannot be 114 when 12 pcs is 94.5

      const pcsResult = resolvePrice({
        product: dozenProduct,
        packType: 'pcs',
        shopType: 'basic',
        savedTiers,
        landedCost: 84.96
      });

      // Should reject 114.0 and derive pcs price ~ 8.00
      expect(pcsResult.price).not.toBe(114.0);
      expect(pcsResult.price).toBeLessThan(15);
    });
  });

  describe('computeWacClient', () => {
    it('returns new landed cost when existing quantity is 0 (first import)', () => {
      const result = computeWacClient(0, 0, 500, 45, mockProduct, 'pcs');
      expect(result.blendedWacPerPcs).toBe(45);
      expect(result.newLandedPerPcs).toBe(45);
      expect(result.deltaAbs).toBe(45);
    });

    it('correctly blends existing stock and new batch proportionally (50/50 mix)', () => {
      // 500 pcs @ 40 + 500 pcs @ 50 = 1000 pcs @ 45
      const result = computeWacClient(500, 40, 500, 50, mockProduct, 'pcs');
      expect(result.blendedWacPerPcs).toBe(45);
      expect(result.deltaAbs).toBe(5); // 45 - 40
      expect(result.deltaPct).toBe(12.5); // (45 - 40) / 40 * 100
    });

    it('correctly blends unequal quantities', () => {
      // 900 pcs @ 10 + 100 pcs @ 20 = (9000 + 2000) / 1000 = 11
      const result = computeWacClient(900, 10, 100, 20, mockProduct, 'pcs');
      expect(result.blendedWacPerPcs).toBe(11);
      expect(result.deltaAbs).toBe(1);
      expect(result.deltaPct).toBe(10);
    });

    it('calculates blendedWacPerKg for weight-based products', () => {
      // mockProduct is 100g per unit -> 10 units per kg
      const result = computeWacClient(500, 10, 500, 20, mockProduct, 'pcs');
      expect(result.blendedWacPerPcs).toBe(15);
      expect(result.blendedWacPerKg).toBe(150); // 15 * 10
    });

    it('handles negative or zero gracefully without NaN', () => {
      const result = computeWacClient(-10, 0, 0, 50, mockProduct, 'pcs');
      expect(result.blendedWacPerPcs).toBe(50);
      expect(isNaN(result.blendedWacPerPcs)).toBe(false);
    });
  });
});
