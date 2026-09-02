import { describe, it, expect, vi } from 'vitest';
import { clampOrderDate } from '../dates';

describe('date utilities', () => {
  describe('clampOrderDate', () => {
    it('returns the date string if valid and not in future', () => {
      const input = '2024-05-14';
      expect(clampOrderDate(input)).toBe(input);
    });

    it('clamps to today if date is in future', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      const input = future.toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      expect(clampOrderDate(input)).toBe(today);
    });

    it('returns today for invalid dates', () => {
      const today = new Date().toISOString().slice(0, 10);
      expect(clampOrderDate('invalid-date')).toBe(today);
    });
  });
});
