const SOS = require('../models/SOS');

const HEATMAP_DEBUG = 'HEATMAP_DEBUG';
const SOS_ANALYTICS_DEBUG = 'SOS_ANALYTICS_DEBUG';

const HEATMAP_MAX_CLUSTERS = 800;

function isValidCoordinate(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  return true;
}

/**
 * GET /api/sos/heatmap
 * Last 30 days SOS (non-cancelled), grouped by approximate location.
 * Returns latitude, longitude, sosCount, intensity, areaName.
 */
const getSosHeatmap = async (req, res) => {
  try {
    console.log(HEATMAP_DEBUG, 'request user=', req.user?.id || req.user?._id || 'n/a');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const pipeline = [
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          status: { $ne: 'cancelled' },
          latitude: { $exists: true, $type: 'number', $ne: null },
          longitude: { $exists: true, $type: 'number', $ne: null }
        }
      },
      {
        $addFields: {
          latBucket: {
            $divide: [{ $floor: { $multiply: ['$latitude', 100] } }, 100]
          },
          lonBucket: {
            $divide: [{ $floor: { $multiply: ['$longitude', 100] } }, 100]
          },
          areaLabel: {
            $cond: [
              {
                $and: [
                  { $ne: ['$areaName', null] },
                  { $ne: ['$areaName', ''] }
                ]
              },
              '$areaName',
              'Unknown'
            ]
          }
        }
      },
      {
        $match: {
          latBucket: { $ne: 0 },
          lonBucket: { $ne: 0 }
        }
      },
      {
        $group: {
          _id: { lat: '$latBucket', lon: '$lonBucket' },
          sosCount: { $sum: 1 },
          areaName: { $first: '$areaLabel' }
        }
      },
      {
        $project: {
          _id: 0,
          latitude: '$_id.lat',
          longitude: '$_id.lon',
          sosCount: 1,
          areaName: 1,
          intensity: {
            $cond: [
              { $lte: ['$sosCount', 2] },
              1,
              {
                $cond: [{ $lte: ['$sosCount', 6] }, 2, 3]
              }
            ]
          }
        }
      },
      { $sort: { sosCount: -1 } },
      { $limit: HEATMAP_MAX_CLUSTERS }
    ];

    const raw = await SOS.aggregate(pipeline);
    const data = raw.filter((row) =>
      isValidCoordinate(row.latitude, row.longitude)
    );

    console.log(HEATMAP_DEBUG, 'fetched points count=', raw.length);
    console.log(HEATMAP_DEBUG, 'valid clusters returned=', data.length);
    console.log(HEATMAP_DEBUG, 'API success');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error(HEATMAP_DEBUG, 'API failure', err?.message || err);
    return res.status(500).json({ success: false, message: 'Failed to load heatmap' });
  }
};

/**
 * GET /api/sos/count-by-area
 * Today's SOS counts grouped by stored areaName.
 */
const getSosCountByArea = async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const pipeline = [
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $addFields: {
          areaKey: {
            $let: {
              vars: { r: { $ifNull: ['$areaName', ''] } },
              in: {
                $cond: [{ $eq: ['$$r', ''] }, 'Unknown', '$$r']
              }
            }
          }
        }
      },
      {
        $group: {
          _id: '$areaKey',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          area: '$_id',
          count: 1
        }
      },
      { $sort: { count: -1 } }
    ];

    const data = await SOS.aggregate(pipeline);
    console.log(SOS_ANALYTICS_DEBUG, 'count-by-area today rows=', data.length);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error(SOS_ANALYTICS_DEBUG, 'count-by-area error', err);
    return res.status(500).json({ success: false, message: 'Failed to load area counts' });
  }
};

module.exports = {
  getSosHeatmap,
  getSosCountByArea,
  HEATMAP_DEBUG,
  SOS_ANALYTICS_DEBUG
};
