export interface InvoiceItem {
  srNo: number;
  product: string;
  variant: string;
  unit: string;
  sku: string;
  qty: number;
  rate: number;
  gst: string;
  amount: number;
}

export interface InvoiceData {
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  businessTagline?: string;
  memoNumber: string;
  date: string;
  orderDate?: string;
  deliveryDate?: string;
  orderNumber: string;
  billTo: string;
  items: InvoiceItem[];
  subtotal: number;
  gst: number;
  discount?: number;
  total: number;
  footerNote?: string;
}
