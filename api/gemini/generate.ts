import { GoogleGenAI } from '@google/genai';

const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ApiRequest {
  method?: string;
  body?: {
    prompt?: string;
    fileData?: string;
    mimeType?: string;
  };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
  setHeader: (key: string, value: string) => void;
  end: () => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Support CORS for client requests if needed
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, fileData, mimeType } = req.body || {};
  const rawApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!rawApiKey || !rawApiKey.trim()) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured in your deployment environment variables. Please add GEMINI_API_KEY in your Vercel / Netlify / Render project settings.'
    });
  }

  try {
    const genAI = new GoogleGenAI({
      apiKey: rawApiKey.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'dms-v1.0-pro-deployment'
        }
      }
    });

    const contents = fileData
      ? [
          {
            inlineData: {
              data: fileData,
              mimeType: mimeType || 'image/jpeg'
            }
          },
          { text: prompt || '' }
        ]
      : (prompt || '');

    let result = null;
    let lastError: unknown = null;

    for (const modelToUse of CANDIDATE_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await genAI.models.generateContent({
            model: modelToUse,
            contents,
          });
          if (result && result.text) {
            return res.status(200).json({ text: result.text });
          }
        } catch (error: unknown) {
          lastError = error;
          const errMsg = error instanceof Error ? error.message : String(error);
          const isHighDemand = errMsg.includes('503') || errMsg.includes('demand') || errMsg.includes('UNAVAILABLE') || errMsg.includes('RESOURCE_EXHAUSTED');
          if (attempt === 0 && isHighDemand) {
            await delay(800);
            continue;
          }
          break;
        }
      }
    }

    const errMsg = lastError instanceof Error ? lastError.message : 'AI generation failed';
    return res.status(500).json({
      error: errMsg.includes('503') || errMsg.includes('demand') || errMsg.includes('UNAVAILABLE')
        ? 'The AI service is experiencing a temporary demand spike. Please try again in a few moments.'
        : errMsg
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI proxy request failed';
    return res.status(500).json({ error: msg });
  }
}
