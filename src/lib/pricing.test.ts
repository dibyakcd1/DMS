import { describe, it, expect } from 'vitest';
import { sellingPrice, getPackMultiplier, landedCostPerLevel } from './pricing';
import { Product } from '@/types';

describe('Pricing Engine', () => {
  const mockProduct = {
    id: 'test',
    units_per_packet: 20,
    packets_per_case: 10,
    mrp: 100,
  } as unknown as Product;

  it('calculates correct pack multipliers', () => {
    expect(getPackMultiplier(mockProduct, 'pcs')).toBe(1);
    expect(getPackMultiplier(mockProduct, 'packet')).toBe(20);
    expect(getPackMultiplier(mockProduct, 'case')).toBe(200);
  });

  it('calculates selling price with margin correctly', () => {
    // Formula: landed / (1 - margin/100)
    // 100 / (1 - 0.20) = 100 / 0.8 = 125
    expect(sellingPrice(100, 20, 1)).toBe(125);
    
    // With rounding to 0.5
    // 97 / 0.93 = 104.30 -> rounded to 104.5
    expect(sellingPrice(97, 7, 0.5)).toBe(104.5);
  });

  it('derives landed costs correctly', () => {
    const costs = landedCostPerLevel(mockProduct, 2000, false); // 2000 per case
    expect(costs.case).toBe(2000);
    expect(costs.pcs).toBe(10); // 2000 / 200
    expect(costs.packet).toBe(200); // 10 * 20
  });
});
