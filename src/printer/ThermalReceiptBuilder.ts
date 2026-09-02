import { ReceiptBuilder } from "./ReceiptBuilder";
import { InvoiceData } from "./InvoiceData.types";
import { fmtINR } from "../lib/format";

export class ThermalReceiptBuilder extends ReceiptBuilder {
  /**
   * Pads a string with spaces to reach a target length
   */
  private pad(str: string, length: number, align: 'left' | 'right' = 'left'): string {
    const s = String(str);
    if (s.length >= length) return s.substring(0, length);
    const spaces = ' '.repeat(length - s.length);
    return align === 'left' ? s + spaces : spaces + s;
  }

  buildInvoice(data: InvoiceData): Uint8Array {
    let bytes: number[] = [
      ...this.initialize(),
      ...this.setAlignment('center'),
      ...this.setBold(true),
      ...this.setSize(2, 2),
      ...this.text(data.businessName),
      ...this.setSize(1, 1),
      ...this.setBold(false),
      ...this.text(data.businessTagline || ""),
      ...this.divider(),
    ];

    const orderDateStr = data.orderDate || data.date;
    const deliveryDateStr = data.deliveryDate || "Pending";

    bytes = bytes.concat([
      ...this.setAlignment('left'),
      ...this.text(`Memo: ${data.memoNumber}`),
      ...this.text(`Order Date: ${orderDateStr}`),
      ...this.text(`Delivery Date: ${deliveryDateStr}`),
      ...this.text(`Order: ${data.orderNumber}`),
      ...this.divider(),
      ...this.setBold(true),
      ...this.text(`Bill To: ${data.billTo}`),
      ...this.setBold(false),
      ...this.divider(),
    ]);

    // Header for columns (assuming ~32 chars for 58mm, ~42 for 80mm)
    // We'll target 32 chars for safe compatibility
    // ITEM            QTY    AMOUNT
    bytes = bytes.concat([
      ...this.setBold(true),
      ...this.text(
        this.pad("ITEM", 14) + 
        this.pad("QTY", 6, 'right') + 
        this.pad("AMOUNT", 12, 'right')
      ),
      ...this.setBold(false),
      ...this.divider(),
    ]);

    // Items
    data.items.forEach(item => {
      // First line: Product Name
      bytes = bytes.concat(this.text(item.product));
      
      // Second line: Qty x Rate = Total
      const qtyStr = `${item.qty} ${item.unit}`;
      const rateStr = `@${item.rate.toFixed(2)}`;
      const totalStr = fmtINR(item.amount);
      
      bytes = bytes.concat([
        ...this.text(
          this.pad(`  ${qtyStr}`, 14) + 
          this.pad(rateStr, 6, 'right') + 
          this.pad(totalStr, 12, 'right')
        )
      ]);
    });

    bytes = bytes.concat([
      ...this.divider(),
      ...this.setAlignment('right'),
      ...this.text(`Subtotal: ${this.pad(fmtINR(data.subtotal), 12, 'right')}`),
      ...this.text(`GST Total: ${this.pad(fmtINR(data.gst), 12, 'right')}`),
    ]);

    if (data.discount) {
      bytes = bytes.concat([
        ...this.text(`Discount: -${this.pad(fmtINR(data.discount), 12, 'right')}`)
      ]);
    }

    bytes = bytes.concat([
      ...this.setBold(true),
      ...this.setSize(1, 2),
      ...this.text(`TOTAL: ${this.pad(fmtINR(data.total), 11, 'right')}`),
      ...this.setSize(1, 1),
      ...this.setBold(false),
      ...this.divider(),
      ...this.setAlignment('center'),
      ...this.text(data.footerNote || "Thank you!"),
      ...this.feed(4),
      ...this.cut()
    ]);

    return new Uint8Array(bytes);
  }
}
