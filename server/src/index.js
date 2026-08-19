require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const db = require("./db");
const { seedTemplates } = require("./seed-templates");
const { attachUser } = require("./middleware/auth");

seedTemplates(db);

const app = express();
app.disable("x-powered-by");

const WEBSITE_DIR = path.join(__dirname, "..", "..", "website");

app.use(cookieParser());
app.use(attachUser);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/templates", require("./routes/templates"));
app.use("/api/contracts", require("./routes/contracts"));
app.use("/api/sign", require("./routes/sign"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/billing", require("./routes/billing"));
app.use("/api/identity", require("./routes/identity"));

app.use(express.static(WEBSITE_DIR));

app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));
app.use((req, res) => res.status(404).sendFile(path.join(WEBSITE_DIR, "index.html")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[pact] server listening on http://localhost:${PORT}`);
  console.log(`[pact] AI drafting/analysis:  ${process.env.ANTHROPIC_API_KEY ? "connected" : "not configured"}`);
  console.log(`[pact] Billing (Stripe):      ${process.env.STRIPE_SECRET_KEY ? "connected" : "not configured"}`);
  console.log(`[pact] Identity verification: ${process.env.STRIPE_SECRET_KEY ? "connected" : "not configured"}`);
  console.log(`[pact] Email (SMTP):          ${process.env.SMTP_HOST ? "connected" : "not configured"}`);
});
