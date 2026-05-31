/*
 * draw.js
 * Geometriyi ölçekli bir SVG teknik kesit çizimine dönüştürür.
 * Kotalar (ölçü çizgileri), tarama desenleri, dolgu ve toprak itkisi
 * dağılımı çizilir.
 */

const Draw = (function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const fmt = (v) => (Math.round(v * 100) / 100).toFixed(2);

  // Çizim alanı ve kenar boşlukları (piksel)
  const CANVAS = { w: 720, h: 560 };
  const MARGIN = { top: 70, right: 120, bottom: 90, left: 110 };

  function render(geo, opts) {
    opts = opts || {};
    // --- Model sınırları ---
    let maxY = geo.H;
    let maxX = geo.B;
    const all = [];
    Object.values(geo.outline).forEach((poly) => {
      if (Array.isArray(poly)) poly.forEach((p) => all.push(p));
    });
    all.forEach((p) => { if (p.y > maxY) maxY = p.y; if (p.x > maxX) maxX = p.x; });

    const availW = CANVAS.w - MARGIN.left - MARGIN.right;
    const availH = CANVAS.h - MARGIN.top - MARGIN.bottom;
    const scale = Math.min(availW / maxX, availH / maxY);

    // Model (m, y-yukarı) -> SVG (px, y-aşağı)
    const X = (x) => MARGIN.left + x * scale;
    const Y = (y) => CANVAS.h - MARGIN.bottom - y * scale;

    const out = [];
    out.push(`<svg xmlns="${NS}" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" ` +
      `class="wall-svg" font-family="Arial, sans-serif">`);

    // Desenler
    out.push(`<defs>
      <pattern id="concreteHatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="9" height="9" fill="#d9dde3"/>
        <line x1="0" y1="0" x2="0" y2="9" stroke="#9aa3b0" stroke-width="0.7"/>
      </pattern>
      <pattern id="soilHatch" width="14" height="14" patternUnits="userSpaceOnUse">
        <rect width="14" height="14" fill="#efe7d6"/>
        <circle cx="3" cy="3" r="0.9" fill="#b8a072"/>
        <circle cx="10" cy="9" r="0.9" fill="#b8a072"/>
      </pattern>
      <marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
        <path d="M0,0 L7,3 L0,6 Z" fill="#1f6feb"/>
      </marker>
      <marker id="dimArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="#333"/>
      </marker>
    </defs>`);

    const poly = (pts, fill, stroke) =>
      `<polygon points="${pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}" ` +
      `fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;

    // --- Dolgu (önce, betonun arkasında) ---
    geo.soil.forEach((s) => {
      if (s.points.length >= 3) out.push(poly(s.points, 'url(#soilHatch)', '#b9a877'));
    });

    // --- Beton bileşenleri ---
    geo.concrete.forEach((c) => out.push(poly(c.points, 'url(#concreteHatch)', '#3a4150')));

    // --- Zemin (temel altı) tarama çizgileri ---
    const gx0 = X(0) - 18, gx1 = X(maxX) + 18, gy = Y(0);
    out.push(`<line x1="${gx0}" y1="${gy}" x2="${gx1}" y2="${gy}" stroke="#555" stroke-width="1.4"/>`);
    for (let x = gx0; x < gx1; x += 11) {
      out.push(`<line x1="${x}" y1="${gy}" x2="${x - 7}" y2="${gy + 9}" stroke="#888" stroke-width="0.8"/>`);
    }

    // --- Dolgu üst yüzeyi çizgisi ---
    if (geo.soil.length && geo.soil[0].points.length >= 3) {
      const sp = geo.soil[0].points;
      const topPts = sp.filter((p) => Math.abs(p.y - geo.H) < 1e-6 || p.y >= geo.H - 1e-6);
      if (topPts.length >= 2) {
        const a = topPts[0], b = topPts[topPts.length - 1];
        out.push(`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x) + 16}" y2="${Y(b.y)}" stroke="#7a6a3a" stroke-width="1.2" stroke-dasharray="2,3"/>`);
      }
    }

    // --- Toprak itkisi üçgen dağılımı (sanal arka düzlem) ---
    if (opts.showPressure) {
      const xp = X(geo.B) + 6;
      const yTop = Y(geo.H), yBot = Y(0);
      const pmax = 34; // ok uzunluğu (px) tabanda
      const nArr = 5;
      for (let i = 1; i <= nArr; i++) {
        const yy = yTop + ((yBot - yTop) * i) / nArr;
        const frac = (yy - yTop) / (yBot - yTop); // 0 üstte, 1 tabanda
        const len = pmax * frac;
        out.push(`<line x1="${xp + len}" y1="${yy}" x2="${xp}" y2="${yy}" stroke="#1f6feb" stroke-width="1.4" marker-end="url(#arrow)"/>`);
      }
      out.push(`<line x1="${xp + pmax}" y1="${yTop}" x2="${xp}" y2="${yBot}" stroke="#1f6feb" stroke-width="1" stroke-dasharray="3,2"/>`);
      out.push(text(xp + pmax + 6, (yTop + yBot) / 2, 'Pa', { fill: '#1f6feb', size: 12, weight: 'bold', anchor: 'start' }));
    }

    // --- Donatı katmanı (varsa) ---
    if (opts.rebar && opts.rebar.bars) {
      drawRebar(out, opts.rebar, X, Y);
    }

    // --- Ölçülendirme (kotalar) ---
    geo.dimLines = [];
    drawDims(out, geo, X, Y, scale);

    // --- Başlık / ölçek ---
    const title = geo.type === 'cantilever' ? 'KONSOL İSTİNAT DUVARI' : 'AĞIRLIK İSTİNAT DUVARI';
    out.push(text(CANVAS.w / 2, 30, title, { size: 15, weight: 'bold', anchor: 'middle' }));
    out.push(text(CANVAS.w / 2, 48, 'Kesit — ölçüler metre (m)', { size: 11, anchor: 'middle', fill: '#666' }));
    out.push(text(MARGIN.left, CANVAS.h - 18, `Ölçek ≈ 1 : ${Math.round(100 / scale)}  (1 m ≈ ${fmt(scale)} px)`, { size: 10, fill: '#888', anchor: 'start' }));

    out.push('</svg>');
    return out.join('\n');
  }

  function text(x, y, s, o) {
    o = o || {};
    return `<text x="${x}" y="${y}" font-size="${o.size || 11}" ` +
      `fill="${o.fill || '#222'}" text-anchor="${o.anchor || 'middle'}" ` +
      `font-weight="${o.weight || 'normal'}">${s}</text>`;
  }

  // Yatay kota çizgisi (x1->x2), model y=yLvl, ekran offseti px (aşağı +)
  function hDim(out, X, Y, x1, x2, yLvl, off, label) {
    const sy = Y(yLvl) + off;
    const a = X(x1), b = X(x2);
    out.push(`<line x1="${a}" y1="${Y(yLvl)}" x2="${a}" y2="${sy + 4}" stroke="#999" stroke-width="0.6"/>`);
    out.push(`<line x1="${b}" y1="${Y(yLvl)}" x2="${b}" y2="${sy + 4}" stroke="#999" stroke-width="0.6"/>`);
    out.push(`<line x1="${a}" y1="${sy}" x2="${b}" y2="${sy}" stroke="#333" stroke-width="0.9" marker-start="url(#dimArrow)" marker-end="url(#dimArrow)"/>`);
    out.push(text((a + b) / 2, sy - 4, label, { size: 10 }));
  }

  // Düşey kota çizgisi (y1->y2), model x=xLvl, ekran offseti px (sola +)
  function vDim(out, X, Y, y1, y2, xLvl, off, label) {
    const sx = X(xLvl) - off;
    const a = Y(y1), b = Y(y2);
    out.push(`<line x1="${X(xLvl)}" y1="${a}" x2="${sx - 4}" y2="${a}" stroke="#999" stroke-width="0.6"/>`);
    out.push(`<line x1="${X(xLvl)}" y1="${b}" x2="${sx - 4}" y2="${b}" stroke="#999" stroke-width="0.6"/>`);
    out.push(`<line x1="${sx}" y1="${a}" x2="${sx}" y2="${b}" stroke="#333" stroke-width="0.9" marker-start="url(#dimArrow)" marker-end="url(#dimArrow)"/>`);
    out.push(`<text x="${sx - 4}" y="${(a + b) / 2}" font-size="10" fill="#222" text-anchor="middle" transform="rotate(-90 ${sx - 4} ${(a + b) / 2})">${label}</text>`);
  }

  // Donatıyı çizer: çubuklar, filiz, yatay donatı daireleri, çiroz, barbakan,
  // bindirme kotası, poz balonları ve etiketler.
  const REBAR = '#d6336c', FILIZ = '#7048e8', CIROZ = '#e8590c', BARB = '#1098ad';

  // Poz numarası balonu (daire içinde no)
  function pozBalloon(out, px, py, poz) {
    out.push(`<circle cx="${px}" cy="${py}" r="8.5" fill="#fff" stroke="#8e44ad" stroke-width="1.2"/>`);
    out.push(text(px, py + 3.2, poz, { size: 9, weight: 'bold', fill: '#8e44ad', anchor: 'middle' }));
  }

  function drawRebar(out, rebar, X, Y) {
    // 1) Çubuklar / daireler / çiroz / barbakan
    rebar.bars.forEach((b) => {
      if (b.kind === 'dot') {
        out.push(`<circle cx="${X(b.x)}" cy="${Y(b.y)}" r="3.0" ` +
          `fill="${REBAR}" stroke="#7a1538" stroke-width="0.8"/>`);
      } else if (b.kind === 'ciroz') {
        out.push(`<line x1="${X(b.x1)}" y1="${Y(b.y)}" x2="${X(b.x2)}" y2="${Y(b.y)}" ` +
          `stroke="${CIROZ}" stroke-width="1" stroke-dasharray="1,2.5"/>`);
      } else if (b.kind === 'barbakan') {
        out.push(`<circle cx="${X(b.x)}" cy="${Y(b.y)}" r="4.2" fill="none" stroke="${BARB}" stroke-width="1.3"/>`);
        out.push(`<line x1="${X(b.x) - 6}" y1="${Y(b.y)}" x2="${X(b.x) + 6}" y2="${Y(b.y)}" stroke="${BARB}" stroke-width="0.7"/>`);
      } else if (b.kind === 'lapdim') {
        const sx = X(b.a.x) - 14;
        out.push(`<line x1="${sx}" y1="${Y(b.a.y)}" x2="${sx}" y2="${Y(b.b.y)}" ` +
          `stroke="${FILIZ}" stroke-width="1" marker-start="url(#dimArrow)" marker-end="url(#dimArrow)"/>`);
      } else if (b.poly) {
        const pts = b.poly.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ');
        const col = b.kind === 'filiz' ? FILIZ : REBAR;
        const w = b.kind === 'sec' ? 1.2 : 2.0;
        const dash = b.kind === 'filiz' ? ' stroke-dasharray="6,3"' : '';
        out.push(`<polyline points="${pts}" fill="none" stroke="${col}" ` +
          `stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${dash}/>`);
      }
    });
    // 2) Etiketler + poz balonları
    rebar.bars.forEach((b) => {
      if (b.kind === 'lapdim' && b.label) {
        const sx = X(b.a.x) - 14, my = (Y(b.a.y) + Y(b.b.y)) / 2;
        out.push(`<text x="${sx - 3}" y="${my}" font-size="9" fill="${FILIZ}" ` +
          `text-anchor="middle" transform="rotate(-90 ${sx - 3} ${my})">${b.label}</text>`);
      } else if (b.kind === 'barbakan' && b.label) {
        out.push(text(X(b.x) + 9, Y(b.y) + 3, b.label, { size: 8.5, anchor: 'start', fill: BARB, weight: 'bold' }));
      } else if (b.label && b.labelPos) {
        const col = b.kind === 'filiz' ? FILIZ : (b.kind === 'note' ? '#b08900' : (b.kind === 'ciroz' ? CIROZ : REBAR));
        const anchor = b.side === 'left' ? 'end' : 'start';
        const lx = X(b.labelPos.x), ly = Y(b.labelPos.y);
        const tx = b.side === 'left' ? lx - 13 : lx + 13;
        // poz balonu
        if (b.poz) pozBalloon(out, b.side === 'left' ? lx - 4 : lx + 4, ly - 3, b.poz);
        const w = b.label.length * 5.9 + 6;
        out.push(`<rect x="${b.side === 'left' ? tx - w : tx - 2}" y="${ly - 9}" ` +
          `width="${w}" height="13" rx="2" fill="#fff" fill-opacity="0.82" stroke="${col}" stroke-width="0.5"/>`);
        out.push(text(tx, ly, b.label, { size: 9, anchor, fill: col, weight: 'bold' }));
      }
    });
  }

  function drawDims(out, geo, X, Y, scale) {
    const d = geo.dims;
    if (geo.type === 'cantilever') {
      // Toplam genişlik B (en altta)
      hDim(out, X, Y, 0, d.B, 0, 56, `B = ${fmt(d.B)}`);
      // Ayrıntı: Lt | tBot | Lh (taban üstü hizasında)
      hDim(out, X, Y, 0, d.Lt, 0, 32, `Lt=${fmt(d.Lt)}`);
      hDim(out, X, Y, d.Lt, d.xStemBackBot, 0, 32, `${fmt(d.tBot)}`);
      hDim(out, X, Y, d.xStemBackBot, d.B, 0, 32, `Lh=${fmt(d.Lh)}`);
      // Toplam yükseklik H (solda)
      vDim(out, X, Y, 0, d.H, 0, 60, `H = ${fmt(d.H)}`);
      // Temel kalınlığı tf (solda alt)
      vDim(out, X, Y, 0, d.tf, 0, 30, `tf=${fmt(d.tf)}`);
      // Gövde üst kalınlığı (üstte)
      hDim(out, X, Y, d.xStemFront, d.xStemBackTop, d.H, -16, `${fmt(d.tTop)}`);
    } else {
      hDim(out, X, Y, 0, d.b, 0, 50, `b = ${fmt(d.b)}`);
      vDim(out, X, Y, 0, d.H, 0, 50, `H = ${fmt(d.H)}`);
      hDim(out, X, Y, 0, d.a, d.H, -16, `a = ${fmt(d.a)}`);
    }
  }

  /* =====================================================================
   * DONATI AÇILIM CETVELİ — poz balonu, gerçek kancalı şekil, açılım yazısı
   * (referans paftalardaki "adetØçap/aralık L=boy" formatı)
   * ===================================================================== */
  function renderSchedule(schedule, opts) {
    opts = opts || {};
    schedule = schedule || [];
    const notes = opts.notes;
    const W = 720, rowH = 84, top = 64, pad = 16;
    const stock = opts.stock || 12;
    const noteH = notes ? 56 : 0;
    const H = top + Math.max(1, schedule.length) * rowH + 20 + noteH;
    const out = [];
    out.push(`<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" class="wall-svg" font-family="Arial, sans-serif">`);
    out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);
    out.push(text(W / 2, 28, 'DONATI AÇILIM (POZ) CETVELİ', { size: 15, weight: 'bold', anchor: 'middle' }));
    out.push(text(W / 2, 46, 'Format: adetØçap/aralık L=boy (cm) · kancalar 90° · poz no’ları kesitle eşleşir',
      { size: 10, fill: '#666', anchor: 'middle' }));
    out.push(`<line x1="${pad}" y1="${top - 6}" x2="${W - pad}" y2="${top - 6}" stroke="#bbb" stroke-width="1"/>`);

    if (!schedule.length) {
      out.push(text(W / 2, top + 34, 'Donatı açılımı yalnızca konsol (betonarme) tip içindir.',
        { size: 12, fill: '#888', anchor: 'middle' }));
      out.push('</svg>');
      return out.join('\n');
    }

    schedule.forEach((r, i) => {
      const y0 = top + i * rowH;
      out.push(`<line x1="${pad}" y1="${y0 + rowH - 6}" x2="${W - pad}" y2="${y0 + rowH - 6}" stroke="#eee" stroke-width="1"/>`);
      // poz balonu
      out.push(`<circle cx="${pad + 15}" cy="${y0 + 22}" r="13" fill="#fff" stroke="#8e44ad" stroke-width="1.6"/>`);
      out.push(text(pad + 15, y0 + 26, r.poz, { size: 11, weight: 'bold', fill: '#8e44ad', anchor: 'middle' }));
      // açılım (callout) — referans formatı
      const tx = pad + 38;
      const faceTxt = r.face ? `${r.face} · ` : '';
      out.push(text(tx, y0 + 18, r.callout || `${r.count}Ø${r.dia}/${Math.round(r.spacing / 10)} L=${Math.round(r.pieceLen * 100)}`,
        { size: 12.5, weight: 'bold', anchor: 'start', fill: '#1f2a44' }));
      out.push(text(tx, y0 + 35, `${faceTxt}${r.label}`, { size: 10.5, anchor: 'start', fill: '#555' }));
      out.push(text(tx, y0 + 51, `${fmt(r.mass)} kg · ${r.stockBars}×${stock}m · fire %${Math.round(r.wastePct)}`,
        { size: 10, anchor: 'start', fill: '#888' }));
      // gerçek kancalı büküm şekli
      drawShape(out, r.shape, { x: 318, y: y0 + 6, w: W - pad - 318, h: rowH - 18 });
    });

    // Notlar (çiroz, barbakan)
    if (notes) {
      const ny = top + schedule.length * rowH + 16;
      out.push(`<line x1="${pad}" y1="${ny - 6}" x2="${W - pad}" y2="${ny - 6}" stroke="#bbb" stroke-width="1"/>`);
      out.push(text(pad, ny + 10, '⊕ ' + notes.barbakan, { size: 10.5, anchor: 'start', fill: '#1098ad', weight: 'bold' }));
      out.push(text(pad, ny + 28, '✚ ' + notes.ciroz, { size: 10.5, anchor: 'start', fill: '#e8590c', weight: 'bold' }));
    }

    out.push('</svg>');
    return out.join('\n');
  }

  // Büküm şeklini (cm bacaklar) gerçek geometriyle, bacak ölçüleriyle çizer.
  function drawShape(out, shape, box) {
    if (!shape || !shape.segs || !shape.segs.length) return;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    shape.segs.forEach((s) => {
      [[s.x1, s.y1], [s.x2, s.y2]].forEach(([x, y]) => {
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      });
    });
    const bw = Math.max(1e-3, maxx - minx), bh = Math.max(1e-3, maxy - miny);
    const padS = 26;
    const sc = Math.min((box.w - 2 * padS) / bw, (box.h - 2 * padS) / bh);
    const ox = box.x + (box.w - bw * sc) / 2 - minx * sc;
    const oy = box.y + (box.h + bh * sc) / 2 + miny * sc;   // y-aşağı
    const PX = (x) => ox + x * sc, PY = (y) => oy - y * sc;
    // her segment ayrı çizilir (U/L köşeleri gerçek geometriyle korunur)
    shape.segs.forEach((s) => {
      out.push(`<line x1="${PX(s.x1)}" y1="${PY(s.y1)}" x2="${PX(s.x2)}" y2="${PY(s.y2)}" ` +
        `stroke="${REBAR}" stroke-width="2.6" stroke-linecap="round"/>`);
    });
    // bacak ölçüleri (yalnız anlamlı uzunluktakiler)
    shape.segs.forEach((s) => {
      if (s.len < 1) return;
      const mx = (PX(s.x1) + PX(s.x2)) / 2, my = (PY(s.y1) + PY(s.y2)) / 2;
      const horiz = Math.abs(s.y1 - s.y2) < Math.abs(s.x1 - s.x2);
      out.push(text(horiz ? mx : mx - 10, horiz ? my + 12 : my + 3, Math.round(s.len),
        { size: 9, anchor: 'middle', fill: '#333' }));
    });
  }

  return { render, renderSchedule };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Draw;
}
