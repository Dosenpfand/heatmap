/**
 * @typedef {object} Preset
 * @property {string} name
 * @property {string} url Tile URL template ({z} {x} {y}, optional {s} {r} {key}).
 * @property {boolean} light Works best with a light background.
 * @property {boolean} needsKey Requires an API key ({key} in the URL).
 */

/** Basemap presets. @type {Preset[]} */
export const PRESETS = [
  {
    name: 'CARTO Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key={key}',
    light: false,
    needsKey: true,
  },
  {
    name: 'CARTO Dark + labels',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key={key}',
    light: false,
    needsKey: true,
  },
  {
    name: 'CARTO Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key={key}',
    light: true,
    needsKey: true,
  },
  {
    name: 'CARTO Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png?key={key}',
    light: true,
    needsKey: true,
  },
  {
    name: 'Stadia Alidade Smooth Dark',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key={key}',
    light: false,
    needsKey: true,
  },
  {
    name: 'Stadia Alidade Smooth',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key={key}',
    light: true,
    needsKey: true,
  },
  {
    name: 'Stadia Stamen Toner',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png?api_key={key}',
    light: true,
    needsKey: true,
  },
  {
    name: 'MapTiler Dataviz Dark',
    url: 'https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}{r}.png?key={key}',
    light: false,
    needsKey: true,
  },
  {
    name: 'MapTiler Streets',
    url: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}{r}.png?key={key}',
    light: true,
    needsKey: true,
  },
  {
    name: 'Thunderforest Transport Dark',
    url: 'https://{s}.tile.thunderforest.com/transport-dark/{z}/{x}/{y}{r}.png?apikey={key}',
    light: false,
    needsKey: true,
  },
  {
    name: 'Jawg Dark',
    url: 'https://tile.jawg.io/jawg-dark/{z}/{x}/{y}{r}.png?access-token={key}',
    light: false,
    needsKey: true,
  },
  {
    name: 'Esri Satellite (no key)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    light: false,
    needsKey: false,
  },
  {
    name: 'OpenStreetMap (no key, light use only)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    light: true,
    needsKey: false,
  },
];

/**
 * Fills a URL template; x wraps around the antimeridian.
 * @param {string} template
 * @param {number} z
 * @param {number} x
 * @param {number} y
 */
export function tileURL(template, z, x, y) {
  const n = 1 << z;
  x = ((x % n) + n) % n;
  return template
    .replace('{s}', 'abc'[(x + y) % 3])
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', '@2x');
}

/**
 * Tiles covering a view.
 * @param {string} template
 * @param {number} cx view center in world units
 * @param {number} cy
 * @param {number} S px per world unit
 * @param {number} W view size in px
 * @param {number} H
 * @param {boolean} sharp
 * @param sharp pick one zoom level deeper (for exports)
 * @returns {{url: string, px: number, py: number, ts: number}[]} ts = tile size in px
 */
export function tilesForView(template, cx, cy, S, W, H, sharp) {
  const retina = template.includes('{r}');
  const tz = Math.max(0, Math.min(19, Math.round(Math.log2(S / 256) - (sharp ? 1 : 0.4) + (retina ? 0 : 1))));
  const n = 1 << tz;
  const ts = S / n;
  const x0 = Math.floor((cx - W / 2 / S) * n);
  const x1 = Math.floor((cx + W / 2 / S) * n);
  const y0 = Math.max(0, Math.floor((cy - H / 2 / S) * n));
  const y1 = Math.min(n - 1, Math.floor((cy + H / 2 / S) * n));
  const list = /** @type {{url: string, px: number, py: number, ts: number}[]} */ ([]);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      list.push({ url: tileURL(template, tz, x, y), px: (x / n - cx) * S + W / 2, py: (y / n - cy) * S + H / 2, ts });
    }
  }
  return list;
}

/** Known tile providers by host suffix. */
const PROVIDERS = [
  ['basemaps.cartocdn.com', '© CARTO'],
  ['stadiamaps.com', '© Stadia Maps © Stamen Design © OpenMapTiles'],
  ['maptiler.com', '© MapTiler'],
  ['thunderforest.com', '© Thunderforest'],
  ['jawg.io', '© Jawg Maps'],
  ['arcgisonline.com', 'Imagery © Esri, Maxar, Earthstar Geographics'],
];

/**
 * Attribution text for a tile URL template: the provider (if known, else its host) plus OpenStreetMap.
 * @param {string} template
 */
export function attributionFor(template) {
  let host = '';
  try {
    host = new URL(template.replace(/\{s\}/g, 'a')).hostname;
  } catch {
    // custom/invalid URL: OSM only
  }
  const known = PROVIDERS.find(([h]) => host === h || host.endsWith('.' + h));
  const isOsm = host === 'tile.openstreetmap.org' || host.endsWith('.openstreetmap.org');
  const parts = [];
  if (known) parts.push(known[1]);
  else if (host && !isOsm) parts.push(`Tiles: ${host}`);
  parts.push('© OpenStreetMap contributors');
  return parts.join(' | ');
}
