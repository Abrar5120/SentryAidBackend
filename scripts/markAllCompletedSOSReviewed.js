/**
 * One-time cleanup: mark all completed SOS records as already reviewed.
 *
 * Run from backend folder:
 *   node scripts/markAllCompletedSOSReviewed.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const SOS = require('../models/SOS');

const FILTER = {
  status: 'completed',
  $or: [
    { reviewSubmitted: false },
    { reviewSubmitted: { $exists: false } }
  ]
};

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const matchedCount = await SOS.countDocuments(FILTER);
  console.log(`Found ${matchedCount} completed SOS records needing repair.`);

  if (matchedCount === 0) {
    console.log('Updated 0 records.');
    console.log('All completed SOS are now marked as reviewed.');
    await mongoose.disconnect();
    return;
  }

  const result = await SOS.updateMany(FILTER, { $set: { reviewSubmitted: true } });

  console.log(`Updated ${result.modifiedCount} records.`);
  console.log('All completed SOS are now marked as reviewed.');

  await mongoose.disconnect();
  console.log('\nDone. Restart the backend and verify GET /api/reviews/pending.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
