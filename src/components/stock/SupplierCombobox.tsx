import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";

interface SupplierComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SupplierCombobox({ value, onChange, placeholder = "Select supplier...", className }: SupplierComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [suppliers, setSuppliers] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const fetchSuppliers = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("supplier_name");
      
      if (error) throw error;
      
      const uniqueSuppliers = Array.from(new Set(data?.map(s => s.supplier_name).filter(Boolean))) as string[];
      setSuppliers(uniqueSuppliers.sort());
    } catch (err) {
      console.error("Error fetching suppliers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // If the current value is not in the list, we might want to show it or allow adding it
  const displayValue = value || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg hover:bg-zinc-50 font-medium px-3", className)}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 rounded-xl" align="start">
        <Command>
          <CommandInput 
            placeholder="Search suppliers..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty className="p-4 text-xs text-center">
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                <div className="space-y-2">
                   <p className="text-zinc-500 italic">No existing supplier found</p>
                   <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-8 text-[10px] w-full"
                    onClick={() => {
                      onChange(search);
                      setOpen(false);
                    }}
                   >
                     <Plus className="h-3 w-3 mr-1" /> Add "{search}"
                   </Button>
                </div>
              )}
            </CommandEmpty>
            <CommandGroup>
              {suppliers.map((supplier) => (
                <CommandItem
                  key={supplier}
                  value={supplier}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === supplier ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {supplier}
                </CommandItem>
              ))}
              {search && !suppliers.includes(search) && (
                <CommandItem
                  value={search}
                  onSelect={(v) => {
                    onChange(v);
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4 text-primary" />
                  New: "{search}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
