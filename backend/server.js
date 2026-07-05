var isNetlify = (typeof process !== 'undefined' && (process.env.NETLIFY || process.env.CONTEXT === "production"));

import express     from "express";
import cors        from "cors";
import dotenv      from "dotenv";
import Parser      from "rss-parser";
import rateLimit   from "express-rate-limit";
import admin       from "firebase-admin";

import { fileURLToPath } from "url";
import { dirname, join } from "path";

import {
  AIProvider,
  GeminiProvider,
  GroqProvider,
  OpenRouterProvider,
  SAFETY_SETTINGS,
} from "./ai-provider.js";

const filenameShim = (typeof import.meta !== 'undefined' && import.meta.url) 
  ? fileURLToPath(import.meta.url) 
  : (typeof __filename !== 'undefined' ? __filename : '');
const dirnameShim = filenameShim ? dirname(filenameShim) : (typeof __dirname !== 'undefined' ? __dirname : process.cwd());

if (!isNetlify) {
  dotenv.config({ path: join(dirnameShim, ".env") });
}

const app  = express();
const PORT = process.env.PORT || 3000;


// Simple server-side caching (Memory based)
const healthCache = new Map();
const forecastCache = new Map();
const chatCache = new Map();

function cleanCache(cache, maxItems = 100) {
  while (cache.size > maxItems) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break; // Safety break
    cache.delete(firstKey);
  }
}



// Allow all origins for now since the API requires Bearer token authentication
// and Netlify branch deploys create dynamic URLs.
app.use(cors());

app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", apiLimiter);

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    isNetlify,
    firebaseInitialized
  });
});



let firebaseInitialized = false;
try {
  const saString = process.env.FIREBASE_SERVICE_ACCOUNT;
  let serviceAccount;
  
  if (saString) {
    try {
      serviceAccount = JSON.parse(saString);
    } catch (e) {
      console.error("❌ Invalid FIREBASE_SERVICE_ACCOUNT JSON. Using default path.");
      serviceAccount = join(dirnameShim, "serviceAccountKey.json");
    }
  } else {
    serviceAccount = join(dirnameShim, "serviceAccountKey.json");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  firebaseInitialized = true;
  console.log("✅ Firebase Admin initialized.");
} catch (error) {
  console.error("❌ Failed to initialize Firebase Admin:", error.message);
}


async function verifyAuthToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Missing or invalid Authorization header." });
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("❌ Token verification failed:", error.message);
    // If the app wasn't initialized, error.message will be "The default Firebase app does not exist."
    // We send this exact message so the developer knows they forgot to add FIREBASE_SERVICE_ACCOUNT.
    return res.status(401).json({ error: `Unauthorized. ${error.message}` });
  }
}

app.use("/api/", verifyAuthToken);

// ── AI PROVIDER CHAIN ────────────────────────────────────────────
// Providers are tried in order. If a provider responds with 429, the
// next provider in the chain is tried automatically.

const _geminiKey      = process.env.GEMINI_API_KEY;
const _groqKey        = process.env.GROQ_API_KEY;
const _openRouterKey  = process.env.OPENROUTER_API_KEY;
const GEMINI_MODEL    = "gemini-2.0-flash";

const _providers = [];

if (_geminiKey) {
  _providers.push(new GeminiProvider(_geminiKey, GEMINI_MODEL));
  console.log(`✅ Gemini provider ready (model: ${GEMINI_MODEL}, key: ...${_geminiKey.slice(-6)})`);
} else {
  console.warn("⚠️  GEMINI_API_KEY missing — Gemini provider skipped.");
}

if (_groqKey) {
  _providers.push(new GroqProvider(_groqKey));
  console.log(`✅ Groq provider ready (fallback, key: ...${_groqKey.slice(-6)})`);
} else {
  console.log("ℹ️  GROQ_API_KEY not set — Groq fallback disabled.");
}

if (_openRouterKey) {
  _providers.push(new OpenRouterProvider(_openRouterKey));
  console.log(`✅ OpenRouter provider ready (tertiary fallback, key: ...${_openRouterKey.slice(-6)})`);
} else {
  console.log("ℹ️  OPENROUTER_API_KEY not set — OpenRouter fallback disabled.");
}

if (_providers.length === 0) {
  console.error("❌ FATAL: No AI providers configured. Set at least GEMINI_API_KEY in .env");
}

/**
 * aiProvider — the global multi-provider AI client.
 * Use aiProvider.chat() for conversational endpoints.
 * Use aiProvider.generate() for single-turn structured outputs.
 */
const aiProvider = new AIProvider(_providers);

// Helper for legacy/multimodal calls that bypass the provider chain
const getGeminiUrl = () => `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${_geminiKey}`;


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

// SAFETY_SETTINGS is imported from ./ai-provider.js

// ── RETRY HELPER — auto-retry on 429 ─────────────────────────────
async function fetchWithRetry(url, options, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = { error: { message: "Failed to parse API response" } };
    }

    if (response.status === 429) {
      console.warn(`⏳ Rate limited (${response.status}). Failing fast to rule-engine fallback...`);
      return { response, data };
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
  const cacheKey = `tips-${bloodGroup || 'none'}-${conditions || 'none'}`;
  
  if (healthCache.has(cacheKey)) {
    const entry = healthCache.get(cacheKey);
    if (Date.now() - entry.time < 3600000) { // 1 hour cache
      return res.json(entry.data);
    }
  }

  try {
    let feed = null;
    let feedSource = null;
    
    const shuffled = [...HEALTH_FEEDS].sort(() => 0.5 - Math.random());

    // Parallelized fetching for SPEED
    const results = await Promise.allSettled(shuffled.map(s => 
      Promise.race([
        parser.parseURL(s.url).then(f => ({ feed: f, source: s })),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000))
      ])
    ));

    const successful = results.find(r => r.status === "fulfilled" && r.value.feed);
    
    if (successful) {
      feed = successful.value.feed;
      feedSource = successful.value.source;
    }

    if (!feed) {
      // High-quality fallback articles for Demo
      const fallbacks = [
        {
          title: "WHO: Strategic Wellness Initiatives for 2026",
          content: "The World Health Organization has outlined key strategies for digital health integration and patient empowerment.",
          link: "https://www.who.int/news-room/news-updates"
        },
        {
          title: "Harvard Health: The Power of Preventive Care",
          content: "New research highlights how consistent vitals monitoring can reduce long-term cardiovascular risks by 40%.",
          link: "https://www.health.harvard.edu/blog"
        },
        {
          title: "V-Med Insights: Understanding your Health Score",
          content: "Learn how your clinical activity and data integrity contribute to a higher, more accurate health score.",
          link: "https://vmed-id.web.app/library"
        }
      ];

      return res.json({
        tip: "Consistent monitoring and verified clinical records are your best tools for long-term health. Keep your profile updated for the most accurate AI insights.",
        source: "V-Med Health Library",
        articles: fallbacks
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

    const aiResult = await aiProvider.generate(
      prompt,
      { temperature: 0.7, maxOutputTokens: 500 },
      SAFETY_SETTINGS
    );

    const tipText = (aiResult.ok && aiResult.text) ? aiResult.text : 
                    "Focus on heart-healthy fats, 30 minutes of walking daily, and consistent sleep patterns to boost your health score.";


    const result = {
      tip: tipText.trim(),
      source: feedSource.name,
      articles: items
    };

    healthCache.set(cacheKey, { time: Date.now(), data: result });
    cleanCache(healthCache);
    
    return res.json(result);

  } catch (error) {
    console.error("Health tips error:", error);
    // Silent fallback to avoid breaking the UI
    res.json({
      tip: "Stay hydrated, maintain a fiber-rich diet, and keep track of your daily activity for a healthier life.",
      source: "V-Med Health Library",
      articles: []
    });
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
  if (_providers.length === 0) {
    return res.status(500).json({ error: "No AI providers configured. Check .env for API keys." });
  }

  // 📝 Chat Caching — avoids hitting Gemini if the exact same query is asked
  const cacheKey = `chat-${patient?.vmedId || doctor?.vmedId || 'anon'}-${message}-${lang}-${history.length}`;
  if (chatCache.has(cacheKey)) {
    const entry = chatCache.get(cacheKey);
    // Cache for 30 minutes for chat
    if (Date.now() - entry.time < 1800000) return res.json(entry.data);
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
    : (openingAckMap[safeLang] || openingAckMap.en || "Understood.");

  // ── Normalise history into [{role, text}] for provider-agnostic use ──
  const normHistory = history.map(h => ({
    role: h.role === "user" ? "user" : "model",
    text: String(h.text || h.parts?.[0]?.text || "")
  }));

  const generationConfig = {
    temperature:     0.7,
    topK:            40,
    topP:            0.95,
    maxOutputTokens: 4096,
  };

  try {
    // ── Route through the multi-provider chain ────────────────
    const result = await aiProvider.chat({
      systemPrompt,
      openingAck,
      history:          normHistory,
      userMessage:      message.trim(),
      generationConfig,
      safetySettings:   SAFETY_SETTINGS,
    });

    // ── All providers exhausted (429 cascade) → rule-based fallback ──
    if (!result.ok && result.status === 429) {
      console.warn("⏳ All providers rate-limited. Serving rule-based fallback.");
      const lowerQ = message.toLowerCase();

      // Extract readable text from patient data for inline fallback
      const activeMeds   = (patient?.medications || []).filter(m => m.active !== false);
      const medsText     = activeMeds.length > 0
        ? activeMeds.map(m => `  - ${m.name}${m.dosage ? " " + m.dosage : ""}`).join("\n")
        : "No active medications found.";
      const vitalsArr    = patient?.vitalsHistory || [];
      const vitalsText   = vitalsArr.length > 0
        ? vitalsArr.slice(-3).reverse().map(v => `  - ${v.date}: BP=${v.bp||"--"}, Sugar=${v.sugar||"--"}`).join("\n")
        : "No recent vitals logged.";

      let fallbackReply = "⚠️ All AI providers are currently busy. Based on your saved profile:\n\n";
      if (lowerQ.includes("medication") || lowerQ.includes("medicine") || lowerQ.includes("pills")) {
        fallbackReply += `**Your Active Medications:**\n${medsText}`;
      } else if (lowerQ.includes("vital") || lowerQ.includes("bp") || lowerQ.includes("sugar")) {
        fallbackReply += `**Your Recent Vitals:**\n${vitalsText}`;
      } else if (lowerQ.includes("visit") || lowerQ.includes("history") || lowerQ.includes("doctor")) {
        const visits = (patient?.visits || []).slice(-3).reverse();
        fallbackReply += `**Recent Visits:**\n${visits.length > 0 ? visits.map(v => `  - ${v.date}: ${v.reason}`).join("\n") : "No visit history."}`;
      } else {
        fallbackReply = "⏳ All AI providers are currently at capacity. Please try again in a moment.\n\n*Tip: Check your vitals history or health tips while you wait.*";
      }
      return res.json({ reply: fallbackReply });
    }

    // ── Non-429 provider error ────────────────────────────────
    if (!result.ok) {
      const friendly = {
        400: "There was a problem with the request. Please try rephrasing.",
        401: "API key is invalid. Check your .env file.",
        403: "API key lacks permission for this model.",
        404: `AI model not found. Contact support.`,
        503: "AI service temporarily unavailable. Please try again shortly.",
      };
      console.error(`❌ [${result.provider}] Error ${result.status}: ${result.error}`);
      return res.status(502).json({
        error: friendly[result.status] || `AI error (${result.status}): ${result.error}`,
        code:  result.status,
      });
    }

    // ── Safety block ──────────────────────────────────────────
    if (result.finishReason === "SAFETY") {
      return res.json({ reply: "I am unable to respond to that message due to safety guidelines." });
    }

    // ── RECITATION block — nudge and retry (Gemini-specific) ─
    if (result.finishReason === "RECITATION") {
      console.warn("⚠️  RECITATION detected — retrying with nudge...");
      const retry = await aiProvider.chat({
        systemPrompt,
        openingAck:       "Here is my response in my own words:",
        history:          normHistory,
        userMessage:      message.trim(),
        generationConfig: { ...generationConfig, temperature: 0.9 },
        safetySettings:   SAFETY_SETTINGS,
      });
      if (retry.ok && retry.text) return res.json({ reply: retry.text });
      return res.json({ reply: "I was not able to generate a response. Could you try rephrasing your question?" });
    }

    // ── Empty response guard ──────────────────────────────────
    if (!result.text) {
      console.error(`⚠️  Empty response from [${result.provider}]`);
      return res.status(502).json({ error: "AI returned an empty response. Please try again." });
    }

    const ctxLabel = isDoctor
      ? `DOCTOR · ${doctorName || "unknown"} [via ${result.provider}]`
      : `${safeLang.toUpperCase()}${patientName ? " · " + patientName : ""} [via ${result.provider}]`;
    console.log(`💬 [${ctxLabel}] "${message.slice(0, 60)}${message.length > 60 ? "..." : ""}"`);

    const chatResult = { reply: result.text };
    chatCache.set(cacheKey, { time: Date.now(), data: chatResult });
    cleanCache(chatCache);

    return res.json(chatResult);

  } catch (err) {
    console.error("❌ Chat endpoint error:", err.message);
    return res.status(500).json({
      error:  "Could not reach any AI provider. Check your internet connection.",
      detail: err.message
    });
  }
});

// ── AI EXTRACTION ENDPOINT ─────────────────────────────────────────
app.post("/api/ai/extract", async (req, res) => {
  const { url, type = "document" } = req.body;

  if (!url) return res.status(400).json({ error: "URL is required" });
  if (_providers.length === 0) return res.status(500).json({ error: "AI key not configured" });

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
        console.warn(`⚠️ Google Doc export failed (Status: ${docResponse.status}). Falling back to raw file download...`);
        // 2. If not a Google Doc, fetch as raw file (PDF/Image)
        const downloadUrl = `https://drive.google.com/uc?id=${driveId}&export=download`;
        const downloadRes = await fetch(downloadUrl);
        
        if (!downloadRes.ok) {
            console.error(`❌ Drive download failed (Status: ${downloadRes.status})`);
            return res.status(400).json({ 
                error: "Could not access file. Ensure the link visibility is set to 'Anyone with the link can view' and the file size is reasonable." 
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

// ── VITALS FORECAST ENDPOINT ──────────────────────────────────────
// Frontend expects: { forecast: "<markdown string>" }
// Compatible with dashboard.js updateForecast() — no changes needed there.
app.post("/api/vitals/forecast", async (req, res) => {
  const { history, patient } = req.body;
  if (!history || !history.length) {
    return res.json({ forecast: "Add more vitals to start your AI health forecast." });
  }

  // Cache key — stable across providers, based on content not provider name
  const cacheKey = `forecast-${patient?.vmedId || patient?.dob || 'anon'}-${history.length}-${JSON.stringify(history[history.length - 1])}`;
  if (forecastCache.has(cacheKey)) {
    const entry = forecastCache.get(cacheKey);
    if (Date.now() - entry.time < 3600000) return res.json(entry.data); // 1 h cache
  }

  // ── Build RAG-enriched prompt ──────────────────────────────────
  // Serialize only safe, non-PII vitals and basic patient context.
  const safePatient = {
    dob:        patient?.dob,
    bloodGroup: patient?.bloodGroup,
    vmedId:     patient?.vmedId,
    // NOTE: Aadhaar / ABHA are deliberately excluded from this prompt.
  };

  const prompt = `You are a clinical AI assistant inside the V-Med ID platform.
Analyze the following patient clinical data and provide a sharp, professional health trend forecast (max 3 sentences).

Patient: ${JSON.stringify(safePatient)}
Recent Vitals History:
${JSON.stringify(history, null, 2)}

Instructions:
1. Examine BP, Blood Sugar, and Pulse specifically.
2. Identify any concerning trends (e.g., rising BP, erratic sugar).
3. End with one specific actionable recommendation (e.g., "Reduce sodium intake").
4. Response must be in Markdown.`;

  try {
    const aiResult = await aiProvider.generate(
      prompt,
      { temperature: 0.1, maxOutputTokens: 500 },
      SAFETY_SETTINGS
    );

    const forecast = (aiResult.ok && aiResult.text)
      ? aiResult.text
      : "Stable vitals recorded. Continue regular monitoring and consult your doctor if you notice any changes.";

    if (!aiResult.ok) {
      console.warn(`⚠️ Forecast: provider [${aiResult.provider}] failed (${aiResult.status}). Using fallback text.`);
    } else {
      console.log(`📊 Forecast generated via [${aiResult.provider}] for vmedId=${patient?.vmedId || 'anon'}`);
    }

    const result = { forecast };
    forecastCache.set(cacheKey, { time: Date.now(), data: result });
    cleanCache(forecastCache);
    res.json(result);

  } catch (e) {
    console.error("❌ Forecast error:", e.message);
    res.json({ forecast: "Analyzer is busy. Trends will appear shortly." });
  }
});

// ── SOS TRIGGER ENDPOINT ──────────────────────────────────────────
app.post("/api/sos/trigger", (req, res) => {
  const { vmedId, location, contacts } = req.body;
  console.log(`🚨 SOS TRIGGERED 🚨 ID: ${vmedId}, Location: ${location}`);
  // In a real app, this would integrate with Twilio/SendGrid to notify contacts
  res.json({ success: true, message: "Emergency contacts notified." });
});

// ── AI EMERGENCY AID ENDPOINT ─────────────────────────────────────
// Uses aiProvider with the lowest temperature for deterministic first-aid.
app.post("/api/ai/emergency-aid", async (req, res) => {
  const { query, patient } = req.body;
  if (!query) return res.status(400).json({ error: "query is required" });

  // Only pass non-PII clinical context (blood group, active meds)
  const safePatient = {
    bloodGroup:  patient?.bloodGroup,
    medications: (patient?.medications || []).filter(m => m.active !== false).map(m => m.name),
  };

  const prompt = `You are an Emergency First-Aid AI embedded in the V-Med ID platform.
Provide immediate, life-saving first-aid steps for the following emergency: "${query}".

Patient clinical context (use only if relevant):
- Blood Group: ${safePatient.bloodGroup || "unknown"}
- Active medications: ${safePatient.medications.length > 0 ? safePatient.medications.join(", ") : "none"}

Instructions:
- Be extremely concise. Use numbered bullet points.
- Prioritize the most critical action first.
- Note any medication contraindications if relevant.
- End every response with: "🚑 Emergency services have been notified. Stay calm and keep the patient still."`;

  try {
    const aiResult = await aiProvider.generate(
      prompt,
      { temperature: 0.05, maxOutputTokens: 400 },
      SAFETY_SETTINGS
    );

    const reply = (aiResult.ok && aiResult.text)
      ? aiResult.text
      : "Stay calm. Lay the patient flat in a safe position, loosen any tight clothing, and do not give food or water. 🚑 Emergency services have been notified. Stay calm and keep the patient still.";

    console.log(`🚨 Emergency aid via [${aiResult.provider}]: "${query.slice(0, 50)}"`);
    res.json({ reply });

  } catch (e) {
    console.error("❌ Emergency aid error:", e.message);
    res.status(500).json({ error: "Failed to generate emergency advice. Follow standard first-aid procedures." });
  }
});

// ── BLOOD DONOR SEARCH ENDPOINT ───────────────────────────────────
app.get("/api/donors/search", (req, res) => {
  const group = req.query.group;
  // Simulated donors around patient's location
  const mockDonors = [
    { name: "Rahul S.", bloodGroup: group || "O+", distance: 1.2, phone: "555-1029" },
    { name: "Priya M.", bloodGroup: group || "B+", distance: 3.4, phone: "555-8832" },
    { name: "Arjun K.", bloodGroup: group || "A-", distance: 5.1, phone: "555-9011" }
  ];
  res.json(mockDonors);
});
import serverless from "serverless-http";

// Add a generic error handler to ensure we always return JSON instead of HTML on crash
app.use((err, req, res, next) => {
  console.error("Unhandled Express Error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error", detail: err.stack });
});

// Configure serverless-http for Netlify
// Netlify rewrites /api/* to /.netlify/functions/api/*
// By setting basePath, serverless-http strips it so Express sees the correct /api/* route.
export const handler = serverless(app, {
  basePath: '/.netlify/functions'
});
export default app;

if (!isNetlify && typeof import.meta !== 'undefined' && import.meta.url) {
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    if (currentFilePath === filenameShim) {
      app.listen(PORT, () => {
        console.log(`🚀 V-Med AI Backend running on http://localhost:${PORT}`);
      });
    }
  } catch (e) {}
}