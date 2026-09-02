import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDateTime } from "./format";

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  cases: number;
  packets: number;
  units: number;
  weight: string;
}

export async function downloadInventoryPDF(data: InventoryItem[]) {
  const doc = new jsPDF();
  const now = new Date();

  // Header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("INVENTORY STATUS REPORT", 105, 20, { align: "center" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated on: ${fmtDateTime(now.toISOString())}`, 105, 28, { align: "center" });

  // Table
  autoTable(doc, {
    startY: 40,
    head: [['SKU', 'Product Name', 'Cases', 'Packets', 'Units', 'Total Weight']],
    body: data.map(item => [
      item.sku,
      item.name,
      item.cases.toString(),
      item.packets.toString(),
      item.units.toString(),
      item.weight
    ]),
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 9,
      halign: 'center'
    },
    columnStyles: {
      1: { halign: 'left', cellWidth: 60 }, // Name column
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    margin: { top: 40 }
  });

  // Footer
  const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount} — Tatvisha Enterprises Inventory Control`,
      105,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }

  doc.save(`Inventory_Report_${now.toISOString().split('T')[0]}.pdf`);
}
