/**
 * One-time repair: SOS documents with location.type "Point" but missing/invalid coordinates.
 *
 * Run from backend folder:
 *   node scripts/repairSosLocations.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const SOS = require('../models/SOS');
const {
  repairInvalidSosLocationsInDb,
  SOS_ESCALATION_DEBUG
} = require('../utils/sosLocationRepair');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const { repaired, cleared } = await repairInvalidSosLocationsInDb(SOS);
  console.log(`Repair summary: repaired=${repaired} cleared=${cleared}`);
  console.log(SOS_ESCALATION_DEBUG, 'recovery completed');

  await mongoose.disconnect();
  console.log('\nDone. Restart the backend.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
