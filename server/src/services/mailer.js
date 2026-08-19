function mailerConfigured() {
  return !!process.env.SMTP_HOST;
}

function sendMail({ to, subject, text }) {
  if (!mailerConfigured()) {
    return {
      sent: false,
      note: "Email is not configured — share the signing link manually. Add SMTP_HOST/SMTP_USER/SMTP_PASS to server/.env to send real emails.",
    };
  }
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  transporter
    .sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text })
    .catch((err) => console.error("[pact] Failed to send email:", err.message));
  return { sent: true, note: null };
}

module.exports = { mailerConfigured, sendMail };
