import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Warehouse as WarehouseType } from "@/types";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/responsive";

interface WarehouseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editingWarehouse: WarehouseType | null;
}

export function WarehouseDrawer({ open, onOpenChange, onSaved, editingWarehouse }: WarehouseDrawerProps) {
  const isMobile = useIsMobile();
  const [saving, setSaving] = React.useState(false);

  // Form State
  const [formData, setFormData] = React.useState({
    name: "",
    code: "",
    location: "",
    is_active: true
  });

  React.useEffect(() => {
    if (open) {
      if (editingWarehouse) {
        setFormData({
          name: editingWarehouse.name || "",
          code: editingWarehouse.code || "",
          location: editingWarehouse.address || editingWarehouse.location || "",
          is_active: editingWarehouse.is_active ?? true
        });
      } else {
        setFormData({
          name: "",
          code: "",
          location: "",
          is_active: true
        });
      }
    }
  }, [open, editingWarehouse]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) return toast.error("Warehouse name is required");
    
    setSaving(true);
    try {
      const locationVal = formData.location.trim() || null;
      type WarehousePayload = {
        name: string;
        code: string | null;
        address?: string | null;
        location?: string | null;
        is_active: boolean;
        updated_at: string;
      };

      const payload: WarehousePayload = {
        name: formData.name.trim(),
        code: formData.code.trim() || null,
        address: locationVal,
        is_active: formData.is_active,
        updated_at: new Date().toISOString()
      };

      let error;
      if (editingWarehouse) {
        let res = await supabase
          .from('warehouses')
          .update(payload)
          .eq('id', editingWarehouse.id);

        // Fallback to location if address column is not found
        if (res.error && res.error.code === 'PGRST204' && res.error.message.includes('address')) {
          delete payload.address;
          payload.location = locationVal;
          res = await supabase
            .from('warehouses')
            .update(payload)
            .eq('id', editingWarehouse.id);
        }
        error = res.error;
      } else {
        let res = await supabase
          .from('warehouses')
          .insert(payload);

        // Fallback to location if address column is not found
        if (res.error && res.error.code === 'PGRST204' && res.error.message.includes('address')) {
          delete payload.address;
          payload.location = locationVal;
          res = await supabase
            .from('warehouses')
            .insert(payload);
        }
        error = res.error;
      }

      if (error) throw error;

      toast.success(editingWarehouse ? "Warehouse updated" : "Warehouse created");
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      console.error('[WarehouseDrawer] Save warehouse failed', err);
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        side={isMobile ? "bottom" : "right"} 
        className={cn("p-0 border-l-0 overflow-hidden", isMobile ? "h-[92dvh] rounded-t-[2.5rem]" : "w-[400px] sm:w-[540px]")}
      >
        <div className="h-full flex flex-col bg-background">
          <div className="p-8 space-y-8">
            <SheetHeader>
              <SheetTitle className="text-2xl font-bold tracking-tight">
                {editingWarehouse ? "Edit warehouse" : "Add warehouse"}
              </SheetTitle>
              <p className="text-sm font-medium text-muted-foreground">Storage location details</p>
            </SheetHeader>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground ml-0.5">Warehouse name *</Label>
                <Input 
                  className="h-11 rounded-xl border bg-muted/5 font-medium" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Main Godown"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground ml-0.5">Code</Label>
                <Input 
                  className="h-11 rounded-xl border bg-muted/5 font-mono font-bold uppercase" 
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="MWH-01"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground ml-0.5">Address / Location</Label>
                <Input 
                  className="h-11 rounded-xl border bg-muted/5 font-medium" 
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Street, City, State"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/5 rounded-xl border">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Active status</Label>
                  <p className="text-[10px] text-muted-foreground font-medium">Allow stock to be stored here</p>
                </div>
                <Button 
                  variant={formData.is_active ? "default" : "outline"} 
                  size="sm" 
                  className={cn(
                    "rounded-xl font-black text-[10px] px-4",
                    formData.is_active ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""
                  )}
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                >
                  {formData.is_active ? "Active" : "Inactive"}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-auto p-8 border-t bg-muted/5 flex gap-3">
            <Button variant="ghost" className="h-14 flex-1 rounded-2xl font-black uppercase tracking-widest text-xs" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="h-14 flex-[2] rounded-2xl font-black uppercase tracking-widest text-xs bg-primary shadow-xl shadow-primary/20 text-white" type="button" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {editingWarehouse ? "Save changes" : "Add warehouse"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
