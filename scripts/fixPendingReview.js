/**
 * Direct repair for stale pending-review SOS records.
 *
 * Run from backend folder:
 *   node scripts/fixPendingReview.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const SOS = require('../models/SOS');
const { repairReviewSubmittedFlags } = require('../services/repairReviewSubmitted');

const STALE_SOS_ID = '6a08d95f232874d3cce10f6e';

async function fixSpecificSos() {
  console.log('\n--- Part 1: Fix specific SOS ---');
  console.log('Target sosId:', STALE_SOS_ID);

  if (!mongoose.Types.ObjectId.isValid(STALE_SOS_ID)) {
    console.error('Invalid SOS id format.');
    return false;
  }

  const sos = await SOS.findById(STALE_SOS_ID);
  if (!sos) {
    console.log('SOS document not found for id:', STALE_SOS_ID);
    return false;
  }

  console.log('Found SOS:');
  console.log('  status =', sos.status);
  console.log('  reviewSubmitted =', sos.reviewSubmitted);

  sos.reviewSubmitted = true;
  await sos.save();

  const verified = await SOS.findById(STALE_SOS_ID).lean();
  console.log('\nUpdated:');
  console.log('  reviewSubmitted =', verified.reviewSubmitted);
  console.log('Confirmation: SOS', STALE_SOS_ID, 'is no longer pending review.');

  return true;
}

async function runGlobalRepair() {
  console.log('\n--- Part 2: Global repair (all Review → SOS flags) ---');
  const result = await repairReviewSubmittedFlags();
  console.log('Global repair summary:', result);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  await fixSpecificSos();
  await runGlobalRepair();

  await mongoose.disconnect();
  console.log('\nDone. Restart the backend and verify GET /api/reviews/pending returns hasPendingReview=false.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
