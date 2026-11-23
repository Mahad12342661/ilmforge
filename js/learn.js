/* ===== Step-by-step learning mode =====
   Shows the 7 explanation steps using the REAL values from the run that just finished.
   The judge moves with Previous / Next only. Nothing advances automatically.
   Private keys are never available here: the session only holds public data. */
"use strict";

window.Learn = (function () {
  const $ = (id) => document.getElementById(id);
  const TOTAL = 7;
  let session = null;
  let index = 0;

  // ---------- Small DOM helpers (textContent only, so user text can never run as HTML) ----------
  function make(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function node(color, who, value, valueClass) {
    const n = make("div", "lv-node " + (color || ""));
    n.appendChild(make("div", "who", who));
    n.appendChild(make("div", "val " + (valueClass || ""), value));
    return n;
  }
  function link(arrow, label) {
    const l = make("div", "lv-link");
    l.appendChild(make("strong", "", arrow));
    l.appendChild(document.createTextNode(label));
    return l;
  }
  function row(cls, ...kids) {
    const r = make("div", "lv-row " + (cls || ""));
    kids.forEach((k) => r.appendChild(k));
    return r;
  }
  function short(text, n) { return text.length > n ? text.slice(0, n) + "…" : text; }

  // ---------- The seven steps ----------
  const STEPS = [
    {
      title: "The original message",
      explain: "This is called plaintext. It is the message Alice wants to send. Anyone who can access it in readable form could understand it.",
      what: "Alice has typed a message. Right now it is ordinary, readable text.",
      why: "If it travelled across the internet like this, anyone along the way could read it.",
      analogy: "A postcard: every person who handles it can read what is written.",
      visual: (s) => {
        const v = row("", node("blue", "Alice's plaintext (readable)", s.message));
        v.style.gridTemplateColumns = "1fr";
        return [v, make("p", "lv-note", "Anyone who sees this can read it.")];
      }
    },
    {
      title: "Creating the keys",
      explain: "Each person creates two keys. A public key can be shared with others. A private key must stay secret. Think of the public key as something you can hand out, while the private key stays with its owner.",
      what: "Alice's and Bob's browsers each generated their own key pair using elliptic-curve cryptography (P-256).",
      why: "The public key can safely be shown to anyone. The private key is what makes the later secret impossible for outsiders to calculate.",
      analogy: "A business card (public) versus your house key (private). You hand out the first and never the second.",
      visual: (s) => [
        row("two",
          (() => { const n = node("blue", "Alice", ""); n.appendChild(make("div", "who", "Public key (shareable)")); n.appendChild(make("div", "val mono", s.alicePub)); n.appendChild(make("div", "who", "Private key")); n.appendChild(make("div", "val locked", "🔒 NOT EXPORTED (hidden)")); return n; })(),
          (() => { const n = node("purple", "Bob", ""); n.appendChild(make("div", "who", "Public key (shareable)")); n.appendChild(make("div", "val mono", s.bobPub)); n.appendChild(make("div", "who", "Private key")); n.appendChild(make("div", "val locked", "🔒 NOT EXPORTED (hidden)")); return n; })()
        ),
        make("p", "lv-note", "These public keys are the real ones generated a moment ago. The private keys never leave the browser's crypto engine.")
      ]
    },
    {
      title: "Exchanging public keys",
      explain: "They exchange public keys, not private keys. The public keys help them independently calculate the same shared secret.",
      what: "Alice sends her public key to Bob, and Bob sends his public key to Alice, over the untrusted channel.",
      why: "Each side now has what it needs for the maths. An eavesdropper sees these keys too, but they are not enough to build the secret.",
      analogy: "Two people swapping business cards in a crowded room. Everyone can see the cards, but nobody learns the house keys.",
      visual: (s) => [
        row("",
          node("blue", "Alice sends", short(s.alicePub, 44), "mono"),
          link("→", "to Bob"),
          node("purple", "Bob receives", short(s.alicePub, 44), "mono")
        ),
        row("",
          node("blue", "Alice receives", short(s.bobPub, 44), "mono"),
          link("←", "to Alice"),
          node("purple", "Bob sends", short(s.bobPub, 44), "mono")
        ),
        make("p", "lv-note", "Private keys are never transmitted.")
      ]
    },
    {
      title: "Creating the shared secret",
      explain: "Although they used different private and public keys, both sides calculate the same shared secret. Someone who only intercepts the public keys cannot normally calculate this secret.",
      what: "Alice combines her private key with Bob's public key (ECDH). Bob combines his private key with Alice's public key. Both get the same result.",
      why: "Now they share a secret that never travelled across the network.",
      analogy: "Two people each mixing their own secret colour with a shared public colour. They end up with the same final blend, which watchers cannot recreate.",
      visual: (s) => {
        const eq = make("div", "lv-equal");
        eq.appendChild(make("strong", "", "="));
        return [
          row("",
            node("blue", "Alice's derived secret", s.secretFp + "…", "mono"),
            eq,
            node("purple", "Bob's derived secret", s.secretFpBob + "…", "mono")
          ),
          (() => { const p = make("p", "lv-note", "Short SHA-256 fingerprints are shown, not the secret itself. "); const ok = make("span", "lv-ok", s.secretsMatch ? "✓ Alice's secret = Bob's secret" : "✗ Secrets differ"); p.appendChild(document.createElement("br")); p.appendChild(ok); return p; })()
        ];
      }
    },
    {
      title: "Creating the encryption key",
      explain: "The shared secret is processed into a usable encryption key. This key is what protects the actual message.",
      what: "Each side feeds the shared secret into HKDF with SHA-256, which produces a fresh AES-256-GCM key.",
      why: "A raw shared secret is not ideal to use directly. HKDF turns it into a clean key of exactly the right size and purpose.",
      analogy: "Turning a rough lump of metal into a precisely cut key that fits the lock.",
      visual: () => [
        row("",
          node("blue", "Input", "Shared secret"),
          link("\u2192", "HKDF + SHA-256"),
          node("purple", "Output", "AES-256-GCM key")
        ),
        (() => {
          const r = row("two",
            node("", "Algorithm", "AES-GCM (authenticated encryption)"),
            node("", "Key length", "256 bits (32 bytes)")
          );
          return r;
        })(),
        make("p", "lv-note", "Key material is hidden here on purpose. Real applications never display encryption keys.")
      ]
    },
    {
      title: "Encrypting and sending",
      explain: "AES-256-GCM uses the encryption key and a unique random IV to transform readable text into unreadable ciphertext. The IV is sent alongside the ciphertext, but it is not a secret key.",
      what: "Alice encrypts her message with the key and a fresh random 12-byte IV, then sends both across the channel.",
      why: "The ciphertext looks like random data. The IV makes sure encrypting the same message twice never gives the same output.",
      analogy: "Putting a letter in a tamper-evident safe. Anyone can carry the safe, but only the key holder can open it.",
      visual: (s) => [
        row("",
          node("blue", "Plaintext", s.message),
          link("→", "AES-256-GCM + IV"),
          node("purple", "Ciphertext (Base64)", s.cipherB64, "mono cipher")
        ),
        row("two", node("", "IV (hex, sent with ciphertext, not secret)", s.ivHex, "mono"), node("", "Size", s.cipherBytes + " bytes (includes 16-byte tag)")),
        make("p", "lv-note", "This is the actual ciphertext produced in your run.")
      ]
    },
    {
      title: "Decrypting the message",
      explain: "Bob independently derives the same AES key. He uses it with the IV to decrypt the ciphertext and recover Alice's original message.",
      what: "Bob received the IV and ciphertext. Using the key he derived himself, he decrypts and checks the authentication tag.",
      why: "If even one bit had been changed on the way, or the key were wrong, decryption would fail instead of showing a wrong message.",
      analogy: "Bob opens the safe with his own matching key and finds the letter untouched.",
      visual: (s) => [
        row("",
          node("purple", "Bob received", "IV: " + s.ivHex + "\n" + short(s.cipherB64, 70), "mono"),
          link("→", "decrypt with Bob's AES key"),
          node("green", "Bob's screen", s.plain)
        ),
        (() => { const p = make("p", "lv-note", ""); p.appendChild(make("span", "lv-ok", s.verified ? "✓ Success: authenticated, decrypted, and matches the original" : "✗ Verification failed")); return p; })()
      ]
    }
  ];

  // ---------- Rendering ----------
  function render() {
    const s = STEPS[index];
    const body = $("learnBody");
    body.textContent = "";
    // Re-trigger the gentle fade used when a step changes
    body.style.animation = "none";
    void body.offsetWidth;
    body.style.animation = "";

    body.appendChild(make("div", "learn-title", "Step " + (index + 1) + " of " + TOTAL));
    body.appendChild(make("h4", "", s.title));
    body.appendChild(make("p", "learn-explain", s.explain));

    const vis = make("div", "lv");
    s.visual(session).forEach((n) => vis.appendChild(n));
    body.appendChild(vis);

    const three = make("div", "learn-three");
    [["What's happening", s.what], ["Why it matters", s.why], ["Everyday analogy", s.analogy]].forEach(([h, t]) => {
      const d = make("div");
      d.appendChild(make("h5", "", h));
      d.appendChild(make("p", "", t));
      three.appendChild(d);
    });
    body.appendChild(three);

    $("learnCounter").textContent = "Step " + (index + 1) + " of " + TOTAL;
    const bar = $("learnProgress");
    bar.setAttribute("aria-valuenow", String(index + 1));
    Array.from(bar.children).forEach((seg, i) => {
      seg.className = i < index ? "done" : i === index ? "current" : "";
    });
    $("learnPrev").disabled = index === 0;
    $("learnNext").disabled = index === TOTAL - 1;
  }

  // ---------- Public controls ----------
  function setSession(data) { session = data; }

  function open() {
    if (!session) return;
    index = 0;
    $("learnMode").hidden = false;
    render();
    $("learnMode").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function close() {
    $("learnMode").hidden = true;
  }

  function clear() {
    session = null;
    close();
  }

  function isOpen() { return !$("learnMode").hidden; }
  function next() { if (index < TOTAL - 1) { index++; render(); } }
  function prev() { if (index > 0) { index--; render(); } }

  // Build progress segments and wire up the buttons
  const bar = $("learnProgress");
  for (let i = 0; i < TOTAL; i++) bar.appendChild(document.createElement("span"));
  $("learnNext").addEventListener("click", next);
  $("learnPrev").addEventListener("click", prev);
  $("learnClose").addEventListener("click", close);
  $("exploreBtn").addEventListener("click", open);
  document.addEventListener("keydown", (e) => {
    if (!isOpen() || e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  });

  return { setSession, open, close, clear };
})();
