import { ProductCatalog } from "./ProductCatalog";
import { ResponsiveDialog } from "@/components/ui/responsive-ui";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsCompact } from "@/lib/responsive";
import { Product, Batch, Line } from "@/types";

interface ProductCatalogSheetProps {
  warehouseId: string;
  lines: Line[];
  onAdd: (p: Product, b?: Batch) => void;
  onRemove?: (productId: string, batchId?: string) => void;
  onUpdateQty?: (productId: string, qty: number, batchId?: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resolvePrice: (p: Product) => { price: number; source: string };
  totals: { subtotal: number; total: number };
}

export const ProductCatalogSheet = ({
  warehouseId,
  lines,
  onAdd,
  onRemove,
  onUpdateQty,
  open,
  onOpenChange,
  resolvePrice,
  totals
}: ProductCatalogSheetProps) => {
  const isCompact = useIsCompact();

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Product Catalog"
      description="Quick select items to add to order"
      trigger={
        <Button className="h-11 md:h-10 px-5 md:px-4 rounded-xl bg-primary font-black text-xs shadow-xl active:scale-95 text-white">
          <ShoppingBag className="mr-2 h-4 w-4" /> Add items
        </Button>
      }
      className={cn(
        "bg-slate-50 dark:bg-card p-0",
        !isCompact ? "max-w-5xl lg:max-w-6xl xl:max-w-7xl h-[85vh]" : ""
      )}
    >
      <ProductCatalog 
        warehouseId={warehouseId}
        lines={lines}
        onAdd={onAdd}
        onRemove={onRemove}
        onUpdateQty={onUpdateQty}
        resolvePrice={resolvePrice}
        totals={totals}
        onClose={() => onOpenChange(false)}
        isSheet={true}
      />
    </ResponsiveDialog>
  );
};

