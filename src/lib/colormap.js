export const CMAPS = {
  'Inferno fire': ['#000004', '#2a0b4d', '#7b1d6b', '#c8363f', '#f57d15', '#fbc92a', '#fcffa4'],
  Orange: ['#1a0500', '#6b1500', '#d33a00', '#fc4c02', '#ff9a3d', '#ffd9a0', '#ffffff'],
  Ice: ['#00040f', '#0b2a6b', '#1d6fd6', '#2fc4f2', '#a8f0ff', '#ffffff'],
  Neon: ['#0a0014', '#4b0fa8', '#d013c9', '#ff4d8d', '#ffc14d', '#ffffff'],
  Viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  Magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
  'Toxic green': ['#000a03', '#03401a', '#0a9a3a', '#4ff07a', '#d4ffc0', '#ffffff'],
  Gold: ['#120900', '#4d2e00', '#a66a00', '#e8a317', '#ffd966', '#fffbe6'],
  'Ink (dark on light)': ['#9aa3c4', '#4b5a9e', '#24307a', '#0d1244', '#050720'],
  White: ['#555566', '#aaaabb', '#ffffff'],
};

/** @param {string} name @returns {string[]} */
function cmap(name) {
  const stops = /** @type {Record<string, string[]>} */ (CMAPS)[name];
  if (!stops) throw new Error(`unknown colormap ${name}`);
  return stops;
}

/**
 * "#rrggbb" -> [r, g, b]
 * @param {string} h
 */
export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/**
 * Linear interpolation along color stops, t in [0,1] -> [r, g, b].
 * @param {string[]} stops
 * @param {number} t
 */
export function ramp(stops, t) {
  const p = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p));
  const f = p - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return a.map((v, k) => v + (b[k] - v) * f);
}

/** 256-entry lookup table of packed little-endian ABGR pixels, indexed by heat intensity. */
/** @param {string} name key of CMAPS */
export function makeLUT(name) {
  const stops = cmap(name);
  const lut = new Uint32Array(256);
  for (let v = 0; v < 256; v++) {
    const t = v / 255;
    const [r, g, b] = ramp(stops, t ** 0.75);
    const a = Math.min(1, t ** 0.6 * 3.2);
    lut[v] = ((Math.round(a * 255) << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
  }
  return lut;
}

export const cmapGradient = (/** @type {string} */ name) => `linear-gradient(90deg,${cmap(name).join(',')})`;
