import * as React from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Calendar, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtINR, statusColor, statusLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  shop_name: string | null;
  total: number;
  order_date: string | null;
  created_at: string;
  salesperson_name: string | null;
}

interface OrderCardProps {
  order: OrderSummary;
  isAdmin: boolean;
  onAction: (id: string, action: 'approved' | 'dispatched' | 'delivered', e: React.MouseEvent) => void;
  onDelete: (id: string, status: string, e: React.MouseEvent) => void;
}

export const OrderCard = React.memo(({ order, isAdmin, onAction, onDelete }: OrderCardProps) => {
  const navigate = useNavigate();
  const o = order;

  return (
    <div 
      className="p-3.5 border border-white/30 rounded-3xl glass-card shadow-sm hover:shadow-2xl transition-all cursor-pointer active:scale-[0.98] group flex flex-col hover:border-brand-primary/40"
      onClick={() => navigate(`/orders/${o.id}`)}
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex justify-between items-start">
          <div className="space-y-1 flex-1 min-w-0">
            <span className="font-mono text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-0.5">#{o.order_number}</span>
            <h3 className="text-[17px] font-bold text-slate-900 leading-tight group-hover:text-brand-primary transition-colors pr-2 break-words">{o.shop_name ?? "Unassociated Shop"}</h3>
            <Badge 
              variant="outline"
              className={cn(
                "h-4 px-1.5 text-[8px] font-black uppercase tracking-widest rounded-md border-none shadow-none mt-1",
                statusColor[o.status as keyof typeof statusColor]
              )}
            >
              {statusLabel[o.status as keyof typeof statusLabel]}
            </Badge>
          </div>
          <div className="flex flex-col items-end gap-1">
            {o.status !== 'delivered' && (
              <div onClick={e => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 -mt-1 -mr-1">
                      <MoreVertical className="h-4 w-4 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl p-2 w-48 shadow-2xl border-none ring-1 ring-black/5">
                    {/* View Detail removed as it is redundant (card is clickable) */}
                    
                    {o.status === 'pending_approval' && isAdmin && (
                      <DropdownMenuItem 
                        className="rounded-xl font-bold text-xs py-3 text-emerald-600 hover:bg-emerald-50"
                        onClick={(e) => onAction(o.id, 'approved', e as unknown as React.MouseEvent)}
                      >
                        Approve Order
                      </DropdownMenuItem>
                    )}
                    {o.status === 'approved' && (
                      <DropdownMenuItem 
                        className="rounded-xl font-bold text-xs py-3 text-amber-600 hover:bg-amber-50"
                        onClick={(e) => onAction(o.id, 'dispatched', e as unknown as React.MouseEvent)}
                      >
                        Dispatch Order
                      </DropdownMenuItem>
                    )}
                    {o.status === 'dispatched' && (
                      <DropdownMenuItem 
                        className="rounded-xl font-bold text-xs py-3 text-indigo-600 hover:bg-indigo-50"
                        onClick={(e) => onAction(o.id, 'delivered', e as unknown as React.MouseEvent)}
                      >
                        Deliver Order
                      </DropdownMenuItem>
                    )}

                    {isAdmin && (o.status === 'draft' || o.status === 'pending_approval') && (
                      <DropdownMenuItem className="rounded-xl font-bold text-xs py-3 text-red-600 hover:bg-red-50" onClick={(e) => onDelete(o.id, o.status, e as React.MouseEvent)}>
                        Delete Permanent
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            <div className={cn(
              "text-base font-bold tabular-nums text-slate-900 mt-1",
              o.total > 10000 && "text-orange-600"
            )}>
              {fmtINR(o.total)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
            <Calendar className="h-3 w-3" />
            {format(new Date(o.order_date || o.created_at), 'dd MMM yyyy')}
          </div>
          {o.salesperson_name && (
            <span className="text-[10px] font-bold text-slate-300 italic truncate max-w-[100px]">
              {o.salesperson_name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

OrderCard.displayName = "OrderCard";
