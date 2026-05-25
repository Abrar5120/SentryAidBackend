/**
 * Manual one-time repair: sets reviewSubmitted=true on every SOS that has a Review.
 * Run from backend folder: node scripts/repair-review-submitted.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { repairReviewSubmittedFlags } = require('../services/repairReviewSubmitted');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in .env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  const result = await repairReviewSubmittedFlags();
  console.log('Done:', result);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
