import express from "express";
import cors    from "cors";
import dotenv  from "dotenv";
import fetch   from "node-fetch";
import Parser  from "rss-parser";

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";  // ✅ corrected model name

// ✅ Function instead of constant — always reads live key, never stale
const getGeminiUrl = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

console.log("🔑 Gemini key loaded:", !!GEMINI_KEY);
console.log("🔑 Key preview      :", GEMINI_KEY ? `...${GEMINI_KEY.slice(-6)}` : "MISSING ❌");
console.log(`📡 Model            : ${GEMINI_MODEL}`);

// --- GOOGLE DRIVE HELPERS ---
function getDriveId(url) {
  if (!url) return null;
  // Patterns for typical Drive URLs
  const docRegex = /\/document\/d\/([a-zA-Z0-9-_]+)/;
  const fileRegex = /\/file\/d\/([a-zA-Z0-9-_]+)/;
  const spreadsheetRegex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
  const presentationRegex = /\/presentation\/d\/([a-zA-Z0-9-_]+)/;
  const ucRegex = /[?&]id=([a-zA-Z0-9-_]+)/;

  const match = url.match(docRegex) || 
                url.match(fileRegex) || 
                url.match(spreadsheetRegex) || 
                url.match(presentationRegex) || 
                url.match(ucRegex);
  return match ? match[1] : null;
}

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
    instruction: `LANGUAGE RULE (HIGHEST PRIORITY): You MUST reply entirely in Hindi (हिन्दी). Every single word of your response must be in Hindi script. Do NOT mix English words into your answer — use Hindi equivalents for all medical terms. For example: "blood pressure" → "रक्तचाप", "diabetes" → "मधుमेह", "tablet" → "गोली", "doctor" → "डॉक्टर". Write naturally as a Hindi speaker would to a patient. If you cannot find a Hindi word for something very technical, you may write it in Hindi transliteration, but the rest of the sentence must still be in Hindi. NEVER reply in English.`
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

## BEHAVIOR RULES (CRITICAL):
1. **AESTHETICS ARE CRITICAL**: Your responses must feel premium. Use emojis where appropriate to make the experience friendly and modern.
2. **Context Awareness**: Always mention specific documents, vitals (BP, Sugar, Weight), or visit history by name if they are relevant to the query.
3. **Health Score Awareness**: If the patient asks about their health or how they are doing, refer to their Health Score.
4. **Action Orientation**: Suggest specific quick actions (e.g., "Would you like me to analyze your latest Blood Report?" or "Should we check your Vitals history?").
5. **Multi-language Priority**: ${langRule}`;

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
    ? docs.map(d => `  - ${d.title} (${d.type || "document"})${d.verified ? " [DOCTOR VERIFIED]" : ""}${d.description ? ': ' + d.description : ''}`).join("\n")
    : "  No documents uploaded";

  const vitalsArr = patient.vitalsHistory || [];
  const vitalsText = vitalsArr.length > 0
    ? vitalsArr.slice(-5).reverse().map(v => 
        `  - ${v.date}: BP=${v.bp || "--"}, Sugar=${v.sugar || "--"}, Pulse=${v.pulse || "--"}, Temp=${v.temp || "--"}, Wt=${v.weight || "--"}${v.verified ? " [DOCTOR VERIFIED]" : " [SELF LOGGED]"}`
      ).join("\n")
    : "  No vitals recorded yet";

  const scoreText = patient.healthScore 
    ? `Total: ${patient.healthScore.total}/1000 (Last calc: ${patient.healthScore.lastCalculated || "N/A"})`
    : "Not yet calculated";

  // ✅ Plain text headers — no repeated unicode chars that trigger RECITATION
  return `${base}

--- PATIENT HEALTH PROFILE ---
Use the details below to personalise every answer.

Name: ${name}, Age: ${age}, Gender: ${gender}
Blood group: ${blood}, Occupation: ${occupation}
V-Med ID: ${vmedId}
Health Score: ${scoreText}

Active Medications (${activeMeds.length}):
${medsText}

Clinical Vitals (Latest 5):
${vitalsText}

Recent Visits (last ${visits.length}):
${visitsText}

Linked Doctors (${doctors.length}):
${doctorsText}

Medical Documents:
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
function buildDoctorPrompt(doctor, patient = null) {
  const name  = doctor?.identity?.fullName           || "Doctor";
  const spec  = doctor?.doctorData?.specializations || "General Medicine";
  const qual  = doctor?.doctorData?.qualification   || "";
  const since = doctor?.doctorData?.practisingSince || "";
  const count = doctor?.patientCount ?? 0;

  let base = `You are V-Med AI Clinical Assistant, an AI tool for doctors inside the V-Med ID platform.
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
4. For dangerous drug interactions, use bold text and a warning emoji.
5. Keep answers structured with headings and bullet points.`;

  if (!patient) {
    return `${base}\n\nMODE: General Clinical Reference (No specific patient context provided).`;
  }

  // Add Patient Context
  const pName = patient.identity?.fullName || "the patient";
  const pDob  = patient.identity?.dob || "unknown";
  const pAge  = pDob !== "unknown" ? `${new Date().getFullYear() - new Date(pDob).getFullYear()} years old` : "age unknown";
  const pGen  = patient.identity?.gender || "not specified";
  const pBlood = patient.patientData?.bloodGroup || "not on record";

  const allMeds    = patient.medications || [];
  const activeMeds = allMeds.filter(m => m.active !== false);
  const medsText   = activeMeds.length > 0
    ? activeMeds.map(m => `  - ${m.name} (${m.dosage || ""})`).join("\n")
    : "  None currently active";

  const visits     = (patient.visits || []).slice(-5).reverse();
  const visitsText = visits.length > 0
    ? visits.map(v => `  - ${v.date}: ${v.reason}${v.diagnosis ? ' (Diag: ' + v.diagnosis + ')' : ''}`).join("\n")
    : "  No visits recorded";

  const docs     = patient.documents || [];
  const docsText = docs.length > 0
    ? docs.map(d => `  - ${d.title} (${d.type})${d.verified ? " [VERIFIED]" : ""}${d.description ? ': ' + d.description : ''}`).join("\n")
    : "  No documents uploaded";

  const vitalsArr = patient.vitalsHistory || [];
  const vitalsText = vitalsArr.length > 0
    ? vitalsArr.slice(-5).reverse().map(v => 
        `  - ${v.date}: BP=${v.bp}, Sugar=${v.sugar}, Pulse=${v.pulse}, Temp=${v.temp}, Wt=${v.weight}${v.verified ? " [VERIFIED]" : ""}`
      ).join("\n")
    : "  - No vitals recorded yet";

  const scoreText = patient.healthScore 
    ? `Total: ${patient.healthScore.total}/1000`
    : "Not yet calculated";

  return `${base}

MODE: Patient Case Analysis
Current Patient: ${pName} (${pAge}, ${pGen})
Blood group: ${pBlood}
Health Score: ${scoreText}

[Active Medications]
${medsText}

[Clinical Vitals (Latest 5)]
${vitalsText}

[Recent History]
${visitsText}

[Related Documents & Reports]
${docsText}

[GUIDANCE FOR THIS CASE]
1. Analyze this patient's history and medications when answering.
2. If the doctor asks about drug interactions, check specifically against their current medications listed above.
3. When discussing lab results (from documents), explain the clinical significance for this patient's profile.
4. Keep the tone professional but patient-centric.`;
}

// ── HEALTH CHECK ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", model: GEMINI_MODEL, service: "V-Med AI Backend" });
});

// ── HEALTH TIPS ENDPOINT ──────────────────────────────────────────
const parser = new Parser();
const HEALTH_FEEDS = [
  { name: "Harvard Health", url: "https://www.health.harvard.edu/blog/feed" },
  { name: "WHO News", url: "https://www.who.int/rss-feeds/news-english.xml" },
  { name: "MedlinePlus", url: "https://medlineplus.gov/rss/allmedlineplus.xml" },
  { name: "Mayo Clinic", url: "https://www.mayoclinic.org/rss/all-health-information-topics" }
];

app.get("/api/health-tips", async (req, res) => {
  const { bloodGroup, conditions } = req.query;
  
  try {
    let feed = null;
    let feedSource = null;
    
    // Shuffle feeds and try them until one succeeds
    const shuffled = [...HEALTH_FEEDS].sort(() => 0.5 - Math.random());
    
    for (const source of shuffled) {
      try {
        console.log(`📡 Fetching feed from: ${source.name}...`);
        // Timeout the RSS parse specifically
        feed = await Promise.race([
          parser.parseURL(source.url),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
        ]);
        feedSource = source;
        if (feed) break;
      } catch (e) {
        console.warn(`⚠️ Failed to fetch ${source.name}:`, e.message);
      }
    }

    if (!feed) {
      return res.json({
        tip: "Maintain a balanced diet, prioritize 7-8 hours of sleep, and stay physically active to support your long-term wellness.",
        source: "V-Med Health Library",
        articles: []
      });
    }
    
    // Take top 3 items
    const items = feed.items.slice(0, 3).map(item => ({
      title: item.title,
      content: item.contentSnippet || item.content || item.summary || "",
      link: item.link
    }));

    const prompt = `
      Act as a clinical health assistant. I will provide you with 3 recent health news articles from ${feedSource.name}. 
      Your task is to provide a single, short, encouraging health tip (max 3 sentences) personalized for a patient.
      
      Patient Info:
      - Blood Group: ${bloodGroup || "Not specified"}
      - Known Conditions: ${conditions || "None specified"}

      Articles:
      ${items.map((it, i) => `${i+1}. ${it.title}: ${it.content}`).join("\n")}

      Rules:
      1. Be encouraging and concise.
      2. If the articles aren't directly related to the conditions, provide a general top-tier health tip inspired by the news.
      3. Do NOT give specific medical prescriptions.
      4. Mention the source: "${feedSource.name}".
      5. Return ONLY the tip text.
    `;

    const response = await fetch(getGeminiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: SAFETY_SETTINGS
      })
    });

    const result = await response.json();
    const tip = result.candidates?.[0]?.content?.parts?.[0]?.text || "Stay hydrated and maintain a balanced diet for optimal health.";

    res.json({
      tip: tip.trim(),
      source: feedSource.name,
      articles: items.map(it => ({ title: it.title, link: it.link }))
    });

  } catch (error) {
    console.error("Health tips error:", error);
    res.status(500).json({ error: "Failed to fetch health tips" });
  }
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
    ? buildDoctorPrompt(doctor, patient)
    : buildSystemPrompt(patient, safeLang);

  const patientName = patient?.identity?.fullName || null;
  const doctorName  = doctor?.identity?.fullName  || null;

  // Opening acknowledgement in target language
  const openingAckMap = isDoctor
    ? (patientName 
        ? `Understood. Clinical context for ${patientName} is loaded. Ready for consultation, Dr. ${doctorName || ""}.`
        : `Understood. I am your V-Med AI Clinical Assistant. Ready for clinical queries, Dr. ${doctorName || ""}.`)
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

// ── AI EXTRACTION ENDPOINT ─────────────────────────────────────────
app.post("/api/ai/extract", async (req, res) => {
  const { url, type = "document" } = req.body;

  if (!url) return res.status(400).json({ error: "URL is required" });
  if (!GEMINI_KEY) return res.status(500).json({ error: "AI key not configured" });

  const driveId = getDriveId(url);
  if (!driveId) {
    return res.status(400).json({ error: "Invalid Google Drive link. Please provide a standard sharing URL." });
  }

  console.log(`📑 Extracting from Drive ID: ${driveId}`);

  try {
    // 1. Try to fetch as a Google Doc (Plain Text) first
    // This is most efficient for docs/sheets
    const exportUrl = `https://docs.google.com/document/d/${driveId}/export?format=txt`;
    const docResponse = await fetch(exportUrl);

    let contentData = null;
    let mimeType = "text/plain";
    let extractionPrompt = "Extract the key medical findings, diagnosis summary, and critical values from this document text. Provide a professional, concise summary.";

    if (docResponse.ok) {
        contentData = await docResponse.text();
    } else {
        // 2. If not a Google Doc, fetch as raw file (PDF/Image)
        const downloadUrl = `https://drive.google.com/uc?id=${driveId}&export=download`;
        const downloadRes = await fetch(downloadUrl);
        
        if (!downloadRes.ok) {
            return res.status(400).json({ 
                error: "Could not access file. Ensure the link visibility is set to 'Anyone with the link can view'." 
            });
        }

        const buffer = await downloadRes.arrayBuffer();
        const detectedMime = downloadRes.headers.get("content-type") || "application/pdf";
        
        // Convert to base64 for Gemini
        contentData = Buffer.from(buffer).toString("base64");
        mimeType = detectedMime;
        extractionPrompt = "Analyze this medical document (PDF/Image). Extract the patient's condition, laboratory results, and doctor's impressions. Provide a concise, structured medical summary.";
    }

    // 3. Send to Gemini for Extraction
    const parts = [{ text: extractionPrompt }];
    if (mimeType === "text/plain") {
        parts.push({ text: `DOCUMENT CONTENT:\n${contentData}` });
    } else {
        parts.push({
            inlineData: {
                mimeType: mimeType,
                data: contentData
            }
        });
    }

    const aiRes = await fetch(getGeminiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        safetySettings: SAFETY_SETTINGS
      })
    });

    const data = await aiRes.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!summary) {
        throw new Error(data.error?.message || "Gemini failed to generate extraction summary.");
    }

    res.json({ summary: summary.trim() });

  } catch (error) {
    console.error("Extraction error:", error);
    res.status(500).json({ error: "Extraction failed: " + error.message });
  }
});

// ── START ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🤖 V-Med AI backend — http://localhost:${PORT}`);
  console.log(`📡 Model    : ${GEMINI_MODEL}`);
  console.log(`🌐 Endpoint : POST http://localhost:${PORT}/api/ai/chat`);
  console.log(`🌍 Languages: English, हिन्दी, తెలుగు\n`);
});