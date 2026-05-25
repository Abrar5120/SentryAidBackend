const admin = require('firebase-admin');

const FIREBASE_DEBUG = 'FIREBASE_DEBUG';

let initAttempted = false;
let initSucceeded = false;

/**
 * Parse Firebase service account JSON from Railway env FIREBASE_SERVICE_ACCOUNT.
 * @returns {object|null}
 */
function parseServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !String(raw).trim()) {
    console.warn(FIREBASE_DEBUG, 'missing FIREBASE_SERVICE_ACCOUNT');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(String(raw).trim());
    if (
      serviceAccount.private_key &&
      typeof serviceAccount.private_key === 'string'
    ) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    return serviceAccount;
  } catch (err) {
    console.error(
      FIREBASE_DEBUG,
      'initialization failed — invalid FIREBASE_SERVICE_ACCOUNT JSON',
      err?.message || err
    );
    return null;
  }
}

/**
 * Initialize firebase-admin once using credential from env (Railway-safe).
 * @returns {boolean}
 */
function initFirebaseAdminIfPossible() {
  if (admin.apps.length > 0) {
    return true;
  }

  if (initAttempted && !initSucceeded) {
    return false;
  }

  initAttempted = true;

  const serviceAccount = parseServiceAccountFromEnv();
  if (!serviceAccount) {
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    initSucceeded = true;
    console.log(FIREBASE_DEBUG, 'initialized successfully');
    return true;
  } catch (err) {
    console.error(FIREBASE_DEBUG, 'initialization failed', err?.message || err);
    if (err?.stack) {
      console.error(FIREBASE_DEBUG, 'stack', err.stack);
    }
    return false;
  }
}

module.exports = {
  admin,
  FIREBASE_DEBUG,
  initFirebaseAdminIfPossible
};
