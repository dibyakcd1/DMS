import * as React from "react";
import { type Product } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtINR } from "@/lib/format";
import { getCompactStockString } from "@/lib/packaging";
import { normalizeDivisionCategory } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Copy, Trash2 } from "lucide-react";

interface ProductTableProps {
  products: Product[];
  onProductClick: (p: Product) => void;
  onClone?: (id: string, e: React.MouseEvent) => void;
  onDelete?: (id: string, name: string, e: React.MouseEvent) => void;
  isLoading?: boolean;
}

export const ProductTable = ({ products, onProductClick, onClone, onDelete, isLoading }: ProductTableProps) => {
  if (isLoading && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Loading inventory...</p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-slate-50/50">
          <TableRow className="hover:bg-transparent border-slate-200">
            <TableHead className="w-[100px] text-[10px] font-black uppercase text-slate-400 tracking-wider h-12">Brand</TableHead>
            <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-12">Product / SKU</TableHead>
            <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-12">Category</TableHead>
            <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-12 text-right px-6">MRP</TableHead>
            <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-12 text-right px-6">Landed Cost</TableHead>
            <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-12 text-right px-6">Global Stock</TableHead>
            <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-12 text-center">Status</TableHead>
            <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-12 text-right px-6">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => {
            const qty = p.inventory?.quantity ?? 0;
            const isActive = p.is_active && qty > 0;
            
            return (
              <TableRow 
                key={p.id}
                onClick={() => onProductClick(p)}
                className={cn(
                  "cursor-pointer transition-colors border-slate-100 group",
                  !isActive && "bg-slate-50/30"
                )}
              >
                <TableCell className="w-[100px]">
                  <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200 shadow-sm">
                    {p.company?.short_code || (p.brand ? p.brand.substring(0, 2).toUpperCase() : "TE")}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-slate-900 text-sm line-clamp-1">{p.name}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">{p.sku}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs font-semibold text-slate-600">
                    {p.division_category || normalizeDivisionCategory(p.division_category, p.name, p.hsn)}
                  </span>
                </TableCell>
                <TableCell className="text-right px-6">
                  <span className="text-sm font-bold text-slate-900">{fmtINR(p.mrp)}</span>
                </TableCell>
                <TableCell className="text-right px-6">
                  <span className="text-sm font-bold text-slate-500">{fmtINR(p.inventory?.avg_landed_cost || 0)}</span>
                </TableCell>
                <TableCell className="text-right px-6">
                  <div className="flex justify-end">
                    <Badge className={cn(
                      "border-none rounded-full px-3 py-0.5 text-[10px] font-black shadow-sm",
                      qty > 100 ? "bg-emerald-50 text-emerald-700" : qty > 10 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                    )}>
                      {getCompactStockString(qty, p)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {p.is_active ? (
                    <Badge className="bg-emerald-50 text-emerald-600 border-none rounded-md px-2 py-0.5 text-[9px] font-black uppercase">Active</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-400 border-none rounded-md px-2 py-0.5 text-[9px] font-black uppercase">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right px-6">
                  <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onClone && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-400"
                        title="Clone Product"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClone(p.id, e);
                        }}
                      >
                        <Copy size={15} />
                      </Button>
                    )}
                    {onDelete && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                        title="Delete Product & Stock"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(p.id, p.name, e);
                        }}
                      >
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
