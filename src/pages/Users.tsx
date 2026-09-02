import * as React from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContextCore";
import { AppRole } from "@/types";
import { SectionHeader } from "@/components/SectionHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ShieldCheck, UserCog, User, CheckCircle2, AlertTriangle, Key, RefreshCw, Eye, EyeOff, Loader2, UserPlus, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { 
  ResponsiveContainer, 
  ResponsiveDialog 
} from "@/components/ui/responsive-ui";
import { PageHeader } from "@/components/PageHeader";

type UserRow = { 
  id: string; 
  full_name: string | null; 
  phone: string | null; 
  role: AppRole; 
  email?: string | null;
  salesperson_pins?: { is_active: boolean; last_used_at: string | null }[];
};

const ROLES: { id: AppRole; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "salesperson", label: "Sales", desc: "Order booking & collections", icon: User },
  { id: "admin", label: "Admin", desc: "Full operational control", icon: UserCog },
  { id: "owner", label: "Owner", desc: "Consolidated system owner", icon: ShieldCheck },
];

export default function Users() {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [users, setUsers] = React.useState<UserRow[] | null>(null);
  const [showSelfDemoteConfirm, setShowSelfDemoteConfirm] = React.useState(false);
  const [pendingRole, setPendingRole] = React.useState<AppRole | null>(null);
  const [savingRole, setSavingRole] = React.useState<string | null>(null);

  // PIN states
  const [pinDialogOpen, setPinDialogOpen] = React.useState(false);
  const [targetUser, setTargetUser] = React.useState<UserRow | null>(null);
  const [newPin, setNewPin] = React.useState("");
  const [pinLabel, setPinLabel] = React.useState("");
  const [showPin, setShowPin] = React.useState(false);
  const [settingPin, setSettingPin] = React.useState(false);
  const [generatedPin, setGeneratedPin] = React.useState<string | null>(null);

  const [onboardOpen, setOnboardOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, phone, email, role")
        .order("full_name");
      
      if (pErr) throw pErr;

      // Try loading roles from user_roles table if present
      const roleMap: Record<string, string[]> = {};
      try {
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("user_id, role");
        
        if (roleRows) {
          roleRows.forEach(r => {
            if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
            roleMap[r.user_id].push(r.role);
          });
        }
      } catch {
        // user_roles table optional
      }

      // Load pins separately
      const { data: pins, error: pinErr } = await supabase
        .from("salesperson_pins")
        .select("profile_id, is_active, last_used_at");

      if (pinErr) {
        console.warn("Pins load failed:", pinErr);
      }

      const usersWithRolesAndPins = (profs ?? []).map(u => {
        const uRoles = roleMap[u.id] || [];
        const primaryRole = (uRoles.length > 0 ? uRoles[0] : (u.role || "salesperson")) as AppRole;
        
        return {
          ...u,
          role: primaryRole,
          salesperson_pins: pins?.filter(p => p.profile_id === u.id) || []
        };
      });

      setUsers(usersWithRolesAndPins as UserRow[]);
    } catch (e: unknown) {
      console.error('[Context] Identities load failed', e);
      toast.error(friendlyError(e));
      setUsers([]);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const setRole = async (uid: string, role: AppRole) => {
    if (!users) return;

    // Last Admin/Owner Protection
    if (role !== 'admin' && role !== 'owner') {
      const admins = users.filter(u => u.role === 'admin' || u.role === 'owner');
      const adminCount = admins.length;
      const tUser = users.find(u => u.id === uid);
      const isTargetAdmin = tUser?.role === 'admin' || tUser?.role === 'owner';
      
      if (isTargetAdmin && adminCount <= 1) {
        console.error('[Context] Security Halt: Last admin protection triggered');
        toast.error("Security Halt: Cannot remove the last administrative account.");
        return;
      }
    }

    if (uid === me?.id && role !== "admin" && role !== "owner") {
      setPendingRole(role);
      setShowSelfDemoteConfirm(true);
      return;
    }
    performSetRole(uid, role);
  };

  const performSetRole = async (uid: string, role: AppRole) => {
    setSavingRole(uid);
    try {
      // 1. Update role directly on profiles table
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", uid);

      if (profErr) {
        console.warn("Profile role update error:", profErr);
      }

      // 2. Try user_roles table if it exists
      try {
        await supabase.from("user_roles").delete().eq("user_id", uid);
        await supabase.from("user_roles").insert({ user_id: uid, role });
      } catch {
        // user_roles table optional
      }

      toast.success("Identity profile updated");
      await load();
    } catch (error: unknown) {
      console.error('[Context] Set role failed', error);
      toast.error(friendlyError(error));
    } finally {
      setSavingRole(null);
    }
  };

  const handleSetPin = (user: UserRow) => {
    setTargetUser(user);
    setNewPin("");
    setPinLabel("");
    setGeneratedPin(null);
    setPinDialogOpen(true);
  };

  const generateRandomPin = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setNewPin(pin);
    setShowPin(true);
    setGeneratedPin(pin);
    setTimeout(() => setGeneratedPin(null), 30000); // Clear after 30s
  };

  const savePin = async () => {
    if (!targetUser || newPin.length !== 4) {
      console.error('[Context] PIN validation failed', { hasTarget: !!targetUser, length: newPin.length });
      toast.error("PIN must be exactly 4 digits");
      return;
    }

    setSettingPin(true);
    try {
      const { data, error } = await supabase.rpc('set_salesperson_pin', {
        p_profile_id: targetUser.id,
        p_pin: newPin,
        p_label: pinLabel || ""
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);

      toast.success("Salesperson PIN updated successfully");
      setGeneratedPin(newPin);
      load();
    } catch (e: unknown) {
      console.error('[Context] Save PIN failed', e);
      toast.error(friendlyError(e));
    } finally {
      setSettingPin(false);
    }
  };

  return (
    <ResponsiveContainer className="space-y-6 pb-24">
      <PageHeader 
        title="Staff" 
        subtitle="Manage staff roles and access PINs" 
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/")}
        action={
          <Button 
            onClick={() => setOnboardOpen(true)}
            className="h-11 px-6 rounded-xl bg-primary text-white shadow-brand font-black uppercase tracking-widest text-[10px]"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add staff
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {users === null && Array.from({ length: 6 }).map((_, i) => <SkeletonUser key={i} />)}
        
        {users !== null && users.length === 0 && (
          <div className="col-span-full py-12 sm:py-20 text-center space-y-4 bg-white rounded-2xl sm:rounded-[2rem] border border-border/40 shadow-sm">
            <div className="h-16 w-16 sm:h-20 sm:w-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <User className="h-8 w-8 sm:h-10 sm:w-10" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">No team members found.</h3>
              <p className="text-xs sm:text-sm font-medium text-slate-400">No identities found in the system registry.</p>
            </div>
          </div>
        )}

        {users?.map(u => {
          const initials = u.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "??";
          const isMe = u.id === me?.id;
          const hasPin = u.salesperson_pins && u.salesperson_pins.length > 0;
          
          return (
            <Card key={u.id} className={cn(
              "flex flex-col h-full overflow-hidden border-border/40 rounded-2xl sm:rounded-3xl bg-white shadow-sm transition-all hover:shadow-md",
              isMe && "ring-2 ring-primary/20 shadow-primary/10"
            )}>
              <CardContent className="p-0 flex-1 flex flex-col">
                <div className="flex items-center gap-3 sm:gap-4 bg-slate-50 p-3 sm:p-6 border-b border-border/20">
                  <Avatar className="h-10 w-10 sm:h-14 sm:w-14 border-2 border-white shadow-md shrink-0">
                    <AvatarFallback className="bg-primary font-black text-white text-sm sm:text-lg">{initials}</AvatarFallback>
                  </Avatar>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black tracking-tight text-slate-900 text-sm sm:text-lg leading-tight break-words">{u.full_name || "Anonymous"}</h3>
                        {isMe && <Badge className="bg-primary/10 text-primary border-none font-black text-[7px] sm:text-[9px] uppercase tracking-widest px-1 sm:px-2 py-0 h-4 sm:h-5 whitespace-nowrap">Self</Badge>}
                      </div>
                      <div className="flex flex-col text-[7px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 sm:mt-1">
                        {u.email && <span>{u.email}</span>}
                        {u.phone && <span>{u.phone}</span>}
                      </div>
                    </div>
                </div>

                <div className="p-3 sm:p-6 flex-1 flex flex-col space-y-4 sm:space-y-6">
                  <div>
                    <p className="mb-3 sm:mb-4 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Staff Role</p>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {ROLES.map(({ id, label, icon: Icon }) => {
                        const active = u.role === id;
                        return (
                          <button
                            key={id}
                            onClick={() => setRole(u.id, id)}
                            disabled={savingRole === u.id}
                            className={cn(
                              "group relative flex flex-col items-center justify-center rounded-xl sm:rounded-2xl border-2 py-3 sm:py-4 px-1 sm:px-2 transition-all active:scale-95 disabled:opacity-50",
                              active 
                                ? "border-primary bg-primary/[0.03] text-primary shadow-sm" 
                                : "border-slate-100 bg-white text-slate-400 hover:bg-slate-50 hover:border-slate-200"
                            )}
                          >
                            {savingRole === u.id && active ? (
                              <Loader2 className="mb-1 h-4 w-4 sm:h-6 sm:w-6 animate-spin" />
                            ) : (
                              <Icon className={cn("mb-1 h-5 w-5 sm:h-6 sm:w-6 transition-transform group-hover:scale-110", active ? "stroke-[2.5px]" : "stroke-2 opacity-40")} />
                            )}
                            <span className="text-[8px] sm:text-[10px] font-black tracking-wider">{label}</span>
                            {active && !savingRole && (
                              <div className="absolute -right-1 -top-1 sm:-right-2 sm:-top-2 rounded-full bg-primary p-0.5 sm:p-1 text-white shadow-md ring-1 sm:ring-2 ring-white">
                                <CheckCircle2 className="h-2 w-2 sm:h-3 sm:w-3" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {u.role === 'salesperson' && (
                     <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                        {hasPin && u.salesperson_pins?.[0]?.last_used_at && (
                          <p className="text-[9px] font-bold text-slate-400 text-center uppercase tracking-wider">
                            Last used: {formatDistanceToNow(new Date(u.salesperson_pins[0].last_used_at), { addSuffix: true })}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            className={cn(
                              "flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] border-border/40 shadow-sm",
                              hasPin ? "text-emerald-600 bg-emerald-50 border-emerald-100/50" : "text-primary bg-white hover:bg-primary/5"
                            )}
                            onClick={() => handleSetPin(u)}
                          >
                            <Key className="mr-1.5 sm:mr-2 h-3.5 w-3.5" />
                            {hasPin ? "Reset PIN" : "Create PIN"}
                          </Button>
                          
                          {hasPin && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl text-rose-500 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-100"
                              onClick={async () => {
                                if (!window.confirm(`CRITICAL: Revoke PIN access for ${u.full_name}?`)) return;
                                try {
                                  const { error } = await supabase.from('salesperson_pins').delete().eq('profile_id', u.id);
                                  if (error) throw error;
                                  toast.success("Security token revoked");
                                  load();
                                } catch (e) {
                                  toast.error(friendlyError(e));
                                }
                              }}
                            >
                              <EyeOff className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                     </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ResponsiveDialog
        open={onboardOpen}
        onOpenChange={setOnboardOpen}
        title="Invite Staff Member"
        description="Follow these steps to add a new staff member to the system."
      >
          <div className="space-y-6">
            <div className="h-20 w-20 bg-primary/10 rounded-[2rem] flex items-center justify-center text-primary mx-auto mb-2">
              <UserPlus className="h-10 w-10" />
            </div>
            <div className="space-y-4 text-sm font-medium text-slate-600 leading-relaxed text-center px-4">
              <p>Tatvisha Enterprises uses an identity-first invitation system.</p>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-left space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Integration steps</p>
                <div className="flex gap-3">
                  <div className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-black shrink-0">1</div>
                  <p className="text-xs font-bold">Open Supabase Authentication Management</p>
                </div>
                <div className="flex gap-3">
                  <div className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-black shrink-0">2</div>
                  <p className="text-xs font-bold">Trigger 'Invite User' with their official email</p>
                </div>
                <div className="flex gap-3">
                  <div className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-black shrink-0">3</div>
                  <p className="text-xs font-bold">Sync: Profile activates on first secure login</p>
                </div>
              </div>
            </div>
            
            <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex gap-4">
              <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
              <p className="text-xs font-black text-amber-700 leading-normal uppercase tracking-tight">
                Safety Protocol: New identities inherit "Salesperson" clearance by default.
              </p>
            </div>
            
            <Button asChild className="w-full h-16 rounded-[2rem] bg-slate-900 text-white font-black uppercase tracking-widest text-[11px] shadow-2xl">
              <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open admin console</a>
            </Button>
          </div>
      </ResponsiveDialog>

      <ResponsiveDialog 
        open={pinDialogOpen} 
        onOpenChange={setPinDialogOpen}
        title="Access PIN"
        description={
          <div className="space-y-1">
            <p>Set a unique login PIN for {targetUser?.full_name}</p>
            {targetUser?.salesperson_pins?.[0]?.last_used_at && (
              <p className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded-lg w-fit">
                Last used: {formatDistanceToNow(new Date(targetUser.salesperson_pins[0].last_used_at), { addSuffix: true })}
              </p>
            )}
          </div>
        }
        className="max-w-sm"
      >
          <div className="space-y-8">
            <div className="space-y-6">
               <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Secure Terminal PIN (4-Digits)</Label>
                  <div className="flex justify-center gap-3 mb-4">
                    {[...Array(4)].map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "h-14 w-12 rounded-2xl flex items-center justify-center font-black text-2xl transition-all border-2",
                          newPin.length > i 
                            ? "border-primary bg-primary/5 text-primary scale-105 shadow-sm" 
                            : "border-slate-100 bg-slate-50 text-slate-200"
                        )}
                      >
                        {newPin.length > i ? (showPin ? newPin[i] : "•") : ""}
                      </div>
                    ))}
                  </div>
                  <div className="relative">
                     <Input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4} 
                        placeholder="Type 4 digits..."
                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold text-center tracking-widest focus-visible:ring-primary/20"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                     />
                     <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-900 transition-colors"
                     >
                        {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                     </button>
                  </div>
               </div>

               <Button 
                variant="outline" 
                className="w-full h-12 rounded-2xl text-primary font-black uppercase tracking-widest text-[10px] border-primary/20 bg-primary/5 hover:bg-primary/10"
                onClick={generateRandomPin}
               >
                 <RefreshCw className="mr-2 h-4 w-4" />
                 Generate PIN
               </Button>

               <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Context Label</Label>
                  <Input 
                    placeholder="Identify this key node..."
                    className="h-14 rounded-2xl bg-slate-50 border-none font-black text-sm px-6"
                    value={pinLabel}
                    onChange={(e) => setPinLabel(e.target.value)}
                  />
               </div>
            </div>

            {generatedPin && (
              <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 flex items-center justify-between animate-in fade-in slide-in-from-top-4">
                <div className="space-y-1">
                   <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600/60 leading-none">Authorization Success</p>
                   <p className="text-3xl font-black text-emerald-600 tracking-[0.2em] leading-none mb-1">{generatedPin}</p>
                </div>
                <div className="h-14 w-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                   <CheckCircle2 size={32} />
                </div>
              </div>
            )}
            
            <div className="flex gap-4">
              <Button variant="outline" className="h-16 rounded-[2rem] flex-1 font-black uppercase tracking-widest text-[11px] border-slate-200" onClick={() => setPinDialogOpen(false)}>Cancel</Button>
              {!generatedPin && (
                <Button 
                  className="h-16 rounded-[2rem] flex-[2] bg-primary text-white font-black uppercase tracking-widest text-[11px] shadow-xl shadow-primary/20"
                  disabled={newPin.length !== 4 || settingPin}
                  onClick={savePin}
                >
                  {settingPin ? <Loader2 className="h-6 w-6 animate-spin" /> : "Save PIN"}
                </Button>
              )}
            </div>
          </div>
      </ResponsiveDialog>

      <AlertDialog open={showSelfDemoteConfirm} onOpenChange={setShowSelfDemoteConfirm}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white max-w-md">
          <div className="p-10 bg-rose-50 border-b border-rose-100 flex flex-col items-center text-center">
            <div className="h-20 w-20 bg-rose-500 text-white rounded-[2rem] flex items-center justify-center shadow-2xl shadow-rose-500/20 mb-6">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <AlertDialogTitle className="text-3xl font-black tracking-tighter text-rose-900 leading-[0.9]">
              Revoke admin access?
            </AlertDialogTitle>
          </div>
          <div className="p-10 space-y-8">
            <AlertDialogDescription className="text-slate-600 font-bold text-base leading-relaxed text-center">
              You are downgrading <span className="text-rose-600 font-black">your own</span> role. This action is permanent; administrative dashboards will vanish immediately.
            </AlertDialogDescription>
            <div className="flex gap-4">
              <AlertDialogCancel className="h-16 rounded-[2rem] flex-1 font-black uppercase tracking-widest text-[11px] border-slate-200">Preserve access</AlertDialogCancel>
              <AlertDialogAction 
                className="h-16 rounded-[2rem] flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest text-[11px] shadow-xl shadow-rose-600/20"
                onClick={() => {
                  if (me?.id && pendingRole) {
                    performSetRole(me.id, pendingRole);
                  }
                }}
              >
                Confirm
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveContainer>
  );
}

function SkeletonUser() {
  return (
    <Card className="rounded-3xl border-border/40 overflow-hidden bg-white shadow-sm shimmer">
      <CardContent className="p-0">
        <div className="flex items-center gap-4 bg-slate-50/50 p-6 border-b border-slate-100">
          <div className="h-14 w-14 rounded-[1.5rem] bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-32 rounded-lg bg-slate-200" />
            <div className="h-3 w-24 rounded-md bg-slate-100" />
          </div>
        </div>
        <div className="p-6 grid grid-cols-3 gap-3">
           <div className="h-16 rounded-2xl bg-slate-100/50" />
           <div className="h-16 rounded-2xl bg-slate-100/50" />
           <div className="h-16 rounded-2xl bg-slate-100/50" />
        </div>
      </CardContent>
    </Card>
  );
}
