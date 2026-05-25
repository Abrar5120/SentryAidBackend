/**
 * One-time repair: permanently mark a stuck SOS as reviewed.
 *
 * Run from backend folder:
 *   node scripts/fixStuckReview.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const SOS = require('../models/SOS');

const STUCK_SOS_ID = '69f7ad25386c74a51609b5ce';

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  console.log('Target sosId:', STUCK_SOS_ID);

  if (!mongoose.Types.ObjectId.isValid(STUCK_SOS_ID)) {
    console.error('Invalid SOS id format.');
    process.exit(1);
  }

  const sos = await SOS.findById(STUCK_SOS_ID);
  if (!sos) {
    console.log('SOS document not found for id:', STUCK_SOS_ID);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('\nFound SOS:');
  console.log('  status =', sos.status);
  console.log('  reviewSubmitted =', sos.reviewSubmitted);

  sos.reviewSubmitted = true;
  await sos.save();

  const verified = await SOS.findById(STUCK_SOS_ID).lean();
  console.log('\nUpdated:');
  console.log('  reviewSubmitted =', verified.reviewSubmitted);
  console.log('\nConfirmation: SOS', STUCK_SOS_ID, 'will no longer appear as pending review.');

  await mongoose.disconnect();
  console.log('\nDone. Restart the backend and verify GET /api/reviews/pending.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
