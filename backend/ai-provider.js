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

// ── SAFETY SETTINGS (Gemini-specific, ignored by OpenAI-compat providers) ────
export const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
];

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
      let result = await provider.call({ systemPrompt, history, userMessage, generationConfig });

      if (result.ok) {
        console.log(`✅ [${provider.name}] responded successfully.`);
        return { ...result, provider: provider.name };
      }

      if (result.status === 429 || result.status >= 500) {
        const reason = result.status === 429 ? "Rate limited (429)" : `Server error (${result.status})`;
        console.warn(`⏳ [${provider.name}] ${reason}. Failing over to next provider...`);
        continue;
      }

      // Auth errors (401/403) — the key for THIS provider is bad, but
      // other providers have independent keys, so try the next one.
      if (result.status === 401 || result.status === 403) {
        console.warn(`🔑 [${provider.name}] Auth error (${result.status}): ${result.error}. Trying next provider...`);
        continue;
      }

      // Non-retriable request error (400) — return immediately, don't failover
      console.error(`❌ [${provider.name}] Error ${result.status}: ${result.error}`);
      return { ...result, provider: provider.name };
    }

    // All providers exhausted
    console.error("❌ All AI providers exhausted (rate-limited or auth failed).");
    return {
      ok:          false,
      status:      503,
      text:        null,
      finishReason: null,
      raw:         {},
      error:       "All AI providers failed. Please check API keys or try again in a moment.",
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
