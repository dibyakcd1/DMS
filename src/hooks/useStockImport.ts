import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { 
  type PackType, 
  type PricingProduct, 
  getPackMultiplier, 
  autoCalcAllTiers, 
  getAllocationInfo,
  getItemWeightKg,
  getTargetMargin,
  computeWacClient
} from "@/lib/pricing";
import { 
  extractInvoiceFromCSV, 
  extractInvoiceFromMedia, 
  extractInvoiceFromText,
  type ExtractedItem
} from "@/services/geminiService";
import { type Product, type Company } from "@/types";
import { recordCorrection } from "@/lib/supplierMappings";
import { resolveCompany } from "@/lib/companyResolver";
import { parseSpreadsheetMatrix, parseDateString, generateDefaultBatchNumber, type ParsedInvoiceItem } from "@/lib/invoiceFieldMapping";
import { inferTaxonomyCategory, inferTaxonomyDivision, computeTaxBreakdown } from "@/lib/taxonomy";
import { persistProductToSupabase } from "@/lib/productPersistence";
import { toDbPackType, resolveUnitProfile } from "@/lib/packaging";

export type StockItem = {
  id: string; 
  productId: string;
  name: string;
  sku: string;
  external_code?: string;
  code_type?: string;
  hsn?: string;
  company_id?: string;
  quantity: number; 
  unitCost: number; 
  batchNumber?: string;
  expiryDate: string;
  packedDate?: string; // MMYY
  packType: PackType;
  unitsPerPacket: number;
  packetsPerCase: number;
  pack_size_value?: number | null;
  pack_size_unit?: string | null;
  mrp?: number;
  unit_type?: "pcs" | "packet" | "kg_g" | null;
  freightTotal?: number;
  handlingTotal?: number;
  taxPct?: number;
  cgstPct?: number;
  sgstPct?: number;
  igstPct?: number;
  netValue?: number;
  taxAmount?: number;
  grossValue?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  allocatedFreight?: number;
  allocatedHandling?: number;
  landedCostPerPack?: number;
  landedCostPerUnit?: number;
  profitPerPack?: number;
  marginPct?: number;
};

export const parseMMYY = (raw: string): { mm: number; yyyy: number } | null => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 4) return null;
  const mm = Number(digits.slice(0, 2));
  const yy = Number(digits.slice(2, 4));
  if (!Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { mm, yyyy: 2000 + yy };
};

export const mmyyToIsoExpiryDate = (raw: string): string | null => {
  const p = parseMMYY(raw);
  if (!p) return null;
  const lastDay = new Date(p.yyyy, p.mm, 0).getDate();
  return `${p.yyyy}-${String(p.mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

export const addMonthsMMYY = (raw: string, months: number): string => {
  const p = parseMMYY(raw);
  if (!p) return raw;
  const date = new Date(p.yyyy, p.mm - 1, 1);
  date.setMonth(date.getMonth() + months);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return mm + yy;
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export type Warehouse = {
  id: string;
  name: string;
  code?: string | null;
  is_active?: boolean;
};

export function useStockImport(products: Product[]) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  
  const [items, setItems] = React.useState<StockItem[]>([]);
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [supplierName, setSupplierName] = React.useState("");
  const [supplierGstn, setSupplierGstn] = React.useState("");
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [invoiceDate, setInvoiceDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [defaultBatchNumber, setDefaultBatchNumber] = React.useState<string>("");
  const [totalFreight, setTotalFreight] = React.useState("0");
  const [totalHandling, setTotalHandling] = React.useState("0");
  const [globalPackedDate, setGlobalPackedDate] = React.useState("");
  const [warehouseId, setWarehouseId] = React.useState<string>("");
  const [availableWarehouses, setAvailableWarehouses] = React.useState<Warehouse[]>([]);

  const [parsing, setParsing] = React.useState(false);
  const [pendingItems, setPendingItems] = React.useState<ExtractedItem[]>([]);
  const [isBulkImportOpen, setIsBulkImportOpen] = React.useState(false);
  const [bulkStep, setBulkStep] = React.useState<1 | 2 | 3>(1);

  const [availableCompanies, setAvailableCompanies] = React.useState<Company[]>([]);
  const [companyPromptOpen, setCompanyPromptOpen] = React.useState(false);
  const [inferredBrand, setInferredBrand] = React.useState<string | null>(null);
  const [suggestedCompanyName, setSuggestedCompanyName] = React.useState<string | null>(null);
  const [suggestedCompanyCode, setSuggestedCompanyCode] = React.useState<string | null>(null);

  const fetchCompanies = React.useCallback(async () => {
    const { data } = await supabase.from("companies").select("*").eq("is_active", true).order("sort_order");
    if (data) setAvailableCompanies(data as Company[]);
  }, []);

  React.useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleCompanyCreated = React.useCallback((newComp: Company) => {
    setAvailableCompanies(prev => {
      if (prev.some(c => c.id === newComp.id)) return prev;
      return [...prev, newComp];
    });
    setCompanyId(newComp.id);
  }, []);

  React.useEffect(() => {
    const fetchWarehouses = async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, code, is_active")
        .order("name");
      
      if (!error && data && data.length > 0) {
        setAvailableWarehouses(data as Warehouse[]);
        const defaultWh = user?.warehouse_id || data[0].id;
        setWarehouseId(defaultWh);

        if (defaultWh) {
          (async () => {
            try {
              const { data: orphanBatches } = await supabase
                .from("inventory_batches")
                .select("id, product_id")
                .is("warehouse_id", null);

              if (orphanBatches && orphanBatches.length > 0) {
                const orphanIds = orphanBatches.map(b => b.id);
                await supabase
                  .from("inventory_batches")
                  .update({ warehouse_id: defaultWh })
                  .in("id", orphanIds);

                const prodIds = Array.from(new Set(orphanBatches.map(b => b.product_id)));
                for (const pid of prodIds) {
                  await supabase.rpc("recompute_inventory", { _product_id: pid }).catch(() => {});
                }
              }
            } catch (err) {
              console.warn("Orphan batch repair notice:", err);
            }
          })();
        }
      }
    };
    fetchWarehouses();
  }, [user?.warehouse_id]);

  // When supplier name changes, try to auto-resolve company
  const handleSupplierChange = React.useCallback((name: string, currentItems?: ExtractedItem[]) => {
    setSupplierName(name);
    if (name) {
      const match = resolveCompany(name, availableCompanies, currentItems || items);
      if (match.isHighConfidence && match.company) {
        setCompanyId(match.company.id);
      } else {
        setInferredBrand(match.suggestedCode || null);
        setSuggestedCompanyName(match.suggestedName || null);
        setSuggestedCompanyCode(match.suggestedCode || null);
      }
    }
  }, [availableCompanies, items]);

  const stats = React.useMemo(() => {
    let totalBaseUnits = 0;
    let totalInvoicedValue = 0;
    let totalTaxAmount = 0;
    let totalGrossValue = 0;
    let totalWeight = 0;
    let totalExpectedGrs = 0;
    let allLinesHaveWeight = items.length > 0;

    // First pass: totals & check if every line has weight data > 0
    items.forEach(item => {
      const p = products.find(px => px.id === item.productId);
      const pricingProd: PricingProduct = {
        id: item.productId,
        units_per_packet: item.unitsPerPacket,
        packets_per_case: item.packetsPerCase,
        mrp: p?.mrp,
        pack_size_value: p?.pack_size_value,
        pack_size_unit: p?.pack_size_unit
      };

      const multiplier = getPackMultiplier(pricingProd, item.packType);
      const units = (Number(item.quantity) || 0) * multiplier;
      totalBaseUnits += units;
      
      const lineNet = item.netValue !== undefined ? Number(item.netValue) : (Number(item.quantity) || 0) * (Number(item.unitCost) || 0);
      const effTaxPct = item.taxPct !== undefined ? Number(item.taxPct) : (p?.gst_rate || 0);
      const lineTax = item.taxAmount !== undefined ? Number(item.taxAmount) : (lineNet * (effTaxPct / 100));
      const lineGross = item.grossValue !== undefined ? Number(item.grossValue) : (lineNet + lineTax);

      totalInvoicedValue += lineNet;
      totalTaxAmount += lineTax;
      totalGrossValue += lineGross;

      const itemWeightKg = getItemWeightKg(units, p?.pack_size_value, p?.pack_size_unit);
      if (itemWeightKg <= 0 && units > 0) {
        allLinesHaveWeight = false;
      }
      totalWeight += itemWeightKg;
    });

    if (totalWeight <= 0) {
      allLinesHaveWeight = false;
    }

    // Second pass: profits with allocated costs
    let totalExpectedRevenue = 0;
    items.forEach(item => {
      const p = products.find(px => px.id === item.productId);
      const pricingProd: PricingProduct = {
        id: item.productId,
        units_per_packet: item.unitsPerPacket,
        packets_per_case: item.packetsPerCase,
        mrp: p?.mrp,
        pack_size_value: p?.pack_size_value,
        pack_size_unit: p?.pack_size_unit,
        target_margin_silver: p?.target_margin_silver ?? undefined,
        target_margin_basic: p?.target_margin_basic ?? undefined,
      };

      const multiplier = getPackMultiplier(pricingProd, item.packType);
      const lineQty = Number(item.quantity) || 0;
      const units = lineQty * multiplier;
      const itemWeightKg = getItemWeightKg(units, p?.pack_size_value, p?.pack_size_unit);

      const allocation = getAllocationInfo({
        itemQty: lineQty,
        itemUnitCost: Number(item.unitCost) || 0,
        itemBaseUnits: units,
        itemWeightKg: itemWeightKg,
        totalFreight: Number(totalFreight) || 0,
        totalHandling: Number(totalHandling) || 0,
        totalWeightKG: allLinesHaveWeight ? totalWeight : 0,
        totalInvoiceValue: totalInvoicedValue,
        manifestLineCount: items.length,
        allLinesHaveWeight
      });

      const freightForLine = item.freightTotal !== undefined ? item.freightTotal : allocation.freightAmount;
      const handlingForLine = item.handlingTotal !== undefined ? item.handlingTotal : allocation.handlingAmount;

      const invoicedCostPerPack = Number(item.unitCost) || 0;
      const landedPerPack = invoicedCostPerPack + (freightForLine / (lineQty || 1)) + (handlingForLine / (lineQty || 1));
      const lineLandedCost = landedPerPack * lineQty;

      // Realistic FMCG wholesale distribution margin (defaults to 7.0% silver tier or product target)
      const targetMarginPct = getTargetMargin(pricingProd, 'silver');
      const safeMarginPct = Math.max(3.0, Math.min(25.0, targetMarginPct));
      
      const expectedSellPerPack = invoicedCostPerPack > 0 
        ? landedPerPack / (1 - safeMarginPct / 100)
        : 0;
      const lineRevenue = expectedSellPerPack * lineQty;
      const lineGrossProfit = Math.max(0, lineRevenue - lineLandedCost);

      totalExpectedRevenue += lineRevenue;
      totalExpectedGrs += lineGrossProfit;
    });

    const totalLandedCost = totalInvoicedValue + (Number(totalFreight) || 0) + (Number(totalHandling) || 0);
    
    // Average Distributor Gross Margin % = ((Expected Revenue - Landed Cost) / Expected Revenue) * 100
    // Standard FMCG margin ranges cleanly from 5% to 15%
    let avgProfit = 0;
    if (totalExpectedRevenue > 0) {
      avgProfit = Number((((totalExpectedRevenue - totalLandedCost) / totalExpectedRevenue) * 100).toFixed(1));
    } else if (totalLandedCost > 0 && totalExpectedGrs > 0) {
      avgProfit = Number(((totalExpectedGrs / (totalLandedCost + totalExpectedGrs)) * 100).toFixed(1));
    }
    avgProfit = Math.max(0, Math.min(35, avgProfit));

    return {
      totalBaseUnits,
      totalInvoicedValue: Number(totalInvoicedValue.toFixed(2)),
      totalTaxAmount: Number(totalTaxAmount.toFixed(2)),
      totalGrossValue: Number(totalGrossValue.toFixed(2)),
      totalWeight,
      allLinesHaveWeight,
      totalExpectedGrs,
      avgProfit
    };
  }, [items, products, totalFreight, totalHandling]);

  const updateAllBatchNumber = (batch: string) => {
    setDefaultBatchNumber(batch);
    if (batch.trim()) {
      setItems(prev => prev.map(it => ({
        ...it,
        batchNumber: batch.trim()
      })));
      toast.success(`Updated batch to ${batch.trim()} across all items`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    const toastId = toast.loading(`Processing ${file.name}...`);
    
    try {
      let extractedItems: ExtractedItem[] = [];
      let detectedSupplier = "";
      let detectedGstn = "";
      let detectedInvoiceNo = "";
      let detectedDate = "";
      let detectedBatch = "";

      const fileName = file.name.toLowerCase();
      const isSpreadsheet = fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".csv");

      if (isSpreadsheet) {
        // Fast structured file parser with multi-row metadata & header detection
        const arrayBuffer = await file.arrayBuffer();
        let matrix: (string | number | null | undefined)[][] = [];

        if (fileName.endsWith(".csv")) {
          const text = new TextDecoder("utf-8").decode(arrayBuffer);
          const parsed = Papa.parse<(string | number)[]>(text, { header: false, skipEmptyLines: true });
          matrix = parsed.data;
        } else {
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          matrix = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(firstSheet, { header: 1 });
        }

        const matrixResult = parseSpreadsheetMatrix(matrix);

        if (matrixResult.items.length > 0) {
          extractedItems = matrixResult.items.map((it: ParsedInvoiceItem) => ({
            sku_or_name: it.sku_or_name,
            sku_code: it.sku_code,
            basepack_code: it.basepack_code,
            external_code: it.basepack_code || it.sku_code,
            hsn: it.hsn,
            category: it.category,
            division: it.division,
            mrp: it.mrp,
            gst_rate: it.gst_rate,
            cgst_rate: it.cgst_rate,
            sgst_rate: it.sgst_rate,
            igst_rate: it.igst_rate,
            quantity: it.quantity,
            pack_type: it.pack_type,
            cost_per_pack: it.cost_per_pack,
            batch_number: it.batch_number,
            packed_date: it.packed_date,
            expiry_date: it.expiry_date,
            extracted_multipliers: it.extracted_multipliers
          }));

          if (matrixResult.metadata.supplierName) detectedSupplier = matrixResult.metadata.supplierName;
          if (matrixResult.metadata.supplierGstn) detectedGstn = matrixResult.metadata.supplierGstn;
          if (matrixResult.metadata.invoiceNumber) detectedInvoiceNo = matrixResult.metadata.invoiceNumber;
          if (matrixResult.metadata.invoiceDate) detectedDate = matrixResult.metadata.invoiceDate;
          if (matrixResult.metadata.batchNumber) detectedBatch = matrixResult.metadata.batchNumber;
        } else {
          // Fallback to Gemini CSV parser if structured headers couldn't be detected
          const csvText = XLSX.utils.sheet_to_csv(XLSX.read(arrayBuffer, { type: "array" }).Sheets[0]);
          const result = await extractInvoiceFromCSV(csvText);
          if (result?.error && (!result.items || result.items.length === 0)) {
            throw new Error(result.error);
          }
          if (result?.items && result.items.length > 0) {
            extractedItems = result.items as ExtractedItem[];
            if (result.supplier_name) detectedSupplier = result.supplier_name;
            if (result.supplier_gstn) detectedGstn = result.supplier_gstn;
            if (result.invoice_number) detectedInvoiceNo = result.invoice_number;
            if (result.invoice_date) detectedDate = result.invoice_date;
            if (result.invoice_batch_number || result.batch_number) detectedBatch = result.invoice_batch_number || result.batch_number || "";
          }
        }
      } else if (file.type.startsWith("image/") || file.type === "application/pdf") {
        const base64 = await fileToBase64(file);
        const result = await extractInvoiceFromMedia(base64, file.type);
        if (result?.error && (!result.items || result.items.length === 0)) {
          throw new Error(result.error);
        }
        if (result?.items) {
          extractedItems = result.items as ExtractedItem[];
          if (result.supplier_name) detectedSupplier = result.supplier_name;
          if (result.supplier_gstn) detectedGstn = result.supplier_gstn;
          if (result.invoice_number) detectedInvoiceNo = result.invoice_number;
          if (result.invoice_date) detectedDate = result.invoice_date;
          if (result.invoice_batch_number || result.batch_number) detectedBatch = result.invoice_batch_number || result.batch_number || "";
        }
      }

      if (extractedItems.length > 0) {
        if (detectedSupplier && !supplierName) setSupplierName(detectedSupplier);
        if (detectedGstn && !supplierGstn) setSupplierGstn(detectedGstn);
        if (detectedInvoiceNo && !invoiceNumber) setInvoiceNumber(detectedInvoiceNo);
        if (detectedDate && !invoiceDate) setInvoiceDate(detectedDate);
        
        const fallbackBatch = detectedBatch || generateDefaultBatchNumber(detectedInvoiceNo || invoiceNumber, detectedDate || invoiceDate);
        if (detectedBatch || !defaultBatchNumber) {
          setDefaultBatchNumber(fallbackBatch);
        }

        // Ensure all extracted items have the fallback batch if missing
        extractedItems = extractedItems.map(it => ({
          ...it,
          batch_number: it.batch_number && it.batch_number.trim() ? it.batch_number.trim() : fallbackBatch
        }));

        // Brand & Company auto-resolution
        const finalSupplier = detectedSupplier || supplierName;
        const compResolution = resolveCompany(finalSupplier, availableCompanies, extractedItems);
        if (compResolution.isHighConfidence && compResolution.company) {
          setCompanyId(compResolution.company.id);
          toast.success(`Auto-detected brand/company: ${compResolution.company.name}`);
        } else {
          setInferredBrand(compResolution.suggestedCode || null);
          setSuggestedCompanyName(compResolution.suggestedName || null);
          setSuggestedCompanyCode(compResolution.suggestedCode || null);
          setCompanyPromptOpen(true);
        }

        setPendingItems(extractedItems);
        setBulkStep(2);
        setIsBulkImportOpen(true);
        toast.success(`Extracted ${extractedItems.length} valid product lines`, { id: toastId });
      } else {
        throw new Error("No product line items could be extracted from this document");
      }
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const onPasteExtract = async (text: string) => {
    if (!text.trim()) return;
    setParsing(true);
    const tid = toast.loading("AI interpretation in progress...");
    try {
      const result = await extractInvoiceFromText(text);
      if (result.error) throw new Error(result.error);
      if (result.items && result.items.length > 0) {
        if (result.supplier_name && !supplierName) setSupplierName(result.supplier_name);
        if (result.supplier_gstn && !supplierGstn) setSupplierGstn(result.supplier_gstn);
        if (result.invoice_number && !invoiceNumber) setInvoiceNumber(result.invoice_number);
        if (result.invoice_date && !invoiceDate) setInvoiceDate(result.invoice_date);
        
        const fallbackBatch = result.invoice_batch_number || result.batch_number || generateDefaultBatchNumber(result.invoice_number || invoiceNumber, result.invoice_date || invoiceDate);
        if (result.invoice_batch_number || result.batch_number || !defaultBatchNumber) {
          setDefaultBatchNumber(fallbackBatch);
        }

        const itemsWithBatch = result.items.map(it => ({
          ...it,
          batch_number: it.batch_number && it.batch_number.trim() ? it.batch_number.trim() : fallbackBatch
        }));

        // Brand & Company auto-resolution
        const finalSupplier = result.supplier_name || supplierName;
        const compResolution = resolveCompany(finalSupplier, availableCompanies, itemsWithBatch);
        if (compResolution.isHighConfidence && compResolution.company) {
          setCompanyId(compResolution.company.id);
          toast.success(`Auto-detected brand/company: ${compResolution.company.name}`);
        } else {
          setInferredBrand(compResolution.suggestedCode || null);
          setSuggestedCompanyName(compResolution.suggestedName || null);
          setSuggestedCompanyCode(compResolution.suggestedCode || null);
          setCompanyPromptOpen(true);
        }

        setPendingItems(itemsWithBatch);
        setBulkStep(2);
        toast.success(`Extracted ${result.items.length} items from text`, { id: tid });
      } else {
        throw new Error("No line items extracted from text");
      }
    } catch (e: unknown) {
      console.error('[Context]', e);
      toast.error(friendlyError(e), { id: tid });
    } finally {
      setParsing(false);
    }
  };

  const addItem = (item: Omit<StockItem, "id">) => {
    const p = products.find(px => px.id === item.productId);
    const commonBatch = defaultBatchNumber?.trim() || generateDefaultBatchNumber(invoiceNumber, invoiceDate);
    const effTaxPct = item.taxPct !== undefined ? item.taxPct : (p?.gst_rate || 0);
    const lineNet = item.netValue !== undefined ? item.netValue : Number(((Number(item.quantity) || 0) * (Number(item.unitCost) || 0)).toFixed(2));
    const lineTax = item.taxAmount !== undefined ? item.taxAmount : Number((lineNet * (effTaxPct / 100)).toFixed(2));
    const lineGross = item.grossValue !== undefined ? item.grossValue : Number((lineNet + lineTax).toFixed(2));

    const newItem: StockItem = {
      ...item,
      id: crypto.randomUUID(),
      batchNumber: item.batchNumber && item.batchNumber.trim() ? item.batchNumber.trim() : commonBatch,
      pack_size_value: p?.pack_size_value,
      pack_size_unit: p?.pack_size_unit,
      mrp: item.mrp || p?.mrp,
      unit_type: p?.unit_type,
      company_id: p?.company_id || companyId || undefined,
      taxPct: effTaxPct,
      netValue: lineNet,
      taxAmount: lineTax,
      grossValue: lineGross,
      cgstAmount: item.cgstAmount ?? (item.cgstPct ? Number((lineNet * (item.cgstPct / 100)).toFixed(2)) : Number((lineTax / 2).toFixed(2))),
      sgstAmount: item.sgstAmount ?? (item.sgstPct ? Number((lineNet * (item.sgstPct / 100)).toFixed(2)) : Number((lineTax / 2).toFixed(2))),
      igstAmount: item.igstAmount ?? (item.igstPct ? Number((lineNet * (item.igstPct / 100)).toFixed(2)) : 0),
    };
    setItems(prev => [...prev, newItem]);
    toast.success("Item added to manifest");
  };

  const updateItem = (id: string, field: keyof StockItem, value: unknown) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitCost' || field === 'taxPct') {
          const qty = Number(updated.quantity) || 0;
          const cost = Number(updated.unitCost) || 0;
          const taxRate = Number(updated.taxPct) || 0;
          updated.netValue = Number((qty * cost).toFixed(2));
          updated.taxAmount = Number((updated.netValue * (taxRate / 100)).toFixed(2));
          updated.grossValue = Number((updated.netValue + updated.taxAmount).toFixed(2));
        }
        return updated;
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
    toast.info("Item removed");
  };

  const updateAllPackedDate = (mmyy: string) => {
    setGlobalPackedDate(mmyy);
    const iso = mmyyToIsoExpiryDate(mmyy);
    if (iso) {
      setItems(prev => prev.map(it => ({
        ...it,
        packedDate: mmyy,
        expiryDate: iso
      })));
      toast.success(`Updated expiry to ${iso} across all items`);
    }
  };

  const addPendingItemsToStaging = (newItems: Omit<StockItem, "id">[]) => {
    const hyd = newItems.map(it => {
      const p = products.find(px => px.id === it.productId);
      const effTaxPct = it.taxPct !== undefined ? it.taxPct : (p?.gst_rate || 0);
      const lineNet = it.netValue !== undefined ? it.netValue : Number(((Number(it.quantity) || 0) * (Number(it.unitCost) || 0)).toFixed(2));
      const lineTax = it.taxAmount !== undefined ? it.taxAmount : Number((lineNet * (effTaxPct / 100)).toFixed(2));
      const lineGross = it.grossValue !== undefined ? it.grossValue : Number((lineNet + lineTax).toFixed(2));

      return { 
        ...it, 
        id: crypto.randomUUID(),
        pack_size_value: p?.pack_size_value,
        pack_size_unit: p?.pack_size_unit,
        mrp: it.mrp || p?.mrp,
        unit_type: p?.unit_type,
        company_id: p?.company_id || companyId || undefined,
        taxPct: effTaxPct,
        netValue: lineNet,
        taxAmount: lineTax,
        grossValue: lineGross,
        cgstAmount: it.cgstAmount ?? (it.cgstPct ? Number((lineNet * (it.cgstPct / 100)).toFixed(2)) : Number((lineTax / 2).toFixed(2))),
        sgstAmount: it.sgstAmount ?? (it.sgstPct ? Number((lineNet * (it.sgstPct / 100)).toFixed(2)) : Number((lineTax / 2).toFixed(2))),
        igstAmount: it.igstAmount ?? (it.igstPct ? Number((lineNet * (it.igstPct / 100)).toFixed(2)) : 0),
      };
    });
    setItems(prev => [...prev, ...hyd]);
    setPendingItems([]);
    toast.success(`${hyd.length} items staged`);
  };

  const handleImport = async (onSuccess?: () => void) => {
    if (!isAdmin) return toast.error("Admin only");
    if (!supplierName || !items.length) return toast.error("Supplier and items required");

    let targetWhId = warehouseId || user?.warehouse_id || availableWarehouses[0]?.id;
    if (!targetWhId) {
      const { data: whRow } = await supabase.from("warehouses").select("id").limit(1).maybeSingle();
      if (whRow?.id) {
        targetWhId = whRow.id;
      }
    }
    if (!targetWhId) {
      return toast.error("Please select a target warehouse for this stock receipt");
    }

    const toastId = toast.loading("Generating GRN Record & Updating Stock...");
    try {
      const commonBatch = defaultBatchNumber?.trim() || generateDefaultBatchNumber(invoiceNumber, invoiceDate);

      // 1. Create the Purchase Invoice (GRN)
      const { data: grn, error: grnError } = await supabase
        .from("purchase_invoices")
        .insert({
          supplier_name: supplierName,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          total_amount: stats.totalInvoicedValue,
          warehouse_id: targetWhId,
          status: "posted",
          total_freight: Number(totalFreight) || 0,
          total_handling: Number(totalHandling) || 0
        })
        .select()
        .single();

      if (grnError) {
        console.error('[Context]', grnError);
        throw grnError;
      }

      // 2. Prepare line items for purchase_invoice_items
      const invoiceItems = items.map(item => {
        const cleanPacked = parseDateString(item.packedDate) || (item.packedDate && /^\d{4}-\d{2}-\d{2}$/.test(item.packedDate) ? item.packedDate : null);
        const cleanExpiry = parseDateString(item.expiryDate) || (item.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(item.expiryDate) ? item.expiryDate : null);
        return {
          purchase_invoice_id: grn.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_cost: item.unitCost,
          pack_type: item.packType,
          mfg_date: cleanPacked,
          expiry_date: cleanExpiry,
          units_per_packet: item.unitsPerPacket,
          packets_per_case: item.packetsPerCase,
        };
      });

      const { error: itemsError } = await supabase
        .from("purchase_invoice_items")
        .insert(invoiceItems);

      if (itemsError) {
        console.error('[Context]', itemsError);
        throw itemsError;
      }

      // Map to carry forward blended WAC computed during Step 3 to Step 8
      const blendedWacMap = new Map<string, number>();

      // 3. Persist / learn aliases in `grn_product_aliases` and update product tax info, company, category, and landed cost
      for (const item of items) {
        await recordCorrection(
          item.name,
          item.productId,
          supplierName,
          {
            externalCode: item.external_code || null,
            codeType: item.code_type || (item.external_code ? "external" : "name"),
            companyId: companyId || item.company_id || null,
            hsn: item.hsn || null
          }
        );

        // Compute landed cost and packaging multipliers for this item
        const p = products.find(px => px.id === item.productId);
        const pricingProd: PricingProduct = {
          id: item.productId,
          units_per_packet: item.unitsPerPacket,
          packets_per_case: item.packetsPerCase,
          mrp: p?.mrp || item.mrp || 0,
          weight_per_unit_grams: p?.weight_per_unit_grams || 0,
          pack_size_value: p?.pack_size_value || 0,
          pack_size_unit: p?.pack_size_unit || "g",
          unit_type: p?.unit_type as "pcs" | "packet" | "kg_g" | null
        };

        const invoicedCostPerPack = Number(item.unitCost) || 0;
        const packMult = getPackMultiplier(pricingProd, item.packType);
        const totalPcs = Number(item.quantity) * packMult;
        const itemWeightKg = getItemWeightKg(totalPcs, p?.pack_size_value, p?.pack_size_unit);

        const allocation = getAllocationInfo({
          itemQty: Number(item.quantity) || 0,
          itemUnitCost: Number(item.unitCost) || 0,
          itemBaseUnits: totalPcs,
          itemWeightKg: itemWeightKg,
          totalFreight: Number(totalFreight) || 0,
          totalHandling: Number(totalHandling) || 0,
          totalWeightKG: stats.allLinesHaveWeight ? stats.totalWeight : 0,
          totalInvoiceValue: stats.totalInvoicedValue,
          manifestLineCount: items.length,
          allLinesHaveWeight: stats.allLinesHaveWeight
        });

        const freightForLine = item.freightTotal !== undefined ? item.freightTotal : allocation.freightAmount;
        const handlingForLine = item.handlingTotal !== undefined ? item.handlingTotal : allocation.handlingAmount;
        const landedPerPack = invoicedCostPerPack + (freightForLine / (Number(item.quantity) || 1)) + (handlingForLine / (Number(item.quantity) || 1));
        const landedPerPcs = packMult > 0 ? landedPerPack / packMult : landedPerPack;

        // Auto-detect and compute tax rates from invoice item
        const itemTax = item.taxPct !== undefined ? item.taxPct : (item.cgstPct !== undefined && item.sgstPct !== undefined ? item.cgstPct + item.sgstPct : (p?.gst_rate || 0));
        const taxBreakdown = computeTaxBreakdown(itemTax);

        const updateObj: Record<string, unknown> = {
          is_active: true
        };

        // Ensure name is never blank
        if (!p?.name || p.name.trim() === '' || p.name.toLowerCase().includes('unknown')) {
          updateObj.name = item.name;
        } else {
          updateObj.name = p.name;
        }

        // Ensure sku is preserved
        if (p?.sku) {
          updateObj.sku = p.sku;
        }

        // 1. MRP
        if (item.mrp && (!p?.mrp || p.mrp === 0)) {
          updateObj.mrp = item.mrp;
        }

        // 2. HSN code
        if (item.hsn && (!p?.hsn || p.hsn === '33074100')) {
          updateObj.hsn = item.hsn;
        }

        // 3. Supplier / Brand auto-filled
        const currentBrand = (p?.brand || "").trim().toLowerCase();
        const isGenericCurrentBrand = !p?.brand || currentBrand === "general" || currentBrand === "general / independent brand" || currentBrand === "general supplier";
        
        if (isGenericCurrentBrand) {
          if (supplierName && !["general", "unknown"].includes(supplierName.toLowerCase())) {
            updateObj.brand = supplierName;
          } else if (item.name.toLowerCase().includes("agarbatti") || item.name.toLowerCase().includes("dhoop") || item.packType === "doz") {
            updateObj.brand = "Madhukunj";
          }
        }

        // 3b. Company ID auto-linked
        if ((!p?.company_id || p.company_id === 'general') && (companyId || item.company_id)) {
          updateObj.company_id = companyId || item.company_id;
        }

        // 4. Category & Division auto-detected if missing/default
        if (!p?.division_category || p.division_category === 'Other' || p.division_category === 'SPECIAL PRODUCTS' || p.division_category === 'Uncategorized') {
          const detectedCategory = inferTaxonomyCategory(item.name, undefined, item.hsn || p?.hsn);
          updateObj.division_category = detectedCategory;
          updateObj.division = inferTaxonomyDivision(detectedCategory);
        } else if (!p?.division) {
          updateObj.division = inferTaxonomyDivision(p.division_category);
        }

        // Universal Unit-Label & Multiplier Auto-Sync
        const unitProfile = resolveUnitProfile(item.packType, p, {
          units_per_packet: item.unitsPerPacket,
          packets_per_case: item.packetsPerCase,
          pack_size_value: p?.pack_size_value,
          pack_size_unit: p?.pack_size_unit
        });

        // Compute Blended WAC (One Source of Truth)
        const existingQty = p?.inventory?.stock_base_units || p?.inventory?.quantity || 0;
        const existingWacPerPcs = p?.inventory?.avg_landed_cost || p?.cost_price || 0;
        const wac = computeWacClient(existingQty, existingWacPerPcs, totalPcs, landedPerPcs, pricingProd, 'pcs');

        // Update product cost_price to blended WAC
        updateObj.cost_price = Number(wac.blendedWacPerPcs.toFixed(4));
        blendedWacMap.set(item.productId, wac.blendedWacPerPcs);

        if (unitProfile.syncPayload) {
          // Sync unit_type if missing or if incoming specifies higher detail
          if (!p?.unit_type || p.unit_type === 'pcs' || item.packType === 'doz' || item.packType === 'kg' || item.packType === 'packet') {
            updateObj.unit_type = unitProfile.syncPayload.unit_type;
          }
          if (!p?.preferred_sell_unit || item.packType === 'doz') {
            updateObj.preferred_sell_unit = unitProfile.syncPayload.preferred_sell_unit;
          }
          if (!p?.item_pack_type || p.item_pack_type === 'unit') {
            updateObj.item_pack_type = unitProfile.syncPayload.item_pack_type;
          }
          if (unitProfile.syncPayload.units_per_packet > 1 || (!p?.units_per_packet || p.units_per_packet <= 1)) {
            updateObj.units_per_packet = unitProfile.syncPayload.units_per_packet;
          }
          if (unitProfile.syncPayload.packets_per_case > 1 || (!p?.packets_per_case || p.packets_per_case <= 1)) {
            updateObj.packets_per_case = unitProfile.syncPayload.packets_per_case;
          }
          if (unitProfile.syncPayload.units_per_case > 1 || (!p?.units_per_case || p.units_per_case <= 1)) {
            updateObj.units_per_case = unitProfile.syncPayload.units_per_case;
          }
          if (unitProfile.syncPayload.pack_size_unit && !p?.pack_size_unit) {
            updateObj.pack_size_unit = unitProfile.syncPayload.pack_size_unit;
          }
        }

        if (Object.keys(updateObj).length > 0) {
          try {
            await persistProductToSupabase(updateObj, item.productId);
          } catch (pUpdErr) {
            console.warn("Product update notice:", pUpdErr);
          }
        }
      }

      // 4. Prepare inventory batches for physical stock update with explicit warehouse_id
      const batchInserts = items.map(item => {
        const p = products.find(px => px.id === item.productId);
        const unitProfile = resolveUnitProfile(item.packType, p, {
          units_per_packet: item.unitsPerPacket,
          packets_per_case: item.packetsPerCase,
          pack_size_value: p?.pack_size_value,
          pack_size_unit: p?.pack_size_unit
        });

        const pricingProd: PricingProduct = {
          id: item.productId,
          units_per_packet: unitProfile.units_per_packet,
          packets_per_case: unitProfile.packets_per_case,
          mrp: p?.mrp || 0,
          weight_per_unit_grams: p?.weight_per_unit_grams || 0,
          pack_size_value: p?.pack_size_value || 0,
          pack_size_unit: p?.pack_size_unit || "g",
          unit_type: p?.unit_type as "pcs" | "packet" | "kg_g" | null
        };

        const invoicedCostPerPack = Number(item.unitCost) || 0;
        const packMult = unitProfile.baseMultiplier || getPackMultiplier(pricingProd, item.packType);
        const totalPcs = Number(item.quantity) * packMult;
        const itemWeightKg = getItemWeightKg(totalPcs, p?.pack_size_value, p?.pack_size_unit);

        const allocation = getAllocationInfo({
          itemQty: Number(item.quantity) || 0,
          itemUnitCost: Number(item.unitCost) || 0,
          itemBaseUnits: totalPcs,
          itemWeightKg: itemWeightKg,
          totalFreight: Number(totalFreight) || 0,
          totalHandling: Number(totalHandling) || 0,
          totalWeightKG: stats.allLinesHaveWeight ? stats.totalWeight : 0,
          totalInvoiceValue: stats.totalInvoicedValue,
          manifestLineCount: items.length,
          allLinesHaveWeight: stats.allLinesHaveWeight
        });

        const freightForLine = item.freightTotal !== undefined ? item.freightTotal : allocation.freightAmount;
        const handlingForLine = item.handlingTotal !== undefined ? item.handlingTotal : allocation.handlingAmount;

        const landedPerPack = invoicedCostPerPack + (freightForLine / (Number(item.quantity) || 1)) + (handlingForLine / (Number(item.quantity) || 1));
        const landedPerPcs = packMult > 0 ? landedPerPack / packMult : landedPerPack;
        const baseCostPerPcs = packMult > 0 ? invoicedCostPerPack / packMult : invoicedCostPerPack;

        const cleanPacked = parseDateString(item.packedDate) || (item.packedDate && /^\d{4}-\d{2}-\d{2}$/.test(item.packedDate) ? item.packedDate : null);
        const cleanExpiry = parseDateString(item.expiryDate) || (item.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(item.expiryDate) ? item.expiryDate : (cleanPacked ? new Date(new Date(cleanPacked).setFullYear(new Date(cleanPacked).getFullYear() + 2)).toISOString().split('T')[0] : new Date(Date.now() + 365*24*3600*1000).toISOString().split('T')[0]));
        const invoiceBatchNo = item.batchNumber && item.batchNumber.trim().length > 0 ? item.batchNumber.trim() : commonBatch;

        return {
          product_id: item.productId,
          purchase_invoice_id: grn.id,
          initial_qty: totalPcs,
          received_qty: totalPcs,
          remaining_qty: totalPcs,
          cost_price: Number(baseCostPerPcs.toFixed(4)), 
          landed_cost: Number(landedPerPcs.toFixed(4)),
          warehouse_id: targetWhId,
          batch_number: invoiceBatchNo,
          mfg_date: cleanPacked,
          expiry_date: cleanExpiry,
          received_at: new Date().toISOString(),
        };
      });

      const { error: batchError } = await supabase.from("inventory_batches").insert(batchInserts);
      if (batchError) {
        console.error('[Context]', batchError);
        throw batchError;
      }

      // 5. Ensure all products are active
      const uniqueProductIds = Array.from(new Set(items.map(it => it.productId)));
      for (const pid of uniqueProductIds) {
        try {
          await supabase.from("products").update({ is_active: true }).eq("id", pid);
        } catch (actErr) {
          console.warn("Product activation notice:", actErr);
        }
      }

      // 6. Direct inventory upsert + RPC recomputation to ensure stock NEVER shows 0
      for (const pid of uniqueProductIds) {
        try {
          await supabase.rpc('recompute_inventory', { _product_id: pid });
        } catch (recErr) {
          console.warn("Recompute inventory fallback notice:", recErr);
        }

        try {
          const { data: bList } = await supabase
            .from("inventory_batches")
            .select("remaining_qty")
            .eq("product_id", pid)
            .gt("remaining_qty", 0);

          const totalQty = bList?.reduce((sum, b) => sum + (Number(b.remaining_qty) || 0), 0) || 0;
          await supabase
            .from("inventory")
            .upsert({
              product_id: pid,
              quantity: totalQty,
              updated_at: new Date().toISOString()
            }, { onConflict: "product_id" });
        } catch (invDirectErr) {
          console.warn("Direct inventory sync notice:", invDirectErr);
        }
      }

      // 7. Record Stock Movements for audit and analytics
      try {
        const movementRows = items.map(item => {
          const p = products.find(px => px.id === item.productId);
          const unitProfile = resolveUnitProfile(item.packType, p, {
            units_per_packet: item.unitsPerPacket,
            packets_per_case: item.packetsPerCase,
            pack_size_value: p?.pack_size_value,
            pack_size_unit: p?.pack_size_unit
          });
          const pricingProd: PricingProduct = {
            id: item.productId,
            units_per_packet: unitProfile.units_per_packet,
            packets_per_case: unitProfile.packets_per_case,
            mrp: p?.mrp || 0,
            pack_size_value: p?.pack_size_value,
            pack_size_unit: p?.pack_size_unit,
            unit_type: p?.unit_type as "pcs" | "packet" | "kg_g" | null
          };
          const packMult = unitProfile.baseMultiplier || getPackMultiplier(pricingProd, item.packType);
          const totalPcs = Number(item.quantity) * packMult;
          return {
            product_id: item.productId,
            movement_type: "inward_purchase",
            quantity: totalPcs,
            warehouse_id: targetWhId,
            reference_type: "purchase_invoice",
            reference_id: grn.id,
            notes: `Inward GRN from ${supplierName} (Invoice #${invoiceNumber || 'N/A'}${supplierGstn ? ' | GSTIN: ' + supplierGstn : ''})`,
            created_at: new Date().toISOString()
          };
        });
        await supabase.from("stock_movements").insert(movementRows);

        // Also insert into inventory_movements for v_stock_ledger_details (Stock History audit trail)
        const invMovementRows = items.map((item) => {
          const p = products.find(px => px.id === item.productId);
          const unitProfile = resolveUnitProfile(item.packType, p, {
            units_per_packet: item.unitsPerPacket,
            packets_per_case: item.packetsPerCase,
            pack_size_value: p?.pack_size_value,
            pack_size_unit: p?.pack_size_unit
          });
          const pricingProd: PricingProduct = {
            id: item.productId,
            units_per_packet: unitProfile.units_per_packet,
            packets_per_case: unitProfile.packets_per_case,
            mrp: p?.mrp || 0,
            pack_size_value: p?.pack_size_value,
            pack_size_unit: p?.pack_size_unit,
            unit_type: p?.unit_type as "pcs" | "packet" | "kg_g" | null
          };
          const packMult = unitProfile.baseMultiplier || getPackMultiplier(pricingProd, item.packType);
          const totalPcs = Number(item.quantity) * packMult;
          return {
            product_id: item.productId,
            warehouse_id: targetWhId,
            quantity: totalPcs,
            movement_type: "purchase",
            reference_type: "purchase_invoice",
            reference_id: grn.id,
            performed_by: user?.id || null,
            notes: `Purchase Invoice #${invoiceNumber || 'N/A'} - ${supplierName || 'General'}`,
            created_at: new Date().toISOString()
          };
        });
        await supabase.from("inventory_movements").insert(invMovementRows);
      } catch (movErr) {
        console.warn("Stock movement record notice:", movErr);
      }

      // 8. Auto-synchronize Price Tiers for products using blended WAC (One Source of Truth)
      for (const item of items) {
        const p = products.find(px => px.id === item.productId);
        if (p) {
          const pricingProd: PricingProduct = {
            id: p.id,
            units_per_packet: p.units_per_packet || item.unitsPerPacket,
            packets_per_case: p.packets_per_case || item.packetsPerCase,
            mrp: p.mrp || item.mrp || 0,
            weight_per_unit_grams: p.weight_per_unit_grams || 0,
            pack_size_value: p.pack_size_value || 0,
            pack_size_unit: p.pack_size_unit || "g",
            unit_type: p.unit_type
          };
          
          const blendedCost = blendedWacMap.get(item.productId);
          if (blendedCost !== undefined && blendedCost > 0) {
            try {
              const tiers = autoCalcAllTiers(pricingProd, blendedCost, 'pcs');
              const tierMap = new Map<string, { product_id: string; shop_type: string; pack_type: string; price: number; updated_at: string }>();
              tiers.forEach(t => {
                const dbPt = toDbPackType(t.pack_type);
                const key = `${t.shop_type}-${dbPt}`;
                if (!tierMap.has(key)) {
                  tierMap.set(key, {
                    product_id: p.id,
                    shop_type: t.shop_type,
                    pack_type: dbPt,
                    price: t.price,
                    updated_at: new Date().toISOString()
                  });
                }
              });
              const allTiersToUpsert = Array.from(tierMap.values());
              if (allTiersToUpsert.length > 0) {
                await supabase.from("product_price_tiers").upsert(allTiersToUpsert, { onConflict: "product_id,shop_type,pack_type" });
              }
            } catch (tErr) {
              console.warn("Price tier sync notice:", tErr);
            }
          }
        }
      }

      // Invalidate all related caches so history and stock screens update immediately without requiring manual refresh
      try {
        queryClient.invalidateQueries({ queryKey: ["stock-movement"] });
        queryClient.invalidateQueries({ queryKey: ["v_stock_ledger_details"] });
        queryClient.invalidateQueries({ queryKey: ["purchase_invoices"] });
        queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["inventory_batches"] });
        queryClient.invalidateQueries({ queryKey: ["inventory_movements"] });
        queryClient.invalidateQueries({ queryKey: ["stock"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["products-catalog"] });
        queryClient.invalidateQueries({ queryKey: ["products-data"] });
        queryClient.invalidateQueries({ queryKey: ["recommended-batches"] });
        queryClient.invalidateQueries({ queryKey: ["v_inventory_batch_details"] });
        queryClient.invalidateQueries({ queryKey: ["v_product_stock_warehouse"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["reports-data"] });
      } catch (cacheErr) {
        console.warn("Cache invalidation error:", cacheErr);
      }

      toast.success(`GRN Created successfully for ${items.length} items!`, { id: toastId });
      setItems([]);
      setPendingItems([]);
      setIsBulkImportOpen(false);
      setBulkStep(1);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err), { id: toastId });
    }
  };

  return {
    items,
    invoiceNumber,
    setInvoiceNumber,
    supplierName,
    setSupplierName: handleSupplierChange,
    supplierGstn,
    setSupplierGstn,
    companyId,
    setCompanyId,
    invoiceDate,
    setInvoiceDate,
    totalFreight,
    setTotalFreight,
    totalHandling,
    setTotalHandling,
    globalPackedDate,
    defaultBatchNumber,
    setDefaultBatchNumber,
    updateAllBatchNumber,
    warehouseId,
    setWarehouseId,
    availableWarehouses,
    availableCompanies,
    companyPromptOpen,
    setCompanyPromptOpen,
    inferredBrand,
    suggestedCompanyName,
    suggestedCompanyCode,
    fetchCompanies,
    handleCompanyCreated,
    parsing,
    pendingItems,
    setPendingItems,
    isBulkImportOpen,
    setIsBulkImportOpen,
    bulkStep,
    setBulkStep,
    stats,
    handleFileUpload,
    onPasteExtract,
    addItem,
    updateItem,
    removeItem,
    updateAllPackedDate,
    addPendingItemsToStaging,
    handleImport
  };
}
