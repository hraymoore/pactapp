const TEMPLATE_SEED = [
  { name: "Freelance Services Agreement", genre: "Freelance & Gig", tier: "starter", desc: "Scope, deliverables, payment schedule and IP assignment for independent contractors." },
  { name: "Independent Contractor Agreement", genre: "Freelance & Gig", tier: "starter", desc: "Classifies work relationship, sets milestones and termination terms." },
  { name: "Residential Lease Agreement", genre: "Real Estate", tier: "starter", desc: "State-aware rental terms, deposit handling and maintenance responsibilities." },
  { name: "Commercial Lease Agreement", genre: "Real Estate", tier: "everyday", desc: "Build-out clauses, CAM charges and renewal options for commercial space." },
  { name: "Property Sale Agreement", genre: "Real Estate", tier: "everyday", desc: "Purchase price, contingencies and closing timeline for property sales." },
  { name: "Employment Offer Letter", genre: "HR & Employment", tier: "starter", desc: "Title, compensation, start date and at-will terms." },
  { name: "Non-Disclosure Agreement (Mutual)", genre: "HR & Employment", tier: "starter", desc: "Two-way confidentiality protection for hiring and partnership talks." },
  { name: "Employee Non-Compete Agreement", genre: "HR & Employment", tier: "everyday", desc: "Restricts post-employment competition within defined scope and duration." },
  { name: "Severance Agreement", genre: "HR & Employment", tier: "everyday", desc: "Separation terms, release of claims and final compensation." },
  { name: "Business Partnership Agreement", genre: "Business Formation", tier: "everyday", desc: "Equity split, roles, profit distribution and exit terms for co-founders." },
  { name: "LLC Operating Agreement", genre: "Business Formation", tier: "everyday", desc: "Governance, member contributions and voting rights for an LLC." },
  { name: "Shareholder Agreement", genre: "Business Formation", tier: "pro", desc: "Share transfer restrictions, drag-along/tag-along and board composition." },
  { name: "Vendor & Supply Agreement", genre: "Commerce & Retail", tier: "starter", desc: "Purchase terms, delivery SLAs and quality standards for suppliers." },
  { name: "Sales & Distribution Agreement", genre: "Commerce & Retail", tier: "everyday", desc: "Territory rights, minimum order volumes and channel exclusivity." },
  { name: "Terms of Sale / Retail Purchase", genre: "Commerce & Retail", tier: "starter", desc: "Consumer-facing sale terms, returns and warranty language." },
  { name: "Software License Agreement (SaaS)", genre: "Technology", tier: "everyday", desc: "Usage rights, uptime SLA, data handling and license fees for SaaS products." },
  { name: "Master Service Agreement (MSA)", genre: "Technology", tier: "pro", desc: "Umbrella terms governing all future statements of work with a client." },
  { name: "Data Processing Agreement (DPA)", genre: "Technology", tier: "pro", desc: "GDPR/CCPA-aligned terms for processing personal data on a client's behalf." },
  { name: "API / Platform Usage Agreement", genre: "Technology", tier: "everyday", desc: "Rate limits, acceptable use and liability for third-party API access." },
  { name: "Construction Contract", genre: "Construction & Trades", tier: "everyday", desc: "Project scope, change-order process and payment milestones." },
  { name: "Subcontractor Agreement", genre: "Construction & Trades", tier: "starter", desc: "Defines subcontractor scope, insurance requirements and lien waivers." },
  { name: "Home Renovation Agreement", genre: "Construction & Trades", tier: "starter", desc: "Materials, timeline and warranty terms for residential renovation work." },
  { name: "Photography / Videography Contract", genre: "Creative & Media", tier: "starter", desc: "Usage rights, delivery timeline and model release terms." },
  { name: "Talent & Influencer Agreement", genre: "Creative & Media", tier: "everyday", desc: "Deliverables, usage windows, exclusivity and disclosure requirements." },
  { name: "Music Licensing Agreement", genre: "Creative & Media", tier: "pro", desc: "Sync rights, royalty splits and territory for licensed music use." },
  { name: "Publishing / Author Agreement", genre: "Creative & Media", tier: "everyday", desc: "Rights granted, royalty rate and reversion terms for authors." },
  { name: "Catering Services Agreement", genre: "Hospitality & Events", tier: "starter", desc: "Guest count, menu, deposit schedule and cancellation policy." },
  { name: "Event Venue Rental Agreement", genre: "Hospitality & Events", tier: "starter", desc: "Rental period, damage deposit and liability terms for venue use." },
  { name: "Wedding & Event Planner Agreement", genre: "Hospitality & Events", tier: "everyday", desc: "Scope of planning services, fees and vendor coordination terms." },
  { name: "Healthcare Services Agreement", genre: "Healthcare", tier: "pro", desc: "HIPAA-aware terms for patient services and billing arrangements." },
  { name: "Business Associate Agreement (BAA)", genre: "Healthcare", tier: "pro", desc: "HIPAA-required terms for vendors handling protected health information." },
  { name: "Telehealth Consent & Services Agreement", genre: "Healthcare", tier: "everyday", desc: "Consent, privacy and service terms for remote care delivery." },
  { name: "Loan Agreement (Personal/Business)", genre: "Finance & Lending", tier: "everyday", desc: "Principal, interest rate, repayment schedule and default terms." },
  { name: "Investment / SAFE Agreement", genre: "Finance & Lending", tier: "pro", desc: "Convertible investment terms for early-stage fundraising." },
  { name: "Consulting & Advisory Agreement", genre: "Finance & Lending", tier: "everyday", desc: "Advisory scope, equity or cash compensation and confidentiality." },
  { name: "Franchise Agreement", genre: "Enterprise", tier: "business", desc: "Territory rights, brand standards, royalties and renewal terms." },
  { name: "Enterprise Master Agreement", genre: "Enterprise", tier: "business", desc: "Multi-entity governing terms with custom legal review workflows." },
  { name: "Mergers & Acquisition Term Sheet", genre: "Enterprise", tier: "business", desc: "Non-binding deal terms for valuation, structure and diligence." },
  { name: "International Distribution Agreement", genre: "Enterprise", tier: "business", desc: "Cross-border terms covering compliance, currency and export control." },
];

function buildBody(t) {
  return [
    t.name.toUpperCase(),
    "",
    `This ${t.name} ("Agreement") is entered into as of [DATE] by and between [PARTY A NAME] ("Party A") and [PARTY B NAME] ("Party B"), together the "Parties."`,
    "",
    "1. PURPOSE",
    t.desc,
    "",
    "2. TERM",
    "This Agreement begins on [START DATE] and continues until [END DATE], or until terminated as provided in this Agreement.",
    "",
    "3. OBLIGATIONS",
    "Each Party agrees to perform the obligations described in this Agreement and any attached schedules or exhibits.",
    "",
    "4. PAYMENT",
    "[Describe payment amounts, method and schedule, if applicable.]",
    "",
    "5. CONFIDENTIALITY",
    "The Parties agree to keep confidential information disclosed under this Agreement private, except as required by law.",
    "",
    "6. TERMINATION",
    "Either Party may terminate this Agreement with [NOTICE PERIOD] written notice, subject to the terms herein.",
    "",
    "7. GOVERNING LAW",
    "This Agreement is governed by the laws of the State of [STATE], without regard to conflict-of-law principles.",
    "",
    "8. ENTIRE AGREEMENT",
    "This Agreement constitutes the entire understanding between the Parties and supersedes all prior discussions.",
    "",
    "9. SIGNATURES",
    "By signing below (or electronically consenting), both Parties agree to be bound by the terms of this Agreement.",
    "",
    "[This is a starting-point draft, not legal advice. Customize every bracketed term and have counsel review before use in a high-stakes deal.]",
  ].join("\n");
}

function seedTemplates(db) {
  const count = db.prepare("SELECT COUNT(*) as n FROM templates").get().n;
  if (count > 0) return;
  const insert = db.prepare(
    "INSERT INTO templates (name, genre, min_tier, description, body) VALUES (?, ?, ?, ?, ?)"
  );
  db.exec("BEGIN");
  try {
    for (const t of TEMPLATE_SEED) {
      insert.run(t.name, t.genre, t.tier, t.desc, buildBody(t));
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  console.log(`[pact] seeded ${TEMPLATE_SEED.length} contract templates`);
}

module.exports = { seedTemplates, TEMPLATE_SEED };
