import express from "express";
import cors    from "cors";
import dotenv  from "dotenv";
import fetch   from "node-fetch";

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50kb" }));

const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";  // ✅ updated model

// ✅ Function instead of constant — always reads live key, never stale
const getGeminiUrl = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

console.log("🔑 Gemini key loaded:", !!GEMINI_KEY);
console.log("🔑 Key preview      :", GEMINI_KEY ? `...${GEMINI_KEY.slice(-6)}` : "MISSING ❌");
console.log(`📡 Model            : ${GEMINI_MODEL}`);

// ── SAFETY SETTINGS (shared across all requests) ──────────────────
const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
];

// ── RETRY HELPER — auto-retry on 429 ─────────────────────────────
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    const data     = await response.json();

    if (response.status === 429) {
      const waitMs = attempt * 4000; // 4s → 8s → 12s
      console.warn(`⏳ Rate limited (attempt ${attempt}/${maxRetries}). Retrying in ${waitMs / 1000}s...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    return { response, data };
  }

  console.error("❌ Rate limit persists after all retries.");
  return {
    response: { ok: false, status: 429 },
    data:     { error: { code: 429, message: "Rate limit persists after retries. Please wait a minute and try again." } }
  };
}

// ── LANGUAGE CONFIG ───────────────────────────────────────────────
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

// ── BUILD PATIENT SYSTEM PROMPT ───────────────────────────────────
function buildSystemPrompt(patient, lang = "en") {
  const langConfig = LANG_INSTRUCTIONS[lang] || LANG_INSTRUCTIONS.en;
  const langRule   = langConfig.instruction;

  const base = `You are V-Med AI, a personal health assistant embedded inside the V-Med ID platform.
You speak directly to the patient. Be warm, clear, and concise.
Never diagnose diseases or prescribe medications. Always recommend consulting a real doctor for medical decisions.
Format responses using markdown: **bold** for key terms, bullet lists for steps, ## headings for sections.

${langRule}`;

  if (!patient) return base;

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

  const allMeds    = patient.medications || [];
  const activeMeds = allMeds.filter(m => m.active !== false);
  const medsText   = activeMeds.length > 0
    ? activeMeds.map(m =>
        `  - ${m.name}${m.dosage    ? " " + m.dosage          : ""}` +
        `${m.frequency              ? ", " + m.frequency       : ""}` +
        `${m.duration               ? ", for " + m.duration    : ""}` +
        `${m.prescribedBy           ? " (Dr. " + m.prescribedBy + ")" : ""}`
      ).join("\n")
    : "  None currently active";

  const visits     = (patient.visits || []).slice(-5).reverse();
  const visitsText = visits.length > 0
    ? visits.map(v =>
        `  - ${v.date || "Unknown date"}: ${v.reason || "Consultation"}` +
        (v.diagnosis  ? `, Diagnosis: ${v.diagnosis}`      : "") +
        (v.doctorName ? `, Dr. ${v.doctorName}`            : "") +
        (v.doctorSpec ? ` (${v.doctorSpec})`               : "") +
        (v.notes      ? `, Notes: ${v.notes}`              : "") +
        (v.prescriptions?.length
          ? `, Prescribed: ${v.prescriptions.join(", ")}`  : "")
      ).join("\n")
    : "  No visits recorded yet";

  const doctors     = patient.linkedDoctors || [];
  const doctorsText = doctors.length > 0
    ? doctors.map(d =>
        `  - Dr. ${d.doctorName}${d.doctorSpec ? ", " + d.doctorSpec : ""}`
      ).join("\n")
    : "  No doctors linked yet";

  const docs     = patient.documents || [];
  const docsText = docs.length > 0
    ? docs.map(d => `  - ${d.title} (${d.type || "document"})`).join("\n")
    : "  No documents uploaded";

  // ✅ Plain text headers — no repeated unicode chars that trigger RECITATION
  return `${base}

--- PATIENT HEALTH PROFILE ---
Use the details below to personalise every answer.

Name: ${name}, Age: ${age}, Gender: ${gender}
Blood group: ${blood}, Occupation: ${occupation}
V-Med ID: ${vmedId}

Active Medications (${activeMeds.length}):
${medsText}

Recent Visits (last ${visits.length}):
${visitsText}

Linked Doctors (${doctors.length}):
${doctorsText}

Uploaded Documents (${docs.length}):
${docsText}

--- BEHAVIOUR RULES ---
1. ${langRule}
2. Address the patient by first name: ${firstName}.
3. For medication questions, refer to their medications listed above.
4. For visit or diagnosis questions, refer to their visit history above.
5. If something is not in their profile, say so clearly then give general guidance.
6. Never expose raw field names, Firestore structure, or internal JSON.
7. If a medication combination looks dangerous, flag it and urge them to call their doctor immediately.
8. Give specific answers based on this patient profile, not generic advice.
9. For diet plan requests, factor in blood group (${blood}), occupation (${occupation}), and current medications.`;
}

// ── BUILD DOCTOR SYSTEM PROMPT ────────────────────────────────────
function buildDoctorPrompt(doctor) {
  const name  = doctor?.identity?.fullName           || "Doctor";
  const spec  = doctor?.doctorData?.specializations || "General Medicine";
  const qual  = doctor?.doctorData?.qualification   || "";
  const since = doctor?.doctorData?.practisingSince || "";
  const count = doctor?.patientCount ?? 0;

  return `You are V-Med AI Clinical Assistant, an AI tool for doctors inside the V-Med ID platform.
You are speaking to a medical professional. Use clinical language. Be precise and concise.

Doctor: Dr. ${name}, Specialization: ${spec}, Qualification: ${qual}
Practising since: ${since}, Linked patients: ${count}

Your role:
- Provide drug references, interaction checks, dosage guidance
- Explain clinical terminology and diagnostic criteria
- Summarise treatment guidelines (reference only)
- Help draft patient-friendly explanations of conditions
- Answer general medical knowledge questions

Rules:
1. Always reply in English.
2. State when information is guideline-based vs evidence-based.
3. Always recommend clinical judgment over AI suggestions.
4. Never diagnose a specific patient — you have no patient data in this mode.
5. For dangerous drug interactions, use bold text and a warning emoji.
6. Keep answers structured with headings and bullet points.`;
}

// ── HEALTH CHECK ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", model: GEMINI_MODEL, service: "V-Med AI Backend" });
});

// ── AI CHAT ENDPOINT ──────────────────────────────────────────────
app.post("/api/ai/chat", async (req, res) => {
  const {
    message,
    patient = null,
    doctor  = null,
    history = [],
    lang    = "en"
  } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not set in .env" });
  }

  const safeLang     = ["en", "hi", "te"].includes(lang) ? lang : "en";
  const isDoctor     = !!doctor;
  const systemPrompt = isDoctor
    ? buildDoctorPrompt(doctor)
    : buildSystemPrompt(patient, safeLang);

  const patientName = patient?.identity?.fullName || null;
  const doctorName  = doctor?.identity?.fullName  || null;

  // Opening acknowledgement in target language
  const openingAckMap = isDoctor
    ? `Understood. I am your V-Med AI Clinical Assistant. Ready for clinical queries, Dr. ${doctorName || ""}.`
    : {
        en: patientName
          ? `I have ${patientName}'s health profile loaded and will answer in English.`
          : "I am V-Med AI, ready to help in English.",
        hi: patientName
          ? `मेरे पास ${patientName} की स्वास्थ्य प्रोफ़ाइल है। मैं हिन्दी में जवाब दूंगा।`
          : "मैं V-मेड AI हूँ, हिन्दी में मदद के लिए तैयार हूँ।",
        te: patientName
          ? `నా దగ్గర ${patientName} యొక్క ఆరోగ్య ప్రొఫైల్ ఉంది. నేను తెలుగులో సమాధానం ఇస్తాను.`
          : "నేను V-మెడ్ AI ని, తెలుగులో సహాయపడటానికి సిద్ధంగా ఉన్నాను.",
      };

  const openingAck = isDoctor
    ? openingAckMap
    : (openingAckMap[safeLang] || openingAckMap.en);

  // ── Gemini contents array ─────────────────────────────────────
  const contents = [
    { role: "user",  parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: openingAck   }] },
    ...history.map(h => ({
      role:  h.role === "user" ? "user" : "model",
      parts: [{ text: String(h.text) }]
    })),
    { role: "user",  parts: [{ text: message.trim() }] }
  ];

  // Helper to build request body — temperature can be raised for RECITATION retry
  const makeBody = (temp = 0.7) => JSON.stringify({
    contents,
    generationConfig: {
      temperature:     temp,
      topK:            40,
      topP:            0.95,
      maxOutputTokens: 4096,
    },
    safetySettings: SAFETY_SETTINGS
  });

  try {
    // ── First attempt ─────────────────────────────────────────
    const { response, data } = await fetchWithRetry(
      getGeminiUrl(),   // ✅ fresh URL on every request
      { method: "POST", headers: { "Content-Type": "application/json" }, body: makeBody(0.7) },
      3
    );

    // ── Gemini-level HTTP errors ──────────────────────────────
    if (!response.ok || data.error) {
      const errCode = data.error?.code    || response.status;
      const errMsg  = data.error?.message || "Unknown error";
      console.error("❌ Gemini API error:", errCode, errMsg);
      console.error("   Full:", JSON.stringify(data.error || {}, null, 2));

      const friendly = {
        429: "Too many requests. Please wait a moment and try again.",
        503: "Gemini is temporarily unavailable. Please try again shortly.",
        400: "There was a problem with the request. Please try rephrasing.",
        401: "Gemini API key is invalid. Check your .env file.",
        403: "API key lacks permission for this model.",
        404: `Model '${GEMINI_MODEL}' not found.`,
      };

      return res.status(502).json({
        error: friendly[errCode] || `Gemini error (${errCode}): ${errMsg}`,
        code:  errCode,
        raw:   errMsg,
      });
    }

    const candidate = data.candidates?.[0];

    // ── SAFETY block ──────────────────────────────────────────
    if (candidate?.finishReason === "SAFETY") {
      return res.json({ reply: "I am unable to respond to that message due to safety guidelines." });
    }

    // ── RECITATION block — retry once with nudge ──────────────
    if (candidate?.finishReason === "RECITATION") {
      console.warn("⚠️  RECITATION — retrying with nudge...");
      const nudgedContents = [
        ...contents,
        { role: "model", parts: [{ text: "Here is my response in my own words:" }] }
      ];
      const { data: d2 } = await fetchWithRetry(
        getGeminiUrl(),
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: nudgedContents,
            generationConfig: { temperature: 0.9, topK: 40, topP: 0.95, maxOutputTokens: 4096 },
            safetySettings: SAFETY_SETTINGS
          })
        },
        2
      );
      const reply2 = d2.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply2) return res.json({ reply: reply2 });
      return res.json({ reply: "I was not able to generate a response for that. Could you try rephrasing your question?" });
    }

    // ── Extract final reply ───────────────────────────────────
    const reply = candidate?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error("⚠️  Empty Gemini response:", JSON.stringify(data, null, 2));
      return res.status(502).json({ error: "Gemini returned an empty response." });
    }

    const ctxLabel = isDoctor
      ? `DOCTOR · ${doctorName || "unknown"}`
      : `${safeLang.toUpperCase()}${patientName ? " · " + patientName : ""}`;
    console.log(`💬 [${ctxLabel}] "${message.slice(0, 60)}${message.length > 60 ? "..." : ""}"`);

    return res.json({ reply });

  } catch (err) {
    console.error("❌ Backend fetch error:", err.message);
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