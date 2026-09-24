import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Sparkles, CheckCircle2, AlertCircle, Loader2, ExternalLink, Eye, EyeOff, FileSpreadsheet } from "lucide-react";
import { getGeminiApiKey, setGeminiApiKey, testGeminiApiKey } from "@/lib/geminiKey";
import { toast } from "sonner";

interface GeminiApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function GeminiApiKeyModal({ open, onOpenChange, onSaved }: GeminiApiKeyModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (open) {
      setApiKey(getGeminiApiKey());
      setTestResult(null);
    }
  }, [open]);

  const handleTestAndSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      toast.error("Please enter a valid Gemini API Key");
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await testGeminiApiKey(trimmed);
      setTestResult(res);
      if (res.success) {
        setGeminiApiKey(trimmed);
        toast.success("Gemini API Key verified and saved successfully!");
        onOpenChange(false);
        if (onSaved) onSaved();
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to verify key";
      setTestResult({ success: false, message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveWithoutTest = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      toast.error("Please enter a valid Gemini API Key");
      return;
    }
    setGeminiApiKey(trimmed);
    toast.success("API Key saved to your browser!");
    onOpenChange(false);
    if (onSaved) onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg rounded-3xl p-6 bg-white border border-slate-200 shadow-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                AI Inward Invoice Scanner Setup
              </DialogTitle>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Git / Static Hosting Mode
              </span>
            </div>
          </div>
          <DialogDescription className="text-xs text-slate-600 leading-relaxed pt-1">
            Because DMSv1.0-pro is hosted directly on Git (client-side with Supabase), AI document scanning runs securely inside your browser using Google Gemini. Enter your free Gemini API key to scan PDF and photo bills.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-700">Google Gemini API Key</Label>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
              >
                <span>Get free API Key</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder="AIzaSy..."
                className="h-11 rounded-xl bg-slate-50 border-slate-200 font-mono text-xs pr-10 focus:bg-white transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                testResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="leading-snug">{testResult.message}</span>
            </div>
          )}

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <FileSpreadsheet className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <strong>No API Key handy?</strong> You can directly upload Excel (<strong>.xlsx</strong>, <strong>.xls</strong>) or <strong>CSV</strong> supplier invoices without needing any API key!
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto h-10 rounded-xl text-xs font-bold text-slate-600"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleSaveWithoutTest}
            disabled={testing || !apiKey.trim()}
            className="w-full sm:w-auto h-10 rounded-xl text-xs font-bold border-slate-200 hover:bg-slate-50"
          >
            Save Directly
          </Button>

          <Button
            type="button"
            onClick={handleTestAndSave}
            disabled={testing || !apiKey.trim()}
            className="w-full sm:w-auto h-10 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm"
          >
            {testing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Verify & Save</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
