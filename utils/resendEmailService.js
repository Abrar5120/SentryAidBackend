const { Resend } = require('resend');

const RESEND_DEBUG = 'RESEND_DEBUG';
const DEFAULT_FROM = 'onboarding@resend.dev';

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

  console.log(RESEND_DEBUG, `sending ${context} to`, recipient);
  console.log(RESEND_DEBUG, 'subject:', subject);
  console.log(RESEND_DEBUG, 'from:', DEFAULT_FROM);

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
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
  DEFAULT_FROM
};
