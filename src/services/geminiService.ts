export interface ExtractedItem {
  sku_or_name: string;
  sku_code?: string;
  basepack_code?: string;
  external_code?: string;
  quantity: number;
  pack_type: "unit" | "packet" | "case" | "doz" | "kg" | "g" | "ml" | "ltr";
  cost_per_pack: number;
  batch_number?: string;
  packed_date?: string; // Packed date / PKM / Mfg date (e.g. "0226" -> "2026-02-28")
  expiry_date?: string; // Expiry date if present on invoice
  mrp?: number;
  gst_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  net_value?: number;
  tax_amount?: number;
  gross_value?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  category?: string;
  division?: string;
  hsn?: string;
  extracted_multipliers?: {
    units_per_packet?: number;
    packets_per_case?: number;
  };
}

export interface ExtractionResult {
  invoice_number?: string;
  invoice_batch_number?: string;
  batch_number?: string;
  supplier_name?: string;
  supplier_gstn?: string;
  invoice_date?: string;
  total_freight?: number;
  total_handling?: number;
  total_amount?: number;
  items?: ExtractedItem[];
  error?: string;
}

export interface ExtractedProduct {
  name: string;
  sku: string;
  mrp: number;
  gst_rate: number;
  category?: string;
  sub_category?: string;
  hsn?: string;
  item_pack_type?: string;
  units_per_packet?: number;
  packets_per_case?: number;
  opening_stock?: number;
  preferred_sell_unit?: "packet" | "pcs" | "case" | "kg" | "doz";
}

export interface ProductExtractionResult {
  products?: ExtractedProduct[];
  error?: string;
}

// ─── Shared JSON extraction schemas ───────────────────────────────────────────
const INVOICE_JSON_SCHEMA = `
Return JSON only:
{
  "invoice_number": string,
  "invoice_batch_number": string, // Top-level Batch or Lot number if specified for the invoice
  "supplier_name": string,
  "supplier_gstn": string, // 15-digit GSTIN format if visible (e.g. 22AAAAA0000A1Z5)
  "invoice_date": "YYYY-MM-DD",
  "total_freight": number, // Default strictly to 0 unless an explicit separate freight/transport ledger charge is written on the invoice
  "total_handling": number, // Default strictly to 0 unless an explicit separate handling/loading charge is written on the invoice
  "total_amount": number,
  "items": [
    {
      "sku_or_name": string, // Product name/description. Do NOT extract dummy lines or 'xxxxx'
      "sku_code": string, // SKU code or SKU7 Code if present on invoice
      "basepack_code": string, // Basepack code or Material code if present (e.g. 68472910)
      "quantity": number,
      "pack_type": "unit" | "packet" | "case" | "doz" | "kg" | "g" | "ml" | "ltr",
      "cost_per_pack": number, // Exact Rate column amount from the invoice for this pack. Do NOT add freight, handling or taxes into this rate.
      "mrp": number,
      "gst_rate": number, // Total GST % (e.g. 0, 5, 12, 18, 28). If CGST 2.5% and SGST 2.5%, set gst_rate to 5.
      "cgst_rate": number, // CGST % (e.g. 2.5)
      "sgst_rate": number, // SGST % (e.g. 2.5)
      "igst_rate": number, // IGST % (e.g. 5)
      "hsn": string,
      "category": string, // Auto-detected category (e.g. "Spices", "Blended Spice", "Personal Care", "Household Care", "Food Items", "Beverages", "Dairy", "Oil & Ghee", "Pulses & Dals", "Grains & Flours")
      "division": string, // Auto-detected division
      "batch_number": string, // Batch or lot number from invoice (e.g. 0AB6001800, 01A6014400)
      "packed_date": "YYYY-MM-DD", // Packed Date / PKM / Mfg Date from invoice. If given as PKM/MMYY (e.g. "0226" -> Feb 2026), format as "2026-02-28".
      "expiry_date": "YYYY-MM-DD", // Expiry date if explicitly given on invoice (or estimated from packed date).
      "extracted_multipliers": {
        "units_per_packet": number,
        "packets_per_case": number
      }
    }
  ]
}
Rules:
1. EXCLUDE NOISE & DUMMY ROWS:
   - Completely ignore placeholder rows like "xxxxx", "XXXXX", "---", "***", or blank lines.
   - Completely ignore summary rows, totals, subtotals, bank details, tax breakups, and terms/conditions.
2. Normalize "pack_type" to one of: unit, packet, case, doz, kg, g, ml, ltr.
3. EXACT INVOICE RATE PRESERVATION:
   - "cost_per_pack" must be the exact price/rate listed under the "Rate" column for that item (e.g. 85.00 for 85/doz, 930.00 for 930/doz, 375.00 for 375/doz).
   - Never add freight, transport, handling or packing charges into "cost_per_pack".
   - "total_freight" and "total_handling" must default to 0 unless the invoice has a distinct freight/handling line.
4. SKU & BASEPACK EXTRACTION:
   - If the invoice has columns like "Basepack Code", "Basepack", "Material Code", "Item Code", or "SKU7 Code" (e.g., Unilever, ITC, Nestle, Dabur bills), extract them into "basepack_code" and "sku_code".
   - Extract HSN numbers into "hsn" (e.g. 34011190, 33074100).
5. GST RATE CAPTURE:
   - Always extract GST rate. If invoice lists CGST % and SGST %, add them together for "gst_rate" (e.g., 2.5% + 2.5% = 5%; 9% + 9% = 18%). If IGST is present, set "gst_rate" to IGST %.
   - If GST is not available, not specified, or exempt on the purchase order, explicitly default "gst_rate": 0, "cgst_rate": 0, "sgst_rate": 0, "igst_rate": 0.
6. DOZEN / DOZ HANDLING (Incense Sticks / Agarbatti / Dhoop / FMCG):
   - If unit is DOZEN, DOZ, DZ, or DZN:
     - Set "pack_type": "doz".
     - Set "extracted_multipliers": { "units_per_packet": 12, "packets_per_case": 1 }.
     - "cost_per_pack" must be the rate per dozen as listed on the invoice (e.g., 85.00, 80.00, 97.00, 930.00, 375.00).
7. For Spice/Distribution Packaging (Unit -> Pack -> Case):
   - Example: "[500 g x 32 pouchs x 1 case]" -> base size 500g, 32 units per case. Set units_per_packet=1, packets_per_case=32, pack_type="case".
8. Extract supplier name, supplier GSTIN, invoice number, date, HSN, and GST rates.
9. Ensure all numerical values are numbers.`;

const PRODUCT_CATALOG_JSON_SCHEMA = `
Return JSON only:
{
  "products": [
    {
      "name": string, // Product description/name. Example: "LIFEBUOY SOAP 125G"
      "sku": string, // SKU or SKU7 Code or Basepack Code. Must be unique. Example: "BATW00A"
      "mrp": number, // Maximum Retail Price. If missing, look for MRP column or set to 0.
      "gst_rate": number, // GST percentage (e.g. 5, 12, 18, 28). If missing, look for CGST%+SGST% or CGST_rate+SGST_rate.
      "category": string, // Product category or division. Example: "Soap", "Household"
      "sub_category": string, // Subcategory if visible.
      "hsn": string, // HSN Code. Example: "34011190"
      "item_pack_type": string, // Item pack type. One of: packet, jar, bottle, bag, box, tin, can, kg, pcs
      "units_per_packet": number, // Units per packet (default 1)
      "packets_per_case": number, // Packets per case (default 1)
      "opening_stock": number, // Initial quantity (e.g. Inv Qty or Rcpt Qty). Default 0.
      "preferred_sell_unit": "packet" | "pcs" | "case" | "kg" // One of these.
    }
  ]
}
Rules for parsing complex sheets (like Hindustan Unilever/Lever):
1. Locate the main tabular data. In HUL sheets, it starts with columns like "Sr No", "Basepack Code", "SKU7 Code", "Product", "HSN CODE", "PKM", "BATCH", "MRP", "Unit Rate", "Inv Qty", "Rcpt Qty".
2. Ignore placeholder rows such as "xxxxx", "XXXXX", or blank cells.
3. Use "Product" or "Product Description" for the "name".
4. Use "SKU7 Code" or "Basepack Code" for the "sku". If both exist, prefer the "SKU7 Code" or "Basepack Code" as the SKU.
5. "gst_rate" can be derived by adding CGST % and SGST % (e.g., if CGST % is 2.5% and SGST % is 2.5%, gst_rate is 5).
6. "opening_stock" can be derived from "Rcpt Qty" or "Inv Qty".
7. Return only the array of products in the JSON object format specified above. Ensure all numerical values are numbers.`;

// ─── Helper to call secure Server-Side proxy ───────────────────────────────
async function callGeminiProxy(payload: { prompt: string; fileData?: string; mimeType?: string }): Promise<string> {
  const maxAttempts = 3;
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        if (contentType.includes("application/json")) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server error: ${response.status}`);
        } else {
          const textErr = await response.text().catch(() => "");
          throw new Error(`AI Service temporarily unavailable (${response.status}): ${textErr.slice(0, 150)}`);
        }
      }

      if (contentType.includes("application/json")) {
        const data = await response.json();
        return data.text || '';
      } else {
        const rawText = await response.text();
        return rawText || '';
      }
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Gemini Client Attempt ${attempt} failed:`, lastError.message);
      
      if (attempt === maxAttempts) {
        break;
      }
      
      await delay(attempt * 1000);
    }
  }

  throw lastError || new Error("Failed to contact Gemini proxy");
}

// ─── Extract from image / PDF (base64) ───────────────────────────────────────
export async function extractInvoiceFromMedia(
  fileData: string, // base64
  mimeType: string
): Promise<ExtractionResult> {
  const prompt = `Extract purchase invoice details from this image/PDF.\n${INVOICE_JSON_SCHEMA}`;
  try {
    const text = await callGeminiProxy({ prompt, fileData, mimeType });
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ExtractionResult;
  } catch (error) {
    console.error("Gemini Media Extraction Error:", error);
    return { error: error instanceof Error ? error.message : "AI extraction failed" };
  }
}

// ─── Local Fallback Parser for CSV/TSV/Text ────────────────────────────────────
function fallbackParseCSV(csvData: string): ExtractionResult {
  const lines = csvData.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { items: [] };

  const items: ExtractedItem[] = [];
  let headerFound = false;
  let nameIdx = 0;
  let qtyIdx = 1;
  let rateIdx = 2;
  let unitIdx = -1;
  let mrpIdx = -1;
  let hsnIdx = -1;
  let gstIdx = -1;
  let cgstIdx = -1;
  let sgstIdx = -1;
  let basepackIdx = -1;
  let skuIdx = -1;
  let batchIdx = -1;

  for (const line of lines) {
    const cols = line.split(/,|\t|;/).map(c => c.replace(/^["']|["']$/g, "").trim());
    if (cols.length < 2) continue;

    if (!headerFound) {
      const lowerCols = cols.map(c => c.toLowerCase());
      const hasHeaderKeywords = lowerCols.some(c => 
        c.includes("product") || c.includes("item") || c.includes("desc") || c.includes("rate") || c.includes("qty")
      );
      if (hasHeaderKeywords) {
        headerFound = true;
        nameIdx = lowerCols.findIndex(c => c.includes("product") || c.includes("item") || c.includes("desc") || c.includes("particular") || c.includes("name"));
        qtyIdx = lowerCols.findIndex(c => c.includes("qty") || c.includes("quantity") || c.includes("units"));
        rateIdx = lowerCols.findIndex(c => c.includes("rate") || c.includes("price") || c.includes("cost"));
        unitIdx = lowerCols.findIndex(c => c.includes("unit") || c.includes("uom") || c.includes("pack"));
        mrpIdx = lowerCols.findIndex(c => c.includes("mrp"));
        hsnIdx = lowerCols.findIndex(c => c.includes("hsn"));
        gstIdx = lowerCols.findIndex(c => c.includes("gst") || c.includes("tax"));
        cgstIdx = lowerCols.findIndex(c => c.includes("cgst"));
        sgstIdx = lowerCols.findIndex(c => c.includes("sgst"));
        basepackIdx = lowerCols.findIndex(c => c.includes("basepack") || c.includes("base pack"));
        skuIdx = lowerCols.findIndex(c => c.includes("sku7") || c.includes("sku code") || c.includes("item code"));
        batchIdx = lowerCols.findIndex(c => c.includes("batch") || c.includes("lot"));
        
        if (nameIdx === -1) nameIdx = 0;
        if (qtyIdx === -1) qtyIdx = 1;
        if (rateIdx === -1) rateIdx = 2;
        continue;
      }
    }

    if (cols.length >= 2) {
      const name = cols[nameIdx] || cols[0];
      if (!name || name.toLowerCase().includes("total") || name.toLowerCase().includes("subtotal")) continue;

      // Noise / dummy check
      const alphaChars = name.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (alphaChars.length > 0 && /^[x]+$/.test(alphaChars)) continue;

      const rawQty = (cols[qtyIdx] || "").replace(/[^\d.]/g, "");
      const rawRate = (cols[rateIdx] || "").replace(/[^\d.]/g, "");
      const rawUnit = unitIdx !== -1 && cols[unitIdx] ? cols[unitIdx].toLowerCase() : "";

      const qty = parseFloat(rawQty) || 1;
      const rate = parseFloat(rawRate) || 0;

      const isDozen = rawUnit.includes("doz") || rawUnit.includes("dz") || name.toLowerCase().includes("doz") || name.toLowerCase().includes("12 pcs");
      const isKg = rawUnit.includes("kg") || name.toLowerCase().includes("kg");

      const packType: ExtractedItem["pack_type"] = isDozen ? "doz" : isKg ? "kg" : "unit";

      const cgstVal = cgstIdx !== -1 && cols[cgstIdx] ? parseFloat(cols[cgstIdx].replace(/[^\d.]/g, "")) || 0 : 0;
      const sgstVal = sgstIdx !== -1 && cols[sgstIdx] ? parseFloat(cols[sgstIdx].replace(/[^\d.]/g, "")) || 0 : 0;
      const igstVal = igstIdx !== -1 && cols[igstIdx] ? parseFloat(cols[igstIdx].replace(/[^\d.]/g, "")) || 0 : 0;
      let gstVal = gstIdx !== -1 && cols[gstIdx] ? parseFloat(cols[gstIdx].replace(/[^\d.]/g, "")) || 0 : 0;
      
      // Rule: GST = CGST + SGST + IGST where applicable
      if (cgstVal > 0 && sgstVal > 0) {
        gstVal = cgstVal + sgstVal;
      } else if (cgstVal > 0 && sgstVal === 0 && igstVal === 0) {
        gstVal = cgstVal * 2;
      } else if (sgstVal > 0 && cgstVal === 0 && igstVal === 0) {
        gstVal = sgstVal * 2;
      } else if (igstVal > 0 && cgstVal === 0 && sgstVal === 0) {
        gstVal = igstVal;
      }

      const netValue = qty * rate;
      const taxAmount = netValue * (gstVal / 100);
      const grossValue = netValue + taxAmount;

      items.push({
        sku_or_name: name,
        sku_code: skuIdx !== -1 && cols[skuIdx] ? cols[skuIdx] : undefined,
        basepack_code: basepackIdx !== -1 && cols[basepackIdx] ? cols[basepackIdx] : undefined,
        quantity: qty,
        pack_type: packType,
        cost_per_pack: rate,
        batch_number: batchIdx !== -1 && cols[batchIdx] ? cols[batchIdx].trim() : undefined,
        mrp: mrpIdx !== -1 && cols[mrpIdx] ? parseFloat(cols[mrpIdx].replace(/[^\d.]/g, "")) || 0 : 0,
        gst_rate: gstVal > 0 ? gstVal : undefined,
        cgst_rate: cgstVal > 0 ? cgstVal : (gstVal > 0 ? gstVal / 2 : undefined),
        sgst_rate: sgstVal > 0 ? sgstVal : (gstVal > 0 ? gstVal / 2 : undefined),
        igst_rate: igstVal > 0 ? igstVal : undefined,
        net_value: Number(netValue.toFixed(2)),
        tax_amount: Number(taxAmount.toFixed(2)),
        gross_value: Number(grossValue.toFixed(2)),
        hsn: hsnIdx !== -1 && cols[hsnIdx] ? cols[hsnIdx] : undefined,
        extracted_multipliers: isDozen ? { units_per_packet: 12, packets_per_case: 1 } : undefined
      });
    }
  }

  return { items };
}

// ─── Extract from CSV text ────────────────────────────────────────────────────
export async function extractInvoiceFromCSV(csvData: string): Promise<ExtractionResult> {
  const prompt = `Analyze this CSV data from a purchase invoice and extract details.\n${INVOICE_JSON_SCHEMA}\n\n${csvData}`;
  try {
    const text = await callGeminiProxy({ prompt });
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ExtractionResult;
  } catch (error) {
    console.error("Gemini CSV Error (Attempting fallback parsing):", error);
    const fallback = fallbackParseCSV(csvData);
    if (fallback.items && fallback.items.length > 0) {
      return fallback;
    }
    return { error: error instanceof Error ? error.message : "AI CSV parsing failed" };
  }
}

// ─── Extract from plain text ──────────────────────────────────────────────────
export async function extractInvoiceFromText(text: string): Promise<ExtractionResult> {
  const prompt = `Analyze this purchase invoice text and extract details.\n${INVOICE_JSON_SCHEMA}\n\n${text}`;
  try {
    const raw = await callGeminiProxy({ prompt });
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ExtractionResult;
  } catch (error) {
    console.error("Gemini Text Error (Attempting fallback parsing):", error);
    const fallback = fallbackParseCSV(text);
    if (fallback.items && fallback.items.length > 0) {
      return fallback;
    }
    return { error: error instanceof Error ? error.message : "AI text extraction failed" };
  }
}

// ─── Extract Products for Catalog ─────────────────────────────────────────────
export async function extractProductsFromCSV(csvData: string): Promise<ProductExtractionResult> {
  const prompt = `Analyze this CSV/Excel data and extract the products for master catalog import.\n${PRODUCT_CATALOG_JSON_SCHEMA}\n\n${csvData}`;
  try {
    const text = await callGeminiProxy({ prompt });
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ProductExtractionResult;
  } catch (error) {
    console.error("Gemini Product CSV Error:", error);
    return { error: error instanceof Error ? error.message : "AI product extraction failed" };
  }
}

export async function extractProductsFromText(text: string): Promise<ProductExtractionResult> {
  const prompt = `Analyze this plain text or pasted Excel rows and extract the products for master catalog import.\n${PRODUCT_CATALOG_JSON_SCHEMA}\n\n${text}`;
  try {
    const raw = await callGeminiProxy({ prompt });
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ProductExtractionResult;
  } catch (error) {
    console.error("Gemini Product Text Error:", error);
    return { error: error instanceof Error ? error.message : "AI product extraction failed" };
  }
}

export async function extractProductsFromMedia(fileData: string, mimeType: string): Promise<ProductExtractionResult> {
  const prompt = `Extract products for master catalog import from this image or document.\n${PRODUCT_CATALOG_JSON_SCHEMA}`;
  try {
    const text = await callGeminiProxy({ prompt, fileData, mimeType });
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ProductExtractionResult;
  } catch (error) {
    console.error("Gemini Product Media Error:", error);
    return { error: error instanceof Error ? error.message : "AI product extraction failed" };
  }
}

// ─── Engagement tip ───────────────────────────────────────────────────────────
export async function getEngagementTip(): Promise<string> {
  const prompt =
    "Give a very short, one-sentence business tip for Tatvisha Enterprises, an FMCG distributor, to improve dealer engagement or sales today.";
  try {
    return await callGeminiProxy({ prompt });
  } catch (error) {
    console.error("Gemini Tip Error:", error);
    return "Review credit limits for high-volume customers ahead of the upcoming festival season.";
  }
}

// ─── AI Coach chat ────────────────────────────────────────────────────────────
export async function getAICoachResponse(
  userMessage: string,
  context: string
): Promise<string> {
  const prompt = `You are an AI business coach for Tatvisha Enterprises, a multi-category FMCG distribution company.
Context: ${context}
User question: ${userMessage}
Give a concise, practical answer in 2-3 sentences.`;
  try {
    return await callGeminiProxy({ prompt });
  } catch (error) {
    console.error("Gemini Coach Error:", error);
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
}
