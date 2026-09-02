import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  ShieldAlert, 
  Boxes, 
  Receipt, 
  ShoppingCart, 
  PackageCheck,
  Building2,
  Percent,
  Store,
  Truck,
  Sparkles
} from "lucide-react";
import { 
  fetchDatabaseStats, 
  executeProductionReset, 
  purgeAllInventoryAndBatches, 
  purgeAllPurchaseInvoices, 
  purgeAllSalesAndOrders,
  purgeAllProducts,
  purgeAllCompanies,
  purgeAllSchemes,
  purgeAllShopsAndCustomers,
  purgeAllSuppliersAndAliases,
  type DatabaseStats, 
  type ProductionResetOptions 
} from "@/lib/productDeletion";
import { seedSampleDatabaseData } from "@/lib/databaseSeeder";
import { toast } from "sonner";

export function DatabaseMaintenanceTab() {
  const [stats, setStats] = React.useState<DatabaseStats | null>(null);
  const [loadingStats, setLoadingStats] = React.useState(true);
  const [resetting, setResetting] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);

  // Production reset options
  const [options, setOptions] = React.useState<ProductionResetOptions>({
    purgeStockAndBatches: true,
    purgePurchaseInvoices: true,
    purgeSalesAndOrders: true,
    purgeProductCatalog: false,
    purgeCustomers: false,
    purgeCompanies: false,
    purgeSchemes: false,
    purgeSuppliers: false
  });

  const [confirmPhrase, setConfirmPhrase] = React.useState("");
  const isConfirmValid = confirmPhrase.trim().toUpperCase() === "CLEAN-DATABASE";

  const loadStats = React.useCallback(async () => {
    setLoadingStats(true);
    try {
      const data = await fetchDatabaseStats();
      setStats(data);
    } catch (err) {
      console.error("Failed to load DB stats:", err);
      toast.error("Could not fetch database stats");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  React.useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleFullReset = async () => {
    if (!isConfirmValid) {
      toast.error('Please type "CLEAN-DATABASE" to confirm production cleanup.');
      return;
    }

    setResetting(true);
    const toastId = toast.loading("Executing production database cleanup...");
    try {
      // Set localStorage flag to avoid any automatic mock data injection
      localStorage.setItem("DISABLE_AUTO_SEED", "true");

      const result = await executeProductionReset(options);
      toast.success(result.message, { id: toastId, duration: 5000 });
      setConfirmPhrase("");
      await loadStats();
    } catch (err) {
      console.error(err);
      toast.error("Failed to execute database cleanup", { id: toastId });
    } finally {
      setResetting(false);
    }
  };

  const handlePurgeStockOnly = async () => {
    if (!window.confirm("Are you sure you want to clear all inventory quantities and batches? Product catalog will remain intact.")) return;
    setResetting(true);
    try {
      await purgeAllInventoryAndBatches();
      toast.success("All inventory stock and batches cleared");
      await loadStats();
    } catch {
      toast.error("Failed to clear inventory");
    } finally {
      setResetting(false);
    }
  };

  const handlePurgeInvoicesOnly = async () => {
    if (!window.confirm("Are you sure you want to clear all purchase invoices and GRN receipts?")) return;
    setResetting(true);
    try {
      await purgeAllPurchaseInvoices();
      toast.success("All purchase invoices and GRNs cleared");
      await loadStats();
    } catch {
      toast.error("Failed to clear purchase invoices");
    } finally {
      setResetting(false);
    }
  };

  const handlePurgeOrdersOnly = async () => {
    if (!window.confirm("Are you sure you want to clear all sales orders, bills, and payment records?")) return;
    setResetting(true);
    try {
      await purgeAllSalesAndOrders();
      toast.success("All sales orders and bills cleared");
      await loadStats();
    } catch {
      toast.error("Failed to clear sales orders");
    } finally {
      setResetting(false);
    }
  };

  const handlePurgeCatalogOnly = async () => {
    if (!window.confirm("CRITICAL: Are you sure you want to delete ALL products and pricing tiers from the catalog?")) return;
    setResetting(true);
    try {
      await purgeAllProducts();
      toast.success("All products and pricing tiers deleted");
      await loadStats();
    } catch {
      toast.error("Failed to clear products catalog");
    } finally {
      setResetting(false);
    }
  };

  const handlePurgeCompaniesOnly = async () => {
    if (!window.confirm("Are you sure you want to delete all registered Companies & Portfolios? Associated schemes will also be purged.")) return;
    setResetting(true);
    try {
      await purgeAllCompanies();
      toast.success("All companies and company portfolios cleared");
      await loadStats();
    } catch {
      toast.error("Failed to clear companies");
    } finally {
      setResetting(false);
    }
  };

  const handlePurgeSchemesOnly = async () => {
    if (!window.confirm("Are you sure you want to delete all active Schemes and promotions?")) return;
    setResetting(true);
    try {
      await purgeAllSchemes();
      toast.success("All promotional schemes cleared");
      await loadStats();
    } catch {
      toast.error("Failed to clear schemes");
    } finally {
      setResetting(false);
    }
  };

  const handlePurgeShopsOnly = async () => {
    if (!window.confirm("Are you sure you want to delete all registered Shops, Outlets & Customer accounts? Associated orders and invoices will also be reset.")) return;
    setResetting(true);
    try {
      await purgeAllShopsAndCustomers();
      toast.success("All shops, outlets, and custom price overrides cleared");
      await loadStats();
    } catch {
      toast.error("Failed to clear shops");
    } finally {
      setResetting(false);
    }
  };

  const handlePurgeSuppliersOnly = async () => {
    if (!window.confirm("Are you sure you want to delete all learned Supplier Product Aliases and templates?")) return;
    setResetting(true);
    try {
      await purgeAllSuppliersAndAliases();
      toast.success("All supplier mappings and aliases cleared");
      await loadStats();
    } catch {
      toast.error("Failed to clear supplier mappings");
    } finally {
      setResetting(false);
    }
  };

  const handleHealUnknown = async () => {
    setResetting(true);
    const toastId = toast.loading("Scanning and repairing 'Unknown' products and aliases...");
    try {
      const { healUnknownProducts } = await import("@/lib/productDeletion");
      const res = await healUnknownProducts();
      toast.success(`Repaired ${res.repaired} unknown products and cleaned ${res.purgedAliases} aliases.`, { id: toastId });
      await loadStats();
    } catch (err) {
      console.error(err);
      toast.error("Failed to repair unknown products", { id: toastId });
    } finally {
      setResetting(false);
    }
  };

  const handleSeedDemoData = async () => {
    if (!window.confirm("Seed sample company portfolios (ITC, HUL, Nestle, etc.) and standard products for testing?")) return;
    setSeeding(true);
    const toastId = toast.loading("Seeding sample master records...");
    try {
      const res = await seedSampleDatabaseData();
      toast.success(res.message, { id: toastId });
      await loadStats();
    } catch {
      toast.error("Failed to seed sample data", { id: toastId });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <Card className="rounded-2xl border border-border/60 shadow-xs bg-card/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Products</p>
              <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">
                {loadingStats ? "..." : (stats?.productsCount ?? 0)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Boxes size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 shadow-xs bg-card/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Batches</p>
              <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">
                {loadingStats ? "..." : (stats?.batchesCount ?? 0)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <PackageCheck size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 shadow-xs bg-card/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoices / GRNs</p>
              <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">
                {loadingStats ? "..." : (stats?.purchaseInvoicesCount ?? 0)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
              <Receipt size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 shadow-xs bg-card/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales Orders</p>
              <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">
                {loadingStats ? "..." : (stats?.ordersCount ?? 0)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <ShoppingCart size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 shadow-xs bg-card/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Companies</p>
              <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">
                {loadingStats ? "..." : (stats?.companiesCount ?? 0)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Building2 size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 shadow-xs bg-card/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Schemes</p>
              <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">
                {loadingStats ? "..." : (stats?.schemesCount ?? 0)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
              <Percent size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 shadow-xs bg-card/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shops / Outlets</p>
              <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">
                {loadingStats ? "..." : (stats?.shopsCount ?? 0)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-600">
              <Store size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 shadow-xs bg-card/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier Aliases</p>
              <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">
                {loadingStats ? "..." : (stats?.suppliersCount ?? 0)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600">
              <Truck size={20} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Production Database Reset Tool */}
      <Card className="rounded-2xl border border-rose-200/80 bg-rose-50/20 dark:bg-rose-950/10 shadow-xs overflow-hidden">
        <CardHeader className="p-5 pb-3 border-b border-rose-200/40">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600">
                <ShieldAlert size={22} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-rose-900 dark:text-rose-200">
                  Production Database Reset (Clean Start)
                </CardTitle>
                <CardDescription className="text-xs text-rose-800/70 dark:text-rose-300/70">
                  Selectively or completely purge companies, schemes, shops, suppliers, stock, or test transactions to prepare for live rollout.
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadStats}
              disabled={loadingStats}
              className="h-8 gap-1.5 text-xs rounded-lg"
            >
              <RefreshCw size={13} className={loadingStats ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-5">
          <div className="space-y-3">
            <Label className="text-xs font-bold text-foreground">Select modules to clean:</Label>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                <Checkbox
                  checked={options.purgeSalesAndOrders}
                  onCheckedChange={(c) => setOptions(prev => ({ ...prev, purgeSalesAndOrders: !!c }))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">Sales Orders, Invoices & Payments</p>
                  <p className="text-[11px] text-muted-foreground">Purges all test sales transactions and billing records.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                <Checkbox
                  checked={options.purgePurchaseInvoices}
                  onCheckedChange={(c) => setOptions(prev => ({ ...prev, purgePurchaseInvoices: !!c }))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">Purchase Invoices & GRNs</p>
                  <p className="text-[11px] text-muted-foreground">Purges supplier invoices and GRN inward items.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                <Checkbox
                  checked={options.purgeStockAndBatches}
                  onCheckedChange={(c) => setOptions(prev => ({ ...prev, purgeStockAndBatches: !!c }))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">Inventory Quantities & Batches</p>
                  <p className="text-[11px] text-muted-foreground">Resets inventory stock movements, ledger, and batch counts to 0.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                <Checkbox
                  checked={options.purgeProductCatalog}
                  onCheckedChange={(c) => setOptions(prev => ({ ...prev, purgeProductCatalog: !!c }))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-rose-600 dark:text-rose-400">All Products Catalog</p>
                  <p className="text-[11px] text-muted-foreground">Wipes all catalog products to allow a completely fresh product import.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                <Checkbox
                  checked={options.purgeCompanies}
                  onCheckedChange={(c) => setOptions(prev => ({ ...prev, purgeCompanies: !!c }))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">Companies & Portfolios</p>
                  <p className="text-[11px] text-muted-foreground">Clears company records and brand portfolios.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                <Checkbox
                  checked={options.purgeSchemes}
                  onCheckedChange={(c) => setOptions(prev => ({ ...prev, purgeSchemes: !!c }))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">Active Schemes & Discounts</p>
                  <p className="text-[11px] text-muted-foreground">Clears all trade schemes, buy-x-get-y, and percent schemes.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                <Checkbox
                  checked={options.purgeCustomers}
                  onCheckedChange={(c) => setOptions(prev => ({ ...prev, purgeCustomers: !!c }))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">Shops & Customer Accounts</p>
                  <p className="text-[11px] text-muted-foreground">Clears registered retail shops and price overrides.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-card hover:bg-muted/40 cursor-pointer transition-colors">
                <Checkbox
                  checked={options.purgeSuppliers}
                  onCheckedChange={(c) => setOptions(prev => ({ ...prev, purgeSuppliers: !!c }))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">Learned Supplier Aliases & Codes</p>
                  <p className="text-[11px] text-muted-foreground">Clears learned invoice text-to-SKU mappings.</p>
                </div>
              </label>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-600" />
              Safety Notice
            </p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Only the selected modules above will be cleared. System roles, authentication, and core warehouse setup remain protected.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <Label className="text-xs font-semibold text-foreground">
              To proceed, type <span className="font-mono font-bold text-rose-600">CLEAN-DATABASE</span> below:
            </Label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="CLEAN-DATABASE"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                className="max-w-xs font-mono text-xs uppercase"
              />
              <Button
                variant="destructive"
                disabled={!isConfirmValid || resetting}
                onClick={handleFullReset}
                className="gap-2 text-xs font-bold shadow-sm"
              >
                <Trash2 size={14} />
                {resetting ? "Cleaning Database..." : "Execute Selected Cleanup"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Granular Maintenance Actions */}
      <Card className="rounded-2xl border border-border/60 shadow-xs">
        <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold">Granular Master Reset Tools</CardTitle>
            <CardDescription className="text-xs">
              Individually purge specific sections without affecting other data.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeedDemoData}
            disabled={seeding || resetting}
            className="h-8 gap-1.5 text-xs text-primary font-semibold"
          >
            <Sparkles size={13} className={seeding ? "animate-spin" : ""} />
            Seed Sample Masters
          </Button>
        </CardHeader>
        <CardContent className="p-5 pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border bg-card flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Companies & Brands</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Clear all company master entries.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeCompaniesOnly}
              disabled={resetting}
              className="w-full text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Clear Companies
            </Button>
          </div>

          <div className="p-3.5 rounded-xl border bg-card flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Trade Schemes</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Clear all active trade schemes and deals.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeSchemesOnly}
              disabled={resetting}
              className="w-full text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Clear Schemes
            </Button>
          </div>

          <div className="p-3.5 rounded-xl border bg-card flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Shops & Customers</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Clear all outlets, shops & custom rates.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeShopsOnly}
              disabled={resetting}
              className="w-full text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Clear Shops
            </Button>
          </div>

          <div className="p-3.5 rounded-xl border bg-card flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Supplier Mappings</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Clear learned item-to-supplier aliases.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeSuppliersOnly}
              disabled={resetting}
              className="w-full text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Clear Suppliers
            </Button>
          </div>

          <div className="p-3.5 rounded-xl border bg-card flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Heal 'Unknown' Products</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Scan & fix products named Unknown.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleHealUnknown}
              disabled={resetting}
              className="w-full text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              Repair Unknowns
            </Button>
          </div>

          <div className="p-3.5 rounded-xl border bg-card flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Stock & Batches</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Reset stock counts to 0.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeStockOnly}
              disabled={resetting}
              className="w-full text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Clear Stock Only
            </Button>
          </div>

          <div className="p-3.5 rounded-xl border bg-card flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Purchase Invoices / GRNs</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Clear all inward GRNs and invoices.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeInvoicesOnly}
              disabled={resetting}
              className="w-full text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Clear Invoices Only
            </Button>
          </div>

          <div className="p-3.5 rounded-xl border bg-card flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Sales & Orders</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Clear all bills, orders, and receipts.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeOrdersOnly}
              disabled={resetting}
              className="w-full text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Clear Orders Only
            </Button>
          </div>

          <div className="p-3.5 rounded-xl border bg-card flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Product Catalog</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Delete all products & pricing tiers.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeCatalogOnly}
              disabled={resetting}
              className="w-full text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Clear Products
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
