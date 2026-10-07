// Runs entirely in the browser (Web Worker). Input: the Strava export .zip File. Output: data.bin ArrayBuffer.
import FitParser from 'fit-file-parser';
const TOL = 1.2; // meters

function rdp(lon, lat) {
  const n = lon.length; if (n < 3) return [...Array(n).keys()];
  const k = Math.cos(lat[0] * Math.PI / 180) * 111320, X = i => lon[i] * k, Y = i => lat[i] * 111320;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop(); if (b <= a + 1) continue;
    const ax = X(a), ay = Y(a), dx = X(b) - ax, dy = Y(b) - ay, L = dx * dx + dy * dy;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      let px = X(i) - ax, py = Y(i) - ay, d;
      if (L === 0) d = Math.hypot(px, py);
      else { const t = Math.max(0, Math.min(1, (px * dx + py * dy) / L)); d = Math.hypot(px - t * dx, py - t * dy); }
      if (d > md) { md = d; mi = i; }
    }
    if (md > TOL) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  const o = []; for (let i = 0; i < n; i++) if (keep[i]) o.push(i); return o;
}

const normType = s => {
  s = (s || 'other').toString().toLowerCase();
  if (/run/.test(s)) return 'Run';
  if (/virtual|ebike|e-bike/.test(s) && /ride|cycl/.test(s)) return 'Ride (virtual/e)';
  if (/cycl|bik|ride|9$/.test(s)) return 'Ride';
  if (/walk/.test(s)) return 'Walk';
  if (/hik/.test(s)) return 'Hike';
  if (/swim/.test(s)) return 'Swim';
  if (/ski/.test(s)) return 'Ski';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function parseGpx(txt) {
  const type = (txt.match(/<type>([^<]*)<\/type>/) || [])[1];
  const ts = Date.parse((txt.match(/<time>([^<]+)<\/time>/) || [])[1] || '') / 1000 || 0, year = ts ? new Date(ts * 1000).getUTCFullYear() : 0;
  const segs = [];
  for (const seg of txt.split('<trkseg>').slice(1)) {
    const lon = [], lat = [];
    const re = /<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g; let m;
    while ((m = re.exec(seg))) { lat.push(+m[1]); lon.push(+m[2]); }
    if (lon.length > 1) segs.push({ lon, lat });
  }
  return { type, year, ts, segs };
}
function parseFit(buf) {
  return new Promise(res => {
    new FitParser({ mode: 'list', speedUnit: 'm/s' }).parse(buf, (err, d) => {
      if (err || !d) return res(null);
      const lon = [], lat = []; let year = 0, ts = 0;
      for (const r of d.records || []) {
        if (r.position_lat == null || r.position_long == null) continue;
        lat.push(r.position_lat); lon.push(r.position_long);
        if (!ts && r.timestamp) { ts = new Date(r.timestamp).getTime() / 1000; year = new Date(r.timestamp).getFullYear(); }
      }
      const s = (d.sessions || [])[0] || {};
      res({ type: s.sport || (d.sports && d.sports[0] && d.sports[0].sport), year, ts, segs: lon.length > 1 ? [{ lon, lat }] : [] });
    });
  });
}


/* ---------- minimal zip reader (random access via Blob.slice, zip64 aware, no whole-file read) ---------- */
const u64 = (dv, o) => Number(dv.getBigUint64(o, true));
async function readAt(file, off, len) { return new DataView(await file.slice(off, off + len).arrayBuffer()); }
async function listZip(file) {
  const tailLen = Math.min(file.size, 65557), tail = await readAt(file, file.size - tailLen, tailLen);
  let e = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Not a zip file');
  let count = tail.getUint16(e + 10, true), cdSize = tail.getUint32(e + 12, true), cdOff = tail.getUint32(e + 16, true);
  if (count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) {
    const lo = file.size - tailLen + e - 20, loc = await readAt(file, lo, 20);
    if (loc.getUint32(0, true) !== 0x07064b50) throw new Error('Bad zip64 zip');
    const z = await readAt(file, u64(loc, 8), 56);
    count = u64(z, 32); cdSize = u64(z, 40); cdOff = u64(z, 48);
  }
  const cd = await readAt(file, cdOff, cdSize), bytes = new Uint8Array(cd.buffer), td = new TextDecoder(), out = [];
  for (let p = 0, i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const method = cd.getUint16(p + 10, true); let csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true);
    const nl = cd.getUint16(p + 28, true), el = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true); let off = cd.getUint32(p + 42, true);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nl));
    for (let x = p + 46 + nl, end = x + el; x + 4 <= end;) {
      const id = cd.getUint16(x, true), sz = cd.getUint16(x + 2, true); let q = x + 4;
      if (id === 1) { if (usize === 0xFFFFFFFF) { usize = u64(cd, q); q += 8; } if (csize === 0xFFFFFFFF) { csize = u64(cd, q); q += 8; } if (off === 0xFFFFFFFF) { off = u64(cd, q); } }
      x += 4 + sz;
    }
    out.push({ name, method, csize, usize, off });
    p += 46 + nl + el + cl;
  }
  return out;
}
async function inflate(blob, fmt) { return new Response(blob.stream().pipeThrough(new DecompressionStream(fmt))).arrayBuffer(); }
async function readEntry(file, e) {
  const lh = await readAt(file, e.off, 30), start = e.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  const data = file.slice(start, start + e.csize);
  if (e.method === 0) return data.arrayBuffer();
  if (e.method === 8) return inflate(data, 'deflate-raw');
  throw new Error('unsupported zip compression ' + e.method);
}

async function build(file, progress) {
  const entries = (await listZip(file)).filter(e => /(?:^|\/)activities\/[^/]+\.(?:gpx|gpx\.gz|fit|fit\.gz)$/i.test(e.name));
  if (!entries.length) throw new Error('No activities/ folder with .gpx/.fit files found. Is this a Strava export zip?');
  const types = [], tracks = [], pts = []; let total = 0, kept = 0;
  for (const [fi, e] of entries.entries()) {
    try {
      let buf = await readEntry(file, e);
      if (/\.gz$/i.test(e.name)) buf = await inflate(new Blob([buf]), 'gzip');
      const a = /\.fit(\.gz)?$/i.test(e.name) ? await parseFit(buf) : parseGpx(new TextDecoder().decode(buf));
      if (!a) continue;
      const tn = normType(a.type); let ti = types.indexOf(tn); if (ti < 0) ti = types.push(tn) - 1;
      for (const s of a.segs) {
        total += s.lon.length;
        const idx = rdp(s.lon, s.lat); if (idx.length < 2) continue;
        let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
        const off = pts.length / 2;
        for (const i of idx) {
          const x = Math.round(s.lon[i] * 1e6), y = Math.round(s.lat[i] * 1e6);
          pts.push(x, y);
          if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        }
        kept += idx.length;
        tracks.push([ti, a.year, off, idx.length, minx, miny, maxx, maxy, Math.round(a.ts || 0)]);
      }
    } catch (err) { console.warn('skip', e.name, err.message); }
    if (fi % 10 === 0) progress(fi, entries.length);
  }
  if (!tracks.length) throw new Error('Found activity files but none contained GPS tracks.');
  const meta = new TextEncoder().encode(JSON.stringify({ types, tracks }));
  const padLen = (4 - ((8 + meta.length) % 4)) % 4, p32 = Int32Array.from(pts);
  const out = new Uint8Array(8 + meta.length + padLen + p32.byteLength), dv = new DataView(out.buffer);
  dv.setUint32(0, meta.length, true); dv.setUint32(4, padLen, true);
  out.set(meta, 8); out.set(new Uint8Array(p32.buffer), 8 + meta.length + padLen);
  return out.buffer;
}

self.onmessage = async ev => {
  try {
    const buf = await build(ev.data, (i, n) => self.postMessage({ progress: `Processing ${i}/${n} activities` }));
    self.postMessage({ done: buf }, [buf]);
  } catch (e) { self.postMessage({ error: e.message }); }
};
