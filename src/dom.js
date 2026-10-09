/** Typed references to the elements declared in index.html. */

/**
 * @template {new () => HTMLElement} T
 * @param {string} id
 * @param {T} Type
 * @returns {InstanceType<T>}
 */
function get(id, Type) {
  const el = document.getElementById(id);
  if (!(el instanceof Type)) throw new Error(`#${id} is missing or not a ${Type.name}`);
  return /** @type {InstanceType<T>} */ (el);
}
const div = (/** @type {string} */ id) => get(id, HTMLDivElement);
const input = (/** @type {string} */ id) => get(id, HTMLInputElement);
const select = (/** @type {string} */ id) => get(id, HTMLSelectElement);
const button = (/** @type {string} */ id) => get(id, HTMLButtonElement);

export const ui = {
  view: get('view', HTMLCanvasElement),
  attribution: div('attribution'),
  count: div('count'),
  status: div('status'),
  loading: div('loading'),
  loadmsg: div('loadmsg'),
  cfg: div('cfg'),
  // data
  upbtn: button('upbtn'),
  upfile: input('upfile'),
  upstat: div('upstat'),
  types: div('types'),
  years: div('years'),
  // look
  cmap: select('cmap'),
  cmprev: div('cmprev'),
  width: input('width'),
  bright: input('bright'),
  glow: input('glow'),
  grad: input('grad'),
  tlight: input('tlight'),
  showstats: input('showstats'),
  base: select('base'),
  tbox: div('tbox'),
  turl: input('turl'),
  keyrow: get('keyrow', HTMLLabelElement),
  tkey: input('tkey'),
  dim: input('dim'),
  // image export
  selbtn: button('selbtn'),
  clrbtn: button('clrbtn'),
  selhint: div('selhint'),
  ratio: select('ratio'),
  px: select('px'),
  exscale: input('exscale'),
  title: input('title'),
  subtitle: input('subtitle'),
  exbase: input('exbase'),
  exbtn: button('exbtn'),
  // animation
  dur: input('dur'),
  durn: input('durn'),
  fps: select('fps'),
  vpx: select('vpx'),
  adate: input('adate'),
  ahl: input('ahl'),
  vidbtn: button('vidbtn'),
};

/** Shows a message in the export status line. */
export function setStatus(/** @type {string} */ text = '') {
  ui.status.textContent = text;
}

/** The `.v` value label next to a range input. */
export function valueLabel(/** @type {HTMLInputElement} */ el) {
  const v = el.parentElement?.querySelector('.v');
  if (!v) throw new Error(`#${el.id} has no .v label`);
  return v;
}
