/* =========================================================
   PACT — client-side app shell
   Talks to the real backend in /server over same-origin fetch
   calls (cookie-based JWT session). See /docs/PRODUCT-PLAN.md
   for what's live vs. still pluggable (AI/billing/identity
   fail closed with a clear message until their API keys are
   set in server/.env).
   ========================================================= */

const PactAPI = {
  _cache: undefined, // undefined = not yet checked, null = logged out, object = user

  async me(force) {
    if (this._cache !== undefined && !force) return this._cache;
    try {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) { this._cache = null; return null; }
      const data = await r.json();
      this._cache = data.user;
      return this._cache;
    } catch (e) {
      this._cache = null;
      return null;
    }
  },

  async signup(payload) {
    const r = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Signup failed.");
    this._cache = data.user;
    return data.user;
  },

  async login({ email, password }) {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) {
      const err = new Error(data.error || "Login failed.");
      err.status = r.status;
      err.payload = data;
      throw err;
    }
    // MFA-enrolled accounts don't get a session on the first call — the
    // caller sees { mfaRequired, challengeToken } and must call
    // verifyMfaLogin() with a code before a real session exists.
    if (data.mfaRequired) return data;
    this._cache = data.user;
    return data.user;
  },

  async verifyMfaLogin({ challengeToken, code }) {
    const r = await fetch("/api/auth/mfa/verify-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ challengeToken, code }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Verification failed.");
    this._cache = data.user;
    return data.user;
  },

  async reactivate({ email, password }) {
    const r = await fetch("/api/auth/reactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Reactivation failed.");
    this._cache = data.user;
    return data.user;
  },

  async logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    this._cache = null;
  },

  async changePassword({ currentPassword, newPassword }) {
    const r = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Could not change password.");
    this._cache = data.user;
    return data.user;
  },

  isLoggedIn() { return !!this._cache; },

  tierMeta(id) {
    const tiers = {
      free:     { label: "Free",          ai: false },
      starter:  { label: "Starter",       ai: false },
      everyday: { label: "Everyday",      ai: false },
      pro:      { label: "Professional",  ai: true  },
      business: { label: "Enterprise",    ai: true  },
    };
    return tiers[id] || tiers.free;
  },

  initials(name) {
    return (name || "P").trim().split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();
  },
};

async function apiJson(url, options) {
  const r = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = {};
  try { data = await r.json(); } catch (e) { /* no body */ }
  if (!r.ok) {
    const err = new Error(data.error || `Request failed (${r.status})`);
    err.status = r.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function paintNav() {
  const user = await PactAPI.me();
  const loggedOutEls = document.querySelectorAll("[data-auth='out']");
  const loggedInEls = document.querySelectorAll("[data-auth='in']");

  loggedOutEls.forEach(el => el.style.display = user ? "none" : "");
  loggedInEls.forEach(el => el.style.display = user ? "" : "none");

  if (user) {
    document.querySelectorAll("[data-user-avatar]").forEach(el => el.textContent = PactAPI.initials(user.name));
    document.querySelectorAll("[data-user-name]").forEach(el => el.textContent = user.name);
    document.querySelectorAll("[data-user-tier]").forEach(el => el.textContent = PactAPI.tierMeta(user.tier).label);
  }
  return user;
}

function wireNavToggle() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;
  toggle.addEventListener("click", () => links.classList.toggle("open"));
  links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));
}

function wireReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); } });
  }, { threshold: 0.15 });
  els.forEach(e => io.observe(e));
}

document.addEventListener("DOMContentLoaded", async () => {
  await paintNav();
  wireNavToggle();
  wireReveal();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[pact] service worker failed:", err));
  }

  const logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await PactAPI.logout();
      window.location.href = "index.html";
    });
  }
});
