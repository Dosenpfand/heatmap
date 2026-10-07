import FitParser from 'fit-file-parser';

/**
 * Normalizes the many sport spellings found in exports to a short display name.
 * @param {unknown} raw
 */
export function normType(raw) {
  const s = String(raw || 'other').toLowerCase();
  if (/run/.test(s)) return 'Run';
  if (/virtual|ebike|e-bike/.test(s) && /ride|cycl/.test(s)) return 'Ride (virtual/e)';
  if (/cycl|bik|ride|9$/.test(s)) return 'Ride';
  if (/walk/.test(s)) return 'Walk';
  if (/hik/.test(s)) return 'Hike';
  if (/swim/.test(s)) return 'Swim';
  if (/ski/.test(s)) return 'Ski';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @typedef {{lon: number[], lat: number[]}} Segment
 * @typedef {{type?: string, year: number, ts: number, segs: Segment[]}} Activity
 */

/**
 * @param {string} txt GPX document
 * @returns {Activity}
 */
export function parseGpx(txt) {
  const type = txt.match(/<type>([^<]*)<\/type>/)?.[1];
  const ts = Date.parse(txt.match(/<time>([^<]+)<\/time>/)?.[1] ?? '') / 1000 || 0;
  const year = ts ? new Date(ts * 1000).getUTCFullYear() : 0;
  /** @type {Segment[]} */
  const segs = [];
  for (const seg of txt.split('<trkseg>').slice(1)) {
    /** @type {number[]} */
    const lon = [];
    /** @type {number[]} */
    const lat = [];
    for (const m of seg.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)) {
      lat.push(+m[1]);
      lon.push(+m[2]);
    }
    if (lon.length > 1) segs.push({ lon, lat });
  }
  return { type, year, ts, segs };
}

/**
 * @param {ArrayBuffer} buf FIT file
 * @returns {Promise<Activity | null>}
 */
export function parseFit(buf) {
  return new Promise((resolve) => {
    new FitParser({ mode: 'list', speedUnit: 'm/s' }).parse(buf, (err, data) => {
      if (err || !data) return resolve(null);
      /** @type {number[]} */
      const lon = [];
      /** @type {number[]} */
      const lat = [];
      let ts = 0;
      for (const r of data.records ?? []) {
        if (r.position_lat == null || r.position_long == null) continue;
        lat.push(r.position_lat);
        lon.push(r.position_long);
        if (!ts && r.timestamp) ts = new Date(r.timestamp).getTime() / 1000;
      }
      const sport = data.sessions?.[0]?.sport ?? data.sports?.[0]?.sport;
      const type = sport == null ? undefined : String(sport);
      const year = ts ? new Date(ts * 1000).getUTCFullYear() : 0;
      resolve({ type, year, ts, segs: lon.length > 1 ? [{ lon, lat }] : [] });
    });
  });
}
