const SOS_ESCALATION_DEBUG = 'SOS_ESCALATION_DEBUG';

/**
 * True when location has a valid GeoJSON Point with [longitude, latitude].
 */
function hasValidSosLocation(sos) {
  return (
    sos != null &&
    sos.location &&
    Array.isArray(sos.location.coordinates) &&
    sos.location.coordinates.length === 2 &&
    Number.isFinite(sos.location.coordinates[0]) &&
    Number.isFinite(sos.location.coordinates[1])
  );
}

function canBuildCoordinatesFromLatLon(sos) {
  return (
    sos != null &&
    typeof sos.latitude === 'number' &&
    typeof sos.longitude === 'number' &&
    Number.isFinite(sos.latitude) &&
    Number.isFinite(sos.longitude)
  );
}

/**
 * Repair in-memory SOS document before save. Mutates sos when repair is possible.
 * @returns {{ ok: boolean, repaired: boolean }}
 */
function repairSosLocationOnDocument(sos) {
  if (hasValidSosLocation(sos)) {
    return { ok: true, repaired: false };
  }

  if (canBuildCoordinatesFromLatLon(sos)) {
    sos.location = {
      type: 'Point',
      coordinates: [sos.longitude, sos.latitude]
    };
    if (typeof sos.markModified === 'function') {
      sos.markModified('location');
    }
    return { ok: true, repaired: true };
  }

  return { ok: false, repaired: false };
}

/**
 * Prepare SOS for MongoDB write: repair location or unset invalid location field.
 * @returns {{ ok: boolean, repaired: boolean, cleared: boolean }}
 */
function prepareSosLocationForSave(sos) {
  const result = repairSosLocationOnDocument(sos);
  if (result.ok) {
    return { ...result, cleared: false };
  }

  if (sos && typeof sos.set === 'function') {
    sos.set('location', undefined);
    sos.markModified('location');
  } else if (sos) {
    delete sos.location;
  }

  return { ok: false, repaired: false, cleared: true };
}

/**
 * Persist SOS after location repair/clear. Never throws on invalid location alone.
 */
async function saveSosWithLocationRepair(sos) {
  const prep = prepareSosLocationForSave(sos);
  if (prep.repaired) {
    console.log(SOS_ESCALATION_DEBUG, 'repaired invalid location', String(sos._id));
  }
  await sos.save();
  return prep;
}

const INVALID_LOCATION_FILTER = {
  'location.type': 'Point',
  $or: [
    { 'location.coordinates': { $exists: false } },
    { 'location.coordinates': null },
    { 'location.coordinates.0': { $exists: false } },
    { 'location.coordinates.1': { $exists: false } }
  ]
};

/**
 * Bulk-repair SOS documents with Point type but missing coordinates (safe for startup).
 */
async function repairInvalidSosLocationsInDb(SOSModel) {
  const rows = await SOSModel.find(INVALID_LOCATION_FILTER);
  if (!rows.length) {
    return { repaired: 0, cleared: 0 };
  }

  let repaired = 0;
  let cleared = 0;

  for (const sos of rows) {
    if (canBuildCoordinatesFromLatLon(sos)) {
      // eslint-disable-next-line no-await-in-loop
      await SOSModel.updateOne(
        { _id: sos._id },
        {
          $set: {
            location: {
              type: 'Point',
              coordinates: [sos.longitude, sos.latitude]
            }
          }
        }
      );
      console.log(SOS_ESCALATION_DEBUG, 'repaired invalid location', String(sos._id));
      repaired += 1;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await SOSModel.updateOne({ _id: sos._id }, { $unset: { location: '' } });
      console.warn(SOS_ESCALATION_DEBUG, 'skipped invalid SOS', String(sos._id));
      cleared += 1;
    }
  }

  return { repaired, cleared };
}

module.exports = {
  SOS_ESCALATION_DEBUG,
  hasValidSosLocation,
  canBuildCoordinatesFromLatLon,
  repairSosLocationOnDocument,
  prepareSosLocationForSave,
  saveSosWithLocationRepair,
  repairInvalidSosLocationsInDb,
  INVALID_LOCATION_FILTER
};
