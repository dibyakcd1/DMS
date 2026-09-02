import * as React from "react";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ProductFiltersProps {
  categories: { id?: string; label: string; count?: number }[];
  currentSearch: string;
  currentCategory: string;
  currentFilters: Record<string, string>;
  totalCount: number;
  onSearchChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onFilterChange: (id: string, v: string) => void;
  onClearFilters: () => void;
  showInactive: boolean;
  onShowInactiveChange: (v: boolean) => void;
}

const PACK_TYPES = [
  { id: "pcs", label: "PCS", icon: "S" },
  { id: "packet", label: "Packet", icon: "P" },
  { id: "case", label: "Case", icon: "C" },
  { id: "kg", label: "KG", icon: "K" },
];

export const ProductFilters = ({
  categories,
  currentSearch,
  currentCategory,
  currentFilters,
  totalCount,
  onSearchChange,
  onCategoryChange,
  onFilterChange,
  onClearFilters,
  showInactive,
  onShowInactiveChange,
}: ProductFiltersProps) => {
  const productFilters = [
    { 
      id: 'sort', 
      label: 'Sort', 
      icon: 'sort' as const, 
      options: ['Stock (High)', 'Stock (Low)', 'A-Z', 'Z-A'] 
    },
    { 
      id: 'pack', 
      label: 'Pack Type', 
      icon: 'package' as const, 
      options: ['All', ...PACK_TYPES.map(p => p.id)] 
    }
  ];

  return (
    <div className="space-y-4">
      <SearchFilterBar
        categories={categories}
        filters={productFilters}
        totalCount={totalCount}
        currentSearch={currentSearch}
        currentCategory={currentCategory}
        currentFilters={currentFilters}
        onSearchChange={onSearchChange}
        onCategoryChange={onCategoryChange}
        onFilterChange={onFilterChange}
        onClearFilters={onClearFilters}
        showInactive={showInactive}
        onShowInactiveChange={onShowInactiveChange}
      />
    </div>
  );
};
