import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, fmtINR } from "./format";
import { resolveDisplayUnit } from "./unitLabel";
import { Database } from "@/integrations/supabase/types";
import { COMPANY_NAME, COMPANY_TAGLINE } from "@/lib/config";
import { resolveCompanyInfo, getCanonicalCompanyKey, resolveEffectiveGstRate } from "./company-helpers";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Shop = Database["public"]["Tables"]["shops"]["Row"];

interface InvoiceItem {
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  line_total: number;
  company_name?: string;
  company_short_code?: string;
  brand?: string;
}

interface InvoiceData {
  invoice: Invoice; 
  order: { order_number: string; order_date?: string | null; delivered_at?: string | null; created_at?: string | null };
  shop: Shop;
  items: InvoiceItem[];
  format?: 'A4' | '80mm';
}

export async function generateInvoicePDF({ invoice, order, shop, items, format = 'A4' }: InvoiceData): Promise<jsPDF> {
  const isThermal = format === '80mm';
  
  // 80mm = ~226 pts (72 dpi) or ~3.15 inches
  const doc = isThermal 
    ? new jsPDF({ unit: 'mm', format: [80, 250] }) // 80mm wide, 250mm tall (standard receipt length)
    : new jsPDF();

  const title = invoice.type === "gst" ? "TAX INVOICE" : "CASH MEMO";
  const margin = isThermal ? 5 : 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  
  const orderDateFormatted = fmtDate(order.order_date || order.created_at || invoice.created_at);
  const deliveryDateFormatted = order.delivered_at ? fmtDate(order.delivered_at) : "Pending";

  // Header
  if (isThermal) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(COMPANY_NAME, pageWidth / 2, 12, { align: "center" });
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(COMPANY_TAGLINE, pageWidth / 2, 17, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, pageWidth / 2, 24, { align: "center" });
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`Memo: ${invoice.invoice_number}`, margin, 30);
    doc.text(`Order Date: ${orderDateFormatted}`, margin, 34);
    doc.text(`Delivery Date: ${deliveryDateFormatted}`, margin, 38);
    doc.text(`Order Ref: ${order.order_number}`, margin, 42);
  } else {
    doc.setFontSize(20);
    doc.setTextColor(44, 62, 80);
    doc.setFont("helvetica", "bold");
    doc.text(COMPANY_NAME, 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(127, 140, 141);
    doc.setFont("helvetica", "normal");
    doc.text(COMPANY_TAGLINE, 14, 28);
    
    doc.setFontSize(14);
    doc.setTextColor(44, 62, 80);
    doc.setFont("helvetica", "bold");
    doc.text(title, 140, 22);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Invoice No: ${invoice.invoice_number}`, 140, 28);
    doc.text(`Order Date: ${orderDateFormatted}`, 140, 33);
    doc.text(`Delivery Date: ${deliveryDateFormatted}`, 140, 38);
    doc.text(`Order Ref: #${order.order_number}`, 140, 43);
  }

  // Divider
  doc.setDrawColor(200, 200, 200);
  const startY = isThermal ? 45 : 48;
  doc.line(margin, startY, pageWidth - margin, startY);

  // Shop Details
  const currentY = startY + (isThermal ? 6 : 10);
  doc.setFontSize(isThermal ? 8 : 10);
  doc.setTextColor(52, 73, 94);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO:", margin, currentY);
  
  doc.setFont("helvetica", "normal");
  doc.setTextColor(44, 62, 80);
  doc.text(shop.name, margin, currentY + (isThermal ? 4 : 6));
  
  let shopY = currentY + (isThermal ? 4 : 6);
  doc.setFontSize(isThermal ? 7 : 9);
  doc.setTextColor(127, 140, 141);
  
  if (shop.address) {
    shopY += (isThermal ? 4 : 5);
    const splitAddress = doc.splitTextToSize(shop.address, isThermal ? 70 : 80);
    doc.text(splitAddress, margin, shopY);
    shopY += (splitAddress.length * (isThermal ? 3 : 4));
  }
  
  if (shop.phone) {
    shopY += (isThermal ? 3 : 4);
    doc.text(`Phone: ${shop.phone}`, margin, shopY);
  }
  
  if (shop.gstin) {
    shopY += (isThermal ? 4 : 5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text(`GSTIN: ${shop.gstin}`, margin, shopY);
  }

  // Resolve company tags and effective GST for each line
  const itemsWithCompany = items.map(item => {
    const comp = resolveCompanyInfo({
      company_name: item.company_name,
      company_short_code: item.company_short_code,
      brand: item.brand,
      sku: item.sku,
      name: item.name
    });
    const effGstRate = resolveEffectiveGstRate({
      gst_rate: item.gst_rate,
      sku: item.sku,
      name: item.name
    });
    return { ...item, comp, gst_rate: effGstRate };
  });

  const distinctCompanies = Array.from(new Set(itemsWithCompany.map(i => getCanonicalCompanyKey(i.comp))));
  const hasMultipleCompanies = distinctCompanies.length > 1;

  // Items Table
  const tableData = itemsWithCompany.map((item, idx) => {
    const compTag = hasMultipleCompanies ? `[${item.comp.short_code}] ` : "";
    const productName = `${compTag}${item.name}`;

    const lineExclusive = Number(item.unit_price) * Number(item.quantity);
    const lineTotalWithTax = lineExclusive * (1 + item.gst_rate / 100);

    if (isThermal) {
      // For thermal, combine Qty and Unit to save space and align better
      const unit = (item.unit || "Unit").toLowerCase();
      let unitShort = "U";
      if (unit.includes("doz") || unit.includes("dz") || unit.includes("dozen")) unitShort = "Dz";
      else if (unit.includes("piece") || unit.includes("pcs") || unit.includes("pc")) unitShort = "Pc";
      else if (unit.includes("packet") || unit.includes("pkt") || unit.includes("pag")) unitShort = "Pk";
      else if (unit.includes("case") || unit.includes("box") || unit.includes("ocs") || unit.includes("ctn")) unitShort = "Cs";
      else if (unit.includes("kg")) unitShort = "Kg";
      else if (unit.includes("bag")) unitShort = "Bg";
      else if (unit.includes("pouch")) unitShort = "Pch";
      else if (unit.includes("jar")) unitShort = "Jar";
      else if (unit.includes("bottle") || unit.includes("btl")) unitShort = "Btl";
      else if (unit.length > 2) unitShort = unit.substring(0, 2).charAt(0).toUpperCase() + unit.substring(1, 2);
      
      const qtyStr = `${item.quantity}${unitShort}`;
      return [
        productName,
        qtyStr,
        fmtINR(item.unit_price).replace("Rs. ", ""),
        fmtINR(lineTotalWithTax).replace("Rs. ", "")
      ];
    }
    return [
      idx + 1,
      productName,
      item.quantity,
      resolveDisplayUnit(item.unit),
      fmtINR(item.unit_price).replace("Rs. ", ""),
      `${item.gst_rate}%`,
      fmtINR(lineTotalWithTax).replace("Rs. ", "")
    ];
  });

  const tableHeader = isThermal 
    ? ["Item", "Qty", "Rate", "Total"]
    : ["#", "Product Description", "Qty", "Unit", "Rate", "GST", "Amount"];

  autoTable(doc, {
    startY: shopY + 6,
    margin: { left: margin, right: margin },
    head: [tableHeader],
    body: tableData,
    headStyles: { 
      fillColor: isThermal ? [255, 255, 255] : [44, 62, 80], 
      textColor: isThermal ? [0, 0, 0] : [255, 255, 255],
      fontSize: isThermal ? 8 : 9,
      fontStyle: 'bold'
    },
    bodyStyles: { 
      fontSize: isThermal ? 7 : 8,
      textColor: [44, 62, 80]
    },
    columnStyles: isThermal ? {
      0: { cellWidth: "auto" },
      1: { halign: "center", cellWidth: 15 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 18 },
    } : {
      0: { cellWidth: 10 },
      1: { cellWidth: "auto" },
      2: { halign: "center", cellWidth: 15 },
      3: { halign: "center", cellWidth: 20 },
      4: { halign: "right", cellWidth: 25 },
      5: { halign: "center", cellWidth: 15 },
      6: { halign: "right", cellWidth: 30 },
    },
    theme: isThermal ? "plain" : "striped"
  });

  // Totals
  let finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + (isThermal ? 6 : 10);
  const totalLabelX = pageWidth - (isThermal ? 45 : 70);
  const totalValueX = pageWidth - margin;

  doc.setFontSize(isThermal ? 8 : 10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(44, 62, 80);
  
  const invoiceWithLegacy = invoice as unknown as { sub_total?: number; tax_amount?: number; subtotal?: number; gst_total?: number };

  doc.text("Subtotal:", totalLabelX, finalY);
  const subTotalVal = invoiceWithLegacy.sub_total ?? invoiceWithLegacy.subtotal ?? 0;
  doc.text(fmtINR(Number(subTotalVal)).replace("Rs. ", "").trim(), totalValueX, finalY, { align: "right" });
  
  finalY += (isThermal ? 4 : 6);
  doc.text("GST:", totalLabelX, finalY);
  const taxAmountVal = invoiceWithLegacy.tax_amount ?? invoiceWithLegacy.gst_total ?? 0;
  doc.text(fmtINR(Number(taxAmountVal)).replace("Rs. ", "").trim(), totalValueX, finalY, { align: "right" });
  
  if (Number(invoice.discount_amount || 0) > 0) {
    finalY += (isThermal ? 4 : 6);
    doc.text("Discount:", totalLabelX, finalY);
    doc.text("-" + fmtINR(Number(invoice.discount_amount)).replace("Rs. ", "").trim(), totalValueX, finalY, { align: "right" });
  }

  finalY += (isThermal ? 6 : 8);
  doc.setFontSize(isThermal ? 10 : 12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", totalLabelX, finalY);
  // Important: Use fmtINR which now includes "Rs. " prefix
  doc.text(fmtINR(Number(invoice.total)).trim(), totalValueX, finalY, { align: "right" });

  // Company / Principal Audit Settlement Table for Multi-Company Orders (A4 mode)
  if (!isThermal && hasMultipleCompanies) {
    const compSummaryMap = new Map<string, { name: string; shortCode: string; count: number; subtotal: number; gst: number; total: number }>();
    
    itemsWithCompany.forEach(it => {
      const cKey = getCanonicalCompanyKey(it.comp);
      if (!compSummaryMap.has(cKey)) {
        compSummaryMap.set(cKey, {
          name: it.comp.name,
          shortCode: it.comp.short_code,
          count: 0,
          subtotal: 0,
          gst: 0,
          total: 0
        });
      }
      const grp = compSummaryMap.get(cKey)!;
      const itemSubtotal = Number(it.unit_price) * Number(it.quantity);
      const itemGst = itemSubtotal * (Number(it.gst_rate) / 100);
      grp.count += 1;
      grp.subtotal += itemSubtotal;
      grp.gst += itemGst;
      grp.total += (itemSubtotal + itemGst);
    });

    const auditTableBody = Array.from(compSummaryMap.values()).map(grp => [
      `[${grp.shortCode}] ${grp.name}`,
      grp.count,
      fmtINR(grp.subtotal).replace("Rs. ", ""),
      fmtINR(grp.gst).replace("Rs. ", ""),
      fmtINR(grp.total).replace("Rs. ", "")
    ]);

    finalY += 12;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text("AUDIT BREAKDOWN: PRINCIPAL COMPANY / BRAND SETTLEMENT", margin, finalY);

    autoTable(doc, {
      startY: finalY + 3,
      margin: { left: margin, right: margin },
      head: [["Company / Principal", "Items", "Taxable Value", "GST", "Net Total"]],
      body: auditTableBody,
      headStyles: {
        fillColor: [240, 243, 246],
        textColor: [44, 62, 80],
        fontSize: 8,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [70, 80, 95]
      },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "center", cellWidth: 20 },
        2: { halign: "right", cellWidth: 35 },
        3: { halign: "right", cellWidth: 30 },
        4: { halign: "right", cellWidth: 35 },
      },
      theme: "grid"
    });

    finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  // Statutory GST Slab Breakdown Table (A4 mode for Tax Invoices)
  if (!isThermal && (invoice.type === "gst" || taxAmountVal > 0)) {
    const gstMap = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; totalTax: number }>();
    itemsWithCompany.forEach(it => {
      const rate = Number(it.gst_rate) || 0;
      if (!gstMap.has(rate)) {
        gstMap.set(rate, { rate, taxable: 0, cgst: 0, sgst: 0, totalTax: 0 });
      }
      const grp = gstMap.get(rate)!;
      const taxable = Number(it.unit_price) * Number(it.quantity);
      const tax = taxable * (rate / 100);
      grp.taxable += taxable;
      grp.totalTax += tax;
      grp.cgst += tax / 2;
      grp.sgst += tax / 2;
    });

    const gstTableBody = Array.from(gstMap.values()).sort((a, b) => a.rate - b.rate).map(grp => [
      `GST ${grp.rate}%`,
      fmtINR(grp.taxable).replace("Rs. ", ""),
      `${grp.rate / 2}% (${fmtINR(grp.cgst).replace("Rs. ", "")})`,
      `${grp.rate / 2}% (${fmtINR(grp.sgst).replace("Rs. ", "")})`,
      fmtINR(grp.totalTax).replace("Rs. ", "")
    ]);

    finalY += 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(44, 62, 80);
    doc.text("GST TAX SUMMARY & STATUTORY BREAKDOWN", margin, finalY);

    autoTable(doc, {
      startY: finalY + 3,
      margin: { left: margin, right: margin },
      head: [["Tax Slab", "Taxable Value", "CGST", "SGST", "Total GST Tax"]],
      body: gstTableBody,
      headStyles: {
        fillColor: [240, 243, 246],
        textColor: [44, 62, 80],
        fontSize: 8,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [70, 80, 95]
      },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "right", cellWidth: 35 },
        2: { halign: "right", cellWidth: 35 },
        3: { halign: "right", cellWidth: 35 },
        4: { halign: "right", cellWidth: 35 },
      },
      theme: "grid"
    });

    finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  // Footer
  finalY += (isThermal ? 10 : 16);
  doc.setFontSize(isThermal ? 7 : 8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150, 150, 150);
  doc.text("This is a computer generated invoice.", pageWidth / 2, isThermal ? finalY : 285, { align: "center" });

  if (isThermal) {
    finalY += 4;
    doc.text("Thank you for your business!", pageWidth / 2, finalY, { align: "center" });
  }

  return doc;
}

export async function shareOrDownloadInvoice(data: InvoiceData) {
  const doc = await generateInvoicePDF(data);
  const { invoice, shop } = data;
  
  // Share or Download
  const pdfOutput = doc.output("blob");
  const url = URL.createObjectURL(pdfOutput);
  
  if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    try {
      const file = new File([pdfOutput], `Invoice_${invoice.invoice_number}.pdf`, { type: "application/pdf" });
      await navigator.share({
        files: [file],
        title: `Invoice ${invoice.invoice_number}`,
        text: `Invoice for ${shop.name}`
      });
    } catch (err) {
      window.open(url, "_blank");
    }
  } else {
    window.open(url, "_blank");
  }
}
