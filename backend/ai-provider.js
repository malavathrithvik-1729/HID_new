/**
 * V-Med AI Provider — Multi-provider RAG engine
 * ------------------------------------------------
 * Provider chain (in priority order):
 *   1. Gemini 2.0 Flash  (primary)
 *   2. Groq / Llama-3.3-70b  (429 fallback)
 *
 * Both providers share a common interface so endpoints
 * are completely provider-agnostic.
 */



// ── SAFETY SETTINGS (Gemini-specific, ignored by OpenAI-compat providers) ────
export const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
];

// ── GEMINI PROVIDER ───────────────────────────────────────────────────────────
export class GeminiProvider {
  /**
   * @param {string} apiKey
   * @param {string} model  e.g. "gemini-2.0-flash"
   */
  constructor(apiKey, model = "gemini-2.0-flash") {
    this.name    = "Gemini";
    this.apiKey  = apiKey;
    this.model   = model;
  }

  get _url() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
  }

  /**
   * Build the Gemini `contents` array from the canonical chat format.
   *
   * @param {Array}    history         [{role:"user"|"model", parts:[{text}]}]
   * @param {string}   userMessage     The final user message for this turn
   */
  buildContents(history = [], userMessage) {
    return [
      ...history.map(h => ({
        role:  h.role === "user" ? "user" : "model",
        parts: [{ text: String(h.text || h.parts?.[0]?.text || "") }]
      })),
      { role: "user",  parts: [{ text: userMessage }] },
    ];
  }

  /**
   * Build the Gemini system_instruction object.
   *
   * @param {string} systemPrompt
   * @param {string} openingAck
   */
  buildSystemInstruction(systemPrompt, openingAck) {
    return {
      role: "system",
      parts: [{ text: `${systemPrompt}\n\nAcknowledgement: ${openingAck}` }]
    };
  }

  /**
   * Call Gemini generateContent.
   *
   * @param {object}  opts
   * @param {Array}   opts.contents          Gemini-format contents array
   * @param {object}  opts.generationConfig
   * @param {Array}   opts.safetySettings
   * @returns {Promise<ProviderResult>}
   */
  async call({ contents, systemInstruction, generationConfig, safetySettings }) {
    let resp, data;
    try {
      const body = { contents, generationConfig, safetySettings };
      if (systemInstruction) body.system_instruction = systemInstruction;

      resp = await fetch(this._url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      data = await resp.json();
    } catch (e) {
      return { ok: false, status: 0, text: null, finishReason: null, error: e.message };
    }

    const candidate    = data.candidates?.[0];
    const text         = candidate?.content?.parts?.[0]?.text ?? null;
    const finishReason = candidate?.finishReason ?? null;
    const errCode      = data.error?.code  || (resp.ok ? null : resp.status);
    const errMsg       = data.error?.message || null;

    return {
      ok:          resp.ok && !data.error,
      status:      errCode ?? resp.status,
      text,
      finishReason,
      raw:         data,
      error:       errMsg,
    };
  }
}

// ── GROQ PROVIDER (OpenAI-compatible) ─────────────────────────────────────────
export class GroqProvider {
  /**
   * @param {string} apiKey
   * @param {string} model   e.g. "llama-3.3-70b-versatile"
   */
  constructor(apiKey, model = "llama-3.3-70b-versatile") {
    this.name   = "Groq";
    this.apiKey = apiKey;
    this.model  = model;
    this._url   = "https://api.groq.com/openai/v1/chat/completions";
  }

  /**
   * Convert Gemini-style `contents` + `systemPrompt` into OpenAI messages.
   * The system prompt becomes a `{ role: "system" }` message.
   * Gemini "model" role maps to OpenAI "assistant".
   */
  _buildMessages(systemPrompt, history = [], userMessage) {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

    for (const h of history) {
      const role    = h.role === "user" ? "user" : "assistant";
      const content = h.text || h.parts?.[0]?.text || "";
      if (content) messages.push({ role, content });
    }

    messages.push({ role: "user", content: userMessage });
    return messages;
  }

  /**
   * Call Groq chat completions.
   *
   * @param {object}  opts
   * @param {string}  opts.systemPrompt
   * @param {Array}   opts.history          [{role, text}] or [{role, parts}]
   * @param {string}  opts.userMessage
   * @param {object}  opts.generationConfig
   * @returns {Promise<ProviderResult>}
   */
  async call({ systemPrompt, history = [], userMessage, generationConfig = {} }) {
    const messages = this._buildMessages(systemPrompt, history, userMessage);

    let resp, data;
    try {
      resp = await fetch(this._url, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model:       this.model,
          messages,
          temperature: generationConfig.temperature   ?? 0.7,
          max_tokens:  generationConfig.maxOutputTokens ?? 4096,
          top_p:       generationConfig.topP           ?? 0.95,
        }),
      });
      data = await resp.json();
    } catch (e) {
      return { ok: false, status: 0, text: null, finishReason: null, error: e.message };
    }

    const text         = data.choices?.[0]?.message?.content ?? null;
    const finishReason = data.choices?.[0]?.finish_reason    ?? null;
    const errMsg       = data.error?.message ?? null;

    // Groq returns 429 with { error: { type: "rate_limit_exceeded" } }
    return {
      ok:          resp.ok && !data.error,
      status:      resp.status,
      text,
      finishReason,
      raw:         data,
      error:       errMsg,
    };
  }
}

// ── OPENROUTER PROVIDER (OpenAI-compatible free-tier) ─────────────────────────
export class OpenRouterProvider {
  /**
   * @param {string} apiKey
   * @param {string} model   e.g. "meta-llama/llama-3.3-70b-instruct:free"
   */
  constructor(apiKey, model = "meta-llama/llama-3.3-70b-instruct:free") {
    this.name   = "OpenRouter";
    this.apiKey = apiKey;
    this.model  = model;
    this._url   = "https://openrouter.ai/api/v1/chat/completions";
  }

  _buildMessages(systemPrompt, history = [], userMessage) {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    for (const h of history) {
      const role    = h.role === "user" ? "user" : "assistant";
      const content = h.text || h.parts?.[0]?.text || "";
      if (content) messages.push({ role, content });
    }
    messages.push({ role: "user", content: userMessage });
    return messages;
  }

  async call({ systemPrompt, history = [], userMessage, generationConfig = {} }) {
    const messages = this._buildMessages(systemPrompt, history, userMessage);

    let resp, data;
    try {
      resp = await fetch(this._url, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer":  "https://vmed-id.app",
          "X-Title":       "V-Med ID",
        },
        body: JSON.stringify({
          model:       this.model,
          messages,
          temperature: generationConfig.temperature    ?? 0.7,
          max_tokens:  generationConfig.maxOutputTokens ?? 4096,
        }),
      });
      data = await resp.json();
    } catch (e) {
      return { ok: false, status: 0, text: null, finishReason: null, error: e.message };
    }

    const text         = data.choices?.[0]?.message?.content ?? null;
    const finishReason = data.choices?.[0]?.finish_reason    ?? null;
    const errMsg       = data.error?.message ?? null;

    return {
      ok:          resp.ok && !data.error,
      status:      resp.status,
      text,
      finishReason,
      raw:         data,
      error:       errMsg,
    };
  }
}

// ── AI PROVIDER ORCHESTRATOR ─────────────────────────────────────────────────
/**
 * AIProvider — chains multiple providers with automatic 429 failover.
 *
 * Usage:
 *   const ai = new AIProvider([geminiProvider, groqProvider]);
 *   const result = await ai.chat({ ... });
 *
 * @typedef {object} ProviderResult
 * @property {boolean}     ok
 * @property {number}      status
 * @property {string|null} text
 * @property {string|null} finishReason
 * @property {object}      raw
 * @property {string|null} error
 */
export class AIProvider {
  /**
   * @param {Array<GeminiProvider|GroqProvider|OpenRouterProvider>} providers
   *        Ordered list — first is primary, rest are fallbacks.
   */
  constructor(providers) {
    if (!providers || providers.length === 0) {
      throw new Error("AIProvider requires at least one provider.");
    }
    this.providers = providers;
  }

  /**
   * General-purpose chat call with automatic provider failover.
   *
   * For Gemini: pass `contents` (already built via GeminiProvider.buildContents).
   * For Groq/OpenRouter: pass `systemPrompt`, `history`, `userMessage`.
   *
   * The orchestrator passes ALL params to each provider — each provider
   * picks what it needs and ignores the rest.
   *
   * @param {object} opts
   * @param {string}           opts.systemPrompt
   * @param {string}           opts.openingAck       Gemini acknowledgement turn
   * @param {Array}            opts.history
   * @param {string}           opts.userMessage
   * @param {object}           opts.generationConfig
   * @param {Array}            opts.safetySettings
   * @returns {Promise<ProviderResult>}
   */
  async chat({ systemPrompt, openingAck = "Understood.", history = [], userMessage, generationConfig = {}, safetySettings = [] }) {
    for (const provider of this.providers) {
      let result;

      if (provider instanceof GeminiProvider) {
        const contents = provider.buildContents(history, userMessage);
        const systemInstruction = provider.buildSystemInstruction(systemPrompt, openingAck);
        result = await provider.call({ contents, systemInstruction, generationConfig, safetySettings });
      } else {
        // OpenAI-compatible provider (Groq, OpenRouter)
        result = await provider.call({ systemPrompt, history, userMessage, generationConfig });
      }

      if (result.ok) {
        console.log(`✅ [${provider.name}] responded successfully.`);
        return { ...result, provider: provider.name };
      }

      if (result.status === 429 || result.status >= 500) {
        const reason = result.status === 429 ? "Rate limited (429)" : `Server error (${result.status})`;
        console.warn(`⏳ [${provider.name}] ${reason}. Failing over to next provider...`);
        continue;
      }

      // Non-retriable error (400, 401, 403...) — return immediately, don't failover
      console.error(`❌ [${provider.name}] Error ${result.status}: ${result.error}`);
      return { ...result, provider: provider.name };
    }

    // All providers exhausted
    console.error("❌ All AI providers exhausted or rate-limited.");
    return {
      ok:          false,
      status:      429,
      text:        null,
      finishReason: null,
      raw:         {},
      error:       "All AI providers are currently rate-limited. Please try again in a moment.",
      provider:    "none",
    };
  }

  /**
   * Simple single-turn text generation (used for forecasts, tips, extraction).
   * Wraps `chat()` with a minimal system prompt.
   *
   * @param {string} prompt           The user prompt
   * @param {object} generationConfig
   * @param {Array}  safetySettings
   * @returns {Promise<ProviderResult>}
   */
  async generate(prompt, generationConfig = {}, safetySettings = []) {
    return this.chat({
      systemPrompt:     "You are a helpful clinical AI assistant. Provide accurate, concise, and well-formatted responses.",
      openingAck:       "Understood. I will provide a concise and accurate response.",
      history:          [],
      userMessage:      prompt,
      generationConfig,
      safetySettings,
    });
  }
}
