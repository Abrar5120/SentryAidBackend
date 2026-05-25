const https = require('https');
const { URL } = require('url');

const GEOCODE_TIMEOUT_MS = 3500;
const USER_AGENT = 'SentryAid/1.0 (https://sentryaid.local; emergency SOS analytics)';

/**
 * Reverse-geocode lat/lon to a human-readable area label (suburb / district / city).
 * Uses Nominatim; respect their usage policy in production (caching, rate limits).
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string>}
 */
function reverseGeocodeArea(lat, lon) {
  const u = new URL('https://nominatim.openstreetmap.org/reverse');
  u.searchParams.set('format', 'json');
  u.searchParams.set('lat', String(lat));
  u.searchParams.set('lon', String(lon));
  u.searchParams.set('zoom', '14');
  u.searchParams.set('addressdetails', '1');

  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        headers: { 'User-Agent': USER_AGENT },
        timeout: GEOCODE_TIMEOUT_MS
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`nominatim HTTP ${res.statusCode}`));
            return;
          }
          try {
            const j = JSON.parse(data);
            const addr = j.address || {};
            const sub =
              addr.city_district ||
              addr.suburb ||
              addr.neighbourhood ||
              addr.quarter ||
              addr.town ||
              addr.city ||
              addr.village ||
              addr.municipality ||
              addr.state_district ||
              addr.county ||
              addr.state;
            const label = sub != null && String(sub).trim() !== '' ? String(sub).trim() : 'Unknown';
            resolve(label);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('geocode timeout'));
    });
  });
}

module.exports = { reverseGeocodeArea, GEOCODE_TIMEOUT_MS };
