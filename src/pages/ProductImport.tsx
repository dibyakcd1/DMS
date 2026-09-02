import * as React from "react";
import { useAuth } from "@/context/AuthContextCore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Upload, ChevronLeft, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Info, Download, X, AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { supabase } from "@/integrations/supabase/client";
import { productImportService } from "@/services/productImportService";
import type { ImportSummary } from "@/services/productImportService";
import { extractProductsFromCSV, extractProductsFromText, extractProductsFromMedia } from "@/services/geminiService";
import { sanitizeProductForDb, persistProductToSupabase } from "@/lib/packaging";

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


const TEMPLATE_HEADERS = [
  "name", "mrp", "units_per_packet", "packets_per_case", "pack_size_value", "pack_size_unit", "item_pack_type", "category"
];

const EXAMPLE_ROW = [
  "TE Chilli Packet 100g", 45.00, 10, 20, 100, "g", "packet", "Spices"
];

type ImportStep = "UPLOAD" | "MAPPING" | "PREVIEW" | "CONFIRM" | "RESULT";

const MANDATORY_COLUMNS = ["Product Name", "SKU"];

export default function ProductImport() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = React.useState(false);
  const [step, setStep] = React.useState<ImportStep>("UPLOAD");
  const [file, setFile] = React.useState<File | null>(null);
  
  // Validation State
  const [validationResult, setValidationResult] = React.useState<ImportSummary | null>(null);
  const [mappings, setMappings] = React.useState<Record<string, string>>({});
  const [skipErrors, setSkipErrors] = React.useState(true);

  // AI Smart Import State
  const [activeTab, setActiveTab] = React.useState<"standard" | "ai">("standard");
  const [parsing, setParsing] = React.useState(false);
  const [pastedText, setPastedText] = React.useState("");

  const handleAISmartFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setParsing(true);
    const toastId = toast.loading(`AI is analyzing ${selectedFile.name}...`);
    try {
      let result;
      if (selectedFile.name.endsWith(".csv") || selectedFile.name.endsWith(".xlsx") || selectedFile.name.endsWith(".xls")) {
        const reader = new FileReader();
        const data = await new Promise((resolve) => {
          reader.onload = (ev) => resolve(ev.target?.result);
          reader.readAsArrayBuffer(selectedFile);
        });
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        const extractRes = await extractProductsFromCSV(csv);
        if (extractRes.error) throw new Error(extractRes.error);
        result = extractRes.products;
      } else if (selectedFile.type.startsWith("image/") || selectedFile.type === "application/pdf") {
        const base64 = await fileToBase64(selectedFile);
        const extractRes = await extractProductsFromMedia(base64, selectedFile.type);
        if (extractRes.error) throw new Error(extractRes.error);
        result = extractRes.products;
      } else {
        throw new Error("Unsupported file type. Please upload Excel, CSV, PDF, or scanned Image.");
      }

      if (result && result.length > 0) {
        const summary = productImportService.processAIExtractedProducts(result);
        setValidationResult(summary);
        setStep("PREVIEW");
        toast.success(`Extracted ${result.length} products successfully`, { id: toastId });
      } else {
        throw new Error("No products could be extracted. Please check the file content.");
      }
    } catch (err) {
      console.error("[Context]", err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const handleAISmartTextExtract = async () => {
    if (!pastedText.trim()) return;

    setParsing(true);
    const toastId = toast.loading("AI is reading pasted content...");
    try {
      const extractRes = await extractProductsFromText(pastedText);
      if (extractRes.error) throw new Error(extractRes.error);
      const result = extractRes.products;

      if (result && result.length > 0) {
        const summary = productImportService.processAIExtractedProducts(result);
        setValidationResult(summary);
        setStep("PREVIEW");
        toast.success(`Extracted ${result.length} products successfully`, { id: toastId });
      } else {
        throw new Error("No products could be extracted. Check format or headers.");
      }
    } catch (err) {
      console.error("[Context]", err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setParsing(false);
    }
  };
  
  // Confirmation State
  const [importResult, setImportResult] = React.useState<{
    imported_count: number;
    updated_count: number;
    skipped_count: number;
    failed_rows: Record<string, unknown>[];
  } | null>(null);

  const readyToImportCount = React.useMemo(() => {
    if (!validationResult) return 0;
    return validationResult.rows.filter(r => r.status !== 'error' || !skipErrors).length;
  }, [validationResult, skipErrors]);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive opacity-50" />
        <h2 className="mt-4 text-xl font-bold">Unauthorized</h2>
        <p className="text-muted-foreground">Only admins can import products.</p>
      </div>
    );
  }

  const downloadTemplate = () => {
    const headers = [
      "Product Name", "SKU", "MRP", "GST Rate (%)", "Category", "Sub Category", "Item Pack Type", 
      "Units per Packet", "Packs per Case", "QTY Case/Carton", "Pack Size", "Preferred Sell Unit", 
      "Chain Pack?", "Chain MRP Label", "Opening Stock"
    ];
    
    // Examples based on user provided data and categories
    const examples = [
      // EXAMPLE - DO NOT REMOVE
      ["EXAMPLE - DO NOT REMOVE", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      
      // Representative sample across categories
      ["Aashirvaad Atta 5kg", "AA-ATTA-5KG", "220", "5", "Flour & Grains", "Wheat", "bag", "1", "4", "20kg", "5kg", "kg", "No", "", "80"],
      ["Maggi Noodles 70g x 12", "MG-NOO-70G", "14", "5", "Food Items", "Instant", "packet", "12", "8", "pack", "70g", "packet", "No", "", "500"],
      ["Tata Salt 1kg", "TT-SALT-1KG", "28", "5", "Spices", "Basic", "packet", "1", "24", "24kg", "1kg", "kg", "No", "", "300"],
      ["Amul Ghee 500ml", "AM-GHE-500", "310", "5", "Oil & Ghee", "Ghee", "unit", "1", "12", "6L", "500ml", "unit", "No", "", "60"],
      ["Parle-G 100g x 20", "PG-BSC-100", "10", "5", "Snacks & Namkeen", "Biscuit", "packet", "20", "16", "pack", "100g", "packet", "No", "", "400"],
      ["Haldirams Bhujia 200g", "HD-BHU-200", "55", "5", "Snacks & Namkeen", "Namkeen", "packet", "1", "30", "case", "200g", "packet", "No", "", "200"],
      ["Surf Excel 500g", "SX-DET-500", "110", "5", "Household", "Detergent", "packet", "1", "20", "case", "500g", "packet", "No", "", "150"],
      ["Red Label Tea 250g", "RL-TEA-250", "115", "5", "Beverages", "Tea", "packet", "1", "24", "case", "250g", "packet", "No", "", "100"],
    ];

    const csvContent = [
      headers.join(','),
      ...examples.map(ex => ex.map(val => `"${val}"`).join(',')) // Use quotes for safety
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ProductImport_Template_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    validateFile(selectedFile);
  };

  const validateFile = async (fileToValidate: File, customMappings?: Record<string, string>) => {
    setLoading(true);
    try {
      const buffer = await fileToValidate.arrayBuffer();
      const result = await productImportService.parseFile(buffer, fileToValidate.name, customMappings);
      setValidationResult(result);
      
      // Check if any mandatory columns are unmapped
      const hasUnmappedMandatory = MANDATORY_COLUMNS.some(col => !result.mappings[col]);
      
      if (hasUnmappedMandatory && step !== "MAPPING") {
        setStep("MAPPING");
        toast.warning("Some mandatory columns could not be auto-detected.");
      } else if (step === "MAPPING") {
        setStep("PREVIEW");
        toast.success("Mapping confirmed");
      } else {
        setStep("PREVIEW");
        toast.success("File validated successfully");
      }
    } catch (error) {
      console.error('[Context]', error);
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!validationResult) return;
    
    setLoading(true);
    const rowsToImport = validationResult.rows
      .filter(r => r.status !== 'error' || !skipErrors)
      .map(r => r.mapped_data);

    try {
      let result;
      try {
        const { data, error } = await supabase.rpc('confirm_product_import', {
          p_rows: rowsToImport,
          p_skip_errors: skipErrors,
          p_user_id: user?.id
        });

        if (error) {
          // If the error indicates missing function or schema cache issue, throw it to trigger fallback
          if (error.code === 'PGRST202' || error.message?.includes('function') || error.message?.includes('schema cache')) {
            throw error;
          }
          throw error;
        }

        result = data as {
          imported_count: number;
          updated_count: number;
          skipped_count: number;
          failed_rows: Record<string, unknown>[];
        };
      } catch (rpcErr: unknown) {
        console.warn('RPC confirm_product_import failed or not found, falling back to client-side import logic:', rpcErr);
        
        let v_imported_count = 0;
        let v_updated_count = 0;
        let v_skipped_count = 0;
        const v_failed_rows: Record<string, unknown>[] = [];
        const v_final_user_id = user?.id || null;

        // In-memory cache to prevent duplicate inserts within the same import file/batch
        const batchProductIdBySku = new Map<string, string>();
        const batchProductIdByName = new Map<string, string>();

        for (const row of rowsToImport) {
          const v_sku = row.sku ? String(row.sku).trim() : '';
          if (!v_sku) continue;

          try {
            let v_name = row.name ? String(row.name).trim() : '';
            if (!v_name || ['unknown', 'unknown product', 'unknown item', 'null', 'undefined'].includes(v_name.toLowerCase())) {
              v_name = `${row.brand || 'Product'} Item [${v_sku}]`;
            }
            const v_ipt = row.item_pack_type ? String(row.item_pack_type).trim() : 'Packet';
            const normSku = v_sku.toUpperCase();
            const normName = v_name.toLowerCase();

            // Check if already processed in this batch
            const existingBatchId = batchProductIdBySku.get(normSku) || batchProductIdByName.get(normName);

            // CASE TYPE LOGIC
            let v_case_type = 'carton';
            if (/(pouch|bag|sachet|pkt|packet)/i.test(v_ipt)) {
              v_case_type = 'bag';
            }

            // BASE WEIGHT UNIT LOGIC
            let v_bw_unit = 'pcs';
            if (/(pouch|sachet)/i.test(v_ipt)) {
              v_bw_unit = 'g';
            }

            // CHAIN PACK DETECTION
            const v_is_chain = row.is_chain_item !== undefined 
              ? Boolean(row.is_chain_item) 
              : (/(chain pack|cb item|chainpack)/i.test(v_name) && !/\[ACB\]/i.test(v_name));

            const v_mrp = Number(row.mrp) || 0;
            const v_is_mrp_priced = v_mrp > 0 ? true : v_is_chain;

            let v_final_chain_label = null;
            if (v_is_chain) {
              v_final_chain_label = row.chain_mrp_label || null;
              if (!v_final_chain_label) {
                const labelMatch = v_name.match(/(?:Rs\.?|Re\.?)\s*\d+\s*\/-(\s*\(\d+pc\))?/i);
                if (labelMatch) {
                  v_final_chain_label = labelMatch[0];
                }
              }
            }

            // PREFERRED SELL UNIT Logic
            const v_has_pcs = /(\d+pc|pcs)/i.test(v_name);
            let v_preferred_unit = 'packet';
            if (v_has_pcs) {
              v_preferred_unit = 'packet';
            } else if (/(jar|bottle|tin|acb)/i.test(v_ipt)) {
              v_preferred_unit = 'unit';
            } else {
              const rawPref = row.preferred_sell_unit ? String(row.preferred_sell_unit).toLowerCase().trim() : 'packet';
              if (['pkt', 'pouch', 'packet', 'sachet'].includes(rawPref)) {
                v_preferred_unit = 'packet';
              } else if (['pcs', 'pc', 'unit', 'jar', 'bottle', 'tin', 'can', 'acb'].includes(rawPref)) {
                v_preferred_unit = 'unit';
              } else if (['carton', 'box', 'case'].includes(rawPref)) {
                v_preferred_unit = 'case';
              } else {
                v_preferred_unit = 'packet';
              }
            }

            const productObj = {
              ...row,
              name: v_name,
              sku: v_sku,
              mrp: v_mrp,
              item_pack_type: v_ipt,
              preferred_sell_unit: v_preferred_unit,
              brand: row.brand || '',
            };

            // Use persistProductToSupabase with uniqueness enforcement by SKU and Name
            const { data: savedData, error: saveErr } = await persistProductToSupabase(
              productObj,
              existingBatchId || undefined
            );

            if (saveErr) throw saveErr;
            const v_product_id = savedData?.id as string;
            if (!v_product_id) {
              throw new Error("No product ID returned after persistence");
            }

            // Cache product ID for both SKU and Name to avoid duplicates within same file
            batchProductIdBySku.set(normSku, v_product_id);
            batchProductIdByName.set(normName, v_product_id);

            // Check if inventory exists
            const { data: invData, error: invError } = await supabase
              .from('inventory')
              .select('id')
              .eq('product_id', v_product_id);

            if (invError) throw invError;

            if (!invData || invData.length === 0) {
              const v_opening_stock = Number(row.opening_stock) || 0;
              // Insert inventory
              const { error: insertInvError } = await supabase
                .from('inventory')
                .insert({ product_id: v_product_id, quantity: v_opening_stock });

              if (insertInvError) throw insertInvError;

              // Insert stock ledger record
              const { error: insertLedgerError } = await supabase
                .from('stock_ledger')
                .insert({
                  product_id: v_product_id,
                  reference_type: 'import',
                  reference_id: 'initial',
                  base_units_delta: v_opening_stock,
                  stock_after: v_opening_stock,
                  created_by: v_final_user_id
                });

              if (insertLedgerError) throw insertLedgerError;

              v_imported_count++;
            } else {
              v_updated_count++;
            }
          } catch (error: unknown) {
            if (!skipErrors) throw error;
            v_failed_rows.push({
              sku: v_sku,
              error: error instanceof Error ? error.message : String(error)
            });
            v_skipped_count++;
          }
        }

        result = {
          imported_count: v_imported_count,
          updated_count: v_updated_count,
          skipped_count: v_skipped_count,
          failed_rows: v_failed_rows
        };
      }

      setImportResult(result);
      setStep("RESULT");

      // Invalidate queries so catalog, stock, and history update immediately
      try {
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["products-catalog"] });
        queryClient.invalidateQueries({ queryKey: ["products-data"] });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["stock-movement"] });
        queryClient.invalidateQueries({ queryKey: ["v_stock_ledger_details"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      } catch (cacheErr) {
        console.warn("Product cache invalidation warning:", cacheErr);
      }

      toast.success("Import processed successfully");
    } catch (error) {
      console.error('[Context]', error);
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const resetImport = () => {
    setStep("UPLOAD");
    setValidationResult(null);
    setImportResult(null);
    setFile(null);
  };

  const renderStep = () => {
    switch (step) {
      case "UPLOAD":
        return (
          <div className="space-y-6">
            {/* Elegant Custom Tab Selector */}
            <div className="flex bg-muted/40 p-1.5 rounded-2xl border border-border/50 max-w-md">
              <button
                onClick={() => setActiveTab("standard")}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  activeTab === "standard" ? "bg-white shadow-sm text-brand-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Standard Import
              </button>
              <button
                onClick={() => setActiveTab("ai")}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  activeTab === "ai" ? "bg-white shadow-sm text-brand-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="h-4 w-4 text-brand-primary" />
                AI Smart Import
              </button>
            </div>

            {activeTab === "standard" ? (
              <>
                <Card className="border-dashed border-2 bg-muted/5 group hover:border-brand-primary/50 transition-colors cursor-pointer relative">
                  <input 
                    type="file" 
                    className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                  />
                  <CardContent className="flex flex-col items-center justify-center py-20 space-y-4">
                    <div className="h-20 w-20 rounded-full bg-brand-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload className="h-10 w-10 text-brand-primary" />
                    </div>
                    <div className="text-center">
                      <h3 className="font-bold text-xl">Upload Product List</h3>
                      <p className="text-sm text-muted-foreground">Click to browse your computer (.xlsx, .csv)</p>
                    </div>
                    {loading && (
                      <div className="flex items-center gap-2 text-brand-primary font-bold animate-pulse">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Validating file...
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex flex-col md:flex-row items-stretch gap-4 p-6 bg-brand-accent/30 rounded-2xl border border-brand-primary/10">
                  <div className="flex-1 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                      <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-bold">Unit Logic Guide</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        <span className="font-bold text-emerald-700">Packet:</span> Case contains Packets, Packets contain Base Units (e.g. 10 pcs per packet).<br/>
                        <span className="font-bold text-emerald-700">Weight:</span> For 5Kg bags, use <code className="bg-white px-1">pack_size_value: 5, pack_size_unit: kg</code>.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" onClick={downloadTemplate} className="rounded-xl border-emerald-600/20 hover:bg-emerald-50 text-emerald-700 font-bold whitespace-nowrap">
                    <Download className="mr-2 h-4 w-4" />
                    Download Template
                  </Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AI File Uploader */}
                <Card className="border border-border/50 bg-muted/5 flex flex-col justify-between rounded-3xl p-6">
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tight flex items-center gap-2 mb-2">
                      <Sparkles className="h-5 w-5 text-brand-primary animate-pulse" />
                      Document Upload
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                      Upload any Purchase Invoice, Excel Sheet, PDF, or scanned image from Hindustan Unilever (or other distributors). Gemini will use smart logic to automatically detect the table, parse columns, and extract products.
                    </p>

                    <div className={cn(
                      "border-2 border-dashed border-border/60 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer relative group transition-colors bg-white/40",
                      parsing ? "opacity-60 cursor-not-allowed" : "hover:border-brand-primary/40"
                    )}>
                      <input 
                        type="file" 
                        id="ai-product-file"
                        className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                        accept=".csv,.xlsx,.xls,.png,.jpg,.jpeg,.pdf"
                        onChange={handleAISmartFileUpload}
                        disabled={parsing}
                      />
                      <div className="h-14 w-14 rounded-2xl bg-brand-primary/5 flex items-center justify-center group-hover:scale-115 transition-transform duration-300">
                        {parsing ? <Loader2 className="h-7 w-7 text-brand-primary animate-spin" /> : <Upload className="h-7 w-7 text-brand-primary" />}
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-sm">Upload Invoice or Sheet</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Supports Excel, CSV, PDF, PNG, JPG</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-start gap-3">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-blue-700 leading-relaxed">
                      <strong>Hindustan Unilever Specialization:</strong> Gemini is optimized to automatically recognize and parse HUL-specific formats (like Basepack Code, SKU7 Code, CGST %, and Rcpt Qty).
                    </p>
                  </div>
                </Card>

                {/* AI Text Paste */}
                <Card className="border border-border/50 bg-muted/5 flex flex-col justify-between rounded-3xl p-6">
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tight flex items-center gap-2 mb-2">
                      <FileSpreadsheet className="h-5 w-5 text-brand-primary" />
                      Paste Raw Rows
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                      Open your distributor spreadsheet or invoice, copy the table rows, and paste them here. Gemini will organize them into products.
                    </p>

                    <textarea
                      placeholder="Paste columns/rows here... (e.g. Lifebuoy Soap 125g  BATW00A  120.00  101.49  90)"
                      className="w-full h-44 p-4 rounded-2xl border border-border bg-white text-xs font-mono focus:ring-2 focus:ring-brand-primary outline-none resize-none leading-relaxed"
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      disabled={parsing}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <p className="text-[10px] text-muted-foreground italic">
                      Make sure headers are included if possible for even better accuracy.
                    </p>
                    <Button
                      onClick={handleAISmartTextExtract}
                      disabled={parsing || !pastedText.trim()}
                      className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl px-6 shadow-brand font-black uppercase tracking-widest text-[10px] h-12 flex items-center gap-2 shrink-0"
                    >
                      {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Extract with AI
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        );

      case "MAPPING":
        return (
          <div className="space-y-6">
            <Card className="border-brand-primary/20 shadow-xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-brand-primary text-white p-8">
                <CardTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                  <FileSpreadsheet className="h-6 w-6" />
                  Column Mapping
                </CardTitle>
                <CardDescription className="text-white/70 italic">Some columns couldn't be auto-detected. Please map them manually.</CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <div className="max-h-[400px] overflow-auto border border-border/50 rounded-2xl">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0">
                      <TableRow>
                        <TableHead>System Column</TableHead>
                        <TableHead>Detected File Column</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.keys(validationResult?.mappings || {}).map((sysCol) => {
                        const isMandatory = MANDATORY_COLUMNS.includes(sysCol);
                        const currentMapping = mappings[sysCol] || validationResult?.mappings[sysCol] || "";
                        
                        return (
                          <TableRow key={sysCol}>
                            <TableCell className="font-bold py-4">
                              {sysCol} {isMandatory && <span className="text-red-500">*</span>}
                            </TableCell>
                            <TableCell>
                              <select 
                                className={cn(
                                  "w-full h-10 px-3 rounded-xl border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-brand-primary outline-none",
                                  isMandatory && !currentMapping ? "border-red-500 bg-red-50/50" : ""
                                )}
                                value={currentMapping}
                                onChange={(e) => setMappings(prev => ({ ...prev, [sysCol]: e.target.value }))}
                              >
                                <option value="">-- Skip Column --</option>
                                {validationResult?.available_headers.map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/20 p-8 flex justify-between border-t border-border/40">
                <Button variant="ghost" onClick={() => setStep("UPLOAD")} className="font-bold">
                  <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
                <Button 
                  onClick={() => {
                    const finalMappings = { ...validationResult?.mappings, ...mappings };
                    const cleanMappings: Record<string, string> = {};
                    Object.entries(finalMappings).forEach(([k, v]) => { if (v) cleanMappings[k] = v; });
                    if (file) validateFile(file, cleanMappings);
                  }} 
                  disabled={loading || MANDATORY_COLUMNS.some(col => !mappings[col] && !validationResult?.mappings[col])}
                  className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl px-12 shadow-brand font-black uppercase tracking-widest text-xs h-14"
                >
                  {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                  Confirm Mapping
                </Button>
              </CardFooter>
            </Card>
          </div>
        );

      case "PREVIEW":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-emerald-50/50 border-emerald-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-700 leading-none">{validationResult?.valid_count}</p>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Ready</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-amber-50/50 border-amber-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-amber-700 leading-none">{validationResult?.warning_count}</p>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Warnings</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-red-50/50 border-red-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <X className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-red-700 leading-none">{validationResult?.error_count}</p>
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Errors</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="overflow-hidden border-border/50">
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResult?.rows.map((row) => (
                      <TableRow key={row.row_index} className={cn(
                        row.status === 'error' ? "bg-red-50/30" : row.status === 'warning' ? "bg-amber-50/30" : ""
                      )}>
                        <TableCell className="text-xs font-mono text-muted-foreground">{row.row_index}</TableCell>
                        <TableCell className="font-medium">{row.mapped_data.name || "N/A"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.mapped_data.sku || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant={
                            row.status === 'valid' ? "default" : 
                            row.status === 'warning' ? "secondary" : "destructive"
                          } className="rounded-full px-2 py-0.5 text-[9px] uppercase font-black">
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.errors.concat(row.warnings).map((msg, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <span className={row.errors.includes(msg) ? "text-red-600" : "text-amber-600"}>•</span>
                              {msg}
                            </div>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <CardFooter className="px-0 py-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 self-start bg-muted/50 p-4 rounded-xl border border-border/50 w-full">
                <Checkbox 
                  id="skip-errors" 
                  checked={skipErrors} 
                  onCheckedChange={(checked) => setSkipErrors(!!checked)} 
                />
                <Label htmlFor="skip-errors" className="text-xs font-bold flex items-center gap-2 cursor-pointer">
                  Skip rows with errors and continue
                </Label>
              </div>
              
              <div className="flex justify-between w-full">
                <Button variant="outline" onClick={() => setStep("UPLOAD")} className="rounded-xl font-bold border-border/50">
                  <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
                <Button 
                  onClick={() => setStep("CONFIRM")} 
                  disabled={readyToImportCount === 0}
                  className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl px-8 shadow-brand font-black uppercase tracking-widest text-[10px] h-12"
                >
                  Continue with {readyToImportCount} Rows <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          </div>
        );

      case "CONFIRM":
        return (
          <Card className="border-brand-primary/20 shadow-xl overflow-hidden rounded-3xl">
            <CardHeader className="bg-brand-primary text-white p-8">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Confirm Import</CardTitle>
              <CardDescription className="text-white/70">Review the actions that will be performed on the database.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Action Type: Upsert</p>
                      <p className="text-xs text-muted-foreground">New products will be created, existing ones will be updated.</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-xl py-1 px-3">{readyToImportCount}</Badge>
                </div>

                <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Stock Protection</p>
                      <p className="text-xs text-muted-foreground italic">Existing product stock will NOT be overwritten.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/10 rounded-2xl border border-dashed border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                      <X className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Skipped Rows</p>
                      <p className="text-xs text-muted-foreground">Rows marked as errors will be excluded.</p>
                    </div>
                  </div>
                  <Badge variant="ghost" className="text-muted-foreground font-mono text-xl">
                    {(validationResult?.error_count || 0) + ((validationResult?.total || 0) - (readyToImportCount + (validationResult?.error_count || 0)))}
                  </Badge>
                </div>
              </div>

              {loading && (
                <div className="space-y-2 text-center py-4">
                  <Loader2 className="h-10 w-10 animate-spin text-brand-primary mx-auto" />
                  <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Processing Import...</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/20 p-8 flex justify-between border-t border-border/40">
              <Button variant="ghost" onClick={() => setStep("PREVIEW")} disabled={loading} className="font-bold">
                <ChevronLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button 
                onClick={confirmImport} 
                disabled={loading}
                className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl px-12 shadow-brand font-black uppercase tracking-widest text-xs h-14"
              >
                {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Upload className="mr-2 h-5 w-5" />}
                Confirm and Start Import
              </Button>
            </CardFooter>
          </Card>
        );

      case "RESULT":
        return (
          <Card className="border-emerald-200 shadow-2xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-emerald-600 text-white p-10 text-center">
              <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-6 scale-110">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <CardTitle className="text-3xl font-black uppercase tracking-tighter">Import Complete!</CardTitle>
              <CardDescription className="text-emerald-100 text-lg">Your product catalog has been synchronized.</CardDescription>
            </CardHeader>
            <CardContent className="p-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                <div className="text-center p-6 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <p className="text-4xl font-black text-emerald-700">{importResult?.imported_count}</p>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-1">New Products</p>
                </div>
                <div className="text-center p-6 rounded-2xl bg-blue-50 border border-blue-100">
                  <p className="text-4xl font-black text-blue-700">{importResult?.updated_count}</p>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">Updated</p>
                </div>
              </div>

              {importResult?.failed_rows && importResult.failed_rows.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black uppercase tracking-widest text-[10px] text-red-600 flex items-center gap-2">
                      <X className="h-3 w-3" /> {importResult.failed_rows.length} Failed Rows
                    </h4>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        const headers = Object.keys(importResult.failed_rows[0]);
                        const csvContent = [
                          headers.join(','),
                          ...importResult.failed_rows.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
                        ].join('\n');
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Failed_Products_${new Date().getTime()}.csv`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="mr-2 h-3 w-3" />
                      Download Failed
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-auto border border-red-100 rounded-xl">
                    <Table>
                      <TableBody>
                        {importResult.failed_rows.map((row, i) => (
                          <TableRow key={i} className="bg-red-50/50">
                            <TableCell className="font-mono text-[10px]">{row.sku}</TableCell>
                            <TableCell className="text-[10px] text-red-700">{row.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="p-10 pt-0 flex gap-4">
              <Button 
                variant="outline" 
                className="flex-1 rounded-2xl h-14 font-bold border-emerald-600/20 text-emerald-700 hover:bg-emerald-50"
                onClick={resetImport}
              >
                Import Another File
              </Button>
              <Button 
                className="flex-1 rounded-2xl h-14 bg-brand-primary hover:bg-brand-primary/90 text-white shadow-brand font-black uppercase tracking-widest"
                onClick={() => navigate("/products")}
              >
                View Products
              </Button>
            </CardFooter>
          </Card>
        );
    }
  };

  return (
    <TooltipProvider>
      <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/products")} className="h-12 w-12 rounded-2xl bg-white border border-border/50 shadow-xs hover:bg-muted">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-brand-primary" />
                Inventory Pilot
              </h1>
              <p className="text-muted-foreground font-medium hidden sm:block">Bulk synchronize your master product data and warehouse inventory.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-2xl h-12 border border-border/50">
            {["UPLOAD", "MAPPING", "PREVIEW", "CONFIRM"].map((s, i) => (
              <div 
                key={s} 
                className={cn(
                  "px-4 h-full flex items-center rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  step === s ? "bg-white shadow-sm text-brand-primary" : "text-muted-foreground/50"
                )}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {renderStep()}
      </div>
    </TooltipProvider>
  );
}
