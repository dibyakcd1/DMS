import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clampOrderDate } from '../lib/dates';

describe('clampOrderDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set system time to 2026-05-12T10:00:00Z
    vi.setSystemTime(new Date('2026-05-12T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a date string in the past unchanged', () => {
    const pastDate = '2026-05-10';
    expect(clampOrderDate(pastDate)).toBe(pastDate);
  });

  it("returns today's date unchanged", () => {
    const todayStr = '2026-05-12';
    expect(clampOrderDate(todayStr)).toBe(todayStr);
  });

  it('clamps a future date string to today', () => {
    const futureDate = '2026-05-15';
    const todayStr = '2026-05-12';
    expect(clampOrderDate(futureDate)).toBe(todayStr);
  });

  it('falls back gracefully for an invalid date string', () => {
    const invalidDate = 'not-a-date';
    const todayStr = '2026-05-12';
    expect(clampOrderDate(invalidDate)).toBe(todayStr);
  });
});
