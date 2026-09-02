import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-ui";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Shop } from "@/types";

interface AddShopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (shopId: string) => void;
  initialData?: Partial<Shop>;
}

const empty: Partial<Shop> = { 
  name: "", 
  owner_name: "", 
  phone: "", 
  address: "", 
  gstin: "", 
  credit_limit: 0, 
  is_active: true, 
  shop_type: "silver", 
  discount_pct: 0 
};

export function AddShopDialog({ open, onOpenChange, onSuccess, initialData }: AddShopDialogProps) {
  const [edit, setEdit] = React.useState<Partial<Shop>>(empty);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setEdit(initialData || empty);
    }
  }, [open, initialData]);

  const save = async () => {
    if (!edit.name?.trim()) return toast.error("Shop name is required");
    setBusy(true);
    const payload = {
      name: edit.name!.trim(),
      owner_name: edit.owner_name || null,
      phone: edit.phone || null,
      address: edit.address || null,
      gstin: edit.gstin || null,
      credit_limit: Number(edit.credit_limit || 0),
      is_active: edit.is_active ?? true,
      shop_type: edit.shop_type || "silver",
      discount_pct: Number(edit.discount_pct || 0),
    };

    try {
      if (!edit.id) {
        // Check for duplicate name
        const { data: existing } = await supabase
          .from("shops")
          .select("id")
          .ilike("name", payload.name)
          .maybeSingle();
        
        if (existing) {
          toast.error("A shop with this name already exists");
          setBusy(false);
          return;
        }
      }

      let data = null;
      let error: { code?: string; message?: string } | null = null;

      try {
        const res = edit.id
          ? await supabase.from("shops").update(payload).eq("id", edit.id).select().single()
          : await supabase.from("shops").insert(payload).select().single();
        data = res.data;
        if (res.error) {
          error = { code: res.error.code, message: res.error.message };
        }
      } catch (dbErr: unknown) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        error = { message: errMsg };
      }

      if (error && (error.code === "42703" || error.message?.includes("does not exist"))) {
        console.warn("Table shops is missing gstin/shop_type/discount_pct. Retrying with basic columns.");
        const basicPayload = {
          name: payload.name,
          owner_name: payload.owner_name,
          phone: payload.phone,
          address: payload.address,
          credit_limit: payload.credit_limit,
          is_active: payload.is_active,
        };
        const res = edit.id
          ? await supabase.from("shops").update(basicPayload).eq("id", edit.id).select().single()
          : await supabase.from("shops").insert(basicPayload).select().single();
        data = res.data;
        error = res.error;
      }

      if (error) throw error;

      toast.success(edit.id ? "Shop updated" : "Shop added");
      onOpenChange(false);
      if (onSuccess && data) onSuccess(data.id);
    } catch (error) {
      console.error('[AddShop]', error);
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit.id ? "Optimize Outlet" : "Register New Outlet"}
      description="Configure distribution node parameters and credit thresholds."
      className="max-w-2xl"
    >
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Business name">
            <Input 
              className="h-12 rounded-xl bg-muted/20 border-none font-bold" 
              value={edit.name ?? ""} 
              onChange={e => setEdit({...edit, name: e.target.value})} 
              placeholder="Legal entity name" 
            />
          </Field>
          <Field label="Proprietor name">
            <Input 
              className="h-12 rounded-xl bg-muted/20 border-none font-bold" 
              value={edit.owner_name ?? ""} 
              onChange={e => setEdit({...edit, owner_name: e.target.value})} 
              placeholder="Full name" 
            />
          </Field>
          <Field label="Contact number">
            <Input 
              className="h-12 rounded-xl bg-muted/20 border-none font-bold" 
              type="tel" 
              value={edit.phone ?? ""} 
              onChange={e => setEdit({...edit, phone: e.target.value})} 
              placeholder="+91 ..." 
            />
          </Field>
          <Field label="Registration ID (GSTIN)">
            <Input 
              className="h-12 rounded-xl bg-muted/20 border-none font-bold uppercase" 
              value={edit.gstin ?? ""} 
              onChange={e => setEdit({...edit, gstin: e.target.value.toUpperCase()})} 
              placeholder="GST Number" 
            />
          </Field>
          <Field label="Geographic Address" className="md:col-span-2">
            <Input 
              className="h-12 rounded-xl bg-muted/20 border-none font-bold" 
              value={edit.address ?? ""} 
              onChange={e => setEdit({...edit, address: e.target.value})} 
              placeholder="Street, City, Zip" 
            />
          </Field>
          <Field label="Credit ceiling (₹)">
            <Input 
              className="h-12 rounded-xl bg-muted/20 border-none font-bold" 
              type="number" 
              value={edit.credit_limit ?? 0} 
              onChange={e => setEdit({...edit, credit_limit: Number(e.target.value)})} 
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Discount %">
              <Input 
                className="h-12 rounded-xl bg-muted/20 border-none font-bold" 
                type="number" 
                value={edit.discount_pct ?? 0} 
                onChange={e => setEdit({...edit, discount_pct: Number(e.target.value)})} 
              />
            </Field>
            <Field label="Tier">
              <Select 
                value={edit.shop_type || "silver"} 
                onValueChange={(v: "premium" | "gold" | "silver" | "bronze" | "basic") => setEdit({ ...edit, shop_type: v })}
              >
                <SelectTrigger className="h-12 rounded-xl bg-muted/20 border-none font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="bronze">Bronze</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/40 md:col-span-2">
             <div className="space-y-0.5">
                <Label className="text-xs font-bold">Active Status</Label>
                <p className="text-[10px] text-muted-foreground font-medium">Visible to sales agents</p>
             </div>
             <Switch checked={edit.is_active ?? true} onCheckedChange={(v) => setEdit({...edit, is_active: v})} />
          </div>
        </div>
        <div className="flex gap-4 pt-4">
          <Button 
            variant="outline" 
            className="h-14 flex-1 rounded-2xl font-black uppercase text-[11px] tracking-widest text-muted-foreground" 
            onClick={() => onOpenChange(false)}
          >
            Discard
          </Button>
          <Button 
            className="h-14 flex-[2] rounded-2xl font-black uppercase text-[11px] tracking-widest bg-primary text-white shadow-2xl shadow-primary/30" 
            onClick={save}
            disabled={busy}
          >
            {busy ? "Applying..." : (edit.id ? "Apply changes" : "Enable point of sale")}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs font-medium text-muted-foreground ml-0.5">{label}</Label>
      {children}
    </div>
  );
}
