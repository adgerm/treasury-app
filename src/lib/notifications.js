const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

const FROM = process.env.SMTP_FROM || 'Treasury <noreply@localhost>';

/**
 * Send receipt status email (e.g. approved/rejected).
 */
async function sendReceiptStatusEmail(toEmail, receipt, status) {
  if (!process.env.SMTP_HOST) {
    console.warn('SMTP not configured; skipping email to', toEmail);
    return;
  }
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: `Receipt ${status}: ${receipt.description}`,
    text: `Your receipt "${receipt.description}" ($${receipt.amount}) has been ${status}.`,
  });
}

module.exports = { sendReceiptStatusEmail };
