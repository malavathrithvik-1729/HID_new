import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

console.log("🔑 Gemini key loaded:", !!process.env.GEMINI_API_KEY);

/* ===============================
   🤖 AI HEALTH CHAT ENDPOINT
================================ */
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { message } = req.body;
    console.log("📩 Incoming message:", message);

    if (!message) {
      return res.json({ reply: "Please ask a health-related question." });
    }

    const MODEL_NAME = "models/gemini-2.5-flash";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
You are a healthcare information assistant inside a medical application.

Rules:
- Answer only general health-related questions
- Do NOT diagnose diseases
- Do NOT prescribe medicines or dosage
- Keep answers simple, calm, and educational
- If unsure, suggest consulting a qualified doctor

User question:
${message}
`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Gemini API error:", data);
      throw new Error("Gemini API failed");
    }

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I couldn’t generate a response right now.";

    res.json({ reply });

  } catch (error) {
    console.error("❌ Gemini Backend Error:", error);
    res.json({
      reply:
        "The AI assistant is temporarily unavailable. Please try again later."
    });
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🤖 Gemini backend running at http://localhost:${PORT}`);
});
