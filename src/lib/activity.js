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
 * `ele` (meters) and `t` (seconds) are NaN where unknown.
 * @typedef {{lon: number[], lat: number[], ele: number[], t: number[]}} Segment
 * @typedef {{type?: string, year: number, ts: number, segs: Segment[]}} Activity
 */

/** A recording gap longer than this (s) that also moved farther than GAP_DIST_M breaks the track. */
const GAP_S = 60;
const GAP_DIST_M = 100;

/**
 * Splits segments where the recorder was paused and resumed elsewhere, so no straight line is drawn across the gap.
 * @param {Segment} s
 * @returns {Segment[]}
 */
export function splitGaps(s) {
  /** @type {Segment[]} */
  const out = [];
  let from = 0;
  const cut = (/** @type {number} */ to) => {
    if (to - from > 1)
      out.push({
        lon: s.lon.slice(from, to),
        lat: s.lat.slice(from, to),
        ele: s.ele.slice(from, to),
        t: s.t.slice(from, to),
      });
    from = to;
  };
  for (let i = 1; i < s.lon.length; i++) {
    const dt = s.t[i] - s.t[i - 1];
    if (!(dt > GAP_S)) continue;
    const dy = (s.lat[i] - s.lat[i - 1]) * 111320;
    const dx = (s.lon[i] - s.lon[i - 1]) * 111320 * Math.cos((s.lat[i] * Math.PI) / 180);
    if (Math.hypot(dx, dy) > GAP_DIST_M) cut(i);
  }
  cut(s.lon.length);
  return out;
}

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
    /** @type {Segment} */
    const s = { lon: [], lat: [], ele: [], t: [] };
    for (const m of seg.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"(?:[^>]*\/>|[^>]*>([\s\S]*?)<\/trkpt>)/g)) {
      s.lat.push(+m[1]);
      s.lon.push(+m[2]);
      s.ele.push(m[3] ? parseFloat(m[3].match(/<ele>([^<]*)<\/ele>/)?.[1] ?? '') : NaN);
      s.t.push(m[3] ? Date.parse(m[3].match(/<time>([^<]*)<\/time>/)?.[1] ?? '') / 1000 : NaN);
    }
    segs.push(...splitGaps(s));
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
      /** @type {number[]} */
      const ele = [];
      /** @type {number[]} */
      const t = [];
      let ts = 0;
      for (const r of data.records ?? []) {
        if (r.position_lat == null || r.position_long == null) continue;
        lat.push(r.position_lat);
        lon.push(r.position_long);
        ele.push(r.enhanced_altitude ?? r.altitude ?? NaN);
        t.push(r.timestamp ? new Date(r.timestamp).getTime() / 1000 : NaN);
        if (!ts && r.timestamp) ts = new Date(r.timestamp).getTime() / 1000;
      }
      const sport = data.sessions?.[0]?.sport ?? data.sports?.[0]?.sport;
      const type = sport == null ? undefined : String(sport);
      const year = ts ? new Date(ts * 1000).getUTCFullYear() : 0;
      resolve({ type, year, ts, segs: splitGaps({ lon, lat, ele, t }) });
    });
  });
}
