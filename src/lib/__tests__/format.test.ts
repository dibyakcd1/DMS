import { describe, it, expect } from 'vitest';
import { 
  fmtINR, 
  fmtDate, 
  fmtDateTime, 
  fmtCompactINR 
} from '../format';

describe('format utilities', () => {
  describe('fmtINR', () => {
    it('formats numbers to INR currency string', () => {
      expect(fmtINR(1000).replace(/\s/g, ' ')).toBe('Rs. 1,000.00');
      expect(fmtINR(1234567.89).replace(/\s/g, ' ')).toBe('Rs. 12,34,567.89');
    });

    it('handles zero and negative numbers', () => {
      expect(fmtINR(0).replace(/\s/g, ' ')).toBe('Rs. 0.00');
      expect(fmtINR(-500).replace(/\s/g, ' ')).toBe('-Rs. 500.00');
    });
  });

  describe('fmtCompactINR', () => {
    it('formats large numbers compactly', () => {
      expect(fmtCompactINR(500).replace(/\s/g, ' ')).toBe('Rs. 500');
      expect(fmtCompactINR(1500).replace(/\s/g, ' ')).toBe('Rs. 1.5K');
      expect(fmtCompactINR(1000000).replace(/\s/g, ' ')).toBe('Rs. 10.0L');
    });
  });

  describe('fmtDate', () => {
    it('formats ISO strings to standard date format', () => {
      const date = '2024-03-20T10:00:00Z';
      expect(fmtDate(date).replace(/\s/g, ' ')).toMatch(/20 Mar 2024|20 Mar, 2024/);
    });
  });
});
