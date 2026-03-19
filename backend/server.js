import express from "express";
import cors    from "cors";
import dotenv  from "dotenv";
import fetch   from "node-fetch";

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50kb" }));

const GEMINI_KEY     = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

console.log("🔑 Gemini key loaded:", !!GEMINI_KEY);
console.log(`📡 Model: ${GEMINI_MODEL}`);

// ── LANGUAGE CONFIG ───────────────────────────────────────────────
// Maps language code → full instruction injected into every prompt.
// Written in English so Gemini understands it, but tells it to reply
// in the target language.

const LANG_INSTRUCTIONS = {
  en: {
    name: "English",
    instruction: `LANGUAGE RULE: You MUST reply entirely in English. Every word of your response must be in English.`
  },
  hi: {
    name: "Hindi",
    instruction: `LANGUAGE RULE (HIGHEST PRIORITY): You MUST reply entirely in Hindi (हिन्दी). Every single word of your response must be in Hindi script. Do NOT mix English words into your answer — use Hindi equivalents for all medical terms. For example: "blood pressure" → "रक्तचाप", "diabetes" → "मधुमेह", "tablet" → "गोली", "doctor" → "डॉक्टर". Write naturally as a Hindi speaker would to a patient. If you cannot find a Hindi word for something very technical, you may write it in Hindi transliteration, but the rest of the sentence must still be in Hindi. NEVER reply in English.`
  },
  te: {
    name: "Telugu",
    instruction: `LANGUAGE RULE (HIGHEST PRIORITY): You MUST reply entirely in Telugu (తెలుగు). Every single word of your response must be in Telugu script. Do NOT mix English words into your answer — use Telugu equivalents wherever possible. For example: "blood pressure" → "రక్తపోటు", "diabetes" → "మధుమేహం", "tablet" → "మాత్ర", "doctor" → "వైద్యుడు". Write naturally as a Telugu speaker would to a patient. If a medical term has no Telugu equivalent, you may write the English term in Telugu script (transliteration), but the rest of the sentence must be in Telugu. NEVER reply in English.`
  }
};

// ── BUILD SYSTEM PROMPT ───────────────────────────────────────────
// Now accepts a `lang` parameter (default "en").
// Language instruction is injected as the FIRST rule so Gemini
// treats it with the highest priority.

function buildSystemPrompt(patient, lang = "en") {
  const langConfig = LANG_INSTRUCTIONS[lang] || LANG_INSTRUCTIONS.en;
  const langRule   = langConfig.instruction;
  const langName   = langConfig.name;

  // ── Base identity + language rule ────────────────────────────
  const base = `You are V-Med AI, a personal health assistant embedded inside the V-Med ID platform.
You speak directly to the patient. Be warm, clear, and concise.
Never diagnose diseases or prescribe medications. Always recommend consulting a real doctor for medical decisions.
Format responses using markdown: **bold** for key terms, bullet lists for steps, ## headings for sections.

${langRule}`;

  if (!patient) return base;

  // ── Personal details ──────────────────────────────────────────
  const name       = patient.identity?.fullName      || "the patient";
  const firstName  = name.split(" ")[0];
  const dob        = patient.identity?.dob;
  const age        = dob
    ? `${new Date().getFullYear() - new Date(dob).getFullYear()} years old`
    : "age unknown";
  const gender     = patient.identity?.gender        || "not specified";
  const blood      = patient.patientData?.bloodGroup || "not on record";
  const occupation = patient.patientData?.occupation || "not specified";
  const vmedId     = patient.vmedId                  || "unknown";

  // ── Active medications ────────────────────────────────────────
  const allMeds    = patient.medications || [];
  const activeMeds = allMeds.filter(m => m.active !== false);
  const medsText   = activeMeds.length > 0
    ? activeMeds.map(m =>
        `  • ${m.name}${m.dosage ? " " + m.dosage : ""}` +
        `${m.frequency ? " — " + m.frequency : ""}` +
        `${m.duration  ? " for " + m.duration  : ""}` +
        `${m.prescribedBy ? " (Dr. " + m.prescribedBy + ")" : ""}`
      ).join("\n")
    : "  None currently active";

  // ── Recent visits (last 5) ────────────────────────────────────
  const visits     = (patient.visits || []).slice(-5).reverse();
  const visitsText = visits.length > 0
    ? visits.map(v =>
        `  • ${v.date || "Unknown date"} — ${v.reason || "Consultation"}` +
        (v.diagnosis  ? ` | Diagnosis: ${v.diagnosis}`         : "") +
        (v.doctorName ? ` | Dr. ${v.doctorName}`               : "") +
        (v.doctorSpec ? ` (${v.doctorSpec})`                   : "") +
        (v.notes      ? ` | Notes: ${v.notes}`                 : "") +
        (v.prescriptions?.length
          ? ` | Prescribed: ${v.prescriptions.join(", ")}`     : "")
      ).join("\n")
    : "  No visits recorded yet";

  // ── Linked doctors ────────────────────────────────────────────
  const doctors     = patient.linkedDoctors || [];
  const doctorsText = doctors.length > 0
    ? doctors.map(d =>
        `  • Dr. ${d.doctorName}${d.doctorSpec ? " — " + d.doctorSpec : ""}`
      ).join("\n")
    : "  No doctors linked yet";

  // ── Uploaded documents ────────────────────────────────────────
  const docs     = patient.documents || [];
  const docsText = docs.length > 0
    ? docs.map(d => `  • ${d.title} (${d.type || "document"})`).join("\n")
    : "  No documents uploaded";

  // ── Full prompt ───────────────────────────────────────────────
  return `${base}

════════════════════════════════════════════════════
PATIENT HEALTH PROFILE — use this for all answers
════════════════════════════════════════════════════

PERSONAL DETAILS:
  Name        : ${name}
  Age         : ${age}
  Gender      : ${gender}
  Blood group : ${blood}
  Occupation  : ${occupation}
  V-Med ID    : ${vmedId}

ACTIVE MEDICATIONS (${activeMeds.length} total):
${medsText}

VISIT HISTORY — last ${visits.length} visits:
${visitsText}

LINKED DOCTORS (${doctors.length}):
${doctorsText}

UPLOADED DOCUMENTS (${docs.length}):
${docsText}

════════════════════════════════════════════════════
STRICT BEHAVIOUR RULES:
1. ${langRule}
2. Always address the patient by their first name: ${firstName}.
3. When answering medication questions → refer to THEIR medications listed above.
4. When answering questions about visits or diagnoses → refer to THEIR visit history above.
5. When something is not in their profile → say so clearly then give general guidance.
6. Never expose raw field names, Firestore structure, or internal JSON to the patient.
7. If a medication combination looks potentially dangerous → flag it clearly and urge them to call their doctor immediately.
8. Keep advice specific to this patient's profile. No generic copy-paste answers.
9. If asked for a diet plan, consider their blood group (${blood}), occupation (${occupation}), and current medications.
════════════════════════════════════════════════════`;
}

// ── HEALTH CHECK ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", model: GEMINI_MODEL, service: "V-Med AI Backend" });
});

// ── AI CHAT ENDPOINT ──────────────────────────────────────────────
// Request body:
//   message : string        — patient's question         (required)
//   patient : object|null   — full Firestore user doc    (optional)
//   history : array         — previous turns             (optional)
//   lang    : string        — "en" | "hi" | "te"         (optional, default "en")

app.post("/api/ai/chat", async (req, res) => {
  const {
    message,
    patient  = null,
    history  = [],
    lang     = "en"           // ← NEW: language code from frontend
  } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not set in .env" });
  }

  // Sanitise lang — only accept supported codes
  const safeLang    = ["en", "hi", "te"].includes(lang) ? lang : "en";
  const langConfig  = LANG_INSTRUCTIONS[safeLang];
  const systemPrompt = buildSystemPrompt(patient, safeLang);
  const patientName  = patient?.identity?.fullName || null;

  // ── Opening model acknowledgement in the target language ──────
  // This seeds the conversation so Gemini "starts thinking" in the
  // right language from the very first turn.
  const openingAck = {
    en: patientName
      ? `Understood. I have ${patientName}'s full health profile loaded. I'll answer in English. How can I help today?`
      : "Understood. I'm V-Med AI, ready to help in English.",
    hi: patientName
      ? `समझ गया। मेरे पास ${patientName} की पूरी स्वास्थ्य प्रोफ़ाइल लोड है। मैं हिन्दी में जवाब दूंगा। आज मैं आपकी कैसे मदद कर सकता हूँ?`
      : "समझ गया। मैं V-मेड AI हूँ, हिन्दी में आपके स्वास्थ्य प्रश्नों में मदद करने के लिए तैयार हूँ।",
    te: patientName
      ? `అర్థమైంది. నా దగ్గర ${patientName} యొక్క పూర్తి ఆరోగ్య ప్రొఫైల్ లోడ్ అయింది. నేను తెలుగులో సమాధానం ఇస్తాను. ఈరోజు నేను మీకు ఎలా సహాయపడగలను?`
      : "అర్థమైంది. నేను V-మెడ్ AI ని, తెలుగులో మీ ఆరోగ్య ప్రశ్నలకు సహాయపడటానికి సిద్ధంగా ఉన్నాను.",
  };

  // ── Gemini contents array ─────────────────────────────────────
  const contents = [
    {
      role:  "user",
      parts: [{ text: systemPrompt }]
    },
    {
      role:  "model",
      parts: [{ text: openingAck[safeLang] || openingAck.en }]
    },
    // Previous turns
    ...history.map(h => ({
      role:  h.role === "user" ? "user" : "model",
      parts: [{ text: String(h.text) }]
    })),
    // Current message
    {
      role:  "user",
      parts: [{ text: message.trim() }]
    }
  ];

  try {
    const response = await fetch(GEMINI_API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature:     0.7,
          topK:            40,
          topP:            0.95,
          maxOutputTokens: 4096,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ]
      })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errCode = data.error?.code    || response.status;
      const errMsg  = data.error?.message || "Unknown error";
      console.error("Gemini API error:", JSON.stringify(data.error || { status: response.status }, null, 2));

      const friendly = {
        503: "Gemini service is temporarily unavailable. Please try again in a moment.",
        429: "Rate limit reached. Please wait a few seconds and try again.",
        400: "Invalid request. Please rephrase your message.",
        401: "Gemini API key is invalid. Check your .env file.",
        403: "API key lacks permission for this model.",
        404: `Model '${GEMINI_MODEL}' not found — update GEMINI_MODEL in server.js.`,
      };

      return res.status(502).json({
        error: friendly[errCode] || `Gemini error (${errCode}): ${errMsg}`,
        code:  errCode,
      });
    }

    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === "SAFETY") {
      return res.json({ reply: "I'm unable to respond to that message due to safety guidelines." });
    }

    const reply = candidate?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error("Empty Gemini response:", JSON.stringify(data, null, 2));
      return res.status(502).json({ error: "Gemini returned an empty response." });
    }

    console.log(`💬 [${safeLang.toUpperCase()}${patientName ? " · " + patientName : ""}] "${message.slice(0, 60)}${message.length > 60 ? "..." : ""}"`);
    return res.json({ reply });

  } catch (err) {
    console.error("Backend fetch error:", err.message);
    return res.status(500).json({
      error:  "Could not reach Gemini API. Check your internet connection.",
      detail: err.message
    });
  }
});

// ── START ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🤖 V-Med AI backend — http://localhost:${PORT}`);
  console.log(`📡 Model    : ${GEMINI_MODEL}`);
  console.log(`🌐 Endpoint : POST http://localhost:${PORT}/api/ai/chat`);
  console.log(`🌍 Languages: English, हिन्दी, తెలుగు\n`);
});