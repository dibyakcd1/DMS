import * as React from 'react';
import { Scheme } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SchemeBadgeProps {
  scheme: Scheme;
  className?: string;
}

export function SchemeBadge({ scheme, className }: SchemeBadgeProps) {
  const getBadgeConfig = () => {
    switch (scheme.scheme_type) {
      case 'buy_x_get_y':
        return {
          label: `Buy ${scheme.buy_qty} Get ${scheme.get_qty}`,
          classes: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
        };
      case 'discount_pct':
        return {
          label: `${scheme.discount_value}% OFF`,
          classes: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
        };
      case 'discount_flat':
        return {
          label: `₹${scheme.discount_value} OFF`,
          classes: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
        };
      default:
        return {
          label: 'Promo Scheme',
          classes: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
        };
    }
  };

  const config = getBadgeConfig();
  const formatLocalDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return isoString;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'cursor-help rounded-md px-2 py-0.5 text-[11px] font-bold tracking-tight inline-flex items-center gap-1 shrink-0 transition-all border shadow-sm',
              config.classes,
              className
            )}
          >
            {config.label}
            <Info className="h-3 w-3 opacity-60" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] p-3 text-xs bg-slate-900 border border-slate-800 text-white rounded-lg shadow-lg">
          <div className="space-y-1.5">
            <p className="font-bold">{scheme.name}</p>
            {scheme.notes && <p className="text-slate-300 italic">{scheme.notes}</p>}
            <div className="border-t border-slate-800 pt-1.5 space-y-0.5 text-[10px] text-slate-400">
              <p>Type: <span className="font-semibold text-slate-200">{scheme.scheme_type.replace(/_/g, ' ').toUpperCase()}</span></p>
              {scheme.min_order_value && <p>Min Order: <span className="font-semibold text-slate-200">₹{scheme.min_order_value}</span></p>}
              {scheme.min_order_qty && <p>Min Qty: <span className="font-semibold text-slate-200">{scheme.min_order_qty} items</span></p>}
              <p>Validity: <span className="font-semibold text-slate-200">{formatLocalDate(scheme.valid_from)} to {formatLocalDate(scheme.valid_to)}</span></p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
