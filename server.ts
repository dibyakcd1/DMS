import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Initialize dotenv from standard .env
dotenv.config({ override: true });

// Check if user specified a custom GEMINI_API_KEY in .env
const loadCustomApiKey = () => {
  const cleanVal = (val: string) => {
    let cleaned = val.trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    return cleaned;
  };

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
      if (match && match[1]) {
        const cleaned = cleanVal(match[1]);
        if (cleaned) {
          process.env.GEMINI_API_KEY = cleaned;
        }
      }
    }
  } catch (e) {
    console.error("Error parsing env files for custom API key:", e);
  }
};

loadCustomApiKey();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // High-availability model cascade for AI invoice parsing & general generation
  // Uses active Gemini models with rapid fallback
  const CANDIDATE_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
  ];

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Simple in-memory response cache for frequent identical text prompts
  const promptCache = new Map<string, { response: string; timestamp: number }>();
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  // Gemini Proxy Routes
  app.post('/api/gemini/generate', async (req, res) => {
    const { prompt, fileData, mimeType } = req.body;
    const promptStr = typeof prompt === 'string' ? prompt : JSON.stringify(prompt || '');

    // Check cache for pure text requests without attachments
    if (!fileData && promptStr && promptStr.length < 500) {
      const cached = promptCache.get(promptStr);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        res.json({ text: cached.response });
        return;
      }
    }

    try {
      const rawApiKey = process.env.GEMINI_API_KEY;
      if (!rawApiKey || !rawApiKey.trim()) {
        res.status(500).json({ error: 'AI generation is not configured. Please set GEMINI_API_KEY.' });
        return;
      }

      const genAI = new GoogleGenAI({
        apiKey: rawApiKey.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const contents = fileData
        ? [
            {
              inlineData: {
                data: fileData,
                mimeType
              }
            },
            { text: prompt }
          ]
        : prompt;

      let result = null;
      let lastError: unknown = null;

      // Iterate through candidate models across different clusters with retry
      for (const modelToUse of CANDIDATE_MODELS) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await genAI.models.generateContent({
              model: modelToUse,
              contents,
            });
            if (result && result.text) {
              break;
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
        if (result && result.text) {
          break;
        }
      }

      if (result && result.text) {
        // Cache successful response for short prompts
        if (!fileData && promptStr && promptStr.length < 500) {
          promptCache.set(promptStr, { response: result.text, timestamp: Date.now() });
        }
        res.json({ text: result.text });
        return;
      }

      // If all models are temporarily busy with 503, provide smart fallbacks where appropriate
      if (promptStr.includes('mindfulness affirmation')) {
        res.json({ text: "Clarity in distribution and calm execution ensure everyday success." });
        return;
      }

      if (promptStr.includes('business tip for Tatvisha Enterprises') || promptStr.includes('Daily Spark')) {
        const tips = [
          "Ensure secondary order reconciliations are submitted before evening van batching.",
          "Check credit outstanding for key retail counters ahead of weekend peak ordering.",
          "Review fast-moving FMCG items and set proactive minimum reorder thresholds.",
          "Confirm HSN tax slabs and batch expiry dates during GRN inward verification."
        ];
        const randomTip = tips[Math.floor(Math.random() * tips.length)];
        res.json({ text: randomTip });
        return;
      }

      if (promptStr.includes('Prioritize them based on productivity')) {
        res.json({ text: JSON.stringify(["Review pending orders", "Check inventory levels", "Follow up on payments"]) });
        return;
      }

      throw lastError || new Error("AI generation service is temporarily experiencing high traffic across models.");
    } catch (error) {
      let errMsg = error instanceof Error ? error.message : 'AI generation failed';
      if (errMsg.includes('leaked') || errMsg.includes('API key was reported as leaked') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('403')) {
        errMsg = "Your Gemini API Key has been reported as leaked or blocked. Please update it in the Settings menu (Gear Icon) in the top-right of the AI Studio workspace to proceed with AI features.";
      } else if (errMsg.includes('503') || errMsg.includes('demand') || errMsg.includes('temporary') || errMsg.includes('UNAVAILABLE') || errMsg.includes('overloaded')) {
        errMsg = "The AI service is experiencing a temporary demand spike across models. Please retry in a few moments, or use CSV/Excel import for immediate processing.";
      }
      res.status(500).json({ error: errMsg });
    }
  });

  // In-memory state for the Kanban board
  // For a real app, this would be in a database
  let boardState = {
    columns: [
      { id: 'todo', title: 'To Do', taskIds: ['task-1', 'task-2'] },
      { id: 'in-progress', title: 'In Progress', taskIds: [] },
      { id: 'done', title: 'Done', taskIds: [] }
    ],
    tasks: {
      'task-1': { id: 'task-1', content: 'Design the UI' },
      'task-2': { id: 'task-2', content: 'Implement real-time sync' }
    }
  };

  // API Routes
  app.get('/api/board', (req, res) => {
    res.json(boardState);
  });

  // Socket.io for real-time updates
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Send initial state
    socket.emit('board-update', boardState);

    socket.on('update-board', (newState) => {
      boardState = newState;
      // Broadcast to everyone else
      socket.broadcast.emit('board-update', boardState);
    });

    socket.on('create-task', ({ columnId, content }) => {
      const taskId = `task-${Date.now()}`;
      boardState.tasks[taskId] = { id: taskId, content };
      const col = boardState.columns.find(c => c.id === columnId);
      if (col) {
        col.taskIds.push(taskId);
      }
      io.emit('board-update', boardState);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error('Server error:', err);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
