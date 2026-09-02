import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, Calendar } from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { fmtINR, statusColor, statusLabel } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { useFilters } from "@/hooks/useFilters";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContextCore";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { OrderCard } from "@/components/orders/OrderCard";
import { useOrders } from "@/hooks/useOrders";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ResponsiveContainer, 
  ResponsiveDialog
} from "@/components/ui/responsive-ui";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending_approval", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered", label: "Delivered" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

type OrderListItem = Database["public"]["Tables"]["orders"]["Row"] & {
  shop: { name: string } | null;
  salesperson: { full_name: string | null } | null;
  is_void?: boolean;
};

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [actionState, setActionState] = React.useState<{
    id: string | null;
    action: 'approved' | 'dispatched' | 'delivered' | null;
    isOpen: boolean;
    vehicleNumber?: string;
    driverName?: string;
  }>({ id: null, action: null, isOpen: false, vehicleNumber: '', driverName: '' });

  const [selectedTimestamp, setSelectedTimestamp] = React.useState<string>(
    new Date().toISOString().slice(0, 16)
  );

  const handleDeleteOrder = async (id: string, status: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (["dispatched", "delivered"].includes(status)) {
      return toast.error("Cannot delete a dispatched or delivered order directly. Please 'Cancel' or 'Revert' it first to restore inventory stock.");
    }

    if (!confirm("Are you sure you want to delete this order? This action cannot be undone.")) return;
    
    try {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
      toast.success("Order deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete order");
    }
  };

  const openActionDialog = (id: string, action: 'approved' | 'dispatched' | 'delivered', e: React.MouseEvent) => {
    e.stopPropagation();
    setActionState({ id, action, isOpen: true, vehicleNumber: '', driverName: '' });
    setSelectedTimestamp(new Date().toISOString().slice(0, 16));
  };

  const handleAction = async () => {
    if (!actionState.id || !actionState.action) return;
    
    const id = actionState.id;
    const action = actionState.action;
    const timestamp = new Date(selectedTimestamp).toISOString();

    try {
      if (action === 'dispatched') {
        if (!actionState.vehicleNumber || !actionState.driverName) {
          toast.error("Vehicle Number and Driver Name are required for dispatch.");
          return;
        }

        const { error: rpcError } = await supabase.rpc('invoice_deduction', { 
          p_order_id: id,
          p_performed_by: currentUser?.id
        });
        if (rpcError) throw rpcError;

        const dispatchLog = `[DISPATCH] Vehicle: ${actionState.vehicleNumber} | Driver: ${actionState.driverName} | Date: ${new Date(timestamp).toLocaleDateString()}`;
        
        // Fetch current notes to append
        const { data: orderData } = await supabase.from("orders").select("notes").eq("id", id).single();
        const newNotes = orderData?.notes ? `${orderData.notes}\n${dispatchLog}` : dispatchLog;

        const { error } = await supabase.from("orders").update({
          status: 'dispatched',
          dispatched_at: timestamp,
          notes: newNotes
        }).eq("id", id);
        if (error) throw error;
      } else if (action === 'delivered') {
        const { error: rpcError } = await supabase.rpc('deliver_order', { 
          p_order_id: id,
          p_delivered_by: currentUser?.id || '00000000-0000-0000-0000-000000000000'
        });
        if (rpcError) throw rpcError;

        // Optionally update the actual delivered_at timestamp to match what was selected in the quick action
        const { error: updateError } = await supabase.from("orders").update({
          delivered_at: timestamp
        }).eq("id", id);
        if (updateError) throw updateError;
      } else {
        const updateData: Database["public"]["Tables"]["orders"]["Update"] = { status: action };

        const { error } = await supabase.from("orders").update(updateData).eq("id", id);
        if (error) throw error;
      }

      toast.success(`Order ${statusLabel[action]}`);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setActionState({ id: null, action: null, isOpen: false, vehicleNumber: '', driverName: '' });
    } catch (error) {
      console.error(error);
      toast.error(`Failed to ${action} order: ${friendlyError(error)}`);
    }
  };

  const statusParam = searchParams.get("status") || "all";
  const initialFilter = FILTERS.find(f => f.value === statusParam)?.label || "All";
  
  const { 
    state, 
    debouncedSearch, 
    setSearch, 
    setCategory, 
    setFilter, 
    reset: clearFilters 
  } = useFilters({ 
    category: initialFilter,
    initialSearch: searchParams.get("q") || ""
  });

  const [salespeople, setSalespeople] = React.useState<{ id: string; full_name: string | null }[]>([]);

  React.useEffect(() => {
    if (isAdmin) {
      supabase.from("profiles").select("id, full_name").eq("role", "salesperson").then(({ data }) => {
        const list = (data ?? []).map(row => ({
          id: row.id,
          full_name: row.full_name || 'Staff'
        }));
        setSalespeople(list);
      });
    }
  }, [isAdmin]);

  const {
    data: ordersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useOrders(debouncedSearch, state.category, isAdmin, currentUser?.id, state.filters.salesperson);

  const flatOrders = React.useMemo(() => ordersData?.pages.flatMap(page => page.data) ?? [], [ordersData]);
  const totalCount = ordersData?.pages[0]?.count ?? 0;

  const filtered = React.useMemo(() => {
    return [...flatOrders].sort((a, b) => {
      const sort = state.filters.sort || 'Newest First';
      const dateA = a.order_date ? new Date(a.order_date).getTime() : new Date(a.created_at).getTime();
      const dateB = b.order_date ? new Date(b.order_date).getTime() : new Date(b.created_at).getTime();
      
      if (sort === 'Newest First') return dateB - dateA;
      if (sort === 'Oldest First') return dateA - dateB;
      if (sort === 'Total (High)') return b.total - a.total;
      if (sort === 'Total (Low)') return a.total - b.total;
      return 0;
    });
  }, [flatOrders, state.filters.sort]);

  React.useEffect(() => {
    const channel = supabase
      .channel('orders-list-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => queryClient.invalidateQueries({ queryKey: ["orders"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  React.useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (state.category === "All") {
      nextParams.delete("status");
    } else {
      const val = FILTERS.find(f => f.label === state.category)?.value || state.category.toLowerCase().replace(' ', '_');
      nextParams.set("status", val);
    }
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [state.category, searchParams, setSearchParams]);

  const categories = FILTERS.map(f => ({ label: f.label }));

  const orderFilters = [
    { 
      id: 'sort', 
      label: 'Sort By', 
      icon: 'sort' as const, 
      options: ['Newest First', 'Oldest First', 'Total (High)', 'Total (Low)'] 
    },
    ...(isAdmin ? [{
      id: 'salesperson',
      label: 'Salesperson',
      icon: 'user' as const,
      options: ['all', ...salespeople.map(s => s.id)],
      optionLabels: { 'all': 'All Staff', ...Object.fromEntries(salespeople.map(s => [s.id, s.full_name || 'Unnamed'])) }
    }] : [])
  ];

  return (
    <div className="pb-32">
      <PageHeader
        title="Orders"
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/")}
      />

      <div className="glass-panel rounded-3xl p-3 shadow-md border border-white/30 transition-all duration-500 mt-2">
        <SearchFilterBar
          categories={categories}
          filters={orderFilters}
          totalCount={filtered.length}
          currentSearch={state.search}
          currentCategory={state.category}
          currentFilters={state.filters}
          onSearchChange={setSearch}
          onCategoryChange={setCategory}
          onFilterChange={setFilter}
          onClearFilters={clearFilters}
          placeholder="Search order # or shop name..."
        />
      </div>

      <div className="space-y-6">
        {isLoading && flatOrders.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 w-full animate-pulse bg-slate-100 rounded-3xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="rounded-3xl border-none shadow-sm bg-slate-50/50 py-24 flex flex-col items-center justify-center text-center ring-1 ring-slate-100/50">
             <div className="h-20 w-20 rounded-[2rem] bg-white shadow-xl flex items-center justify-center mb-6 ring-1 ring-slate-100">
                <div className="h-3 w-3 rounded-full bg-brand-primary animate-pulse" />
             </div>
             <p className="text-sm font-bold text-slate-500 max-w-xs mx-auto">No orders match your current filters.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((o) => (
              <OrderCard 
                key={o.id}
                order={o}
                isAdmin={isAdmin}
                onAction={openActionDialog}
                onDelete={handleDeleteOrder}
              />
            ))}
          </div>
        )}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-xl font-bold text-xs h-11 px-8 border-slate-200"
          >
            {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Load more orders
          </Button>
        </div>
      )}

      <ResponsiveDialog
        open={actionState.isOpen}
        onOpenChange={(open) => setActionState(prev => ({ ...prev, isOpen: open }))}
        title={`Update Status`}
        description={actionState.action === 'dispatched' ? "Enter dispatch information. This will update your stock." : "Select the date and time for this status update."}
      >
        <div className="space-y-6 pt-4">
          {actionState.action === 'dispatched' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="vehicle" className="text-xs font-bold uppercase tracking-wider text-slate-400">Vehicle Number *</Label>
                <Input
                  id="vehicle"
                  placeholder="e.g. MH 12 AB 1234"
                  value={actionState.vehicleNumber}
                  onChange={(e) => setActionState(prev => ({ ...prev, vehicleNumber: e.target.value.toUpperCase() }))}
                  className="rounded-2xl h-12 border-slate-200 focus:ring-brand-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver" className="text-xs font-bold uppercase tracking-wider text-slate-400">Driver Name *</Label>
                <Input
                  id="driver"
                  placeholder="Full Name"
                  value={actionState.driverName}
                  onChange={(e) => setActionState(prev => ({ ...prev, driverName: e.target.value }))}
                  className="rounded-2xl h-12 border-slate-200 focus:ring-brand-primary"
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="timestamp" className="text-xs font-bold uppercase tracking-wider text-slate-400">Date and Time</Label>
            <Input
              id="timestamp"
              type="datetime-local"
              value={selectedTimestamp}
              onChange={(e) => setSelectedTimestamp(e.target.value)}
              className="rounded-2xl h-12 border-slate-200 focus:ring-brand-primary"
            />
          </div>
          <Button 
            className="w-full h-12 rounded-2xl bg-brand-primary hover:bg-brand-primary/90 text-white font-bold"
            onClick={handleAction}
            disabled={actionState.action === 'dispatched' && (!actionState.vehicleNumber || !actionState.driverName)}
          >
            Confirm {statusLabel[actionState.action || 'approved']}
          </Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
