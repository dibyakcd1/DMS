import { useState, useEffect, useCallback } from 'react';

interface FilterState {
  search: string;
  category: string;
  filters: Record<string, string>;
}

interface UseFiltersOptions {
  initialSearch?: string;
  category?: string;
  initialFilters?: Record<string, string>;
}

export function useFilters(options: UseFiltersOptions = {}) {
  const [state, setState] = useState<FilterState>({
    search: options.initialSearch || '',
    category: options.category || 'All',
    filters: options.initialFilters || {},
  });

  const [debouncedSearch, setDebouncedSearch] = useState(state.search);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(state.search);
    }, 300);

    return () => clearTimeout(handler);
  }, [state.search]);

  const setSearch = useCallback((search: string) => {
    setState((prev) => ({ ...prev, search }));
  }, []);

  const setCategory = useCallback((category: string) => {
    setState((prev) => ({ ...prev, category }));
  }, []);

  const setFilter = useCallback((id: string, value: string) => {
    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, [id]: value },
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      search: options.initialSearch || '',
      category: options.category || 'All',
      filters: options.initialFilters || {},
    });
  }, [options.initialSearch, options.category, options.initialFilters]);

  return {
    state,
    debouncedSearch,
    setSearch,
    setCategory,
    setFilter,
    reset,
  };
}
