import * as React from "react";
import { Check, ChevronsUpDown, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type Product } from "@/types";
import { Badge } from "@/components/ui/badge";

interface ProductMappingComboboxProps {
  products: Product[];
  selectedProduct: Product | null;
  onSelect: (product: Product | null) => void;
  suggestedProducts?: { product: Product; score: number; reason?: string }[];
  placeholder?: string;
  className?: string;
}

export function ProductMappingCombobox({
  products,
  selectedProduct,
  onSelect,
  suggestedProducts = [],
  placeholder = "Search catalog to map...",
  className,
}: ProductMappingComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!search.trim()) {
      return products.slice(0, 30);
    }
    const q = search.toLowerCase().trim();
    return products
      .filter((p) => {
        const nameMatch = p.name.toLowerCase().includes(q);
        const skuMatch = p.sku?.toLowerCase().includes(q);
        const categoryMatch = p.division_category?.toLowerCase().includes(q);
        return nameMatch || skuMatch || categoryMatch;
      })
      .slice(0, 30);
  }, [products, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-9 text-xs border-zinc-200 rounded-lg hover:bg-zinc-50 font-medium px-2.5",
            selectedProduct ? "bg-white text-zinc-900 border-zinc-300" : "bg-zinc-50/70 text-zinc-500",
            className
          )}
        >
          <span className="truncate text-left font-medium">
            {selectedProduct ? (
              <span className="flex items-center gap-1.5 truncate">
                <span className="font-semibold text-zinc-900 truncate">{selectedProduct.name}</span>
                {selectedProduct.sku && (
                  <span className="text-[10px] text-zinc-400 font-mono">[{selectedProduct.sku}]</span>
                )}
              </span>
            ) : (
              <span className="text-zinc-400 flex items-center gap-1.5">
                <Search className="h-3 w-3" />
                {placeholder}
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0 rounded-xl shadow-xl border-zinc-200" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type product name or SKU..."
            value={search}
            onValueChange={setSearch}
            className="h-9 text-xs"
          />
          <CommandList className="max-h-[280px]">
            <CommandEmpty className="p-4 text-xs text-center text-zinc-500">
              No matching product in catalog
            </CommandEmpty>

            {suggestedProducts.length > 0 && !search.trim() && (
              <CommandGroup heading="Smart Suggestions">
                {suggestedProducts.map(({ product, score, reason }) => (
                  <CommandItem
                    key={`sug-${product.id}`}
                    value={`sug-${product.id}`}
                    onSelect={() => {
                      onSelect(product);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between py-2 text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <div className="truncate">
                        <p className="font-semibold text-zinc-900 uppercase truncate">{product.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">
                          {product.sku ? `SKU: ${product.sku}` : `MRP: ₹${product.mrp || 0}`}
                          {reason ? ` • ${reason}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[9px] font-bold h-4 bg-blue-50 text-blue-700 shrink-0">
                      {Math.round(score)}%
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading={suggestedProducts.length > 0 && !search.trim() ? "All Products" : "Matching Products"}>
              <CommandItem
                value="__unmap__"
                onSelect={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className="text-[11px] font-medium text-amber-600 py-1.5 cursor-pointer"
              >
                --- Clear Mapping / Leave Unmapped ---
              </CommandItem>

              {filtered.map((p) => {
                const isSelected = selectedProduct?.id === p.id;
                return (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onSelect(isSelected ? null : p);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between py-2 text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-emerald-600",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="truncate">
                        <p className="font-medium text-zinc-900 uppercase truncate">{p.name}</p>
                        <p className="text-[10px] text-zinc-400 font-mono">
                          {p.sku ? `SKU: ${p.sku}` : ""} {p.mrp ? `• MRP: ₹${p.mrp}` : ""}
                        </p>
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
