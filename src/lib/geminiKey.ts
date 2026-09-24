import { GoogleGenAI } from "@google/genai";

const STORAGE_KEY = "dms_gemini_api_key";
const LEGACY_STORAGE_KEY = "gemini_api_key";

export function getGeminiApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const localKey = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (localKey && localKey.trim()) return localKey.trim();
  } catch (e) {
    console.warn("Could not read localStorage for Gemini key:", e);
  }
  const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
  return envKey || "";
}

export function setGeminiApiKey(key: string): void {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  try {
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
      localStorage.setItem(LEGACY_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch (e) {
    console.warn("Could not write to localStorage for Gemini key:", e);
  }

  window.dispatchEvent(new CustomEvent("gemini-key-changed", { detail: trimmed }));
}

export function hasGeminiApiKey(): boolean {
  return Boolean(getGeminiApiKey());
}

export async function testGeminiApiKey(candidateKey?: string): Promise<{ success: boolean; message: string }> {
  const keyToTest = candidateKey?.trim() || getGeminiApiKey();
  if (!keyToTest) {
    return { success: false, message: "No API key provided." };
  }

  const models = [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
    "gemini-flash-latest",
    "gemini-3.6-flash",
    "gemini-3.8-flash",
  ];

  for (const model of models) {
    try {
      const ai = new GoogleGenAI({ apiKey: keyToTest });
      const res = await ai.models.generateContent({
        model,
        contents: "Respond with the single word: OK",
      });
      if (res && res.text) {
        return { success: true, message: `Connected successfully with model ${model}!` };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("leaked") || errMsg.includes("403") || errMsg.includes("PERMISSION_DENIED")) {
        return { success: false, message: "API key was reported as invalid or blocked by Google." };
      }
      if (
        errMsg.includes("404") ||
        errMsg.includes("503") ||
        errMsg.includes("429") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("high demand")
      ) {
        continue;
      }
      return { success: false, message: errMsg || "Failed to contact Gemini API." };
    }
  }

  return { success: false, message: "Could not reach candidate Gemini models with this key." };
}
