// Template catalog. `keywords` are extra search terms a user might type
// that don't appear in the name/genre/description verbatim (e.g. "car"
// should find "Vehicle Bill of Sale", "lawyer" should find "Legal
// Services" templates) — see routes/templates.js for how search matches
// against name + genre + description + keywords.
const TEMPLATE_SEED = [
  // ---- Freelance & Gig ----
  {
    name: "Freelance Services Agreement",
    genre: "Freelance & Gig",
    tier: "starter",
    desc: "Scope, deliverables, payment schedule and IP assignment for independent contractors, with the usual revisions, confidentiality and termination terms spelled out.",
    keywords: "gig contractor freelancer scope of work",
    body: [
      "FREELANCE SERVICES AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between [CLIENT NAME] (\"Client\") and [FREELANCER " +
        "NAME] (\"Freelancer\").",
      "",
      "1. SERVICES",
      "Freelancer will provide the following services: [DESCRIBE SERVICES / DELIVERABLES]. Detailed " +
        "specifications may be attached as Exhibit A.",
      "",
      "2. TIMELINE",
      "Work will begin on [START DATE]. The deliverables above are due on or before [DUE DATE(S)], subject to " +
        "any delay caused by Client's late feedback or late provision of materials Freelancer needs.",
      "",
      "3. PAYMENT",
      "Client will pay Freelancer [CHOOSE ONE: a flat fee of $[AMOUNT] / an hourly rate of $[AMOUNT]/hour], " +
        "payable [SCHEDULE — e.g., 50% upfront and 50% on delivery, or monthly]. Invoices not paid within " +
        "[NUMBER] days of the due date accrue a late fee of [PERCENTAGE]% per month.",
      "",
      "4. REVISIONS",
      "This engagement includes up to [NUMBER] rounds of revisions on each deliverable. Additional revisions, or " +
        "work outside the scope described in Section 1, will be billed at $[RATE] or require a written change " +
        "order before Freelancer begins the additional work.",
      "",
      "5. INDEPENDENT CONTRACTOR STATUS",
      "Freelancer is an independent contractor, not an employee of Client. Freelancer is responsible for their " +
        "own taxes, insurance, and equipment, and is not entitled to employee benefits.",
      "",
      "6. OWNERSHIP OF WORK PRODUCT",
      "Upon full payment, Client owns all rights to the final deliverables. Freelancer retains ownership of any " +
        "pre-existing tools, templates, or materials used to create the deliverables, and may use non-confidential " +
        "work from this engagement in their own portfolio unless the parties agree otherwise in writing.",
      "",
      "7. CONFIDENTIALITY",
      "Each party agrees to keep the other's confidential business information private, except as required by " +
        "law, both during and after this engagement.",
      "",
      "8. TERMINATION",
      "Either party may terminate this Agreement with [NOTICE PERIOD] written notice. Client will pay Freelancer " +
        "for all work completed up to the termination date.",
      "",
      "9. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of [STATE], without regard to conflict-of-law principles.",
      "",
      "10. SIGNATURES",
      "By signing below (or electronically consenting), both parties agree to be bound by the terms of this " +
        "Agreement.",
      "",
      "[This is a starting-point draft, not legal advice. Review your state's independent-contractor " +
        "classification rules before relying on Section 5, and have counsel review before use in a high-stakes " +
        "engagement.]",
    ].join("\n"),
  },
  { name: "Independent Contractor Agreement", genre: "Freelance & Gig", tier: "starter", desc: "Classifies work relationship, sets milestones and termination terms.", keywords: "1099 contractor gig" },

  // ---- Real Estate ----
  {
    name: "Residential Lease Agreement",
    genre: "Real Estate",
    tier: "starter",
    desc: "Rent, security deposit, utilities, occupants and maintenance terms for a residential rental — general-purpose; see the Arkansas and Texas versions below for state-specific deposit/notice rules.",
    keywords: "rent apartment tenant landlord house lease",
    body: [
      "RESIDENTIAL LEASE AGREEMENT",
      "",
      "This Lease is entered into as of [DATE] by and between [LANDLORD NAME] (\"Landlord\") and [TENANT NAME] " +
        "(\"Tenant\") for the property located at [PROPERTY ADDRESS] (the \"Property\").",
      "",
      "1. TERM",
      "This Lease begins on [START DATE] and ends on [END DATE], or continues month-to-month thereafter unless " +
        "either party gives notice as described in Section 6.",
      "",
      "2. RENT",
      "Tenant agrees to pay $[AMOUNT] per month, due on the [DAY] of each month, payable by [PAYMENT METHOD]. A " +
        "late fee of $[AMOUNT] applies to rent received more than [NUMBER] days after it is due.",
      "",
      "3. SECURITY DEPOSIT",
      "Tenant will pay a security deposit of $[AMOUNT] before move-in. Landlord will return the deposit, less " +
        "any lawful deductions for unpaid rent or damage beyond normal wear and tear, within the time period " +
        "required under the law of [STATE], along with an itemized list of any deductions.",
      "",
      "4. UTILITIES & OCCUPANTS",
      "Tenant is responsible for the following utilities: [LIST, e.g., electricity, gas, internet]. Landlord is " +
        "responsible for: [LIST, e.g., water, trash, sewer]. Only the following persons may reside at the " +
        "Property: [LIST OCCUPANTS]. [Pets are / are not] permitted, subject to: [PET TERMS, if any].",
      "",
      "5. MAINTENANCE & REPAIRS",
      "Landlord is responsible for maintaining the Property in a habitable condition and making necessary " +
        "repairs within a reasonable time of notice. Tenant is responsible for damage beyond normal wear and " +
        "tear and for promptly reporting needed repairs.",
      "",
      "6. TERMINATION & NOTICE",
      "Either party must provide written notice as required under [STATE]'s residential landlord-tenant law " +
        "before ending a month-to-month tenancy, and before either party may act on a material breach of this " +
        "Lease.",
      "",
      "7. GOVERNING LAW",
      "This Lease is governed by the laws of the State of [STATE], without regard to conflict-of-law principles.",
      "",
      "8. SIGNATURES",
      "By signing below (or electronically consenting), both parties agree to be bound by the terms of this Lease.",
      "",
      "[This is a starting-point draft, not legal advice. Landlord-tenant rules — deposit limits, return " +
        "deadlines, and required notice periods — vary significantly by state and sometimes by city; have " +
        "counsel review before use.]",
    ].join("\n"),
  },
  { name: "Commercial Lease Agreement", genre: "Real Estate", tier: "everyday", desc: "Build-out clauses, CAM charges and renewal options for commercial space.", keywords: "office retail space landlord tenant" },
  { name: "Property Sale Agreement", genre: "Real Estate", tier: "everyday", desc: "Purchase price, contingencies and closing timeline for property sales.", keywords: "house home buy sell closing" },

  // ---- HR & Employment ----
  { name: "Employment Offer Letter", genre: "HR & Employment", tier: "starter", desc: "Title, compensation, start date and at-will terms.", keywords: "job hire offer new employee" },
  {
    name: "Non-Disclosure Agreement (Mutual)",
    genre: "HR & Employment",
    tier: "starter",
    desc: "Two-way confidentiality protection for hiring and partnership talks — standard definitions, exclusions and survival period.",
    keywords: "nda confidentiality secrecy mutual",
    body: [
      "MUTUAL NON-DISCLOSURE AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between [PARTY A NAME] and [PARTY B NAME] (together, " +
        "the \"Parties\") in connection with [DESCRIBE PURPOSE — e.g., a potential business relationship, job " +
        "interview, or partnership discussion] (the \"Purpose\").",
      "",
      "1. CONFIDENTIAL INFORMATION",
      "\"Confidential Information\" means any non-public information disclosed by either Party, in any form, " +
        "that is identified as confidential or that a reasonable person would understand to be confidential, " +
        "including business plans, financials, product designs, and customer or technical information.",
      "",
      "2. EXCLUSIONS",
      "Confidential Information does not include information that: (a) is or becomes publicly available through " +
        "no fault of the receiving Party; (b) was already known to the receiving Party before disclosure; (c) is " +
        "independently developed without use of the disclosing Party's Confidential Information; or (d) is " +
        "required to be disclosed by law or court order, provided notice is given where legally permitted.",
      "",
      "3. OBLIGATIONS",
      "Each Party agrees to: (a) use the other Party's Confidential Information only for the Purpose; (b) not " +
        "disclose it to any third party without prior written consent, except to employees or advisors who need " +
        "to know it for the Purpose and are bound by confidentiality obligations at least as strict as these; " +
        "and (c) protect it with the same degree of care used for its own confidential information, and no less " +
        "than reasonable care.",
      "",
      "4. NO LICENSE",
      "Nothing in this Agreement grants either Party any license or rights to the other's Confidential " +
        "Information beyond what is needed for the Purpose.",
      "",
      "5. TERM",
      "This Agreement's confidentiality obligations continue for [NUMBER] years from the date of disclosure of " +
        "the relevant Confidential Information, even if the Parties' discussions regarding the Purpose end " +
        "sooner.",
      "",
      "6. RETURN OF MATERIALS",
      "Upon written request, each Party will promptly return or destroy all materials containing the other " +
        "Party's Confidential Information, except for one archival copy retained solely for legal-compliance " +
        "purposes.",
      "",
      "7. REMEDIES",
      "Each Party acknowledges that a breach of this Agreement may cause irreparable harm for which monetary " +
        "damages alone would be inadequate, entitling the non-breaching Party to seek injunctive relief in " +
        "addition to any other available remedy.",
      "",
      "8. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of [STATE], without regard to conflict-of-law principles.",
      "",
      "9. SIGNATURES",
      "By signing below (or electronically consenting), both Parties agree to be bound by the terms of this " +
        "Agreement.",
      "",
      "[This is a starting-point draft, not legal advice. Customize the term length and scope of Confidential " +
        "Information for your situation, and have counsel review before signing anything high-stakes.]",
    ].join("\n"),
  },
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
  {
    name: "Equipment Rental Agreement",
    genre: "Commerce & Retail",
    tier: "starter",
    desc: "Rental period, fees, deposit and damage liability for renting out tools, gear, or other equipment.",
    keywords: "equipment rental lease tool gear deposit damage",
    body: [
      "EQUIPMENT RENTAL AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between [OWNER NAME] (\"Owner\") and [RENTER NAME] " +
        "(\"Renter\") for the rental of the equipment described below.",
      "",
      "1. EQUIPMENT",
      "Description: [EQUIPMENT DESCRIPTION — make/model]   Serial/Asset No.: [SERIAL NUMBER]",
      "Accessories included: [LIST ACCESSORIES]",
      "",
      "2. RENTAL PERIOD",
      "The rental period runs from [START DATE/TIME] to [END DATE/TIME]. Renter will return the equipment to " +
        "[RETURN LOCATION] by the end of the rental period.",
      "",
      "3. FEES & DEPOSIT",
      "Rental fee: $[AMOUNT] for the rental period, payable [WHEN]. Security deposit: $[AMOUNT], refundable " +
        "within [NUMBER] days of return if the equipment is returned on time and in the condition described in " +
        "Section 5. A late return fee of $[AMOUNT] per day applies after the rental period ends.",
      "",
      "4. CONDITION AT PICKUP",
      "Renter inspected the equipment before taking possession and confirms it was in the following condition: " +
        "[DESCRIBE CONDITION / NOTE ANY EXISTING DAMAGE].",
      "",
      "5. RENTER'S RESPONSIBILITIES",
      "Renter will use the equipment only for its intended purpose, follow any safety instructions provided by " +
        "Owner, and return it in the same condition noted at pickup, normal wear and tear excepted. Renter is " +
        "responsible for the cost of repair or, if the equipment is lost or damaged beyond repair, its " +
        "replacement cost of $[REPLACEMENT VALUE].",
      "",
      "6. PROHIBITED USE",
      "Renter may not sublease, lend, or transfer possession of the equipment to anyone else without Owner's " +
        "written consent, or use it outside [GEOGRAPHIC/USE RESTRICTIONS, if any].",
      "",
      "7. INSURANCE",
      "[Renter is responsible for carrying insurance covering loss of or damage to the equipment during the " +
        "rental period. / No insurance is required under this Agreement.]",
      "",
      "8. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of [STATE], without regard to conflict-of-law principles.",
      "",
      "9. SIGNATURES",
      "By signing below (or electronically consenting), both parties agree to be bound by the terms of this " +
        "Agreement.",
      "",
      "[This is a starting-point draft, not legal advice. For high-value or specialized equipment, consider " +
        "requiring proof of insurance and have counsel review the liability and replacement-value terms.]",
    ].join("\n"),
  },

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
  {
    name: "Model Release Agreement",
    genre: "Creative & Media",
    tier: "starter",
    desc: "A standard model/subject release granting a photographer or videographer the right to use someone's image or likeness.",
    keywords: "model release photography photo likeness image consent subject",
    body: [
      "MODEL RELEASE AGREEMENT",
      "",
      "This Release is given as of [DATE] by [MODEL/SUBJECT NAME] (\"Subject\") to [PHOTOGRAPHER/VIDEOGRAPHER " +
        "NAME] (\"Producer\") in connection with photographs and/or video recorded on or around [SHOOT DATE] at " +
        "[LOCATION] (the \"Materials\").",
      "",
      "1. GRANT OF RIGHTS",
      "Subject grants Producer an irrevocable, worldwide, royalty-free right to use, reproduce, edit, and " +
        "publish the Materials — including Subject's name, image, and likeness as they appear in them — for the " +
        "following purposes: [CHOOSE ALL THAT APPLY: portfolio / editorial / advertising and commercial use / " +
        "social media / other: ___________].",
      "",
      "2. COMPENSATION",
      "In exchange for this Release, Subject [CHOOSE ONE: has received $[AMOUNT] / has received the following " +
        "non-cash consideration: [DESCRIBE] / is giving this Release without compensation], receipt of which is " +
        "acknowledged.",
      "",
      "3. NO FURTHER APPROVAL",
      "Subject acknowledges that Producer is not required to have Subject review or approve the final use of the " +
        "Materials, unless the parties have separately agreed otherwise in writing.",
      "",
      "4. SUBJECT'S CAPACITY",
      "Subject represents that they are at least 18 years old, [OR, IF A MINOR:] that the undersigned parent or " +
        "legal guardian consents to this Release on the minor Subject's behalf: Parent/Guardian Name: [NAME].",
      "",
      "5. RELEASE OF CLAIMS",
      "Subject releases Producer, and anyone Producer licenses the Materials to, from any claim arising from use " +
        "of the Materials as permitted above, including any claim for defamation, invasion of privacy, or right " +
        "of publicity, except for uses that are unlawful or materially misrepresent Subject.",
      "",
      "6. GOVERNING LAW",
      "This Release is governed by the laws of the State of [STATE], without regard to conflict-of-law principles.",
      "",
      "7. SIGNATURE",
      "By signing below (or electronically consenting), Subject confirms they have read and agree to this Release.",
      "",
      "[This is a starting-point draft, not legal advice. Commercial/advertising use of someone's likeness " +
        "carries more legal exposure than editorial use — have counsel review before relying on this Release for " +
        "a paid ad campaign.]",
    ].join("\n"),
  },

  // ---- Music & Entertainment ----
  { name: "Music Licensing Agreement", genre: "Music & Entertainment", tier: "pro", desc: "Sync rights, royalty splits and territory for licensed music use.", keywords: "song music sync license" },
  { name: "Recording Artist Agreement", genre: "Music & Entertainment", tier: "pro", desc: "Recording obligations, advances, royalty splits and rights ownership between an artist and label or producer.", keywords: "song music record label artist" },
  { name: "Band Member / Music Group Partnership Agreement", genre: "Music & Entertainment", tier: "everyday", desc: "Ownership splits, decision-making and departure terms among members of a band or group.", keywords: "band music group song" },
  { name: "Live Performance / Booking Agreement", genre: "Music & Entertainment", tier: "starter", desc: "Performance fee, rider terms, cancellation policy for a live show or gig booking.", keywords: "concert gig show booking music" },
  {
    name: "Songwriter Split Sheet Agreement",
    genre: "Music & Entertainment",
    tier: "starter",
    desc: "Records each songwriter's percentage ownership of a song's composition, PRO affiliation and publisher — the standard split-sheet format labels use before registering a song.",
    keywords: "song music royalty split writer split sheet percentage pro ascap bmi sesac",
    body: [
      "SONGWRITER SPLIT SHEET",
      "",
      "This Split Sheet records the ownership shares of the musical composition titled \"[SONG TITLE]\" (the " +
        "\"Composition\"), as agreed by its writers as of [DATE].",
      "",
      "1. WRITERS & OWNERSHIP SHARES",
      "Each person below contributed to the Composition and is credited with the ownership percentage shown. " +
        "The percentages must total 100%.",
      "",
      "WRITER 1",
      "Name: [NAME]   Role (e.g. lyrics, music, topline, production): [ROLE]   Email: [EMAIL]",
      "PRO Affiliation (ASCAP / BMI / SESAC / GMR / none): [PRO]   Publisher (if any): [PUBLISHER]",
      "Ownership Share: [ ]%",
      "",
      "WRITER 2",
      "Name: [NAME]   Role: [ROLE]   Email: [EMAIL]",
      "PRO Affiliation: [PRO]   Publisher (if any): [PUBLISHER]",
      "Ownership Share: [ ]%",
      "",
      "WRITER 3",
      "Name: [NAME]   Role: [ROLE]   Email: [EMAIL]",
      "PRO Affiliation: [PRO]   Publisher (if any): [PUBLISHER]",
      "Ownership Share: [ ]%",
      "",
      "(Add an additional writer block for each further contributor. Shares must total 100%.)",
      "",
      "2. WHAT THIS COVERS",
      "This Split Sheet applies only to ownership of the musical composition (the underlying melody and lyrics) " +
        "and the royalties that flow from it — mechanical, performance, and print royalties. It does not, by " +
        "itself, address ownership of any sound recording (master) made of the Composition; master ownership is " +
        "a separate agreement unless this document is amended to include it.",
      "",
      "3. REGISTRATION",
      "Each writer is responsible for registering their share with their own Performing Rights Organization, if " +
        "any, and the Composition should be registered with the applicable PRO(s) and, if co-published, with " +
        "each publisher of record.",
      "",
      "4. SAMPLES, INTERPOLATIONS & PRIOR WORKS",
      "If the Composition contains a sample, interpolation, or material from a prior work, the writers listed " +
        "above confirm that all necessary clearances have been obtained or disclosed separately — this Split " +
        "Sheet does not itself clear or license any pre-existing material.",
      "",
      "5. CHANGES",
      "This Split Sheet may only be amended in writing, signed by every writer listed above.",
      "",
      "6. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of [STATE], without regard to conflict-of-law principles.",
      "",
      "7. SIGNATURES",
      "By signing below (or electronically consenting), each writer confirms the accuracy of their contribution " +
        "and ownership share.",
      "",
      "[This is a starting-point draft, not legal advice. If a producer, sample, or interpolation is involved, " +
        "additional rights holders may need their own share or clearance before the Composition is registered " +
        "or released.]",
    ].join("\n"),
  },
  {
    name: "Beat Lease Agreement",
    genre: "Music & Entertainment",
    tier: "starter",
    desc: "Non-exclusive or exclusive beat licensing terms — usage limits, credit requirements and the upgrade path to a full buyout.",
    keywords: "beat lease producer instrumental license type exclusive non-exclusive",
    body: [
      "BEAT LEASE AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between [PRODUCER NAME] (\"Producer\"), owner of the " +
        "musical instrumental titled/tagged \"[BEAT TITLE / ID]\" (the \"Beat\"), and [ARTIST NAME] (\"Lessee\").",
      "",
      "1. LICENSE TYPE",
      "Producer grants Lessee a [NON-EXCLUSIVE / EXCLUSIVE] license to use the Beat as set out below. Under a " +
        "non-exclusive lease, Producer may continue to license the same Beat to other artists; under an " +
        "exclusive license, Producer will not license the Beat to anyone else once this Agreement takes effect.",
      "",
      "2. PERMITTED USE",
      "Lessee may use the Beat to record and release one (1) song, subject to the following limits under a " +
        "non-exclusive lease (leave blank or mark N/A if this is an exclusive license):",
      "- Up to [NUMBER] total audio/video streams across all platforms",
      "- Up to [NUMBER] copies sold or distributed (physical and digital combined)",
      "- Monetized use on video platforms up to [NUMBER] views",
      "Exceeding these limits requires upgrading to a higher-tier lease or an exclusive license from Producer.",
      "",
      "3. FEE",
      "Lessee agrees to pay a one-time fee of $[AMOUNT], payable [BEFORE DELIVERY / ON DELIVERY] of the Beat's " +
        "audio file(s).",
      "",
      "4. PRODUCER CREDIT & TAG",
      "Lessee will credit Producer as \"prod. by [PRODUCER NAME]\" in the song's title, liner notes, and " +
        "streaming-platform metadata wherever the platform allows it. [If the leased file includes an audible " +
        "producer tag, it may not be removed, pitched out, or otherwise edited to be inaudible.]",
      "",
      "5. OWNERSHIP",
      "Producer retains all ownership of the Beat itself, including the right to continue licensing it to others " +
        "under a non-exclusive lease. This Agreement licenses use of the Beat only — it does not transfer " +
        "copyright in the instrumental to Lessee.",
      "",
      "6. PROHIBITED USES",
      "Lessee may not resell, re-lease, or redistribute the Beat itself (as opposed to the finished song), claim " +
        "authorship of the instrumental, or use the Beat in a way that exceeds the permitted use above without " +
        "Producer's written consent.",
      "",
      "7. TERM",
      "This license continues for the life of copyright in the Beat unless Lessee exceeds the permitted use " +
        "above without upgrading, or either party terminates for uncured material breach with [NOTICE PERIOD] " +
        "written notice.",
      "",
      "8. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of [STATE], without regard to conflict-of-law principles.",
      "",
      "[This is a starting-point draft, not legal advice. If the Beat itself contains an uncleared sample, " +
        "Producer's own rights to license it may be limited — confirm before relying on this license for a " +
        "commercial release.]",
    ].join("\n"),
  },
  {
    name: "Collaboration / Feature Agreement",
    genre: "Music & Entertainment",
    tier: "starter",
    desc: "Credit, compensation and ownership split between a lead artist and a featured artist or collaborator on a song.",
    keywords: "feature collaboration song music artist credit verse hook",
    body: [
      "COLLABORATION / FEATURE AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between [LEAD ARTIST NAME] (\"Lead Artist\") and " +
        "[FEATURED ARTIST NAME] (\"Featured Artist\") regarding the song titled \"[SONG TITLE]\" (the \"Song\").",
      "",
      "1. CONTRIBUTION",
      "Featured Artist will contribute [DESCRIBE CONTRIBUTION — e.g., one verse, a hook, background vocals, " +
        "production] to the Song.",
      "",
      "2. COMPENSATION",
      "In exchange for the contribution above, Lead Artist will pay Featured Artist [CHOOSE ONE: a flat fee of " +
        "$[AMOUNT] / a [ ]% share of the Song's composition / a [ ]% share of the Song's master recording / a " +
        "combination as described: ___________], payable [SCHEDULE].",
      "",
      "3. CREDIT",
      "The Song will be credited as \"[LEAD ARTIST NAME] feat. [FEATURED ARTIST NAME]\" (or as otherwise agreed: " +
        "[CREDIT LANGUAGE]) in all releases, metadata, and promotional materials where practicable.",
      "",
      "4. APPROVAL BEFORE RELEASE",
      "Lead Artist will share a final mix of the Song with Featured Artist for approval before public release. " +
        "Approval may not be unreasonably withheld, and is deemed given if Featured Artist does not respond " +
        "within [NUMBER] days of receiving the final mix.",
      "",
      "5. OWNERSHIP",
      "Except as expressly granted in Section 2, Featured Artist does not acquire any ownership interest in the " +
        "Song's composition or master recording. [If a composition or master percentage was agreed above, state " +
        "it again here for clarity: ___________.]",
      "",
      "6. CLEARANCE & CONFLICTS",
      "Featured Artist confirms that their contribution does not conflict with any exclusive recording or " +
        "publishing agreement they are already bound by, and that they have the right to contribute to the Song.",
      "",
      "7. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of [STATE], without regard to conflict-of-law principles.",
      "",
      "[This is a starting-point draft, not legal advice. If Featured Artist is signed to a label or publisher, " +
        "that company's consent may be required before this collaboration can be released.]",
    ].join("\n"),
  },

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
  {
    name: "Vehicle Bill of Sale",
    genre: "Automotive & Vehicle",
    tier: "starter",
    desc: "Records the sale of a car, truck or other vehicle between buyer and seller — vehicle details, price, as-is terms and odometer disclosure.",
    keywords: "car auto vehicle sale buy sell truck bill of sale",
    body: [
      "VEHICLE BILL OF SALE",
      "",
      "This Bill of Sale is entered into as of [DATE] by and between [SELLER NAME], of [SELLER ADDRESS] " +
        "(\"Seller\"), and [BUYER NAME], of [BUYER ADDRESS] (\"Buyer\"), for the sale of the vehicle described " +
        "below.",
      "",
      "1. VEHICLE",
      "Year: [YEAR]   Make: [MAKE]   Model: [MODEL]   Body Style: [BODY STYLE]   Color: [COLOR]",
      "VIN: [VEHICLE IDENTIFICATION NUMBER]   License Plate No.: [PLATE NUMBER / STATE]",
      "Odometer Reading at Time of Sale: [MILEAGE] miles",
      "",
      "2. ODOMETER DISCLOSURE",
      "Seller certifies that, to the best of their knowledge, the odometer reading above reflects the actual " +
        "mileage of the vehicle, [CHOOSE ONE: unless marked otherwise: / except that it reflects mileage in " +
        "excess of its mechanical limits / except that the odometer reading is NOT the actual mileage and should " +
        "not be relied upon]. Federal and state law require accurate odometer disclosure on transfer of ownership.",
      "",
      "3. PURCHASE PRICE",
      "Buyer agrees to pay Seller $[AMOUNT] for the vehicle, payable by [PAYMENT METHOD] [upon signing / upon " +
        "transfer of title].",
      "",
      "4. CONDITION — SOLD AS-IS",
      "Unless otherwise stated here, the vehicle is sold \"AS-IS, WHERE-IS,\" with no warranty, express or " +
        "implied, as to its condition, merchantability, or fitness for a particular purpose. [DESCRIBE ANY KNOWN " +
        "DEFECTS OR EXCEPTIONS, if any: ___________.]",
      "",
      "5. TITLE & REGISTRATION",
      "Seller will provide Buyer with the vehicle's title, properly signed over, at the time of this sale. Buyer " +
        "is responsible for transferring title and registering the vehicle with the Department of Motor " +
        "Vehicles (or equivalent agency) in [STATE] within the time required by state law.",
      "",
      "6. GOVERNING LAW",
      "This Bill of Sale is governed by the laws of the State of [STATE], without regard to conflict-of-law " +
        "principles.",
      "",
      "7. SIGNATURES",
      "By signing below (or electronically consenting), Seller transfers ownership of the vehicle to Buyer as " +
        "described above, and Buyer accepts the vehicle on the terms stated.",
      "",
      "[This is a starting-point draft, not legal advice. Some states require a separate, state-specific bill-of-" +
        "sale or title-transfer form, or notarization — confirm your state's DMV requirements before relying on " +
        "this document alone.]",
    ].join("\n"),
  },
  { name: "Vehicle Lease Agreement", genre: "Automotive & Vehicle", tier: "starter", desc: "Lease term, mileage limits, insurance requirements and end-of-lease terms for a vehicle.", keywords: "car auto vehicle lease truck" },
  { name: "Auto Repair / Service Work Order", genre: "Automotive & Vehicle", tier: "starter", desc: "Authorizes specific repair or maintenance work on a vehicle, with parts, labor cost and warranty terms.", keywords: "car auto vehicle mechanic repair shop truck" },
  { name: "Fleet Vehicle Maintenance Agreement", genre: "Automotive & Vehicle", tier: "everyday", desc: "Ongoing maintenance scope and service levels for a business's vehicle fleet.", keywords: "car auto vehicle fleet truck business" },

  // ---- Education & Training ----
  { name: "Tutoring Services Agreement", genre: "Education & Training", tier: "starter", desc: "Session schedule, rate and cancellation policy between a tutor and student or parent.", keywords: "tutor teacher lessons education" },
  { name: "Coaching / Mentorship Agreement", genre: "Education & Training", tier: "starter", desc: "Scope of coaching sessions, goals and fees between a coach and client.", keywords: "coach mentor training" },
  { name: "Online Course Licensing Agreement", genre: "Education & Training", tier: "everyday", desc: "Terms for licensing a course or curriculum to a platform or another business.", keywords: "online course education curriculum" },
  { name: "Corporate Training Services Agreement", genre: "Education & Training", tier: "everyday", desc: "Scope, delivery format and fees for training services delivered to a business.", keywords: "corporate training education business" },

  // ---- Personal & Family ----
  {
    name: "Roommate Agreement",
    genre: "Personal & Family",
    tier: "starter",
    desc: "Splits rent and expenses, house rules and move-out notice between roommates — separate from, and doesn't replace, any lease with the landlord.",
    keywords: "roommate housemate shared housing rent split",
    body: [
      "ROOMMATE AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between the following roommates sharing the residence " +
        "at [PROPERTY ADDRESS] (the \"Residence\"):",
      "Roommate 1: [NAME]   Roommate 2: [NAME]   Roommate 3: [NAME] (add more as needed)",
      "",
      "This Agreement is between the roommates only. It does not modify, and is not a substitute for, any lease " +
        "the roommates (or one of them) may have signed with a landlord.",
      "",
      "1. RENT & EXPENSE SPLIT",
      "Total monthly rent of $[TOTAL RENT] is split as follows: [NAME]: $[AMOUNT] ([PERCENT]%); [NAME]: " +
        "$[AMOUNT] ([PERCENT]%); [NAME]: $[AMOUNT] ([PERCENT]%). Shared utilities and other recurring costs " +
        "(internet, streaming, cleaning supplies, etc.) are split: [DESCRIBE SPLIT — e.g., equally / by usage].",
      "",
      "2. SECURITY DEPOSIT (BETWEEN ROOMMATES)",
      "If one roommate paid the landlord's security deposit on behalf of the group, the other roommates will " +
        "reimburse that roommate $[AMOUNT] each. When the deposit is returned by the landlord, it will be " +
        "divided among the roommates in the same proportion, less any amount a specific roommate caused to be " +
        "withheld (e.g., damage to their own room).",
      "",
      "3. HOUSE RULES",
      "The roommates agree to the following house rules: guests staying longer than [NUMBER] nights require the " +
        "other roommates' advance notice/consent; quiet hours are [TIME RANGE]; shared spaces are cleaned on the " +
        "following schedule: [DESCRIBE]; [ADD ANY OTHER RULES — e.g., pets, smoking, shared groceries].",
      "",
      "4. MOVE-OUT NOTICE",
      "A roommate who wants to move out before the end of the underlying lease term will give the other " +
        "roommates at least [NUMBER] days' written notice, and remains responsible for their share of rent " +
        "through the end of that notice period or until a replacement roommate is found and approved by the " +
        "remaining roommates and (if required) the landlord, whichever comes first.",
      "",
      "5. DISPUTES",
      "The roommates will attempt to resolve disagreements about this Agreement directly before involving the " +
        "landlord or any third party, except where the landlord's involvement is legally required.",
      "",
      "6. SIGNATURES",
      "By signing below (or electronically consenting), each roommate agrees to be bound by the terms of this " +
        "Agreement.",
      "",
      "[This is a starting-point draft, not legal advice. This Agreement is between roommates only — check the " +
        "actual lease for whether adding, removing, or replacing a roommate also requires the landlord's " +
        "consent.]",
    ].join("\n"),
  },
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

  // ---- Home & Personal Services (generic; deep AR/TX coverage below) ----
  { name: "Home & Personal Services Agreement", genre: "Home & Personal Services", tier: "starter", desc: "Recurring service terms for lawn care, cleaning, or similar home services — scope, schedule and cancellation policy.", keywords: "lawn care landscaping cleaning handyman home service recurring" },

  // ---- Family Law (informational only — see ai_restricted below) ----
  {
    name: "Marital Settlement Agreement — Informational Overview",
    genre: "Family Law",
    tier: "starter",
    desc: "An informational overview of what a marital settlement agreement typically covers — not a fillable contract.",
    keywords: "divorce marital settlement family law spouse separation",
    aiRestricted: true,
    body: [
      "MARITAL SETTLEMENT AGREEMENT — INFORMATIONAL OVERVIEW",
      "",
      "This document is informational only. It is not a contract, is not filled in with your details, and is " +
        "not something Pact AI will draft or customize for you.",
      "",
      "WHAT A MARITAL SETTLEMENT AGREEMENT TYPICALLY ADDRESSES",
      "- Division of marital property and debts",
      "- Spousal support (alimony), if any, and its duration",
      "- Child custody, visitation/parenting time, and child support, if applicable",
      "- Health insurance and tax-filing arrangements during the transition",
      "",
      "WHY PACT DOESN'T AUTO-GENERATE THIS ONE",
      "Divorce settlements are typically filed with and reviewed by a court, vary significantly by state, and " +
        "carry consequences (support obligations, custody terms, property division) that are highly fact-specific. " +
        "Pact AI will not draft or suggest terms for this category — it will only point you to this overview.",
      "",
      "NEXT STEPS",
      "Consult a licensed family-law attorney in your state, and check your local court's self-help or family-law " +
        "facilitator resources for the forms your jurisdiction actually requires.",
      "",
      "This is not legal advice. Review with a licensed attorney before taking any action based on this overview.",
    ].join("\n"),
  },
  {
    name: "Child Custody & Visitation Info Sheet",
    genre: "Family Law",
    tier: "starter",
    desc: "General information about how custody and visitation/parenting-time arrangements are typically structured.",
    keywords: "custody visitation parenting plan child family law divorce",
    aiRestricted: true,
    body: [
      "CHILD CUSTODY & VISITATION — INFORMATIONAL SHEET",
      "",
      "This document is informational only. It is not a contract or parenting plan, and Pact AI will not draft or " +
        "customize custody or visitation terms.",
      "",
      "TERMS YOU'LL COMMONLY SEE",
      "- Legal custody (who makes major decisions) vs. physical custody (where the child primarily lives)",
      "- Parenting time / visitation schedules, including holidays and school breaks",
      "- Child support, calculated under your state's guidelines",
      "",
      "WHY PACT DOESN'T AUTO-GENERATE THIS ONE",
      "Custody and visitation terms are almost always subject to court approval and the child's best interests as " +
        "your state defines them — an AI-suggested arrangement could conflict with local guidelines or a judge's " +
        "expectations. Pact AI will not finalize or suggest custody terms.",
      "",
      "NEXT STEPS",
      "Work with a licensed family-law attorney, and check your local family court for required parenting-plan forms.",
      "",
      "This is not legal advice. Review with a licensed attorney before taking any action based on this overview.",
    ].join("\n"),
  },
  {
    name: "Uncontested Divorce Filing Checklist",
    genre: "Family Law",
    tier: "starter",
    desc: "A general checklist of what an uncontested divorce filing usually involves — informational only.",
    keywords: "divorce filing checklist uncontested family law court",
    aiRestricted: true,
    body: [
      "UNCONTESTED DIVORCE — GENERAL FILING CHECKLIST",
      "",
      "This is a general, informational checklist, not a legal filing and not customized to your situation. " +
        "Pact AI will not draft divorce petitions or related filings.",
      "",
      "TYPICALLY INVOLVED",
      "- Meeting your state's residency requirement before filing",
      "- Filing a petition with the appropriate family/circuit court",
      "- Serving your spouse (or filing jointly, where allowed)",
      "- A settlement agreement covering property, support and custody (see the Marital Settlement Agreement " +
        "overview and Child Custody & Visitation info sheet in this category)",
      "- A waiting/cooling-off period before the divorce is finalized, which varies by state",
      "",
      "WHY THIS STAYS INFORMATIONAL",
      "Divorce is a court proceeding. Filing requirements, forms and waiting periods vary by state and by county, " +
        "and getting them wrong can delay or jeopardize your case — this is exactly the kind of situation where " +
        "Pact AI defers instead of guessing.",
      "",
      "NEXT STEPS",
      "Contact your local family/circuit court clerk for the exact forms required, and consult a licensed " +
        "family-law attorney, especially if children, property or support are involved.",
      "",
      "This is not legal advice. Review with a licensed attorney before taking any action based on this checklist.",
    ].join("\n"),
  },

  // ---- Deep state coverage: Arkansas & Texas ----
  // MVP prioritizes real depth in two states across three categories over
  // shallow, generic coverage everywhere — every other state still gets a
  // usable contract via the generic ('ALL') templates above, with the
  // governing-law clause auto-filled to that state at creation time.
  {
    name: "Arkansas Lawn Care & Landscaping Service Agreement",
    genre: "Home & Personal Services",
    tier: "starter",
    state: "AR",
    desc: "Recurring lawn care/landscaping terms written for Arkansas, including a standard cancellation policy.",
    keywords: "lawn care landscaping arkansas home service recurring",
    body: [
      "ARKANSAS LAWN CARE & LANDSCAPING SERVICE AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between [SERVICE PROVIDER NAME] (\"Provider\") and " +
        "[CUSTOMER NAME] (\"Customer\") for lawn care and/or landscaping services at [SERVICE ADDRESS], Arkansas.",
      "",
      "1. SERVICES & SCHEDULE",
      "Provider will perform [DESCRIBE SERVICES — e.g., weekly mowing, edging, seasonal cleanup] beginning " +
        "[START DATE] through [END DATE], on a [WEEKLY/BI-WEEKLY/MONTHLY] schedule, weather permitting.",
      "",
      "2. FEES & PAYMENT",
      "Customer agrees to pay $[AMOUNT] per [VISIT/MONTH], due [PAYMENT TERMS, e.g., within 10 days of service].",
      "",
      "3. CANCELLATION POLICY",
      "Either party may cancel a scheduled visit with at least [NOTICE PERIOD, e.g., 24 hours] notice. Either " +
        "party may terminate this Agreement entirely with [NOTICE PERIOD, e.g., 14 days] written notice.",
      "",
      "4. PROPERTY ACCESS & LIABILITY",
      "Customer authorizes Provider to access the property described above during scheduled service windows. " +
        "Provider is responsible for damage directly caused by its negligence; Customer should disclose known " +
        "hazards (irrigation lines, invisible fencing, uneven terrain) before service begins.",
      "",
      "5. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of Arkansas, without regard to conflict-of-law " +
        "principles.",
      "",
      "6. ENTIRE AGREEMENT",
      "This Agreement constitutes the entire understanding between the parties regarding these services.",
      "",
      "[This is a starting-point draft, not legal advice. Customize every bracketed term and have counsel review " +
        "before use in a high-value or long-term arrangement.]",
    ].join("\n"),
  },
  {
    name: "Texas Lawn Care & Landscaping Service Agreement",
    genre: "Home & Personal Services",
    tier: "starter",
    state: "TX",
    desc: "Recurring lawn care/landscaping terms written for Texas, including a standard cancellation policy.",
    keywords: "lawn care landscaping texas home service recurring",
    body: [
      "TEXAS LAWN CARE & LANDSCAPING SERVICE AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between [SERVICE PROVIDER NAME] (\"Provider\") and " +
        "[CUSTOMER NAME] (\"Customer\") for lawn care and/or landscaping services at [SERVICE ADDRESS], Texas.",
      "",
      "1. SERVICES & SCHEDULE",
      "Provider will perform [DESCRIBE SERVICES — e.g., weekly mowing, edging, seasonal cleanup] beginning " +
        "[START DATE] through [END DATE], on a [WEEKLY/BI-WEEKLY/MONTHLY] schedule, weather permitting.",
      "",
      "2. FEES & PAYMENT",
      "Customer agrees to pay $[AMOUNT] per [VISIT/MONTH], due [PAYMENT TERMS, e.g., within 10 days of service]. " +
        "Provider is responsible for any Texas sales tax due on taxable landscaping services under state law.",
      "",
      "3. CANCELLATION POLICY",
      "Either party may cancel a scheduled visit with at least [NOTICE PERIOD, e.g., 24 hours] notice. Either " +
        "party may terminate this Agreement entirely with [NOTICE PERIOD, e.g., 14 days] written notice.",
      "",
      "4. PROPERTY ACCESS & LIABILITY",
      "Customer authorizes Provider to access the property described above during scheduled service windows. " +
        "Provider is responsible for damage directly caused by its negligence; Customer should disclose known " +
        "hazards (irrigation lines, invisible fencing, uneven terrain) before service begins.",
      "",
      "5. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-law principles.",
      "",
      "6. ENTIRE AGREEMENT",
      "This Agreement constitutes the entire understanding between the parties regarding these services.",
      "",
      "[This is a starting-point draft, not legal advice. Customize every bracketed term and have counsel review " +
        "before use in a high-value or long-term arrangement.]",
    ].join("\n"),
  },
  {
    name: "Arkansas Residential Lease Agreement",
    genre: "Real Estate",
    tier: "starter",
    state: "AR",
    desc: "A residential lease written for Arkansas, including deposit-handling terms consistent with state practice.",
    keywords: "rent apartment lease arkansas tenant landlord house",
    body: [
      "ARKANSAS RESIDENTIAL LEASE AGREEMENT",
      "",
      "This Lease is entered into as of [DATE] by and between [LANDLORD NAME] (\"Landlord\") and [TENANT NAME] " +
        "(\"Tenant\") for the property located at [PROPERTY ADDRESS], Arkansas.",
      "",
      "1. TERM",
      "This Lease begins on [START DATE] and ends on [END DATE], unless renewed or terminated as provided herein.",
      "",
      "2. RENT",
      "Tenant agrees to pay $[AMOUNT] per month, due on the [DAY] of each month, payable to [PAYMENT METHOD].",
      "",
      "3. SECURITY DEPOSIT",
      "Tenant will pay a security deposit of $[AMOUNT]. Under Arkansas law, Landlord must return the deposit " +
        "(less lawful deductions) within 60 days of Tenant vacating, along with an itemized list of any " +
        "deductions if the deposit exceeds $50 or is charged to more than one tenant.",
      "",
      "4. MAINTENANCE & REPAIRS",
      "Landlord is responsible for maintaining the property in a habitable condition; Tenant is responsible for " +
        "damage beyond normal wear and tear and for promptly reporting needed repairs.",
      "",
      "5. TERMINATION & NOTICE",
      "Either party must provide written notice as required under Arkansas's residential landlord-tenant rules " +
        "before ending a month-to-month tenancy or before either party may act on a material breach.",
      "",
      "6. GOVERNING LAW",
      "This Lease is governed by the laws of the State of Arkansas, without regard to conflict-of-law principles.",
      "",
      "[This is a starting-point draft, not legal advice. Landlord-tenant rules change; have counsel review before " +
        "use, especially for deposit handling and eviction notice periods.]",
    ].join("\n"),
  },
  {
    name: "Texas Residential Lease Agreement",
    genre: "Real Estate",
    tier: "starter",
    state: "TX",
    desc: "A residential lease written for Texas, including deposit-handling terms consistent with the Texas Property Code.",
    keywords: "rent apartment lease texas tenant landlord house",
    body: [
      "TEXAS RESIDENTIAL LEASE AGREEMENT",
      "",
      "This Lease is entered into as of [DATE] by and between [LANDLORD NAME] (\"Landlord\") and [TENANT NAME] " +
        "(\"Tenant\") for the property located at [PROPERTY ADDRESS], Texas.",
      "",
      "1. TERM",
      "This Lease begins on [START DATE] and ends on [END DATE], unless renewed or terminated as provided herein.",
      "",
      "2. RENT",
      "Tenant agrees to pay $[AMOUNT] per month, due on the [DAY] of each month, payable to [PAYMENT METHOD].",
      "",
      "3. SECURITY DEPOSIT",
      "Tenant will pay a security deposit of $[AMOUNT]. Under Texas Property Code Chapter 92, Landlord must " +
        "return the deposit (less lawful deductions) within 30 days of Tenant surrendering the property and " +
        "providing a forwarding address.",
      "",
      "4. MAINTENANCE & REPAIRS",
      "Landlord is responsible for maintaining the property in a habitable condition and must repair conditions " +
        "materially affecting health/safety within a reasonable time after written notice from Tenant.",
      "",
      "5. TERMINATION & NOTICE",
      "Either party must provide written notice as required under Texas law before ending a month-to-month " +
        "tenancy or before either party may act on a material breach.",
      "",
      "6. GOVERNING LAW",
      "This Lease is governed by the laws of the State of Texas, without regard to conflict-of-law principles.",
      "",
      "[This is a starting-point draft, not legal advice. Landlord-tenant rules change; have counsel review before " +
        "use, especially for deposit handling and eviction notice periods.]",
    ].join("\n"),
  },
  {
    name: "Arkansas Music Licensing Agreement",
    genre: "Music & Entertainment",
    tier: "pro",
    state: "AR",
    desc: "Sync/use rights and royalty terms for licensed music use, written for Arkansas.",
    keywords: "song music sync license arkansas",
    body: [
      "ARKANSAS MUSIC LICENSING AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between [LICENSOR NAME] (\"Licensor\"), the rights " +
        "holder of the musical work \"[SONG TITLE]\" (\"Work\"), and [LICENSEE NAME] (\"Licensee\").",
      "",
      "1. GRANT OF RIGHTS",
      "Licensor grants Licensee a [EXCLUSIVE/NON-EXCLUSIVE] license to use the Work for [DESCRIBE USE — e.g., " +
        "film, advertising, streaming] within the territory of [TERRITORY], for the term of [TERM].",
      "",
      "2. ROYALTIES & FEES",
      "Licensee agrees to pay a [FLAT FEE/ROYALTY RATE] of $[AMOUNT] / [PERCENTAGE]%, payable [SCHEDULE].",
      "",
      "3. CREDIT",
      "Licensee will credit Licensor as [CREDIT LANGUAGE] wherever the Work is used, where practicable.",
      "",
      "4. TERMINATION",
      "Either party may terminate this Agreement for uncured material breach with [NOTICE PERIOD] written notice.",
      "",
      "5. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of Arkansas, without regard to conflict-of-law " +
        "principles.",
      "",
      "[This is a starting-point draft, not legal advice. Music rights (mechanical, performance, sync) can " +
        "involve multiple rights holders — confirm Licensor actually controls the rights being licensed, and " +
        "have counsel review before use.]",
    ].join("\n"),
  },
  {
    name: "Texas Music Licensing Agreement",
    genre: "Music & Entertainment",
    tier: "pro",
    state: "TX",
    desc: "Sync/use rights and royalty terms for licensed music use, written for Texas.",
    keywords: "song music sync license texas",
    body: [
      "TEXAS MUSIC LICENSING AGREEMENT",
      "",
      "This Agreement is entered into as of [DATE] by and between [LICENSOR NAME] (\"Licensor\"), the rights " +
        "holder of the musical work \"[SONG TITLE]\" (\"Work\"), and [LICENSEE NAME] (\"Licensee\").",
      "",
      "1. GRANT OF RIGHTS",
      "Licensor grants Licensee a [EXCLUSIVE/NON-EXCLUSIVE] license to use the Work for [DESCRIBE USE — e.g., " +
        "film, advertising, streaming] within the territory of [TERRITORY], for the term of [TERM].",
      "",
      "2. ROYALTIES & FEES",
      "Licensee agrees to pay a [FLAT FEE/ROYALTY RATE] of $[AMOUNT] / [PERCENTAGE]%, payable [SCHEDULE].",
      "",
      "3. CREDIT",
      "Licensee will credit Licensor as [CREDIT LANGUAGE] wherever the Work is used, where practicable.",
      "",
      "4. TERMINATION",
      "Either party may terminate this Agreement for uncured material breach with [NOTICE PERIOD] written notice.",
      "",
      "5. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-law principles.",
      "",
      "[This is a starting-point draft, not legal advice. Music rights (mechanical, performance, sync) can " +
        "involve multiple rights holders — confirm Licensor actually controls the rights being licensed, and " +
        "have counsel review before use.]",
    ].join("\n"),
  },
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
    "INSERT INTO templates (name, genre, min_tier, description, body, keywords, state, ai_restricted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  db.exec("BEGIN");
  try {
    for (const t of TEMPLATE_SEED) {
      insert.run(
        t.name,
        t.genre,
        t.tier,
        t.desc,
        t.body || buildBody(t),
        t.keywords || "",
        t.state || "ALL",
        t.aiRestricted ? 1 : 0
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  console.log(`[pact] seeded ${TEMPLATE_SEED.length} contract templates`);
}

// Content improvements/additions to TEMPLATE_SEED above only reach a
// database via seedTemplates() if the templates table was still empty —
// seedTemplates() does nothing once it's been run once. This runs on
// every boot instead, targeting specific rows by name, so an improved
// template body (or a genuinely new template) reaches a database that
// was already seeded before this change, not just a brand new one.
// Safe to re-run: each name's end state is the same every time, since
// nothing else writes to templates.body/description/keywords today.
const TEMPLATE_CONTENT_UPDATES = [
  "Songwriter Split Sheet Agreement",
  "Residential Lease Agreement",
  "Non-Disclosure Agreement (Mutual)",
  "Freelance Services Agreement",
  "Vehicle Bill of Sale",
  "Roommate Agreement",
];
const TEMPLATE_CONTENT_ADDITIONS = [
  "Beat Lease Agreement",
  "Collaboration / Feature Agreement",
  "Model Release Agreement",
  "Equipment Rental Agreement",
];

function applyTemplateContentUpdates(db) {
  const byName = new Map(TEMPLATE_SEED.map((t) => [t.name, t]));
  const update = db.prepare(
    "UPDATE templates SET description = ?, body = ?, keywords = ? WHERE name = ? AND genre = ?"
  );
  const insertIfMissing = db.prepare(
    `INSERT INTO templates (name, genre, min_tier, description, body, keywords, state, ai_restricted)
     SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM templates WHERE name = ?)`
  );
  for (const name of TEMPLATE_CONTENT_UPDATES) {
    const t = byName.get(name);
    if (t && t.body) update.run(t.desc, t.body, t.keywords || "", t.name, t.genre);
  }
  for (const name of TEMPLATE_CONTENT_ADDITIONS) {
    const t = byName.get(name);
    if (!t) continue;
    insertIfMissing.run(t.name, t.genre, t.tier, t.desc, t.body || buildBody(t), t.keywords || "", t.state || "ALL", t.aiRestricted ? 1 : 0, t.name);
  }
}

module.exports = { seedTemplates, applyTemplateContentUpdates, TEMPLATE_SEED };
