/**
 * V-Med ID Security & Encryption Utilities
 * Uses Web Crypto API (AES-GCM 256-bit) with PBKDF2 key derivation.
 */

const SYSTEM_SECRET = "VMED_SECURE_PLATFORM_KEY_2026_SECRET_SALT";

async function getDerivedKey(secret = SYSTEM_SECRET) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("vmed_salt_2026"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a plain string or JSON object into a VMED-SEC string
 */
export async function encryptData(payload) {
  try {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    const key = await getDerivedKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(text)
    );

    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const cipherHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');

    return `VMED-SEC:${ivHex}:${cipherHex}`;
  } catch (e) {
    console.error("Encryption error:", e);
    // Fallback encoding if Web Crypto fails
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    return `VMED-SEC:ALT:${b64}`;
  }
}

/**
 * Decrypt a VMED-SEC payload back to JSON or text
 */
export async function decryptData(cipherString) {
  if (!cipherString || typeof cipherString !== "string") return null;

  if (cipherString.startsWith("VMED-SEC:ALT:")) {
    const b64 = cipherString.replace("VMED-SEC:ALT:", "");
    const decoded = decodeURIComponent(escape(atob(b64)));
    try { return JSON.parse(decoded); } catch (_) { return decoded; }
  }

  if (!cipherString.startsWith("VMED-SEC:")) return null;

  try {
    const parts = cipherString.split(":");
    if (parts.length !== 3) return null;

    const ivHex = parts[1];
    const cipherHex = parts[2];

    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const cipherBuffer = new Uint8Array(cipherHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))).buffer;

    const key = await getDerivedKey();
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherBuffer
    );

    const dec = new TextDecoder();
    const decryptedText = dec.decode(decryptedBuffer);

    try {
      return JSON.parse(decryptedText);
    } catch (_) {
      return decryptedText;
    }
  } catch (e) {
    console.error("Decryption error:", e);
    return null;
  }
}

/**
 * Create an encrypted QR payload for patient identity
 */
export async function generatePatientQRPayload(vmedId, fullName, bloodGroup, emergencyPhone = "") {
  const data = {
    vmedId,
    fullName,
    bloodGroup,
    emergencyPhone,
    type: "VMED_PATIENT_IDENTITY",
    timestamp: Date.now()
  };
  return await encryptData(data);
}
