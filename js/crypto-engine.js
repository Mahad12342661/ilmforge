/* ===== Crypto engine ("backend" logic) =====
   Does ALL the processing: key generation, key agreement, key derivation, encryption, decryption.
   It never touches the page (no DOM) and never uses the network.
   Uses only the browser's built-in Web Crypto API (crypto.subtle). */
"use strict";

window.CryptoEngine = (function () {
  const subtle = window.crypto && window.crypto.subtle;
  const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" };
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const HKDF_INFO = encoder.encode("BehindTheMessage demo: AES-256-GCM key");

  // ---------- Byte helpers ----------
  function toBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function fromBase64(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function toHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  function concatBytes(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }
  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }
  function byteLength(text) {
    return encoder.encode(text).length;
  }

  // ---------- Crypto operations ----------
  function isAvailable() {
    return Boolean(window.isSecureContext && subtle);
  }

  // ECDH key pair. The private key is NON-extractable: no code can read or send it.
  async function generateKeyPair() {
    const keys = await subtle.generateKey(ECDH_PARAMS, false, ["deriveBits"]);
    const publicBytes = new Uint8Array(await subtle.exportKey("raw", keys.publicKey));
    return { privateKey: keys.privateKey, publicBytes };
  }

  // Rebuilds a public key from the bytes that arrived over the channel
  function importPublicKey(bytes) {
    return subtle.importKey("raw", bytes, ECDH_PARAMS, false, []);
  }

  // ECDH: own private key + other side's public key -> 256-bit shared secret
  async function deriveSharedSecret(privateKey, otherPublicKey) {
    return new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: otherPublicKey }, privateKey, 256));
  }

  // Short SHA-256 fingerprint so the secret can be compared without displaying it
  async function fingerprint(bytes) {
    return toHex(new Uint8Array(await subtle.digest("SHA-256", bytes))).slice(0, 16);
  }

  // HKDF-SHA-256: shared secret -> AES-256-GCM key.
  // extractable=true ONLY so this educational demo can display the key. Real apps keep it false.
  async function deriveAesKey(secret, salt) {
    const baseKey = await subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
    return subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt, info: HKDF_INFO },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  async function exportRawKey(key) {
    return new Uint8Array(await subtle.exportKey("raw", key));
  }

  function randomIv() {
    return crypto.getRandomValues(new Uint8Array(12)); // 12 bytes = standard size for AES-GCM
  }

  async function encrypt(key, iv, plaintext) {
    return new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext)));
  }

  // Throws a friendly error if the key is wrong or the data was changed (GCM tag check fails)
  async function decrypt(key, iv, ciphertext) {
    try {
      const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      return decoder.decode(plain);
    } catch (e) {
      throw new Error("Decryption failed: the data was altered or the key was wrong, so Bob rejected it.");
    }
  }

  return {
    isAvailable, toBase64, fromBase64, toHex, concatBytes, bytesEqual, byteLength,
    generateKeyPair, importPublicKey, deriveSharedSecret, fingerprint,
    deriveAesKey, exportRawKey, randomIv, encrypt, decrypt
  };
})();
