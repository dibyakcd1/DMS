import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Sparkles, Check, ChevronRight, Layers, Tag } from "lucide-react";
import { Company } from "@/types";
import { createAndCatalogCompany } from "@/lib/companyResolver";
import { toast } from "sonner";

interface CompanyResolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierName: string;
  inferredBrand?: string | null;
  suggestedName?: string | null;
  suggestedCode?: string | null;
  availableCompanies: Company[];
  selectedCompanyId: string | null;
  onSelectCompany: (company: Company | null) => void;
  onCompanyCreated: (newCompany: Company) => void;
}

const PRESET_COLORS = [
  "#2563EB", // Blue
  "#DC2626", // Red
  "#16A34A", // Green
  "#D97706", // Amber
  "#7C3AED", // Purple
  "#DB2777", // Pink
  "#0D9488", // Teal
  "#4B5563", // Gray
];

export function CompanyResolutionModal({
  open,
  onOpenChange,
  supplierName,
  inferredBrand,
  suggestedName,
  suggestedCode,
  availableCompanies,
  selectedCompanyId,
  onSelectCompany,
  onCompanyCreated,
}: CompanyResolutionModalProps) {
  const [activeTab, setActiveTab] = React.useState<"select" | "create">("select");
  const [search, setSearch] = React.useState("");
  
  // Form fields for creating a new company
  const [newName, setNewName] = React.useState("");
  const [newCode, setNewCode] = React.useState("");
  const [newColor, setNewColor] = React.useState("#2563EB");
  const [creating, setCreating] = React.useState(false);

  // Initialize form defaults whenever modal opens or suggestion changes
  React.useEffect(() => {
    if (open) {
      const initialName = suggestedName || inferredBrand || supplierName || "";
      setNewName(initialName);
      const initialCode = (suggestedCode || inferredBrand || initialName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)).toUpperCase();
      setNewCode(initialCode);
      setSearch("");
      if (availableCompanies.length === 0) {
        setActiveTab("create");
      } else {
        setActiveTab("select");
      }
    }
  }, [open, suggestedName, suggestedCode, inferredBrand, supplierName, availableCompanies.length]);

  const filteredCompanies = React.useMemo(() => {
    if (!search.trim()) return availableCompanies;
    const q = search.toLowerCase();
    return availableCompanies.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.short_code && c.short_code.toLowerCase().includes(q))
    );
  }, [availableCompanies, search]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("Company name is required");
      return;
    }

    setCreating(true);
    const toastId = toast.loading("Registering and cataloging company...");
    try {
      const result = await createAndCatalogCompany({
        name: newName.trim(),
        short_code: newCode.trim().toUpperCase() || newName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase(),
        accent_hex: newColor
      });

      if (result.error || !result.company) {
        throw result.error || new Error("Failed to create company");
      }

      toast.success(`Cataloged "${result.company.name}" successfully!`, { id: toastId });
      onCompanyCreated(result.company);
      onSelectCompany(result.company);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error creating company", { id: toastId });
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (company: Company | null) => {
    onSelectCompany(company);
    onOpenChange(false);
    if (company) {
      toast.success(`Selected brand/company: ${company.name}`);
    } else {
      toast.info("Configured as Multi-Brand / General Inward");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md md:max-w-lg rounded-3xl p-6 bg-white shadow-2xl border-0">
        <DialogHeader className="text-left space-y-1.5 pb-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-bold uppercase tracking-tight text-zinc-900">
              Confirm Brand & Company
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-zinc-500">
            {supplierName ? `Invoice from "${supplierName}"` : "Assign this GRN to an active company or catalog a new brand."}
          </DialogDescription>
        </DialogHeader>

        {/* Suggestion banner if brand is inferred */}
        {(inferredBrand || suggestedName) && (
          <div className="bg-blue-50/80 border border-blue-100 rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block">AI Brand Suggestion</span>
                <p className="text-xs font-bold text-blue-900 truncate">
                  {suggestedName || inferredBrand} {suggestedCode ? `(${suggestedCode})` : ''}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="h-7 px-2.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg gap-1 shrink-0"
              onClick={() => {
                setNewName(suggestedName || inferredBrand || "");
                setNewCode(suggestedCode || inferredBrand || "");
                setActiveTab("create");
              }}
            >
              <Plus className="h-3 w-3" />
              Catalog Brand
            </Button>
          </div>
        )}

        {/* Tab switch */}
        <div className="flex bg-zinc-100 p-1 rounded-xl">
          <button
            type="button"
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === "select" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"}`}
            onClick={() => setActiveTab("select")}
          >
            Select Existing ({availableCompanies.length})
          </button>
          <button
            type="button"
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === "create" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"}`}
            onClick={() => setActiveTab("create")}
          >
            + Create & Catalog New
          </button>
        </div>

        {activeTab === "select" ? (
          <div className="space-y-3">
            <Input
              placeholder="Search existing companies / brands..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 rounded-xl bg-zinc-50 border-zinc-200 text-xs"
            />

            <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
              {filteredCompanies.map(comp => {
                const isSelected = comp.id === selectedCompanyId;
                return (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => handleSelect(comp)}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${isSelected ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500" : "border-zinc-100 bg-white hover:bg-zinc-50 hover:border-zinc-200"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div 
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0 shadow-xs"
                        style={{ backgroundColor: comp.accent_hex || '#3B82F6' }}
                      >
                        {comp.short_code ? comp.short_code.slice(0, 3) : comp.name.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">{comp.name}</p>
                        <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-tight">{comp.short_code || 'N/A'}</p>
                      </div>
                    </div>
                    {isSelected ? (
                      <Check className="h-4 w-4 text-blue-600 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
                    )}
                  </button>
                );
              })}

              {filteredCompanies.length === 0 && (
                <div className="p-6 text-center text-xs text-zinc-400 space-y-2">
                  <p>No company found matching "{search}"</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 rounded-lg"
                    onClick={() => {
                      setNewName(search);
                      setActiveTab("create");
                    }}
                  >
                    Create "{search}" as new brand
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateCompany} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Company / Brand Name <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="e.g. Cycle Pure Agarbattis, Everest Spices"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="h-10 rounded-xl bg-zinc-50 border-zinc-200 text-xs font-medium"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Short Code / SKU Prefix
                </Label>
                <Input
                  placeholder="e.g. CYCLE, EVEREST"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  className="h-10 rounded-xl bg-zinc-50 border-zinc-200 text-xs font-mono font-bold"
                  maxLength={10}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Brand Color
                </Label>
                <div className="flex items-center gap-1.5 pt-1">
                  {PRESET_COLORS.slice(0, 5).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`h-7 w-7 rounded-lg transition-transform ${newColor === c ? "scale-110 ring-2 ring-black" : "opacity-80 hover:opacity-100"}`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={creating || !newName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 rounded-xl gap-2 shadow-md shadow-blue-600/20"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Cataloging Company..." : "Save & Assign to GRN"}
            </Button>
          </form>
        )}

        <DialogFooter className="pt-2 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 h-8 px-2"
            onClick={() => handleSelect(null)}
          >
            Skip / Multi-Brand Invoice
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-[11px] font-semibold text-zinc-700 h-8 px-3 rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
