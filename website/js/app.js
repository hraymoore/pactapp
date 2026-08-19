/* =========================================================
   PACT — client-side app shell
   NOTE: There is no real backend wired up yet. Profile
   storage, "signing", and AI panels below are local mocks
   (localStorage) that stand in for the real identity,
   e-signature and AI services described in
   /docs/PRODUCT-PLAN.md. Swap PactAuth.* for real API calls
   when the backend/third-party integrations are connected.
   ========================================================= */

const PactAuth = {
  KEY: "pact_profile",

  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); }
    catch (e) { return null; }
  },

  save(profile) {
    localStorage.setItem(this.KEY, JSON.stringify(profile));
  },

  logout() {
    localStorage.removeItem(this.KEY);
    window.location.href = "index.html";
  },

  isLoggedIn() { return !!this.get(); },

  tierMeta(id) {
    const tiers = {
      starter:  { label: "Starter",       ai: false },
      everyday: { label: "Everyday",      ai: false },
      pro:      { label: "Professional",  ai: true  },
      business: { label: "Enterprise",    ai: true  },
    };
    return tiers[id] || tiers.starter;
  },

  initials(name) {
    return (name || "P").trim().split(/\s+/).map(s => s[0]).slice(0,2).join("").toUpperCase();
  }
};

function paintNav() {
  const profile = PactAuth.get();
  const loggedOutEls = document.querySelectorAll("[data-auth='out']");
  const loggedInEls = document.querySelectorAll("[data-auth='in']");

  loggedOutEls.forEach(el => el.style.display = profile ? "none" : "");
  loggedInEls.forEach(el => el.style.display = profile ? "" : "none");

  if (profile) {
    document.querySelectorAll("[data-user-avatar]").forEach(el => el.textContent = PactAuth.initials(profile.name));
    document.querySelectorAll("[data-user-name]").forEach(el => el.textContent = profile.name);
    document.querySelectorAll("[data-user-tier]").forEach(el => el.textContent = PactAuth.tierMeta(profile.tier).label);
  }
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

function lockGatedCards(selector) {
  const profile = PactAuth.get();
  document.querySelectorAll(selector).forEach(card => {
    if (!profile) card.classList.add("locked");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  paintNav();
  wireNavToggle();
  wireReveal();

  const logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) logoutBtn.addEventListener("click", (e) => { e.preventDefault(); PactAuth.logout(); });
});
