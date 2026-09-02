import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '../hooks/useSettings';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useSettings', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('returns DEFAULTS when localStorage is empty', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.reportingPeriod).toBe('monthly');
    expect(result.current.settings.lowStockThreshold).toBe(10);
  });

  it('persists a changed value to localStorage', () => {
    const { result } = renderHook(() => useSettings());
    
    act(() => {
      result.current.updateSetting('reportingPeriod', 'daily');
    });

    expect(result.current.settings.reportingPeriod).toBe('daily');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'bm_user_settings',
      expect.stringContaining('"reportingPeriod":"daily"')
    );
  });

  it('resetSettings() restores DEFAULTS and updates localStorage', () => {
    const { result } = renderHook(() => useSettings());
    
    act(() => {
      result.current.updateSetting('lowStockThreshold', 50);
    });
    
    expect(result.current.settings.lowStockThreshold).toBe(50);

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.settings.lowStockThreshold).toBe(10);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'bm_user_settings',
      expect.stringContaining('"lowStockThreshold":10')
    );
  });

  it('handles corrupted localStorage JSON without throwing', () => {
    localStorageMock.setItem('bm_user_settings', 'invalid-json-{');
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const { result } = renderHook(() => useSettings());
    
    expect(result.current.settings.reportingPeriod).toBe('monthly');
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});
