// Template catalog. `keywords` are extra search terms a user might type
// that don't appear in the name/genre/description verbatim (e.g. "car"
// should find "Vehicle Bill of Sale", "lawyer" should find "Legal
// Services" templates) — see routes/templates.js for how search matches
// against name + genre + description + keywords.
const TEMPLATE_SEED = [
  // ---- Freelance & Gig ----
  { name: "Freelance Services Agreement", genre: "Freelance & Gig", tier: "starter", desc: "Scope, deliverables, payment schedule and IP assignment for independent contractors.", keywords: "gig contractor freelancer scope of work" },
  { name: "Independent Contractor Agreement", genre: "Freelance & Gig", tier: "starter", desc: "Classifies work relationship, sets milestones and termination terms.", keywords: "1099 contractor gig" },

  // ---- Real Estate ----
  { name: "Residential Lease Agreement", genre: "Real Estate", tier: "starter", desc: "State-aware rental terms, deposit handling and maintenance responsibilities.", keywords: "rent apartment tenant landlord house" },
  { name: "Commercial Lease Agreement", genre: "Real Estate", tier: "everyday", desc: "Build-out clauses, CAM charges and renewal options for commercial space.", keywords: "office retail space landlord tenant" },
  { name: "Property Sale Agreement", genre: "Real Estate", tier: "everyday", desc: "Purchase price, contingencies and closing timeline for property sales.", keywords: "house home buy sell closing" },

  // ---- HR & Employment ----
  { name: "Employment Offer Letter", genre: "HR & Employment", tier: "starter", desc: "Title, compensation, start date and at-will terms.", keywords: "job hire offer new employee" },
  { name: "Non-Disclosure Agreement (Mutual)", genre: "HR & Employment", tier: "starter", desc: "Two-way confidentiality protection for hiring and partnership talks.", keywords: "nda confidentiality secrecy" },
  { name: "Employee Non-Compete Agreement", genre: "HR & Employment", tier: "everyday", desc: "Restricts post-employment competition within defined scope and duration.", keywords: "noncompete restrictive covenant" },
  { name: "Severance Agreement", genre: "HR & Employment", tier: "everyday", desc: "Separation terms, release of claims and final compensation.", keywords: "layoff termination separation" },

  // ---- Business Formation ----
  { name: "Business Partnership Agreement", genre: "Business Formation", tier: "everyday", desc: "Equity split, roles, profit distribution and exit terms for co-founders.", keywords: "cofounder partner startup" },
  { name: "LLC Operating Agreement", genre: "Business Formation", tier: "everyday", desc: "Governance, member contributions and voting rights for an LLC.", keywords: "llc members startup" },
  { name: "Shareholder Agreement", genre: "Business Formation", tier: "pro", desc: "Share transfer restrictions, drag-along/tag-along and board composition.", keywords: "equity stock corporation" },

  // ---- Commerce & Retail ----
  { name: "Vendor & Supply Agreement", genre: "Commerce & Retail", tier: "starter", desc: "Purchase terms, delivery SLAs and quality standards for suppliers.", keywords: "supplier procurement wholesale" },
  { name: "Sales & Distribution Agreement", genre: "Commerce & Retail", tier: "everyday", desc: "Territory rights, minimum order volumes and channel exclusivity.", keywords: "distributor reseller channel" },
  { name: "Terms of Sale / Retail Purchase", genre: "Commerce & Retail", tier: "starter", desc: "Consumer-facing sale terms, returns and warranty language.", keywords: "retail store purchase returns" },

  // ---- Technology ----
  { name: "Software License Agreement (SaaS)", genre: "Technology", tier: "everyday", desc: "Usage rights, uptime SLA, data handling and license fees for SaaS products.", keywords: "software saas license" },
  { name: "Master Service Agreement (MSA)", genre: "Technology", tier: "pro", desc: "Umbrella terms governing all future statements of work with a client.", keywords: "msa consulting it services" },
  { name: "Data Processing Agreement (DPA)", genre: "Technology", tier: "pro", desc: "GDPR/CCPA-aligned terms for processing personal data on a client's behalf.", keywords: "gdpr privacy data protection" },
  { name: "API / Platform Usage Agreement", genre: "Technology", tier: "everyday", desc: "Rate limits, acceptable use and liability for third-party API access.", keywords: "api developer platform" },

  // ---- Construction & Trades ----
  { name: "Construction Contract", genre: "Construction & Trades", tier: "everyday", desc: "Project scope, change-order process and payment milestones.", keywords: "builder contractor project" },
  { name: "Subcontractor Agreement", genre: "Construction & Trades", tier: "starter", desc: "Defines subcontractor scope, insurance requirements and lien waivers.", keywords: "subcontractor trade" },
  { name: "Home Renovation Agreement", genre: "Construction & Trades", tier: "starter", desc: "Materials, timeline and warranty terms for residential renovation work.", keywords: "remodel contractor home improvement" },

  // ---- Creative & Media ----
  { name: "Photography / Videography Contract", genre: "Creative & Media", tier: "starter", desc: "Usage rights, delivery timeline and model release terms.", keywords: "photographer videographer shoot" },
  { name: "Talent & Influencer Agreement", genre: "Creative & Media", tier: "everyday", desc: "Deliverables, usage windows, exclusivity and disclosure requirements.", keywords: "influencer social media sponsorship" },
  { name: "Publishing / Author Agreement", genre: "Creative & Media", tier: "everyday", desc: "Rights granted, royalty rate and reversion terms for authors.", keywords: "book author writer publisher" },

  // ---- Music & Entertainment ----
  { name: "Music Licensing Agreement", genre: "Music & Entertainment", tier: "pro", desc: "Sync rights, royalty splits and territory for licensed music use.", keywords: "song music sync license" },
  { name: "Recording Artist Agreement", genre: "Music & Entertainment", tier: "pro", desc: "Recording obligations, advances, royalty splits and rights ownership between an artist and label or producer.", keywords: "song music record label artist" },
  { name: "Band Member / Music Group Partnership Agreement", genre: "Music & Entertainment", tier: "everyday", desc: "Ownership splits, decision-making and departure terms among members of a band or group.", keywords: "band music group song" },
  { name: "Live Performance / Booking Agreement", genre: "Music & Entertainment", tier: "starter", desc: "Performance fee, rider terms, cancellation policy for a live show or gig booking.", keywords: "concert gig show booking music" },
  { name: "Songwriter Split Sheet Agreement", genre: "Music & Entertainment", tier: "starter", desc: "Records each songwriter's percentage ownership of a song's composition.", keywords: "song music royalty split writer" },

  // ---- Hospitality & Events ----
  { name: "Catering Services Agreement", genre: "Hospitality & Events", tier: "starter", desc: "Guest count, menu, deposit schedule and cancellation policy.", keywords: "caterer event food" },
  { name: "Event Venue Rental Agreement", genre: "Hospitality & Events", tier: "starter", desc: "Rental period, damage deposit and liability terms for venue use.", keywords: "venue rental party event" },
  { name: "Wedding & Event Planner Agreement", genre: "Hospitality & Events", tier: "everyday", desc: "Scope of planning services, fees and vendor coordination terms.", keywords: "wedding planner event" },

  // ---- Healthcare ----
  { name: "Healthcare Services Agreement", genre: "Healthcare", tier: "pro", desc: "HIPAA-aware terms for patient services and billing arrangements.", keywords: "doctor patient medical clinic" },
  { name: "Business Associate Agreement (BAA)", genre: "Healthcare", tier: "pro", desc: "HIPAA-required terms for vendors handling protected health information.", keywords: "hipaa medical vendor" },
  { name: "Telehealth Consent & Services Agreement", genre: "Healthcare", tier: "everyday", desc: "Consent, privacy and service terms for remote care delivery.", keywords: "doctor patient telemedicine virtual visit" },
  { name: "Patient Care Agreement (Doctor–Patient)", genre: "Healthcare", tier: "everyday", desc: "Establishes the direct treatment relationship, fees and responsibilities between a doctor and patient.", keywords: "doctor patient physician clinic" },
  { name: "Informed Consent for Treatment", genre: "Healthcare", tier: "starter", desc: "Documents a patient's informed consent to a specific medical procedure or treatment plan.", keywords: "doctor patient medical consent procedure" },

  // ---- Finance & Lending ----
  { name: "Loan Agreement (Personal/Business)", genre: "Finance & Lending", tier: "everyday", desc: "Principal, interest rate, repayment schedule and default terms.", keywords: "loan money lender borrower" },
  { name: "Investment / SAFE Agreement", genre: "Finance & Lending", tier: "pro", desc: "Convertible investment terms for early-stage fundraising.", keywords: "startup investor fundraising equity" },
  { name: "Consulting & Advisory Agreement", genre: "Finance & Lending", tier: "everyday", desc: "Advisory scope, equity or cash compensation and confidentiality.", keywords: "advisor consultant" },

  // ---- Legal Services ----
  { name: "Attorney-Client Engagement Agreement", genre: "Legal Services", tier: "everyday", desc: "Scope of representation, fees and responsibilities between a lawyer and an individual client.", keywords: "lawyer attorney client legal counsel" },
  { name: "Outside Counsel / Business Legal Services Agreement", genre: "Legal Services", tier: "pro", desc: "Ongoing legal services scope, billing arrangement and confidentiality between a lawyer/firm and a business client.", keywords: "lawyer attorney business counsel firm" },
  { name: "Contingency Fee Agreement", genre: "Legal Services", tier: "pro", desc: "Attorney fee structure based on a percentage of case recovery, with cost-advance terms.", keywords: "lawyer attorney litigation case fee" },
  { name: "Legal Retainer Agreement", genre: "Legal Services", tier: "everyday", desc: "Upfront retainer amount, billing rate and how unused funds are handled.", keywords: "lawyer attorney retainer legal" },

  // ---- Automotive & Vehicle ----
  { name: "Vehicle Bill of Sale", genre: "Automotive & Vehicle", tier: "starter", desc: "Records the sale of a car, truck or other vehicle between buyer and seller, as-is terms and odometer disclosure.", keywords: "car auto vehicle sale buy sell truck" },
  { name: "Vehicle Lease Agreement", genre: "Automotive & Vehicle", tier: "starter", desc: "Lease term, mileage limits, insurance requirements and end-of-lease terms for a vehicle.", keywords: "car auto vehicle lease truck" },
  { name: "Auto Repair / Service Work Order", genre: "Automotive & Vehicle", tier: "starter", desc: "Authorizes specific repair or maintenance work on a vehicle, with parts, labor cost and warranty terms.", keywords: "car auto vehicle mechanic repair shop truck" },
  { name: "Fleet Vehicle Maintenance Agreement", genre: "Automotive & Vehicle", tier: "everyday", desc: "Ongoing maintenance scope and service levels for a business's vehicle fleet.", keywords: "car auto vehicle fleet truck business" },

  // ---- Education & Training ----
  { name: "Tutoring Services Agreement", genre: "Education & Training", tier: "starter", desc: "Session schedule, rate and cancellation policy between a tutor and student or parent.", keywords: "tutor teacher lessons education" },
  { name: "Coaching / Mentorship Agreement", genre: "Education & Training", tier: "starter", desc: "Scope of coaching sessions, goals and fees between a coach and client.", keywords: "coach mentor training" },
  { name: "Online Course Licensing Agreement", genre: "Education & Training", tier: "everyday", desc: "Terms for licensing a course or curriculum to a platform or another business.", keywords: "online course education curriculum" },
  { name: "Corporate Training Services Agreement", genre: "Education & Training", tier: "everyday", desc: "Scope, delivery format and fees for training services delivered to a business.", keywords: "corporate training education business" },

  // ---- Personal & Family ----
  { name: "Roommate Agreement", genre: "Personal & Family", tier: "starter", desc: "Splits rent and expenses, house rules and move-out terms between roommates.", keywords: "roommate housemate shared housing" },
  { name: "Pet Boarding / Care Agreement", genre: "Personal & Family", tier: "starter", desc: "Care instructions, fees and liability terms for boarding or pet-sitting.", keywords: "pet dog cat boarding sitter" },
  { name: "Personal Loan Agreement", genre: "Personal & Family", tier: "starter", desc: "Repayment terms for a loan directly between two individuals (not a business lender).", keywords: "loan money friend family personal" },
  { name: "Cohabitation Agreement", genre: "Personal & Family", tier: "everyday", desc: "Property, expense-sharing and separation terms for unmarried partners living together.", keywords: "partner living together relationship" },

  // ---- Enterprise ----
  { name: "Franchise Agreement", genre: "Enterprise", tier: "business", desc: "Territory rights, brand standards, royalties and renewal terms.", keywords: "franchise brand" },
  { name: "Enterprise Master Agreement", genre: "Enterprise", tier: "business", desc: "Multi-entity governing terms with custom legal review workflows.", keywords: "enterprise corporate master" },
  { name: "Mergers & Acquisition Term Sheet", genre: "Enterprise", tier: "business", desc: "Non-binding deal terms for valuation, structure and diligence.", keywords: "m&a acquisition merger deal" },
  { name: "International Distribution Agreement", genre: "Enterprise", tier: "business", desc: "Cross-border terms covering compliance, currency and export control.", keywords: "international export global" },

  // ---- Other (catch-all) ----
  { name: "General / Custom Agreement", genre: "Other", tier: "starter", desc: "A minimal, general-purpose agreement structure for anything that doesn't fit a more specific category — customize freely.", keywords: "custom general misc other blank" },
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
    "INSERT INTO templates (name, genre, min_tier, description, body, keywords) VALUES (?, ?, ?, ?, ?, ?)"
  );
  db.exec("BEGIN");
  try {
    for (const t of TEMPLATE_SEED) {
      insert.run(t.name, t.genre, t.tier, t.desc, buildBody(t), t.keywords || "");
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  console.log(`[pact] seeded ${TEMPLATE_SEED.length} contract templates`);
}

module.exports = { seedTemplates, TEMPLATE_SEED };
