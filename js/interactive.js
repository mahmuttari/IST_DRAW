/*
 * interactive.js
 * Önizleme (kesit SVG) üzerinden ölçü düzenleme:
 *   1) Ölçü etiketine tıkla  → inline sayısal düzenleme (tıkla-düzenle)
 *   2) Mavi tutamacı sürükle  → ilgili ölçüyü canlı değiştirme (sürükleme)
 *
 * Her iki yol da ilgili <input> değerini günceller ve onChange() çağırır
 * (app.js yeniden hesaplar + çizer).
 */

const Interactive = (function () {
  'use strict';

  let host = null;        // #drawing
  let getInput = null;    // (id) => HTMLInputElement
  let onChange = null;    // () => void
  let drag = null;        // aktif sürükleme durumu

  function attach(opts) {
    host = opts.host;
    getInput = opts.getInput;
    onChange = opts.onChange;
    // Olay delegasyonu — SVG her render'da yenilenir, host sabittir
    host.addEventListener('click', onClick);
    host.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  // SVG ekran-pikselini model metresine çeviren ölçek bilgisi (root attr)
  function svgGeom() {
    const svg = host.querySelector('svg.wall-svg');
    if (!svg) return null;
    const scale = parseFloat(svg.getAttribute('data-scale'));
    const ox = parseFloat(svg.getAttribute('data-ox'));
    const oy = parseFloat(svg.getAttribute('data-oy'));
    const vbw = parseFloat(svg.getAttribute('data-vbw'));
    if (!scale || !vbw) return null;
    return { svg, scale, ox, oy, vbw };
  }

  // Fare olayını viewBox koordinatına çevirir (SVG ölçeklense de doğru)
  function toViewBox(ev, g) {
    const rect = g.svg.getBoundingClientRect();
    const sx = (ev.clientX - rect.left) / rect.width * g.vbw;
    const vbh = g.vbw * (rect.height / rect.width);
    const sy = (ev.clientY - rect.top) / rect.height * vbh;
    return { sx, sy };
  }

  /* ---------- 1) TIKLA-DÜZENLE ---------- */
  function onClick(ev) {
    const grp = ev.target.closest('.dim-edit');
    if (!grp || drag) return;
    const field = grp.getAttribute('data-field');
    const input = getInput(field);
    if (!input) return;
    promptEdit(field, input);
  }

  function promptEdit(field, input) {
    // Basit, güvenilir ve her ortamda çalışan inline düzenleme
    const cur = parseFloat(input.value);
    const labelMap = {
      c_H: 'Toplam yükseklik H (m)', c_tf: 'Temel kalınlığı (m)',
      c_Lt: 'Ön ökçe Lt (m)', c_Lh: 'Arka topuk Lh (m)',
      c_tTop: 'Gövde üst kalınlığı (m)', c_tBot: 'Gövde alt kalınlığı (m)',
      l_H: 'Toplam yükseklik H (m)', l_tf: 'Temel kalınlığı (m)',
      l_Lh: 'Arka topuk Lh (m)',
      l_tTop: 'Gövde üst kalınlığı (m)', l_tBot: 'Gövde alt kalınlığı (m)',
      g_H: 'Yükseklik H (m)', g_a: 'Üst genişlik a (m)', g_b: 'Alt genişlik b (m)',
    };
    const v = window.prompt((labelMap[field] || field) + ' :', isFinite(cur) ? cur : '');
    if (v == null) return;
    const nv = parseFloat(String(v).replace(',', '.'));
    if (!isFinite(nv)) return;
    input.value = nv;
    onChange();
  }

  /* ---------- 2) SÜRÜKLEME ---------- */
  function onPointerDown(ev) {
    const h = ev.target.closest('.drag-handle');
    if (!h) return;
    const g = svgGeom();
    if (!g) return;
    ev.preventDefault();
    const field = h.getAttribute('data-field');
    drag = {
      field,
      input: getInput(field),
      axis: h.getAttribute('data-axis'),
      sign: parseFloat(h.getAttribute('data-sign')) || 1,
      anchor: parseFloat(h.getAttribute('data-anchor')) || 0,
      g,
    };
    host.style.userSelect = 'none';
  }

  function onPointerMove(ev) {
    if (!drag) return;
    const g = drag.g;
    const { sx, sy } = toViewBox(ev, g);
    // viewBox px -> model m
    const mx = (sx - g.ox) / g.scale;
    const my = (g.oy - sy) / g.scale;
    // Tutamaç konumundan ölçü değeri = işaret · (eksen koordinatı − çapa)
    const coord = drag.axis === 'x' ? mx : my;
    const val0 = drag.sign > 0 ? (coord - drag.anchor) : (drag.anchor - coord);
    let val = val0;
    // 5 cm'e yuvarla, makul alt sınır
    val = Math.max(0.05, Math.round(val / 0.05) * 0.05);
    if (drag.input && isFinite(val)) {
      drag.input.value = (Math.round(val * 100) / 100).toFixed(2);
      onChange();
    }
  }

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    if (host) host.style.userSelect = '';
  }

  return { attach };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Interactive;
}
