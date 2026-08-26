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

module.exports = { aiConfigured, draftWithAI, analyzeWithAI };
