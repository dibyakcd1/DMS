import * as React from 'react';
import { type ShopType } from '@/lib/pricing';

export function useGlobalSettings() {
  const [margins, setMargins] = React.useState<Record<ShopType, number>>({
    premium: 3,
    gold: 5,
    silver: 7,
    bronze: 10,
    basic: 15,
  });
  const [categoryMargins, setCategoryMargins] = React.useState<Record<string, number>>({
    "Spices": 6,
    "Food Items": 4,
    "Beverages": 3,
    "Oil & Ghee": 2,
    "Dairy": 3,
    "Snacks & Namkeen": 5,
    "Pulses & Dals": 4,
    "Flour & Grains": 3,
    "Dry Fruits": 4,
    "Sauces & Condiments": 5,
    "Personal Care": 4,
    "Household": 4,
  });
  const [varianceThreshold, setVarianceThreshold] = React.useState<number>(5);
  const [loading, setLoading] = React.useState(false);

  const updateMargins = async (newMargins: Record<ShopType, number>) => {
    setLoading(true);
    localStorage.setItem('te_global_margins', JSON.stringify(newMargins));
    setMargins(newMargins);
    setLoading(false);
  };

  const updateCategoryMargins = async (newCats: Record<string, number>) => {
    setLoading(true);
    localStorage.setItem('te_category_margins', JSON.stringify(newCats));
    setCategoryMargins(newCats);
    setLoading(false);
  };

  const updateVarianceThreshold = async (val: number) => {
    setLoading(true);
    localStorage.setItem('te_variance_threshold', String(val));
    setVarianceThreshold(val);
    setLoading(false);
  };

  React.useEffect(() => {
    // One-time migration from legacy bm_* keys to brand new te_* keys
    const bm_global = localStorage.getItem('bm_global_margins');
    if (bm_global && !localStorage.getItem('te_global_margins')) {
      localStorage.setItem('te_global_margins', bm_global);
    }
    const bm_category = localStorage.getItem('bm_category_margins');
    if (bm_category && !localStorage.getItem('te_category_margins')) {
      localStorage.setItem('te_category_margins', bm_category);
    }
    const bm_variance = localStorage.getItem('bm_variance_threshold');
    if (bm_variance && !localStorage.getItem('te_variance_threshold')) {
      localStorage.setItem('te_variance_threshold', bm_variance);
    }

    const saved = localStorage.getItem('te_global_margins');
    if (saved) {
      try { setMargins(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
    const savedCats = localStorage.getItem('te_category_margins');
    if (savedCats) {
      try { setCategoryMargins(JSON.parse(savedCats)); } catch (e) { console.error(e); }
    }
    const savedVariance = localStorage.getItem('te_variance_threshold');
    if (savedVariance) {
      setVarianceThreshold(Number(savedVariance));
    }
  }, []);

  return { 
    margins, 
    updateMargins, 
    categoryMargins, 
    updateCategoryMargins, 
    varianceThreshold,
    updateVarianceThreshold,
    loading 
  };
}
