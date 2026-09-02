// Safe client-side caller that proxies requests to /api/gemini/generate

export async function getDailyAffirmation(): Promise<string> {
  try {
    const response = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: "Generate a short, powerful mindfulness affirmation for today. Keep it under 15 words."
      })
    });
    if (!response.ok) {
      throw new Error(`Proxy error: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return data.text?.trim() || "Focus on the present moment.";
    }
    return "Focus on the present moment.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The path to focus starts with a single breath.";
  }
}

export async function prioritizeTasks(tasks: string[]): Promise<string[]> {
  try {
    const prompt = `Here are some tasks: ${tasks.join(", ")}. Prioritize them based on productivity and well-being. Return only a valid JSON array of strings in order of importance, e.g. ["task 1", "task 2"].`;
    const response = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    if (!response.ok) {
      throw new Error(`Proxy error: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      const clean = (data.text || "").replace(/```json|```/g, "").trim();
      return JSON.parse(clean || "[]") as string[];
    }
    return tasks;
  } catch (error) {
    console.error("Gemini Error:", error);
    return tasks;
  }
}

