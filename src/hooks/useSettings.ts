import * as React from 'react';

export type AppSettings = {
  reportingPeriod: 'daily' | 'weekly' | 'monthly';
  gstRounding: 'round' | 'floor' | 'ceil';
  lowStockThreshold: number;
  defaultWarehouseId: string | null;
}

const DEFAULTS: AppSettings = {
  reportingPeriod: 'monthly',
  gstRounding: 'round',
  lowStockThreshold: 10,
  defaultWarehouseId: null,
};

const STORAGE_KEY = 'bm_user_settings';

export function useSettings() {
  const [settings, setSettings] = React.useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULTS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    return DEFAULTS;
  });

  const updateSetting = React.useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetSettings = React.useCallback(() => {
    setSettings(DEFAULTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
  }, []);

  return { settings, updateSetting, resetSettings };
}
