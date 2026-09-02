export const fmtINR = (n: number | string | null | undefined) => {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? 0));
  if (isNaN(v) || !isFinite(v)) return "Rs.\u00A00.00";
  const absV = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat("en-IN", { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(absV);
  return `${sign}Rs.\u00A0${formatted}`;
};

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
};

export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export const fmtCompactINR = (n: number | string | null | undefined) => {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? 0));
  if (isNaN(v) || !isFinite(v)) return "Rs.\u00A00";
  const absV = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  
  let formatted = "";
  if (absV >= 10000000) formatted = `${(absV / 10000000).toFixed(1)}Cr`;
  else if (absV >= 100000) formatted = `${(absV / 100000).toFixed(1)}L`;
  else if (absV >= 1000) formatted = `${(absV / 1000).toFixed(1)}K`;
  else formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(absV);
  
  return `${sign}Rs.\u00A0${formatted}`;
};

export const statusLabel: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const statusColor: Record<string, string> = {
  draft: "bg-slate-200 text-slate-700",
  pending_approval: "bg-orange-500 text-white",
  approved: "bg-blue-600 text-white",
  rejected: "bg-red-600 text-white",
  dispatched: "bg-violet-600 text-white",
  delivered: "bg-emerald-600 text-white",
  cancelled: "bg-slate-500 text-white",
};

export const payStatusLabel: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  void: "Cancelled",
};

export const payStatusColor: Record<string, string> = {
  unpaid: "bg-destructive/10 text-destructive border border-destructive/20",
  partial: "bg-status-pending/15 text-status-pending border border-status-pending/30",
  paid: "bg-status-delivered/15 text-status-delivered border border-status-delivered/30",
  void: "bg-muted text-muted-foreground",
};

export const CATEGORY_LABELS: Record<string, string> = {
  // Canonical FMCG Categories
  "HOUSEHOLD CARE": "Household Care",
  "HOUSEHOLD_CARE": "Household Care",
  "HOUSEHOLD": "Household Care",
  "FABRIC CARE": "Household Care",
  "FABRIC_CARE": "Household Care",
  "SOAPS & DETERGENTS": "Household Care",
  "SOAPS AND DETERGENTS": "Household Care",
  "PERSONAL CARE": "Personal Care",
  "PERSONAL_CARE": "Personal Care",
  "FOOD ITEMS": "Food Items",
  "FOOD_ITEMS": "Food Items",
  "BEVERAGES": "Beverages",
  "SPICES": "Spices",
  "SPICES & MASALA": "Spices & Masala",
  "BLENDED SPICE": "Blended Spice",
  "BLENDED SPICES": "Blended Spice",
  "INCENSE & DHOOP": "Incense & Dhoop",
  "PUJA SAMAGRI": "Incense & Dhoop",
  "DAIRY": "Dairy",
  "SNACKS": "Snacks & Foods",
  "SNACKS & FOODS": "Snacks & Foods",
  "OIL & GHEE": "Oil & Ghee",
  "DRY FRUITS": "Dry Fruits",
  "PULSES": "Pulses & Dals",
  "PULSES & DALS": "Pulses & Dals",
  "FLOUR & GRAINS": "Grains & Flours",
  "GRAINS & FLOURS": "Grains & Flours",
  "SAUCES & CONDIMENTS": "Sauces & Condiments",
  "PACKAGING MATERIAL": "Packaging Material",
  "CHAIN": "Chain Items",
  "OTHER": "Other",
  // Legacy spice keys — kept for backward compatibility
  "BASIC SPICES": "Basic Spices",
  "WHOLE SPICES": "Whole Spices",
  "PROCESS ITEMS": "Processed Spices",
};

export function formatDivisionCategory(value?: string | null) {
  if (!value) return "Other";
  const cleaned = value.trim().replace(/[_-]+/g, ' ');
  const normalized = cleaned.toUpperCase();
  if (CATEGORY_LABELS[normalized]) return CATEGORY_LABELS[normalized];
  
  // Custom mapping for cases where DB value might be different
  const mappings: Record<string, string> = {
    "BASIC": "Basic Spices",
    "BLENDED": "Blended Spices",
    "WHOLE": "Whole Spices",
    "PROCESS": "Processed Spices",
    "FOOD": "Food Items",
    "BEV": "Beverages",
    "SNACK": "Snacks & Foods",
    "PASTA": "Food Items",
    "HOUSEHOLD": "Household Care",
    "DETERGENT": "Household Care",
    "FABRIC": "Household Care",
  };
  
  if (mappings[normalized]) return mappings[normalized];

  // Title case fallback
  return cleaned.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

export const friendlyError = (err: unknown) => {
  if (!err) return "Unknown error occurred";
  if (typeof err === "string") return err;
  
  const error = err as { message?: string; details?: string; hint?: string };
  
  // Supabase/PostgREST error objects
  if (error.message && typeof error.message === "string") {
    const msg = error.message;
    if (msg.includes("JWT")) return "Your session has expired. Please log in again.";
    if (msg.includes("check_balance_limit")) return "Shop has exceeded its credit limit.";
    if (msg.includes("check_inventory_exists")) return "Insufficient inventory in warehouse.";
    if (msg.includes("foreign key constraint")) return "Operation failed: Related record does not exist.";
    if (msg.includes("permission denied")) return "You don't have permission to perform this action.";
    return msg;
  }
  
  if (error.details && typeof error.details === "string") return error.details;
  if (error.hint && typeof error.hint === "string") return error.hint;
  
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};
