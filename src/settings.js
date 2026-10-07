import { ui } from './dom.js';
import { exportSize as calcExportSize } from './lib/selection.js';
import { scaleOf, state } from './state.js';

/** @typedef {import('./heat.js').HeatOptions} HeatOptions */

export const BG = { dark: '#0b0d12', light: '#efece4' };

export const isLight = () => ui.tlight.checked;
export const background = () => (isLight() ? BG.light : BG.dark);

/** The tile URL template with the API key filled in, or '' if a key is required but missing. */
export function tileTemplate() {
  const url = ui.turl.value.trim();
  if (!url.includes('{key}')) return url;
  const key = ui.tkey.value.trim();
  return key ? url.replace(/\{key\}/g, encodeURIComponent(key)) : '';
}

/** The template to draw, or 'none' when the basemap is off or unusable. */
export const activeBase = () => (ui.base.value === 'none' || !tileTemplate() ? 'none' : tileTemplate());

/** @returns {HeatOptions} */
export const heatOptions = () => ({
  width: +ui.width.value,
  bright: +ui.bright.value,
  glow: +ui.glow.value,
  grad: +ui.grad.value,
  lut: state.lut,
});

/** Heat options for an export: line width and glow radius are scaled by the "export line scale". */
export function exportHeatOptions() {
  const o = heatOptions();
  const scale = +ui.exscale.value;
  o.width *= scale;
  o.grad *= scale;
  return o;
}

/** Export region in world units: the selection, or else the current viewport. */
export function exportRegion() {
  if (state.sel) return state.sel;
  const { view, viewport } = state;
  const S = scaleOf(view.z);
  return {
    x0: view.cx - viewport.w / 2 / S,
    x1: view.cx + viewport.w / 2 / S,
    y0: view.cy - viewport.h / 2 / S,
    y1: view.cy + viewport.h / 2 / S,
  };
}

export const exportSize = () => calcExportSize(exportRegion(), +ui.px.value);
