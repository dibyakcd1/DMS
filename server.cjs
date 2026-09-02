var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_dotenv = __toESM(require("dotenv"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_express = __toESM(require("express"), 1);
var import_http = require("http");
var import_socket = require("socket.io");
var import_vite = require("vite");
var import_genai = require("@google/genai");
import_dotenv.default.config({ override: true });
var loadCustomApiKey = () => {
  const cleanVal = (val) => {
    let cleaned = val.trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"') || cleaned.startsWith("'") && cleaned.endsWith("'")) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    return cleaned;
  };
  try {
    const envPath = import_path.default.resolve(process.cwd(), ".env");
    if (import_fs.default.existsSync(envPath)) {
      const content = import_fs.default.readFileSync(envPath, "utf-8");
      const match = content.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
      if (match && match[1]) {
        const cleaned = cleanVal(match[1]);
        if (cleaned) {
          process.env.GEMINI_API_KEY = cleaned;
          return;
        }
      }
    }
    const envExamplePath = import_path.default.resolve(process.cwd(), ".env.example");
    if (import_fs.default.existsSync(envExamplePath)) {
      const content = import_fs.default.readFileSync(envExamplePath, "utf-8");
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
async function startServer() {
  const app = (0, import_express.default)();
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
  const httpServer = (0, import_http.createServer)(app);
  const io = new import_socket.Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3e3;
  const CANDIDATE_MODELS = [
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash"
  ];
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const promptCache = /* @__PURE__ */ new Map();
  const CACHE_TTL_MS = 10 * 60 * 1e3;
  app.post("/api/gemini/generate", async (req, res) => {
    const { prompt, fileData, mimeType } = req.body;
    const promptStr = typeof prompt === "string" ? prompt : JSON.stringify(prompt || "");
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
        res.status(503).json({ error: "AI generation is not configured. Please set GEMINI_API_KEY." });
        return;
      }
      const genAI = new import_genai.GoogleGenAI({
        apiKey: rawApiKey.trim(),
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const contents = fileData ? [
        {
          inlineData: {
            data: fileData,
            mimeType
          }
        },
        { text: prompt }
      ] : prompt;
      let result = null;
      let lastError = null;
      for (const modelToUse of CANDIDATE_MODELS) {
        try {
          result = await genAI.models.generateContent({
            model: modelToUse,
            contents
          });
          if (result && result.text) {
            break;
          }
        } catch (error) {
          lastError = error;
          const errMsg = error instanceof Error ? error.message : String(error);
          console.warn(`Gemini (${modelToUse}) notice:`, errMsg);
          await delay(300);
        }
      }
      if (result && result.text) {
        if (!fileData && promptStr && promptStr.length < 500) {
          promptCache.set(promptStr, { response: result.text, timestamp: Date.now() });
        }
        res.json({ text: result.text });
        return;
      }
      if (promptStr.includes("mindfulness affirmation")) {
        res.json({ text: "Clarity in distribution and calm execution ensure everyday success." });
        return;
      }
      if (promptStr.includes("business tip for Tatvisha Enterprises") || promptStr.includes("Daily Spark")) {
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
      if (promptStr.includes("Prioritize them based on productivity")) {
        res.json({ text: JSON.stringify(["Review pending orders", "Check inventory levels", "Follow up on payments"]) });
        return;
      }
      throw lastError || new Error("AI generation service is temporarily experiencing high traffic across models.");
    } catch (error) {
      console.error("Gemini Proxy Error after cascade retries:", error);
      let errMsg = error instanceof Error ? error.message : "AI generation failed";
      if (errMsg.includes("leaked") || errMsg.includes("API key was reported as leaked") || errMsg.includes("PERMISSION_DENIED") || errMsg.includes("403")) {
        errMsg = "Your Gemini API Key has been reported as leaked or blocked. Please update it in the Settings menu (Gear Icon) in the top-right of the AI Studio workspace to proceed with AI features.";
      } else if (errMsg.includes("503") || errMsg.includes("demand") || errMsg.includes("temporary") || errMsg.includes("UNAVAILABLE") || errMsg.includes("overloaded")) {
        errMsg = "The AI service is currently experiencing high demand. Please try again in a moment or use the direct CSV/tabular import.";
      }
      res.status(503).json({ error: errMsg });
    }
  });
  let boardState = {
    columns: [
      { id: "todo", title: "To Do", taskIds: ["task-1", "task-2"] },
      { id: "in-progress", title: "In Progress", taskIds: [] },
      { id: "done", title: "Done", taskIds: [] }
    ],
    tasks: {
      "task-1": { id: "task-1", content: "Design the UI" },
      "task-2": { id: "task-2", content: "Implement real-time sync" }
    }
  };
  app.get("/api/board", (req, res) => {
    res.json(boardState);
  });
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    socket.emit("board-update", boardState);
    socket.on("update-board", (newState) => {
      boardState = newState;
      socket.broadcast.emit("board-update", boardState);
    });
    socket.on("create-task", ({ columnId, content }) => {
      const taskId = `task-${Date.now()}`;
      boardState.tasks[taskId] = { id: taskId, content };
      const col = boardState.columns.find((c) => c.id === columnId);
      if (col) {
        col.taskIds.push(taskId);
      }
      io.emit("board-update", boardState);
    });
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  httpServer.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error("Server error:", err);
    }
  });
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
