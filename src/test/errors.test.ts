import { describe, it, expect } from 'vitest';
import { friendlyError } from '../lib/errors';

describe('friendlyError', () => {
  it('returns friendly message for known error keys', () => {
    expect(friendlyError('new row violates row-level security')).toContain('permission');
    expect(friendlyError('violates foreign key constraint')).toContain('linked to other data');
    expect(friendlyError('duplicate key value')).toContain('already exists');
    expect(friendlyError('insufficient_stock')).toContain('Insufficient stock');
    expect(friendlyError('credit_limit_exceeded')).toContain('credit limit');
    expect(friendlyError('Failed to fetch')).toContain('Network error');
  });

  it('is case-insensitive', () => {
    expect(friendlyError('NEW ROW VIOLATES ROW-LEVEL SECURITY')).toContain('permission');
    expect(friendlyError('JWT EXPIRED')).toContain('session has expired');
  });

  it('returns fallback for unknown errors', () => {
    expect(friendlyError('some random weird database error')).toBe('Something went wrong. Please try again.');
  });

  it('handles non-Error objects and primitives gracefully', () => {
    expect(friendlyError(null)).toBe('Something went wrong. Please try again.');
    expect(friendlyError(undefined)).toBe('Something went wrong. Please try again.');
    expect(friendlyError({ foo: 'bar' })).toBe('Something went wrong. Please try again.');
    expect(friendlyError(404)).toBe('Something went wrong. Please try again.');
  });

  it('extracts message from Error object', () => {
    const err = new Error('duplicate key value in table users');
    expect(friendlyError(err)).toContain('already exists');
  });
});
