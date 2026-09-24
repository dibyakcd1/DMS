import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Printer, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  UserCircle, 
  ShieldAlert, 
  RotateCcw, 
  Settings2, 
  Store, 
  Sliders,
  LogOut,
  Layers,
  Zap,
  AlertCircle,
  ArrowRight,
  Info,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContextCore";
import { useSettings } from "@/hooks/useSettings";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { PrinterSettings } from "@/components/PrinterSettings";
import { CompaniesManagementTab } from "@/components/settings/CompaniesManagementTab";
import { SchemesManagementTab } from "@/components/settings/SchemesManagementTab";
import { DatabaseMaintenanceTab } from "@/components/settings/DatabaseMaintenanceTab";
import { GeminiSettingsCard } from "@/components/settings/GeminiSettingsCard";

import { 
  ResponsiveContainer, 
} from "@/components/ui/responsive-ui";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Database } from "lucide-react";

type SettingsTab = "hardware" | "business" | "account" | "preferences" | "companies" | "schemes" | "database";

export default function Settings() {
  const { user, isAdmin, signOut } = useAuth();
  const { settings, updateSetting, resetSettings } = useSettings();
  const { 
    margins, 
    updateMargins, 
    categoryMargins, 
    updateCategoryMargins, 
    varianceThreshold,
    updateVarianceThreshold,
    loading: marginsLoading 
  } = useGlobalSettings();
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("hardware");

  const [localMargins, setLocalMargins] = React.useState(margins);
  const [localCats, setLocalCats] = React.useState(categoryMargins);
  const [localVariance, setLocalVariance] = React.useState(varianceThreshold);

  React.useEffect(() => {
    setLocalMargins(margins);
  }, [margins]);

  React.useEffect(() => {
    setLocalCats(categoryMargins);
  }, [categoryMargins]);

  React.useEffect(() => {
    setLocalVariance(varianceThreshold);
  }, [varianceThreshold]);

  const handleUpdate = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    updateSetting(key, value);
    toast.success("Settings updated", {
      description: `${key.replace(/([A-Z])/g, ' $1').toLowerCase()} saved successfully.`
    });
  };

  const handleReset = () => {
    resetSettings();
    toast.info("Settings reset", {
      description: "All preferences have been restored to defaults."
    });
  };

  const handleMarginChange = (st: keyof typeof margins, val: string) => {
    const num = parseFloat(val) || 0;
    setLocalMargins(prev => ({ ...prev, [st]: num }));
  };

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab") as SettingsTab;
    if (tabParam && ["hardware", "business", "account", "preferences", "companies", "schemes", "database"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);

  const navItems = [
    { id: "hardware", label: "Hardware", icon: Printer, desc: "Devices & Printers" },
    { id: "account", label: "Account", icon: UserCircle, desc: "Your profile & credentials" },
    ...(isAdmin ? [
      { id: "business", label: "Business", icon: Store, desc: "Pricing & margin defaults" },
      { id: "preferences", label: "Preferences", icon: Sliders, desc: "Display & print settings" },
      { id: "companies", label: "Companies", icon: Layers, desc: "Distribution partners" },
      { id: "schemes", label: "Schemes", icon: Zap, desc: "Active trade schemes" },
      { id: "database", label: "Database", icon: Database, desc: "Production reset & clean" }
    ] : []),
  ] as const;

  const RestrictedFallback = () => (
    <Card className="border-2 border-dashed border-rose-100 bg-rose-50/30 rounded-3xl p-12 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-500">
          <ShieldAlert size={32} />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-black text-rose-900 uppercase tracking-tight">Access Restricted</h3>
          <p className="text-sm font-bold text-rose-600/60 max-w-xs mx-auto italic">
            This module requires administrative clearances. Operations are locked.
          </p>
        </div>
        <Button 
          variant="outline" 
          className="mt-4 rounded-xl border-rose-200 text-rose-500 font-bold uppercase tracking-widest text-[10px]"
          onClick={() => setActiveTab("account")}
        >
          Return to Profile
        </Button>
      </div>
    </Card>
  );

  return (
    <ResponsiveContainer className="pb-32 px-4 sm:px-6 lg:px-0">
      <PageHeader 
        title="Settings" 
        subtitle="App configuration" 
        titleColor="var(--color-brand-primary)"
      />
      
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 mt-3 lg:mt-6">
        {/* Navigation - Responsive Horizontal Bar on Mobile/Tablet & Vertical Sidebar on Desktop */}
        <aside className="lg:w-64 shrink-0 px-0">
          <div className="lg:sticky lg:top-24 space-y-4">
            {/* Mobile & Tablet Tab Pills Bar */}
            <div className="flex lg:hidden items-center gap-2 overflow-x-auto pb-2 pt-1 px-1 -mx-1 no-scrollbar touch-pan-x">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2.5 rounded-xl transition-all duration-200 shrink-0 border text-xs font-bold whitespace-nowrap active:scale-95",
                    activeTab === item.id 
                      ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10" 
                      : "bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50"
                  )}
                >
                  <item.icon className={cn("h-4 w-4 shrink-0", activeTab === item.id ? "text-white" : "text-slate-400")} />
                  <span>{item.label}</span>
                </button>
              ))}
              <button
                onClick={() => signOut()}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-200 shrink-0 border border-rose-200 text-rose-600 bg-rose-50/50 hover:bg-rose-100 text-xs font-bold whitespace-nowrap active:scale-95"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Logout</span>
              </button>
            </div>

            {/* Desktop Navigation Sidebar */}
            <div className="hidden lg:flex flex-col gap-1.5 p-3 rounded-3xl bg-white/70 backdrop-blur-md border border-slate-200/60 shadow-sm">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer rounded-2xl transition-all duration-200 w-full text-left shrink-0 active:scale-95",
                    activeTab === item.id 
                      ? "bg-slate-900 text-white shadow-lg shadow-slate-900/15" 
                      : "text-slate-600 hover:bg-slate-100/70"
                  )}
                >
                  <div className={cn(
                    "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
                    activeTab === item.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  )}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className={cn("text-xs font-bold transition-colors leading-tight break-words", activeTab === item.id ? "text-white" : "text-slate-800")}>{item.label}</p>
                    <p className={cn("text-[10px] font-medium tracking-wide leading-tight break-words mt-0.5 opacity-70", activeTab === item.id ? "text-white" : "text-slate-400")}>{item.desc}</p>
                  </div>
                </button>
              ))}
              
              <div className="pt-2 border-t border-slate-100 mt-1">
                <button
                  onClick={() => signOut()}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 transition-all group"
                >
                  <div className="h-8 w-8 rounded-lg bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                    <LogOut className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-xs font-bold">Logout</p>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Dynamic Content Area */}
        <main className="flex-1 min-w-0 pb-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-5 sm:space-y-6"
            >
              {activeTab === "hardware" && (
                <PrinterSettings />
              )}

              {activeTab === "account" && (
                <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
                  <div className="bg-[#0F172A] p-5 sm:p-8 py-6 sm:py-8 text-white relative flex items-center">
                    <div className="absolute top-0 right-0 h-full w-full bg-[radial-gradient(circle_at_70%_20%,rgba(168,82,43,0.15),transparent_60%)] pointer-events-none" />
                    <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-3.5 sm:gap-6 relative z-10 w-full">
                      <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10 shrink-0">
                        <UserCircle className="h-7 w-7 sm:h-8 sm:w-8 text-white/80" />
                      </div>
                      <div className="space-y-1 min-w-0 w-full">
                        <h3 className="text-lg sm:text-2xl font-bold truncate">{user?.email?.split('@')[0]}</h3>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1">
                           <Badge className="bg-primary/20 text-white border-primary/30 font-black text-[9px] sm:text-[10px] px-2.5 py-0.5 rounded-lg tracking-wider uppercase">{isAdmin ? "Superuser" : "Standard Agent"}</Badge>
                           <span className="text-white/40 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Access Verifier 1.2</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-4 sm:p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-6">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider ml-0.5">Identity Endpoint</Label>
                        <div className="h-11 flex items-center px-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs sm:text-sm font-bold text-slate-800 font-mono select-all truncate">
                          {user?.email}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider ml-0.5">Assigned Node</Label>
                        <div className="h-11 flex items-center px-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs sm:text-sm font-bold text-slate-800 font-mono select-all truncate">
                          NE-DIST-CENTER #03
                        </div>
                      </div>
                    </div>
 
                    <div className="p-3.5 sm:p-4 bg-amber-50/80 rounded-xl border border-amber-200/60 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                      <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 border border-amber-200">
                        <ShieldAlert className="h-5 w-5 text-amber-700" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold text-amber-900 tracking-tight">Credential Isolation</p>
                        <p className="text-xs font-medium text-amber-800/80 leading-relaxed max-w-lg">
                          Security policies and cluster permissions are enforced by the cloud supervisor. Local adjustments are prohibited.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === "business" && (
                isAdmin ? (
                  <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
                  <CardHeader className="p-4 sm:p-5 pb-3">
                    <CardTitle className="text-lg font-bold tracking-tight">Business Matrix</CardTitle>
                    <CardDescription className="text-slate-400 text-xs mt-0.5">Global Pricing & Arithmetic Constants</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-5 pt-2 space-y-6">
                    <div className="space-y-5">
                      {/* Tier Based Margins */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 px-1">
                           <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-2 shrink-0">
                              <Store size={14} className="text-primary shrink-0" /> <span className="truncate">Tier Matrix (%)</span>
                           </Label>
                           <Badge variant="outline" className="border-slate-200 text-slate-400 font-bold text-[9px] uppercase tracking-wider h-5 px-2">Sync Active</Badge>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3 lg:gap-4">
                           {(['premium', 'gold', 'silver', 'bronze', 'basic'] as const).map((tier, index) => (
                             <div 
                               key={tier} 
                               className={cn(
                                 "space-y-1.5 p-3 rounded-xl bg-slate-50 transition-all hover:bg-white hover:shadow-md border border-slate-100 group",
                                 index === 4 && "col-span-2 sm:col-span-1 md:col-span-1"
                               )}
                             >
                               <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block text-center mb-1 group-hover:text-primary transition-colors">{tier}</Label>
                               <div className="relative">
                                 <Input 
                                   type="number" 
                                   step="0.1"
                                   value={localMargins[tier]} 
                                   onChange={(e) => handleMarginChange(tier, e.target.value)}
                                   className="h-10 rounded-lg bg-white border-slate-200 focus:border-primary font-bold text-center text-sm text-slate-900 shadow-sm px-2" 
                                 />
                               </div>
                             </div>
                           ))}
                        </div>
                      </div>
  
                      {/* Category Based Margins */}
                      <div className="space-y-3">
                         <div className="flex items-center justify-between px-1 border-t pt-5 border-slate-100">
                            <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-2 shrink-0">
                               <Sliders size={14} className="text-amber-500 shrink-0" /> <span className="truncate">Category Surcharge (%)</span>
                            </Label>
                         </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                             {Object.entries(localCats).map(([cat, val]) => (
                              <div key={cat} className="space-y-1.5 p-3.5 rounded-xl bg-[#FFFBF0] border border-amber-200/50 group transition-all hover:bg-white hover:shadow-md">
                                 <Label className="text-[10px] uppercase font-bold text-amber-900/70 tracking-wider block leading-tight truncate">{cat}</Label>
                                 <div className="relative">
                                    <Input 
                                      type="number" 
                                      value={val} 
                                      onChange={(e) => setLocalCats({...localCats, [cat]: Number(e.target.value)})}
                                      className="h-11 rounded-xl bg-white border-amber-200/60 focus:border-amber-500 font-bold text-sm text-slate-900 shadow-sm pl-3 pr-8" 
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">%</span>
                                 </div>
                              </div>
                            ))}
                         </div>
                      </div>
 
                      {/* Variance Threshold */}
                      <div className="space-y-3">
                         <div className="flex items-center justify-between px-1 border-t pt-5 border-slate-100">
                            <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-2 shrink-0">
                               <ShieldAlert size={14} className="text-rose-500 shrink-0" /> <span className="truncate">Variance Alert Threshold (%)</span>
                            </Label>
                         </div>
                         <div className="w-full sm:max-w-xs">
                           <div className="space-y-1.5 p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/60 group transition-all hover:bg-white hover:shadow-md">
                              <Label className="text-[10px] uppercase font-bold text-rose-900/70 tracking-wider block leading-tight">Price Deviation Limit</Label>
                              <div className="relative">
                                 <Input 
                                   type="number" 
                                   value={localVariance} 
                                   onChange={(e) => setLocalVariance(Number(e.target.value))}
                                   className="h-11 rounded-xl bg-white border-rose-200/60 focus:border-rose-500 font-bold text-sm text-slate-900 shadow-sm pl-3 pr-8" 
                                 />
                                 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-rose-500">%</span>
                              </div>
                           </div>
                         </div>
                      </div>
                    </div>
  
                    <div className="flex justify-end pt-5 border-t border-slate-100 mt-5">
                      <Button 
                        onClick={async () => {
                          await updateMargins(localMargins);
                          await updateCategoryMargins(localCats);
                          await updateVarianceThreshold(localVariance);
                          toast.success("Matrix Synchronized");
                        }}
                        disabled={marginsLoading}
                        className="w-full sm:w-auto bg-slate-900 hover:bg-black rounded-xl h-11 px-8 text-sm font-bold tracking-wide transition-all transform active:scale-95"
                      >
                        {marginsLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
                        {marginsLoading ? "Processing" : "Apply Matrix"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                ) : <RestrictedFallback />
              )}

              {activeTab === "preferences" && (
                isAdmin ? (
                  <div className="space-y-6">
                    <GeminiSettingsCard />
                    
                    <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
                      <CardHeader className="p-4 sm:p-5 pb-3">
                        <CardTitle className="text-lg font-bold tracking-tight">Preferences</CardTitle>
                        <CardDescription className="text-slate-400 text-xs mt-0.5">Display and reporting defaults.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-5 pt-2 space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 block mb-1">
                               Reporting period
                            </Label>
                            <Select 
                              value={settings.reportingPeriod} 
                              onValueChange={(v) => handleUpdate('reportingPeriod', v as "daily" | "weekly" | "monthly")}
                            >
                              <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200/80 font-bold text-sm text-slate-800 px-4 focus:ring-primary shadow-sm transition-all focus:bg-white hover:bg-slate-100/50">
                                <SelectValue placeholder="Period" />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-slate-200 shadow-xl p-1.5 bg-white">
                                <SelectItem value="daily" className="text-xs sm:text-sm font-bold py-2 rounded-xl">Daily</SelectItem>
                                <SelectItem value="weekly" className="text-xs sm:text-sm font-bold py-2 rounded-xl">Weekly</SelectItem>
                                <SelectItem value="monthly" className="text-xs sm:text-sm font-bold py-2 rounded-xl">Monthly</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
     
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 block mb-1">
                              GST rounding mode
                            </Label>
                            <Select 
                              value={settings.gstRounding} 
                              onValueChange={(v) => handleUpdate('gstRounding', v as "round" | "ceil" | "floor")}
                            >
                              <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200/80 font-bold text-sm text-slate-800 px-4 focus:ring-primary shadow-sm transition-all focus:bg-white hover:bg-slate-100/50">
                                <SelectValue placeholder="Logic" />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-slate-200 shadow-xl p-1.5 bg-white">
                                <SelectItem value="round" className="text-xs sm:text-sm font-bold py-2 rounded-xl">Round</SelectItem>
                                <SelectItem value="ceil" className="text-xs sm:text-sm font-bold py-2 rounded-xl">Ceiling</SelectItem>
                                <SelectItem value="floor" className="text-xs sm:text-sm font-bold py-2 rounded-xl">Floor</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
     
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 block mb-1">
                              Low stock alert threshold
                            </Label>
                            <div className="relative">
                              <Input 
                                type="number" 
                                value={settings.lowStockThreshold} 
                                onChange={(e) => handleUpdate('lowStockThreshold', Number(e.target.value))}
                                className="h-11 rounded-xl bg-slate-50 border-slate-200/80 font-bold text-sm text-slate-800 pl-4 pr-16 focus:ring-primary focus:bg-white shadow-sm transition-all" 
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Units</span>
                            </div>
                          </div>
                        </div>
     
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 border-t border-slate-100">
                          <Button 
                            variant="ghost" 
                            onClick={handleReset}
                            className="w-full sm:w-auto text-xs font-bold text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center gap-2 h-10 px-4 rounded-xl transition-all group"
                          >
                            <RotateCcw size={15} className="group-hover:-rotate-180 transition-transform duration-500" /> 
                            Purge Memory & Reset
                          </Button>
                          <div className="flex items-center gap-2 self-center">
                             <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                             <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">System State: Synchronized</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : <RestrictedFallback />
              )}

              {activeTab === "companies" && (
                isAdmin ? <CompaniesManagementTab /> : <RestrictedFallback />
              )}

              {activeTab === "schemes" && (
                isAdmin ? <SchemesManagementTab /> : <RestrictedFallback />
              )}

              {activeTab === "database" && (
                isAdmin ? <DatabaseMaintenanceTab /> : <RestrictedFallback />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </ResponsiveContainer>
  );
}
