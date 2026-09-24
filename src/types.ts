export type AppRole = "owner" | "admin" | "salesperson";

export const PACK_TYPES = ["pcs", "packet", "case", "doz", "kg", "ltr"] as const;
export type NewOrderPackType = (typeof PACK_TYPES)[number];

export type OrderStatus = "draft" | "pending_approval" | "approved" | "rejected" | "dispatched" | "delivered" | "cancelled";

export type Line = {
  product_id: string;
  name: string;
  sku: string;
  company_id?: string | null;
  company_name?: string | null;
  company_short_code?: string | null;
  company_accent_hex?: string | null;
  brand?: string | null;
  mrp: number;
  unit_price: number;
  gst_rate: number;
  cgst_rate?: number | null;
  sgst_rate?: number | null;
  igst_rate?: number | null;
  quantity: number;
  stock: number;
  packType: NewOrderPackType;
  item_pack_type?: string | null;
  division_category?: string | null;
  pack_size_value?: number | null;
  pack_size_unit?: string | null;
  case_qty_unit?: string | null;
  case_qty_value?: number | null;
  avg_landed_cost?: number;
  units_per_packet?: number;
  packets_per_case?: number;
  units_per_case?: number;
  unit_type?: "pcs" | "packet" | "kg_g" | null;
  weight_per_unit_grams?: number | null;
  display_weight_unit?: string | null;
  priceSource?: string;
  isLowMargin?: boolean;
  batch_id?: string;
  batch_number?: string;
  is_fifo?: boolean;
  isNew?: boolean;
  isModified?: boolean;
  isRemoved?: boolean;
};

export type PriceTierMap = Record<string, Record<string, Partial<Record<NewOrderPackType, number>>>>;
export type PriceOverrideMap = Record<string, Record<string, Partial<Record<NewOrderPackType, number>>>>;

export type ProductAlias = {
  id: string;
  raw_name: string;
  product_id: string;
  supplier_name: string | null;
  external_code: string | null;
  code_type: string | null;
  company_id: string | null;
  hsn: string | null;
  confidence: number;
  use_count: number;
  created_at: string;
  company?: Company | null;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  mrp: number;
  gst_rate: number;
  cgst_rate?: number | null;
  sgst_rate?: number | null;
  igst_rate?: number | null;
  hsn: string | null;
  min_stock: number;
  is_active: boolean;
  brand: string | null;
  division: string | null;
  division_category: string;
  sub_category: string | null;
  item_pack_type: string | null;
  pack_size_value: number | null;
  pack_size_unit: string | null;
  base_unit: string | null;
  unit: string | null;
  units_per_packet: number;
  packets_per_case: number;
  units_per_case: number;
  case_qty_value: number | null;
  case_qty_unit: string | null;
  unit_type: "pcs" | "packet" | "kg_g";
  weight_per_unit_grams: number | null;
  display_weight_unit: "g" | "kg" | "ml" | "ltr" | null;
  preferred_sell_unit: "packet" | "unit" | "case" | "kg" | "g" | "ml" | "l";
  is_mrp_priced: boolean;
  is_chain_item: boolean;
  chain_mrp_label: string | null;
  case_type: string | null;
  base_weight_unit: string | null;
  target_margin_basic: number | null;
  target_margin_premium: number | null;
  target_margin_gold: number | null;
  target_margin_silver: number | null;
  target_margin_bronze: number | null;
  description: string | null;
  image_url: string | null;
  batch_number: string | null;
  inventory?: { stock_base_units: number; avg_landed_cost?: number } | null;
  company_id: string | null;
  company?: Company | null;
  aliases?: ProductAlias[];
  created_at: string;
  updated_at: string;
};

export type PurchaseInvoice = {
  id: string;
  invoice_number: string;
  supplier_name: string;
  company_id?: string | null;
  invoice_date: string;
  total_amount: number;
  total_freight: number;
  total_handling: number;
  status: 'pending' | 'approved' | 'posted' | 'reversed';
  created_at: string;
  company?: Company | null;
  items?: PurchaseInvoiceItem[];
};

export type PurchaseInvoiceItem = {
  id: string;
  purchase_invoice_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  pack_type?: string | null;
  units_per_packet?: number | null;
  packets_per_case?: number | null;
  external_code?: string | null;
  hsn?: string | null;
  created_at: string;
  product?: Product | null;
};

// --- NEW: Company ---
export type Company = {
  id: string;
  name: string;
  short_code: string;
  accent_hex: string;
  logo_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  product_count?: number;
  in_stock_count?: number;
  total_stock_units?: number;
  active_schemes_count?: number;
};

// --- NEW: Scheme ---
export type SchemeType = 'buy_x_get_y' | 'discount_pct' | 'discount_flat';

export type Scheme = {
  id: string;
  name: string;
  company_id: string | null;
  scheme_type: SchemeType;
  product_id: string | null;
  category: string | null;
  buy_qty: number | null;
  get_qty: number | null;
  discount_value: number | null;
  min_order_value: number | null;
  min_order_qty: number | null;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  company?: Company | null;
  product?: Pick<Product, 'id' | 'name' | 'sku'> | null;
};

export type Shop = {
  id: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  credit_limit: number;
  is_active: boolean;
  shop_type: "premium" | "gold" | "silver" | "bronze" | "basic";
  discount_pct: number;
};

export type Batch = {
  id: string;
  product_id: string;
  warehouse_id: string | null;
  batch_number: string;
  expiry_date: string;
  mfg_date?: string | null;
  received_qty: number;
  remaining_qty: number;
  cost_price: number;
  landed_cost: number;
  created_at: string;
  warehouse?: { name: string; code?: string } | null;
};

export type StockAudit = {
  id: string;
  warehouse_id: string;
  status: 'pending' | 'approved' | 'cancelled';
  notes: string | null;
  auditor_id: string;
  started_at: string;
  completed_at: string | null;
  warehouses?: Warehouse;
};

export type StockAuditItem = {
  id: string;
  audit_id: string;
  product_id: string;
  expected_qty: number;
  actual_qty: number;
  reconciliation_qty: number;
  notes: string | null;
  product?: Product;
  batch?: Batch;
};

export type Warehouse = {
  id: string;
  name: string;
  code: string | null;
  address?: string | null;
  location?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WarehouseTransfer = {
  id: string;
  product_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  batch_id: string;
  quantity: number;
  status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  products?: Product | null;
  from_warehouse?: Warehouse | null;
  to_warehouse?: Warehouse | null;
  batch?: Batch | null;
};
