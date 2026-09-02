import { describe, it, expect } from 'vitest';
import { friendlyError } from '../errors';

describe('error utilities', () => {
  describe('friendlyError', () => {
    it('maps supabase unique constraint errors', () => {
      const error = new Error('duplicate key value violates unique constraint');
      expect(friendlyError(error)).toBe('A record with this value already exists.');
    });

    it('maps foreign key violations', () => {
      const error = new Error('violates foreign key constraint');
      expect(friendlyError(error)).toBe('This record is linked to other data and cannot be modified.');
    });

    it('falls back for unknown codes', () => {
      const error = new Error('Something totally random');
      expect(friendlyError(error)).toBe('Something went wrong. Please try again.');
    });

    it('handles empty/null errors gracefully', () => {
      expect(friendlyError(null)).toBe('Something went wrong. Please try again.');
      expect(friendlyError(undefined)).toBe('Something went wrong. Please try again.');
    });
  });
});
