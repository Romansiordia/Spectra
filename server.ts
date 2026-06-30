import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON middleware for request bodies
  app.use(express.json());

  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY || "dummy_key_to_prevent_crash"
  });

  // API route for AI Assistant chat
  app.post("/api/chat", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(401).json({ error: "API key is not configured on the server." });
      }

      const { messages, contextData } = req.body;

      // Construct a system prompt based on context (e.g., current samples, spectra data, etc.)
      const systemInstruction = `
Eres el Asistente Quimiométrico AI de Spectra Pro, una plataforma web para análisis de espectros NIR y modelos PLS.
Tu objetivo es ayudar a los usuarios (químicos, investigadores, estudiantes) a interpretar datos espectrales, 
explicar conceptos de calibración multivariada (PLS, PCA), preprocesamiento (SNV, Derivadas) y guiarles en el uso de la aplicación.
Responde de manera profesional, clara y concisa en español.

Contexto actual de la aplicación del usuario:
- Muestras activas: ${contextData?.activeSamplesCount || 0}
- Modelo PLS generado: ${contextData?.isModelGenerated ? 'Sí' : 'No'}
- Preprocesamientos aplicados: ${contextData?.preprocesses ? contextData.preprocesses.join(', ') : 'Ninguno'}
      `;

      // Convert messages to Gemini format (assuming the client sends them in a standard format)
      // Usually { role: "user" | "model", parts: [{ text: "..." }] }
      const formattedMessages = messages.map((m: any) => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      // Extract the last message to send, and use the rest as history
      const history = formattedMessages.slice(0, -1);
      const lastMessage = formattedMessages[formattedMessages.length - 1]?.parts[0]?.text || "";

      // We use gemini-2.5-flash as the default fast and capable model
      const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction,
          temperature: 0.7,
        },
        history,
      });

      const response = await chat.sendMessage({
        message: lastMessage,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Error in AI chat endpoint:", error);
      res.status(500).json({ error: "Failed to generate AI response" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
