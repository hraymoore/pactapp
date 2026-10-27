function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient() {
  const Anthropic = require("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function notConfiguredError() {
  const err = new Error(
    "Pact AI is not connected yet. Add ANTHROPIC_API_KEY to server/.env to enable live drafting and analysis."
  );
  err.status = 501;
  return err;
}

async function draftWithAI(prompt) {
  if (!aiConfigured()) throw notConfiguredError();
  const client = getClient();
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content:
          "You are Pact AI, a contract drafting assistant embedded in a contract management platform. " +
          "Draft clear, plain-language contract text for the request below, using bracketed placeholders " +
          "for deal-specific details. End with a one-line reminder that this is a starting point, not legal advice.\n\n" +
          `Request: ${prompt}`,
      },
    ],
  });
  return msg.content.map((block) => block.text || "").join("\n");
}

async function analyzeWithAI(contractBody, question) {
  if (!aiConfigured()) throw notConfiguredError();
  const client = getClient();
  const q = question && question.trim() ? question.trim() : "Summarize this contract and flag any unusual or one-sided terms.";
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content:
          `You are Pact AI, reviewing a signed or draft contract. ${q}\n\n` +
          "Be specific about clause numbers or section names where possible. This is assistance, not legal advice.\n\n" +
          `Contract:\n${contractBody}`,
      },
    ],
  });
  return msg.content.map((block) => block.text || "").join("\n");
}

const CHAT_SYSTEM_PROMPT =
  "You are Pact AI, a conversational assistant embedded in Pact, a contract management platform. " +
  "You help users navigate the app, draft new contracts, and revise existing ones across any conversation turn, " +
  "not just a single question. You can also summarize a contract in plain, layman's terms, and adjust the " +
  "reading level or audience (e.g. \"explain it like I'm not a lawyer\", \"summarize for a business partner\", " +
  "\"summarize for a 10th grader\") whenever the user asks for a different verbiage or audience. " +
  "When a user asks you to draft or revise contract text, put the full proposed contract text inside a fenced " +
  "code block (```) by itself so the app can offer to apply it directly to the contract — write only the contract " +
  "text inside that block, no commentary inside it. Keep everything else conversational. Always end contract " +
  "drafts with a brief reminder that this is a starting point, not legal advice.";

const MAX_CHAT_MESSAGES = 30;

async function chatWithAI(messages, contractContext) {
  if (!aiConfigured()) throw notConfiguredError();
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error("At least one message is required.");
    err.status = 400;
    throw err;
  }
  const client = getClient();
  const trimmed = messages.slice(-MAX_CHAT_MESSAGES).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 20000),
  }));

  let system = CHAT_SYSTEM_PROMPT;
  if (contractContext) {
    system += `\n\nThe user currently has this contract open, named "${contractContext.name}":\n\n${contractContext.body}`;
  }

  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 1500,
    system,
    messages: trimmed,
  });
  return msg.content.map((block) => block.text || "").join("\n");
}

// "Auto-fill details with Pact AI" for an archive upload (routes/
// archive.js) — proposes values only; the caller never saves these
// without the user explicitly reviewing and confirming each field (see
// archive_items.ai_suggested_fields, which records exactly that).
async function extractArchiveMetadataWithAI(documentText) {
  if (!aiConfigured()) throw notConfiguredError();
  const client = getClient();
  const truncated = documentText.slice(0, 15000);
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content:
          "You are Pact AI, helping a user catalog an uploaded contract document into an archive. " +
          "Read the document text below and propose values for these fields. Respond with ONLY a JSON " +
          "object, no commentary, no markdown code fence, matching exactly this shape (use null for any " +
          "field you can't confidently determine):\n\n" +
          '{"title": string|null, "category": string|null, "governingState": string|null (two-letter US ' +
          'state code if named in the document), "counterpartyNames": string[] (every named party other ' +
          'than the uploader, best guess), "effectiveDate": string|null ("YYYY-MM-DD"), "expirationDate": ' +
          'string|null ("YYYY-MM-DD"), "autoRenews": boolean|null, "totalValueCents": number|null (total ' +
          'dollar value mentioned, converted to cents), "tags": string[] (2-5 short topical tags)}\n\n' +
          `Document text:\n${truncated}`,
      },
    ],
  });
  const raw = msg.content.map((block) => block.text || "").join("\n");
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Pact AI did not return a usable suggestion for this document.");
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    throw new Error("Pact AI's suggestion could not be parsed.");
  }
}

module.exports = { aiConfigured, draftWithAI, analyzeWithAI, chatWithAI, extractArchiveMetadataWithAI };
