import { describe, it, expect } from 'vitest';
import { resolveDisplayUnit } from '../unitLabel';
import { Product } from '@/types';

describe('Unit Label One Source of Truth (resolveDisplayUnit)', () => {
  describe('Rule 1: Never let item_pack_type override bundle selling tiers', () => {
    it('displays Packet when sold as packet even if item_pack_type is pouch', () => {
      const prod: Partial<Product> = {
        name: 'Agarbatti 100g',
        item_pack_type: 'pouch',
        units_per_packet: 10
      };
      expect(resolveDisplayUnit('packet', prod)).toBe('Packet');
      expect(resolveDisplayUnit('packet', prod, { short: true })).toBe('Pkt');
    });

    it('displays Packet when sold as packet even if item_pack_type is jar', () => {
      const prod: Partial<Product> = {
        name: 'Balaji Candy Jar',
        item_pack_type: 'jar',
        units_per_packet: 20
      };
      expect(resolveDisplayUnit('packet', prod)).toBe('Packet');
      expect(resolveDisplayUnit('pkt', prod)).toBe('Packet');
    });

    it('displays Case when sold as case even if item_pack_type is box', () => {
      const prod: Partial<Product> = {
        name: 'Camphor Box',
        item_pack_type: 'box',
        units_per_case: 50
      };
      expect(resolveDisplayUnit('case', prod)).toBe('Case');
    });

    it('displays Dozen when sold as doz', () => {
      const prod: Partial<Product> = {
        name: 'Radhe Radhe Zipper',
        item_pack_type: 'pouch'
      };
      expect(resolveDisplayUnit('doz', prod)).toBe('Dozen');
      expect(resolveDisplayUnit('doz', prod, { short: true })).toBe('Doz');
      expect(resolveDisplayUnit('dz', prod)).toBe('Dozen');
      expect(resolveDisplayUnit('dozen', prod)).toBe('Dozen');
    });
  });

  describe('Rule 2: Singular piece sales display container flavor only for pcs tier', () => {
    it('displays Pouch when sold as pcs and item_pack_type is pouch', () => {
      const prod: Partial<Product> = { item_pack_type: 'pouch' };
      expect(resolveDisplayUnit('pcs', prod)).toBe('Pouch');
      expect(resolveDisplayUnit('unit', prod)).toBe('Pouch');
    });

    it('displays Jar when sold as pcs and item_pack_type is jar', () => {
      const prod: Partial<Product> = { item_pack_type: 'jar' };
      expect(resolveDisplayUnit('pcs', prod)).toBe('Jar');
    });

    it('displays Bottle / Btl when sold as pcs and item_pack_type is bottle', () => {
      const prod: Partial<Product> = { item_pack_type: 'bottle' };
      expect(resolveDisplayUnit('pcs', prod)).toBe('Bottle');
      expect(resolveDisplayUnit('pcs', prod, { short: true })).toBe('Btl');
    });

    it('displays Can, Box, Strip, Bag, Tin when sold as pcs', () => {
      expect(resolveDisplayUnit('pcs', { item_pack_type: 'can' })).toBe('Can');
      expect(resolveDisplayUnit('pcs', { item_pack_type: 'box' })).toBe('Box');
      expect(resolveDisplayUnit('pcs', { item_pack_type: 'strip' })).toBe('Strip');
      expect(resolveDisplayUnit('pcs', { item_pack_type: 'bag' })).toBe('Bag');
      expect(resolveDisplayUnit('pcs', { item_pack_type: 'tin' })).toBe('Tin');
    });

    it('displays Pcs when sold as pcs and item_pack_type is packet (prevents bundle confusion)', () => {
      const prod: Partial<Product> = { item_pack_type: 'packet' };
      expect(resolveDisplayUnit('pcs', prod)).toBe('Pcs');
      expect(resolveDisplayUnit('unit', prod)).toBe('Pcs');
      expect(resolveDisplayUnit('pcs', prod, { short: true })).toBe('Pcs');
    });

    it('displays generic Pcs when product has no container flavor', () => {
      const prod: Partial<Product> = { name: 'General Item' };
      expect(resolveDisplayUnit('pcs', prod)).toBe('Pcs');
      expect(resolveDisplayUnit('unit', prod)).toBe('Pcs');
    });
  });

  describe('Rule 3: Weight and volume tiers', () => {
    it('displays Kg, Grams/g, Ltr, and Ml properly', () => {
      expect(resolveDisplayUnit('kg')).toBe('Kg');
      expect(resolveDisplayUnit('g')).toBe('Grams');
      expect(resolveDisplayUnit('g', null, { short: true })).toBe('g');
      expect(resolveDisplayUnit('ltr')).toBe('Litre');
      expect(resolveDisplayUnit('ltr', null, { short: true })).toBe('Ltr');
      expect(resolveDisplayUnit('ml')).toBe('Ml');
    });
  });

  describe('Rule 4: Legacy dozen fallback', () => {
    it('detects dozen brands when packType is empty', () => {
      const prod: Partial<Product> = { name: 'Radhe Radhe Zipper Pouch' };
      expect(resolveDisplayUnit(null, prod)).toBe('Dozen');
      expect(resolveDisplayUnit('', prod, { short: true })).toBe('Doz');
    });
  });

  describe('Rule 5: Multi-screen Character-Level Consistency', () => {
    it('renders identical unit string across Cart, Order Detail, Invoice, and Catalog', () => {
      const prod: Partial<Product> = {
        name: 'Madhukunj Loban Pouch',
        item_pack_type: 'pouch',
        units_per_packet: 12
      };

      const transactedUnit = 'packet';

      // Simulating what each screen calls:
      const cartLabel = resolveDisplayUnit(transactedUnit, prod);
      const orderDetailLabel = resolveDisplayUnit(transactedUnit, prod);
      const invoiceLabel = resolveDisplayUnit(transactedUnit, prod);
      const reportLabel = resolveDisplayUnit(transactedUnit, prod);

      expect(cartLabel).toBe('Packet');
      expect(orderDetailLabel).toBe(cartLabel);
      expect(invoiceLabel).toBe(cartLabel);
      expect(reportLabel).toBe(cartLabel);
    });

    it('renders identical string for single piece pouch sale', () => {
      const prod: Partial<Product> = {
        name: 'Madhukunj Loban Pouch',
        item_pack_type: 'pouch',
        units_per_packet: 12
      };

      const transactedUnit = 'pcs';

      const cartLabel = resolveDisplayUnit(transactedUnit, prod);
      const orderDetailLabel = resolveDisplayUnit(transactedUnit, prod);
      const invoiceLabel = resolveDisplayUnit(transactedUnit, prod);

      expect(cartLabel).toBe('Pouch');
      expect(orderDetailLabel).toBe('Pouch');
      expect(invoiceLabel).toBe('Pouch');
    });

    it('renders identical string for dozen sale', () => {
      const prod: Partial<Product> = {
        name: 'Radhe Radhe Incense',
        item_pack_type: 'pouch',
        units_per_packet: 12
      };

      const transactedUnit = 'doz';

      const cartShort = resolveDisplayUnit(transactedUnit, prod, { short: true });
      const catalogShort = resolveDisplayUnit(transactedUnit, prod, { short: true });
      const orderDetailFull = resolveDisplayUnit(transactedUnit, prod);

      expect(cartShort).toBe('Doz');
      expect(catalogShort).toBe('Doz');
      expect(orderDetailFull).toBe('Dozen');
    });

    it('preserves Pcs when pcs is selected for a product whose preferred_sell_unit is doz', () => {
      const prod: Partial<Product> = {
        name: 'RADHE RADHE 10/-',
        units_per_packet: 12,
        preferred_sell_unit: 'doz'
      };

      expect(resolveDisplayUnit('pcs', prod)).toBe('Pcs');
      expect(resolveDisplayUnit('unit', prod)).toBe('Pcs');
      expect(resolveDisplayUnit('pcs', prod, { short: true })).toBe('Pcs');
    });
  });
});
