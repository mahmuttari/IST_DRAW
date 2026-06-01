/*
 * details.js
 * Referans uygulama paftalarına uygun iki ayrı detay görünüşü üretir:
 *   - Perde Donatı Detayı  (boy görünüş / elevation)
 *   - Taban Plağı Donatı Detayı (plan görünüş)
 *
 * build() çıktısı, hem SVG (ekran) hem DXF (CAD) tarafından kullanılan
 * "primitive" listesidir (model birimi: metre, y-yukarı):
 *   {t:'line',x1,y1,x2,y2,cls}
 *   {t:'rect',x,y,w,h,cls}
 *   {t:'circle',x,y,r,cls}
 *   {t:'text',x,y,s,size,anchor,rot,cls}
 *   {t:'pballoon',x,y,poz}      // poz numarası balonu
 */

const Details = (function () {
  'use strict';

  const cm = (m) => Math.round(m * 100);

  function build(geo, rebar, mat) {
    if (!rebar || (geo.type !== 'cantilever' && geo.type !== 'lwall')) return null;
    const d = geo.dims;
    const P = {};
    rebar.pozlar.forEach((p) => { P[p.poz] = p; });
    const cache = rebar.geomCache;
    const L = cache.L;                       // duvar uzunluğu (m)
    const Hs = d.Hs, B = d.B, tf = d.tf, Lt = d.Lt, tB = d.tBot, Lh = d.Lh;
    const barbS = (cache.barb.s || 100) / 100;     // barbakan aralığı (m)
    const svStem = cache.stem.spacing / 1000;      // düşey donatı aralığı (m)
    const shDist = cache.dist.spacing / 1000;      // yatay donatı aralığı (m)
    const sBase = cache.sBase / 1000;              // taban enine aralığı (m)

    return {
      elevation: buildElevation(),
      plan: buildPlan(),
    };

    /* ---------- PERDE DONATI DETAYI (boy görünüş) ---------- */
    function buildElevation() {
      const it = [];
      const ln = (x1, y1, x2, y2, c) => it.push({ t: 'line', x1, y1, x2, y2, cls: c });
      const tx = (x, y, s, o) => it.push(Object.assign({ t: 'text', x, y, s }, o));

      // Gövde yüzü (L x Hs) + temel şeridi
      it.push({ t: 'rect', x: 0, y: 0, w: L, h: Hs, cls: 'outline' });
      it.push({ t: 'rect', x: -Lt, y: -tf, w: L + Lt + Lh, h: tf, cls: 'outline' });

      // Yatay donatılar (üstte): 7 Ön, 8 Arka
      ln(0.05, Hs - 0.18, L - 0.05, Hs - 0.18, 'rebar');
      ln(0.05, Hs - 0.34, L - 0.05, Hs - 0.34, 'rebar2');
      tx(L / 2, Hs - 0.02, (P['7'] ? P['7'].callout : '') + '  (Ön)', { size: 0.22, anchor: 'middle', cls: 'rebar' });
      tx(L / 2, Hs - 0.52, (P['8'] ? P['8'].callout : '') + '  (Arka)', { size: 0.22, anchor: 'middle', cls: 'rebar2' });
      it.push({ t: 'pballoon', x: 0.25, y: Hs - 0.18, poz: '7' });
      it.push({ t: 'pballoon', x: 0.25, y: Hs - 0.34, poz: '8' });

      // Düşey donatılar (boyuna dağıtılmış) — okunabilirlik için ~24 ile sınırla
      const nV = Math.min(Math.round(L / svStem), 24);
      const stepV = L / nV;
      for (let i = 0; i <= nV; i++) {
        const x = i * stepV;
        ln(x, 0, x, Hs - 0.05, 'rebarthin');
        // üst kanca
        ln(x, Hs - 0.05, x + Math.min(0.12, stepV * 0.4), Hs - 0.05, 'rebarthin');
      }
      // Düşey donatı poz + açılım (sol kenarda, paftadaki gibi)
      tx(0.15, Hs * 0.62, (P['5'] ? P['5'].callout : '') + ' Arka', { size: 0.2, anchor: 'start', cls: 'rebar', rot: 90, x2: 0.15 });
      tx(0.55, Hs * 0.62, (P['3'] ? P['3'].callout : '') + ' Ön', { size: 0.2, anchor: 'start', cls: 'rebar2', rot: 90 });
      tx(0.15, 0.10, (P['6'] ? P['6'].callout : '') + ' Arka filiz', { size: 0.18, anchor: 'start', cls: 'rebar', rot: 90 });
      it.push({ t: 'pballoon', x: 0.32, y: Hs * 0.45, poz: '5' });
      it.push({ t: 'pballoon', x: 0.72, y: Hs * 0.45, poz: '3' });

      // Barbakan ızgarası (Ø.. yatay/düşey barbS aralıkla)
      for (let x = barbS; x < L - 0.2; x += barbS) {
        for (let y = barbS * 0.6; y < Hs - 0.3; y += barbS) {
          it.push({ t: 'circle', x, y, r: 0.06, cls: 'barbakan' });
          ln(x - 0.12, y, x + 0.12, y, 'barbakan');
          ln(x, y - 0.12, x, y + 0.12, 'barbakan');
        }
      }
      tx(0.05, -tf - 0.30, (cache.barb ? `Ø${cache.barb.dia} Barbakan — yatayda ve düşeyde ${cache.barb.s}cm aralıkla` : ''),
        { size: 0.2, anchor: 'start', cls: 'barbakan' });

      // A-A kesit çizgisi
      const xa = L * 0.5;
      ln(xa, -tf - 0.5, xa, Hs + 0.6, 'section');
      tx(xa, Hs + 0.78, 'A', { size: 0.28, anchor: 'middle', cls: 'section' });
      tx(xa, -tf - 0.66, 'A', { size: 0.28, anchor: 'middle', cls: 'section' });

      // Kotalar: yükseklik (sağ), uzunluk (alt)
      dimV(it, L + 0.5, 0, Hs, `${cm(Hs)}`);
      dimV(it, L + 1.0, -tf, Hs, `${cm(Hs + tf)}`);
      dimH(it, -tf - 0.7, -Lt, L + Lh, `${cm(L + Lt + Lh)}`);

      const minx = -Lt - 1.4, maxx = L + 1.4, miny = -tf - 1.0, maxy = Hs + 1.0;
      return { title: 'PERDE DONATI DETAYI', items: it, bounds: { minx, maxx, miny, maxy } };
    }

    /* ---------- TABAN PLAĞI DONATI DETAYI (plan) ---------- */
    function buildPlan() {
      const it = [];
      const ln = (x1, y1, x2, y2, c) => it.push({ t: 'line', x1, y1, x2, y2, cls: c });
      const tx = (x, y, s, o) => it.push(Object.assign({ t: 'text', x, y, s }, o));

      // Taban plağı (uzunluk L x genişlik B)
      it.push({ t: 'rect', x: 0, y: 0, w: L, h: B, cls: 'outline' });
      // Gövde ayak izi (kesik)
      it.push({ t: 'rect', x: 0, y: Lt, w: L, h: tB, cls: 'stemfoot' });
      tx(L / 2, Lt + tB / 2, 'GÖVDE (perde) ayak izi', { size: 0.18, anchor: 'middle', cls: 'dim' });

      // Boyuna donatılar (uzunluk yönünde) — ön/topuk, üst/alt
      const yF = Lt * 0.5, yH = (Lt + tB + B) / 2;
      ln(0.1, yF + 0.10, L - 0.1, yF + 0.10, 'rebar');   // 9 ön üst
      ln(0.1, yF - 0.10, L - 0.1, yF - 0.10, 'rebar2');  // 11 ön alt
      ln(0.1, yH + 0.10, L - 0.1, yH + 0.10, 'rebar');   // 10 topuk üst
      ln(0.1, yH - 0.10, L - 0.1, yH - 0.10, 'rebar2');  // 12 topuk alt
      tx(L * 0.5, yF + 0.24, `Üst ${P['9'] ? P['9'].callout : ''}`, { size: 0.18, anchor: 'middle', cls: 'rebar' });
      tx(L * 0.5, yF - 0.30, `Alt ${P['11'] ? P['11'].callout : ''}`, { size: 0.18, anchor: 'middle', cls: 'rebar2' });
      tx(L * 0.5, yH + 0.24, `Üst ${P['10'] ? P['10'].callout : ''}`, { size: 0.18, anchor: 'middle', cls: 'rebar' });
      tx(L * 0.5, yH - 0.30, `Alt ${P['12'] ? P['12'].callout : ''}`, { size: 0.18, anchor: 'middle', cls: 'rebar2' });
      it.push({ t: 'pballoon', x: 0.3, y: yF + 0.10, poz: '9' });
      it.push({ t: 'pballoon', x: 0.3, y: yF - 0.10, poz: '11' });
      it.push({ t: 'pballoon', x: 0.3, y: yH + 0.10, poz: '10' });
      it.push({ t: 'pballoon', x: 0.3, y: yH - 0.10, poz: '12' });

      // Enine donatılar (genişlik yönünde) — 1/2, sBase aralıkla
      const nT = Math.min(Math.round(L / sBase), 40);
      const stepT = L / nT;
      for (let i = 0; i <= nT; i++) {
        const x = i * stepT;
        ln(x, 0.08, x, B - 0.08, 'rebarthin');
      }
      // Enine bar açılım detayı (solda, kancalı) + poz
      const dx = -1.6, dy = B / 2;
      ln(dx, dy - (B - 0.16) / 2, dx, dy + (B - 0.16) / 2, 'rebar');
      ln(dx, dy + (B - 0.16) / 2, dx + 0.25, dy + (B - 0.16) / 2, 'rebar');
      ln(dx, dy - (B - 0.16) / 2, dx + 0.25, dy - (B - 0.16) / 2, 'rebar');
      tx(dx - 0.2, dy, `${P['1'] ? P['1'].callout : ''} (Üst) / ${P['2'] ? P['2'].callout : ''} (Alt)`,
        { size: 0.2, anchor: 'middle', cls: 'rebar', rot: 90 });
      it.push({ t: 'pballoon', x: dx, y: dy + (B - 0.16) / 2 + 0.2, poz: '1' });
      it.push({ t: 'pballoon', x: dx, y: dy - (B - 0.16) / 2 - 0.2, poz: '2' });

      // Kotalar: uzunluk (üst), genişlik (sağ) + bileşenler (sol)
      dimH(it, B + 0.5, 0, L, `${cm(L)}`);
      dimV(it, L + 0.5, 0, B, `${cm(B)}`);
      dimV(it, L + 1.0, 0, Lt, `${cm(Lt)}`);
      dimV(it, L + 1.0, Lt, Lt + tB, `${cm(tB)}`);
      dimV(it, L + 1.0, Lt + tB, B, `${cm(Lh)}`);

      const minx = dx - 1.4, maxx = L + 1.6, miny = -1.0, maxy = B + 1.2;
      return { title: 'TABAN PLAĞI DONATI DETAYI', items: it, bounds: { minx, maxx, miny, maxy } };
    }

    /* ---------- kota yardımcıları ---------- */
    function dimH(it, yLvl, x1, x2, label) {
      it.push({ t: 'line', x1, y1: yLvl, x2, y2: yLvl, cls: 'dim' });
      it.push({ t: 'line', x1, y1: yLvl - 0.1, x2: x1, y2: yLvl + 0.1, cls: 'dim' });
      it.push({ t: 'line', x1: x2, y1: yLvl - 0.1, x2, y2: yLvl + 0.1, cls: 'dim' });
      it.push({ t: 'text', x: (x1 + x2) / 2, y: yLvl + 0.06, s: label, size: 0.2, anchor: 'middle', cls: 'dimtext' });
    }
    function dimV(it, xLvl, y1, y2, label) {
      it.push({ t: 'line', x1: xLvl, y1, x2: xLvl, y2, cls: 'dim' });
      it.push({ t: 'line', x1: xLvl - 0.1, y1, x2: xLvl + 0.1, y2: y1, cls: 'dim' });
      it.push({ t: 'line', x1: xLvl - 0.1, y1: y2, x2: xLvl + 0.1, y2, cls: 'dim' });
      it.push({ t: 'text', x: xLvl + 0.06, y: (y1 + y2) / 2, s: label, size: 0.2, anchor: 'middle', rot: 90, cls: 'dimtext' });
    }
  }

  /* =====================================================================
   * SVG RENDER — bir detay görünüşünü ölçekli SVG'ye çevirir
   * ===================================================================== */
  const NS = 'http://www.w3.org/2000/svg';
  const STYLE = {
    outline: { stroke: '#3a4150', w: 1.6 },
    stemfoot: { stroke: '#8a93a3', w: 1.0, dash: '6,4' },
    rebar: { stroke: '#d6336c', w: 1.9 },
    rebar2: { stroke: '#7048e8', w: 1.7 },
    rebarthin: { stroke: '#e599b3', w: 0.8 },
    barbakan: { stroke: '#1098ad', w: 1.1 },
    section: { stroke: '#15aabf', w: 1.1, dash: '7,4' },
    dim: { stroke: '#9aa3b0', w: 0.6 },
  };
  const TEXTCOL = { rebar: '#d6336c', rebar2: '#7048e8', barbakan: '#1098ad',
    section: '#15aabf', dim: '#777', dimtext: '#333', text: '#222' };

  function renderSVG(detail, opts) {
    opts = opts || {};
    if (!detail) {
      return `<svg xmlns="${NS}" viewBox="0 0 400 60" class="wall-svg">` +
        `<text x="200" y="34" font-size="13" fill="#888" text-anchor="middle" font-family="Arial">` +
        `Detay yalnızca konsol (betonarme) tip içindir.</text></svg>`;
    }
    const b = detail.bounds;
    const Wpx = opts.width || 940, pad = 28, titleH = 36;
    const mw = b.maxx - b.minx, mh = b.maxy - b.miny;
    const sc = (Wpx - 2 * pad) / mw;
    const Hpx = mh * sc + 2 * pad + titleH;
    const X = (x) => pad + (x - b.minx) * sc;
    const Y = (y) => Hpx - pad - (y - b.miny) * sc;

    const out = [];
    out.push(`<svg xmlns="${NS}" viewBox="0 0 ${Wpx} ${Math.round(Hpx)}" class="wall-svg" font-family="Arial, sans-serif">`);
    out.push(`<rect x="0" y="0" width="${Wpx}" height="${Math.round(Hpx)}" fill="#fff"/>`);
    out.push(`<text x="${Wpx / 2}" y="24" font-size="15" font-weight="bold" text-anchor="middle">${detail.title}</text>`);

    detail.items.forEach((m) => {
      if (m.t === 'line') {
        const s = STYLE[m.cls] || STYLE.dim;
        out.push(`<line x1="${X(m.x1)}" y1="${Y(m.y1)}" x2="${X(m.x2)}" y2="${Y(m.y2)}" ` +
          `stroke="${s.stroke}" stroke-width="${s.w}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`);
      } else if (m.t === 'rect') {
        const s = STYLE[m.cls] || STYLE.outline;
        out.push(`<rect x="${X(m.x)}" y="${Y(m.y + m.h)}" width="${m.w * sc}" height="${m.h * sc}" ` +
          `fill="none" stroke="${s.stroke}" stroke-width="${s.w}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`);
      } else if (m.t === 'circle') {
        const s = STYLE[m.cls] || STYLE.barbakan;
        out.push(`<circle cx="${X(m.x)}" cy="${Y(m.y)}" r="${Math.max(2, m.r * sc)}" fill="none" stroke="${s.stroke}" stroke-width="${s.w}"/>`);
      } else if (m.t === 'pballoon') {
        const px = X(m.x), py = Y(m.y);
        out.push(`<circle cx="${px}" cy="${py}" r="8.5" fill="#fff" stroke="#8e44ad" stroke-width="1.3"/>`);
        out.push(`<text x="${px}" y="${py + 3.2}" font-size="9" font-weight="bold" fill="#8e44ad" text-anchor="middle">${m.poz}</text>`);
      } else if (m.t === 'text') {
        const col = TEXTCOL[m.cls] || '#222';
        const px = X(m.x), py = Y(m.y);
        const rot = m.rot ? ` transform="rotate(${-m.rot} ${px} ${py})"` : '';
        out.push(`<text x="${px}" y="${py}" font-size="${Math.max(8, m.size * sc)}" ` +
          `fill="${col}" text-anchor="${m.anchor || 'start'}" font-weight="${m.cls === 'dimtext' ? 'normal' : '600'}"${rot}>${esc(m.s)}</text>`);
      }
    });
    out.push('</svg>');
    return out.join('\n');
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  return { build, renderSVG };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Details;
}
