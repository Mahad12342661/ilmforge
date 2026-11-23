/* ===== App controller =====
   Connects the crypto engine (processing) to the UI (display).
   Runs the 11 steps in order and handles errors, Reset and button clicks. */
"use strict";

(function () {
  const C = window.CryptoEngine;
  const U = window.UI;
  const L = window.Learn;
  const el = U.el;

  let runId = 0;            // Increases on every run/reset so an old run can stop itself
  let hasRunBefore = false;

  const pause = (ms) => new Promise((r) => setTimeout(r, U.reduceMotion ? Math.min(ms, 120) : ms));
  function guard(id) { if (id !== runId) throw new Error("ABORT"); }

  async function runSimulation() {
    const message = el.input.value;
    if (!message.trim()) {
      U.showError("Please type a message for Alice to send.");
      el.input.focus();
      return;
    }
    if (!C.isAvailable()) {
      U.showError("Web Crypto is not available. Open this page over HTTPS (or localhost) in a modern browser.");
      return;
    }

    const id = ++runId;
    L.clear();
    U.resetAll();
    U.setBusy(true, hasRunBefore);
    let current = 0;

    // One step: highlight it, do the work, show the result, pause so viewers can follow
    async function step(i, work, hold) {
      guard(id);
      current = i;
      U.setStep(i, "active");
      U.setStatus("Step " + (i + 1) + " of " + U.STEPS.length + ": " + U.STEPS[i].title);
      const result = await work();
      guard(id);
      U.setStep(i, "done", result);
      U.setProgress(i + 1);
      await pause(hold === undefined ? 700 : hold);
      guard(id);
    }
    const tick = async () => { await pause(45); guard(id); };

    try {
      const s = {}; // everything created during this run
      U.setScreen(el.aliceText, message);

      // 1. Alice's key pair
      await step(0, async () => {
        s.alice = await C.generateKeyPair();
        U.setKeyBadge("alice");
        el.dPubA.textContent = C.toBase64(s.alice.publicBytes);
        return "Public key: " + s.alice.publicBytes.length + " bytes. Private key: NOT EXPORTED.";
      });

      // 2. Bob's key pair
      await step(1, async () => {
        s.bob = await C.generateKeyPair();
        U.setKeyBadge("bob");
        el.dPubB.textContent = C.toBase64(s.bob.publicBytes);
        return "Public key: " + s.bob.publicBytes.length + " bytes. Private key: NOT EXPORTED.";
      });

      // 3. Exchange PUBLIC keys; each side rebuilds the other's key from the bytes it received
      await step(2, async () => {
        const wireA = C.toBase64(s.alice.publicBytes);
        const wireB = C.toBase64(s.bob.publicBytes);
        U.sendPacket("Alice public key →", "row1");
        U.sendPacket("← Bob public key", "row2 rev");
        U.logEve("Alice's public key (" + s.alice.publicBytes.length + " bytes): public, safe to see");
        U.logEve("Bob's public key (" + s.bob.publicBytes.length + " bytes): public, safe to see");
        await pause(1500);
        guard(id);
        s.alicePubAtBob = C.fromBase64(wireA);
        s.bobPubAtAlice = C.fromBase64(wireB);
        s.aliceSeesBob = await C.importPublicKey(s.bobPubAtAlice);
        s.bobSeesAlice = await C.importPublicKey(s.alicePubAtBob);
        return "Exchanged public keys only. Private keys were never sent.";
      }, 300);

      // 4. ECDH on each side, independently
      await step(3, async () => {
        s.secretAlice = await C.deriveSharedSecret(s.alice.privateKey, s.aliceSeesBob);
        s.secretBob = await C.deriveSharedSecret(s.bob.privateKey, s.bobSeesAlice);
        if (!C.bytesEqual(s.secretAlice, s.secretBob)) throw new Error("Alice and Bob derived different shared secrets.");
        s.fpAlice = await C.fingerprint(s.secretAlice);
        s.fpBob = await C.fingerprint(s.secretBob);
        const fp = s.fpAlice;
        return "Shared secrets match. Fingerprint: " + fp + "… (secret itself is not shown)";
      });

      // 5. HKDF-SHA-256 -> AES-256-GCM key, separately on each side.
      // The salt is built from the two public keys, which both sides know.
      await step(4, async () => {
        s.aesAlice = await C.deriveAesKey(s.secretAlice, C.concatBytes(s.alice.publicBytes, s.bobPubAtAlice));
        s.aesBob = await C.deriveAesKey(s.secretBob, C.concatBytes(s.alicePubAtBob, s.bob.publicBytes));
        const rawA = await C.exportRawKey(s.aesAlice);
        const rawB = await C.exportRawKey(s.aesBob);
        if (!C.bytesEqual(rawA, rawB)) throw new Error("Alice and Bob derived different AES keys.");
        el.dAes.textContent = C.toHex(rawA);
        el.dMatch.textContent = "Shared secret: MATCH ✓\nDerived AES-256 key: MATCH ✓";
        el.dMatch.style.whiteSpace = "pre-line";
        return "Both sides derived the same 256-bit AES key.";
      });

      // 6. Fresh random 12-byte IV
      await step(5, async () => {
        s.iv = C.randomIv();
        el.dIv.textContent = C.toHex(s.iv) + "  (Base64: " + C.toBase64(s.iv) + ")";
        return "IV (hex): " + C.toHex(s.iv);
      });

      // 7. AES-GCM encryption of the user's message
      await step(6, async () => {
        s.cipher = await C.encrypt(s.aesAlice, s.iv, message);
        return "Encrypted " + C.byteLength(message) + " bytes into " + s.cipher.length + " bytes (includes a 16-byte authentication tag).";
      });

      // 8. Ciphertext as Base64, with a scramble animation
      await step(7, async () => {
        s.cipherB64 = C.toBase64(s.cipher);
        await U.scrambleTo(el.aliceText, "█".repeat(Math.min(message.length, 40)), "░▒▓█", tick);
        await U.scrambleTo(el.aliceCipher, s.cipherB64, null, tick);
        el.dCt.textContent = s.cipherB64;
        return "Ciphertext: " + (s.cipherB64.length > 60 ? s.cipherB64.slice(0, 60) + "…" : s.cipherB64);
      }, 400);

      // 9. Send ciphertext + IV across the untrusted channel (the only data that is sent)
      await step(8, async () => {
        const wire = JSON.stringify({ iv: C.toBase64(s.iv), ciphertext: s.cipherB64 });
        U.sendPacket("IV + ciphertext →", "data");
        U.logEve("IV (12 bytes) and ciphertext (" + s.cipher.length + " bytes): unreadable without the key");
        await pause(1500);
        guard(id);
        s.received = JSON.parse(wire);
        U.setScreen(el.bobCipher, s.received.ciphertext);
        return "Bob received " + wire.length + " characters of data.";
      }, 400);

      // 10. Bob decrypts with the key he derived himself
      await step(9, async () => {
        s.plain = await C.decrypt(s.aesBob, C.fromBase64(s.received.iv), C.fromBase64(s.received.ciphertext));
        if (s.plain !== message) throw new Error("Decrypted text does not match the original message.");
        return "Authentication tag verified. Decryption succeeded.";
      });

      // 11. Reveal the original message
      await step(10, async () => {
        await U.scrambleTo(el.bobText, s.plain, "abcdefghijklmnopqrstuvwxyz", tick);
        el.bobText.classList.add("reveal");
        return "Bob reads: \"" + s.plain + "\"";
      }, 0);

      U.setStatus("Complete: Bob successfully decrypted Alice's message.");
      U.showSummary(
        "Alice and Bob each created a key pair and swapped only their public keys. Each then combined their own private key with the other's " +
        "public key (ECDH) to get the same shared secret, which HKDF-SHA-256 turned into an AES-256-GCM key. Alice encrypted your " +
        s.plain.length + "-character message with that key and a random IV. Only the ciphertext and IV crossed the network, which an eavesdropper " +
        "cannot read without the key. Bob decrypted it with his own copy of the key, and GCM's tag confirmed it was not altered. " +
        "Remember: this demo assumes each person already trusts the other's public key."
      );
      // Hand only PUBLIC data and results to the learning mode (never private keys)
      L.setSession({
        message, plain: s.plain, verified: s.plain === message,
        alicePub: C.toBase64(s.alice.publicBytes), bobPub: C.toBase64(s.bob.publicBytes),
        secretFp: s.fpAlice, secretFpBob: s.fpBob, secretsMatch: s.fpAlice === s.fpBob,
        ivHex: C.toHex(s.iv), cipherB64: s.cipherB64, cipherBytes: s.cipher.length
      });
      hasRunBefore = true;
      U.setBusy(false, hasRunBefore);
    } catch (err) {
      if (err && err.message === "ABORT") return; // Reset or a new run took over
      const reason = err && err.message ? err.message : "Unknown error";
      U.setStep(current, "error", "Failed: " + reason);
      U.setStatus("Stopped: something went wrong.");
      U.showError("Encryption did not complete. " + reason + " No message was delivered.");
      hasRunBefore = true;
      U.setBusy(false, hasRunBefore);
    }
  }

  function reset() {
    runId++; // cancels any run in progress
    L.clear();
    hasRunBefore = false;
    U.resetAll();
    el.input.value = "";
    U.setBusy(false, false);
    el.input.focus();
  }

  // ---------- Events ----------
  el.encryptBtn.addEventListener("click", runSimulation);
  el.input.addEventListener("keydown", (e) => { if (e.key === "Enter") runSimulation(); });
  el.resetBtn.addEventListener("click", reset);
  el.scrollBtn.addEventListener("click", U.scrollToSimulator);
  el.detailsToggle.addEventListener("click", U.toggleDetails);

  // ---------- Start ----------
  U.buildSteps();
  if (!C.isAvailable()) {
    U.showError("Web Crypto is not available in this context. Please open the site over HTTPS (such as GitHub Pages) in a modern browser.");
    el.encryptBtn.disabled = true;
  }
})();
