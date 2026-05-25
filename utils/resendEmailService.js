const { Resend } = require('resend');

const RESEND_DEBUG = 'RESEND_DEBUG';

/** Display name shown in the recipient's inbox. */
const DEFAULT_FROM_NAME = 'SentryAid';
/** Verified sender address on Resend domain product.pookiedhk.com */
const DEFAULT_FROM_EMAIL = 'otp@product.pookiedhk.com';

/**
 * Resend "from" header: "Name <email@domain.com>".
 * Override on Railway via RESEND_FROM (full string) or RESEND_FROM_NAME + RESEND_FROM_EMAIL.
 */
function resolveFromAddress() {
  const full = process.env.RESEND_FROM;
  if (full && String(full).trim()) {
    return String(full).trim();
  }
  const name = (process.env.RESEND_FROM_NAME || DEFAULT_FROM_NAME).trim();
  const email = (process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL).trim();
  return `${name} <${email}>`;
}

const DEFAULT_FROM = resolveFromAddress();

console.log(RESEND_DEBUG, 'resolved sender email:', DEFAULT_FROM);

let resendClient = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error('RESEND_API_KEY is not configured');
    console.error(RESEND_DEBUG, 'failed — missing RESEND_API_KEY');
    throw err;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Send an HTML email via Resend API.
 * @param {{ to: string, subject: string, html: string, context?: string }} options
 * @returns {Promise<object>} Resend API response data
 */
async function sendResendEmail({ to, subject, html, context = 'email' }) {
  const recipient = String(to || '').trim();
  if (!recipient) {
    const err = new Error('Recipient email is required');
    console.error(RESEND_DEBUG, 'failed — empty recipient', context);
    throw err;
  }

  const from = resolveFromAddress();

  console.log(RESEND_DEBUG, `sending ${context} to`, recipient);
  console.log(RESEND_DEBUG, 'subject:', subject);
  console.log(RESEND_DEBUG, 'from:', from);

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from,
      to: [recipient],
      subject,
      html
    });

    if (error) {
      console.error(RESEND_DEBUG, 'failed', context, recipient, error);
      throw error;
    }

    console.log(
      RESEND_DEBUG,
      'success',
      context,
      recipient,
      data?.id ? `id=${data.id}` : ''
    );
    return data;
  } catch (err) {
    console.error(RESEND_DEBUG, 'failed', context, recipient, err?.message || err);
    if (err?.stack) {
      console.error(RESEND_DEBUG, 'stack', err.stack);
    }
    throw err;
  }
}

module.exports = {
  sendResendEmail,
  RESEND_DEBUG,
  DEFAULT_FROM,
  resolveFromAddress
};
