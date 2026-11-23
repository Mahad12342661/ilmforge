/* ===== UI ("frontend" display) =====
   Only controls what is shown on the page. Contains no cryptography. */
"use strict";

window.UI = (function () {
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The 11 stages shown as step cards
  const STEPS = [
    { title: "Alice generates a key pair", text: "Alice creates an ECDH public/private key pair. Her private key stays locked inside the browser." },
    { title: "Bob generates a key pair", text: "Bob independently creates his own ECDH public/private key pair." },
    { title: "Public keys are exchanged", text: "Only the PUBLIC keys cross the untrusted channel. Private keys never leave their owners." },
    { title: "Both derive the same shared secret", text: "Alice: her private key + Bob's public key. Bob: his private key + Alice's public key. Same result." },
    { title: "HKDF-SHA-256 makes an AES key", text: "Each side stretches the shared secret into a proper 256-bit AES-GCM key using HKDF." },
    { title: "Alice generates a random IV", text: "A fresh random 12-byte initialisation vector ensures this encryption is unique." },
    { title: "AES-GCM encrypts the message", text: "Alice's message is encrypted with the AES-256-GCM key and the IV." },
    { title: "Ciphertext shown as Base64", text: "The encrypted bytes look like random data. Base64 just makes them printable." },
    { title: "Ciphertext + IV are sent", text: "The ciphertext and IV travel across the untrusted channel. Anyone can see them." },
    { title: "Bob decrypts with his own key", text: "Bob uses the AES key he derived himself, plus the IV, to decrypt and verify the ciphertext." },
    { title: "Original message revealed", text: "Bob's screen shows the recovered plaintext, proving the whole process worked." }
  ];

  const el = {
    input: $("messageInput"), encryptBtn: $("encryptBtn"), resetBtn: $("resetBtn"), scrollBtn: $("scrollBtn"),
    errorBox: $("errorBox"), statusLine: $("statusLine"), progressCount: $("progressCount"), progressBar: $("progressBar"),
    aliceCard: $("aliceCard"), bobCard: $("bobCard"),
    aliceText: $("aliceText"), aliceCipher: $("aliceCipher"), bobCipher: $("bobCipher"), bobText: $("bobText"),
    aliceBadge: $("aliceKeyBadge"), bobBadge: $("bobKeyBadge"),
    packets: $("packetLayer"), eveLog: $("eveLog"), stepList: $("stepList"),
    summary: $("summary"), summaryText: $("summaryText"),
    detailsToggle: $("detailsToggle"), detailsPanel: $("detailsPanel"),
    dPubA: $("dPubA"), dPubB: $("dPubB"), dAes: $("dAes"), dIv: $("dIv"), dCt: $("dCt"), dMatch: $("dMatch")
  };

  function buildSteps() {
    el.stepList.textContent = "";
    STEPS.forEach((s, i) => {
      const li = document.createElement("li");
      li.className = "step";
      li.id = "step-" + i;
      const num = document.createElement("span");
      num.className = "step-num";
      num.textContent = String(i + 1);
      const body = document.createElement("div");
      const h = document.createElement("h4");
      h.textContent = s.title;
      const p = document.createElement("p");
      p.textContent = s.text;
      const r = document.createElement("div");
      r.className = "result";
      body.append(h, p, r);
      li.append(num, body);
      el.stepList.appendChild(li);
    });
  }

  function setStep(i, state, result) {
    const li = $("step-" + i);
    li.className = "step " + state;
    if (result !== undefined) li.querySelector(".result").textContent = result;
  }

  function setProgress(done) {
    el.progressBar.style.width = (done / STEPS.length) * 100 + "%";
    el.progressCount.textContent = done + " / " + STEPS.length;
  }

  function setStatus(text) { el.statusLine.textContent = text; }

  function setScreen(node, text) {
    node.textContent = text;
    node.classList.add("has-text");
    node.classList.remove("reveal");
  }

  function resetScreen(node, placeholder) {
    node.textContent = placeholder;
    node.classList.remove("has-text", "reveal");
  }

  function showError(msg) { el.errorBox.textContent = msg; el.errorBox.hidden = false; }
  function clearError() { el.errorBox.hidden = true; el.errorBox.textContent = ""; }

  function logEve(text) {
    if (el.eveLog.querySelector(".muted")) el.eveLog.textContent = "";
    const li = document.createElement("li");
    li.textContent = text;
    el.eveLog.appendChild(li);
  }

  // Animated packet crossing the untrusted channel
  function sendPacket(label, kind) {
    const p = document.createElement("div");
    p.className = "packet " + kind;
    p.textContent = label;
    el.packets.appendChild(p);
    setTimeout(() => p.remove(), 1600);
  }

  // Characters flicker, then settle on the final text left to right.
  // `tick` is awaited every frame (the controller uses it to pause and to cancel).
  async function scrambleTo(node, finalText, charset, tick) {
    const chars = charset || "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const frames = reduceMotion ? 1 : 14;
    node.classList.add("has-text");
    for (let f = 0; f <= frames; f++) {
      const locked = Math.floor((finalText.length * f) / frames);
      let out = finalText.slice(0, locked);
      for (let k = locked; k < finalText.length; k++) {
        out += finalText[k] === " " ? " " : chars[Math.floor(Math.random() * chars.length)];
      }
      node.textContent = out;
      await tick();
    }
    node.textContent = finalText;
  }

  function setBusy(isBusy, hasRunBefore) {
    el.encryptBtn.disabled = isBusy;
    el.input.disabled = isBusy;
    el.encryptBtn.textContent = isBusy ? "Encrypting..." : (hasRunBefore ? "Encrypt Again" : "Encrypt Message");
  }

  function setKeyBadge(who) {
    const badge = who === "alice" ? el.aliceBadge : el.bobBadge;
    const card = who === "alice" ? el.aliceCard : el.bobCard;
    badge.textContent = "Public key ready · Private key locked";
    badge.classList.add("on");
    card.classList.add("active");
  }

  function showSummary(text) { el.summaryText.textContent = text; el.summary.hidden = false; }

  function toggleDetails() {
    const open = el.detailsToggle.getAttribute("aria-expanded") === "true";
    el.detailsToggle.setAttribute("aria-expanded", String(!open));
    el.detailsPanel.hidden = open;
  }

  function scrollToSimulator() {
    $("simulator").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    setTimeout(() => el.input.focus({ preventScroll: true }), 400);
  }

  function resetAll() {
    clearError();
    setProgress(0);
    setStatus('Ready. Press "Encrypt Message" to begin.');
    STEPS.forEach((_, i) => setStep(i, "", ""));
    resetScreen(el.aliceText, "Waiting…");
    resetScreen(el.aliceCipher, "—");
    resetScreen(el.bobCipher, "—");
    resetScreen(el.bobText, "Waiting…");
    for (const b of [el.aliceBadge, el.bobBadge]) { b.textContent = "No keys yet"; b.classList.remove("on"); }
    el.aliceCard.classList.remove("active");
    el.bobCard.classList.remove("active");
    el.packets.textContent = "";
    el.eveLog.textContent = "";
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Nothing sent yet.";
    el.eveLog.appendChild(li);
    el.summary.hidden = true;
    el.dPubA.textContent = "Not generated yet";
    el.dPubB.textContent = "Not generated yet";
    el.dAes.textContent = "Not derived yet";
    el.dIv.textContent = "Not generated yet";
    el.dCt.textContent = "Not encrypted yet";
    el.dMatch.textContent = "Not checked yet";
  }

  return {
    el, STEPS, reduceMotion,
    buildSteps, setStep, setProgress, setStatus, setScreen, resetScreen,
    showError, clearError, logEve, sendPacket, scrambleTo, setBusy, setKeyBadge,
    showSummary, toggleDetails, scrollToSimulator, resetAll
  };
})();
