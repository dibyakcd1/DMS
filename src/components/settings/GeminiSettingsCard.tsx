import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, KeyRound, CheckCircle2, AlertCircle, Loader2, ExternalLink, Eye, EyeOff, Trash2 } from "lucide-react";
import { getGeminiApiKey, setGeminiApiKey, testGeminiApiKey } from "@/lib/geminiKey";
import { toast } from "sonner";

export function GeminiSettingsCard() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasStoredKey, setHasStoredKey] = useState(false);

  useEffect(() => {
    const key = getGeminiApiKey();
    setApiKey(key);
    setHasStoredKey(Boolean(key));
  }, []);

  const handleSave = async (andTest = false) => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      toast.error("Please enter an API Key");
      return;
    }

    if (andTest) {
      setTesting(true);
      setTestResult(null);
      try {
        const res = await testGeminiApiKey(trimmed);
        setTestResult(res);
        if (res.success) {
          setGeminiApiKey(trimmed);
          setHasStoredKey(true);
          toast.success("Gemini API Key verified and saved!");
        } else {
          toast.error(res.message);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Verification failed";
        setTestResult({ success: false, message: msg });
        toast.error(msg);
      } finally {
        setTesting(false);
      }
    } else {
      setGeminiApiKey(trimmed);
      setHasStoredKey(true);
      toast.success("Gemini API Key saved in your browser!");
    }
  };

  const handleClear = () => {
    setGeminiApiKey("");
    setApiKey("");
    setHasStoredKey(false);
    setTestResult(null);
    toast.info("Gemini API Key removed from browser storage.");
  };

  return (
    <Card className="rounded-3xl border-slate-200/80 bg-white/70 backdrop-blur-md shadow-xs overflow-hidden">
      <CardHeader className="p-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>Gemini AI Invoice Scanner</span>
                {hasStoredKey ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    Not Configured
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Client-side API key for extracting supplier invoices from PDF and photos on Git-hosted deployments.
              </CardDescription>
            </div>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 self-start sm:self-auto hover:underline"
          >
            <span>Get Free Key</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>

      <CardContent className="p-6 pt-2 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-700">Google Gemini API Key</Label>
          <div className="relative flex items-center">
            <KeyRound className="absolute left-3.5 h-4 w-4 text-slate-400" />
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
              placeholder="AIzaSy..."
              className="h-11 rounded-xl bg-slate-50 border-slate-200/80 font-mono text-xs pl-10 pr-10 focus:bg-white transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Stored securely in your local browser storage. It is never sent to third parties.
          </p>
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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {hasStoredKey && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-9 px-3 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Key</span>
            </Button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSave(false)}
              disabled={!apiKey.trim()}
              className="h-9 px-4 rounded-xl text-xs font-bold border-slate-200"
            >
              Save Key
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => handleSave(true)}
              disabled={testing || !apiKey.trim()}
              className="h-9 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm"
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Verify & Save</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
