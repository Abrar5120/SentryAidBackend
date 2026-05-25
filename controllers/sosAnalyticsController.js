const SOS = require('../models/SOS');

const HEATMAP_DEBUG = 'HEATMAP_DEBUG';
const SOS_ANALYTICS_DEBUG = 'SOS_ANALYTICS_DEBUG';

/**
 * GET /api/sos/heatmap
 * Last 30 days SOS (non-cancelled), grouped by approximate location; intensity 1–3 from count bands.
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
          latitude: { $exists: true, $ne: null },
          longitude: { $exists: true, $ne: null }
        }
      },
      {
        $addFields: {
          latBucket: {
            $divide: [{ $floor: { $multiply: ['$latitude', 100] } }, 100]
          },
          lonBucket: {
            $divide: [{ $floor: { $multiply: ['$longitude', 100] } }, 100]
          }
        }
      },
      {
        $group: {
          _id: { lat: '$latBucket', lon: '$lonBucket' },
          sosCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          latitude: '$_id.lat',
          longitude: '$_id.lon',
          sosCount: 1,
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
      { $sort: { sosCount: -1 } }
    ];

    const data = await SOS.aggregate(pipeline);
    console.log(HEATMAP_DEBUG, 'window=30d clusters=', data.length);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error(HEATMAP_DEBUG, err);
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
