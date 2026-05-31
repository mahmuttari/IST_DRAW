/*
 * dxf.js
 * Duvar kesitini + donatıyı DXF (AutoCAD R12 / AC1009) olarak üretir.
 * Yalnızca LINE, CIRCLE, TEXT varlıkları kullanılır; bu varlıklar tüm CAD
 * programlarında (AutoCAD, ZWCAD, BricsCAD, LibreCAD, NanoCAD...) sorunsuz açılır.
 *
 * Birim: milimetre (model metre değerleri 1000 ile çarpılır). $INSUNITS = 4 (mm).
 *
 * DWG hakkında: DWG, AutoCAD'in kapalı ikili formatıdır ve tarayıcıda saf
 * JavaScript ile yazılamaz. DXF dosyasını CAD programında açıp "Farklı Kaydet →
 * DWG" ile DWG'ye çevirebilirsiniz (geometri birebir korunur).
 */

const DXF = (function () {
  'use strict';

  const S = 1000; // m -> mm

  // Katman tanımları: [ad, ACI renk]
  const LAYERS = [
    ['BETON', 7],   // beyaz/siyah
    ['DONATI', 1],  // kırmızı
    ['ZEMIN', 8],   // gri
    ['DOLGU', 42],  // kahve tonu
    ['OLCU', 4],    // camgöbeği
    ['YAZI', 3],    // yeşil
  ];

  function build(geo, rebar, quant, opts) {
    opts = opts || {};
    const e = [];                       // ENTITIES grup kodları
    const th = opts.textHeight || 120;  // mm

    const X = (x) => (x * S).toFixed(2);
    const Y = (y) => (y * S).toFixed(2);

    function line(x1, y1, x2, y2, layer) {
      e.push(0, 'LINE', 8, layer,
        10, X(x1), 20, Y(y1), 30, '0.0',
        11, X(x2), 21, Y(y2), 31, '0.0');
    }
    function circle(x, y, rmm, layer) {
      e.push(0, 'CIRCLE', 8, layer, 10, X(x), 20, Y(y), 30, '0.0', 40, rmm.toFixed(2));
    }
    // R12/ANSI uyumu için ASCII'ye indirger (Ø→D, ²→2, Türkçe harfler vb.)
    function ascii(s) {
      return String(s)
        .replace(/Ø/g, 'D').replace(/³/g, '3').replace(/²/g, '2')
        .replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i')
        .replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u')
        .replace(/[^\x20-\x7E]/g, '');
    }
    function txt(x, y, h, s, layer) {
      e.push(0, 'TEXT', 8, layer, 10, X(x), 20, Y(y), 30, '0.0',
        40, h.toFixed(2), 1, ascii(s));
    }
    function polyLines(pts, layer, close) {
      for (let i = 0; i < pts.length - 1; i++) {
        line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, layer);
      }
      if (close && pts.length > 2) {
        line(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y, layer);
      }
    }

    // --- Beton bileşenleri (kapalı poligon) ---
    geo.concrete.forEach((c) => polyLines(c.points, 'BETON', true));

    // --- Dolgu ---
    geo.soil.forEach((s) => { if (s.points.length >= 3) polyLines(s.points, 'DOLGU', true); });

    // --- Zemin çizgisi (temel altı) ---
    line(-0.4, 0, geo.B + 0.4, 0, 'ZEMIN');

    // --- Donatı ---
    if (rebar && rebar.bars) {
      rebar.bars.forEach((b) => {
        if (b.kind === 'dot') {
          circle(b.x, b.y, (b.r || 0.006) * S, 'DONATI');
        } else if (b.kind === 'ciroz') {
          line(b.x1, b.y, b.x2, b.y, 'DONATI');
        } else if (b.kind === 'barbakan') {
          circle(b.x, b.y, 0.05 * S, 'DOLGU');
          if (b.label) txt(b.x + 0.12, b.y, th * 0.7, b.label, 'YAZI');
        } else if (b.kind === 'lapdim') {
          line(b.a.x - 0.18, b.a.y, b.a.x - 0.18, b.b.y, 'OLCU');
          if (b.label) txt(b.a.x - 0.30, (b.a.y + b.b.y) / 2, th * 0.8, b.label, 'YAZI');
        } else if (b.poly) {
          polyLines(b.poly, 'DONATI', false);
          if (b.label && b.labelPos) txt(b.labelPos.x, b.labelPos.y, th * 0.8,
            (b.poz ? b.poz + ' ' : '') + b.label, 'YAZI');
        } else if (b.kind === 'note' && b.label) {
          txt(b.labelPos.x, b.labelPos.y, th * 0.8, (b.poz ? b.poz + ' ' : '') + b.label, 'YAZI');
        }
      });
    }

    // --- Ölçüler (basit yatay/düşey kotalar — çizgi + metin) ---
    const d = geo.dims;
    const dimOff = 0.6;
    // Toplam genişlik (alt)
    hdim(-dimOff, 0, geo.B, `B=${fmt(geo.B)}`);
    // Toplam yükseklik (sol)
    vdim(-dimOff, 0, d.H, `H=${fmt(d.H)}`);
    function hdim(yLevel, x1, x2, label) {
      const yy = yLevel;
      line(x1, yy, x2, yy, 'OLCU');
      line(x1, yy, x1, 0, 'OLCU');
      line(x2, yy, x2, 0, 'OLCU');
      txt((x1 + x2) / 2 - 0.2, yy - 0.25, th, label, 'OLCU');
    }
    function vdim(xLevel, y1, y2, label) {
      const xx = xLevel;
      line(xx, y1, xx, y2, 'OLCU');
      line(xx, y1, 0, y1, 'OLCU');
      line(xx, y2, 0, y2, 'OLCU');
      txt(xx - 0.5, (y1 + y2) / 2, th, label, 'OLCU');
    }

    // --- Başlık ---
    const title = geo.type === 'cantilever'
      ? 'KONSOL ISTINAT DUVARI - DONATILI KESIT'
      : 'AGIRLIK ISTINAT DUVARI - KESIT';
    txt(0, d.H + 0.6, th * 1.4, title, 'YAZI');
    txt(0, d.H + 0.3, th, 'Olculer mm. Olcek 1:1 (model birimi=mm).', 'YAZI');

    // --- DONATI AÇILIM (POZ) CETVELİ (kesitin sağında) ---
    if (quant && quant.schedule && quant.schedule.length) {
      const x0 = geo.B + 1.6;            // başlangıç x (m)
      const colW = 6.0;                  // şekil için max genişlik (m, şematik)
      const rowH = 1.2;                  // satır yüksekliği (m)
      let y = d.H;
      txt(x0, y + 0.5, th * 1.2, 'DONATI ACILIM (POZ) CETVELI', 'YAZI');
      quant.schedule.forEach((r) => {
        circle(x0 - 0.25, y + 0.27, 0.13 * S, 'YAZI');
        txt(x0 - 0.32, y + 0.20, th * 0.7, String(r.poz), 'YAZI');
        txt(x0, y + 0.25, th * 0.8, (r.callout || `${r.count}D${r.dia} L=${Math.round(r.pieceLen * 100)}`), 'YAZI');
        drawShapeDXF(r.shape, x0, y - rowH * 0.5, colW, rowH * 0.45);
        y -= rowH;
      });
      if (quant.notes) {
        txt(x0, y + 0.1, th * 0.75, quant.notes.barbakan, 'YAZI');
        txt(x0, y - 0.2, th * 0.75, quant.notes.ciroz, 'YAZI');
      }
    }

    // --- AYRI DETAY GÖRÜNÜŞLERİ (kesitin altında) ---
    if (opts.details) {
      const layerOf = { outline: 'BETON', stemfoot: 'BETON', rebar: 'DONATI',
        rebar2: 'DONATI', rebarthin: 'DONATI', barbakan: 'DOLGU',
        section: 'OLCU', dim: 'OLCU', dimtext: 'OLCU' };
      let cursorY = -d.tf - 2.0;            // ilk detay kesitin altında başlar
      [opts.details.elevation, opts.details.plan].forEach((det) => {
        if (!det) return;
        const b = det.bounds;
        const oy = cursorY - (b.maxy - b.miny);     // detayı aşağı yerleştir
        const ox = -b.minx;                          // sola hizala (x=0)
        const PX = (x) => x + ox, PY = (y) => y + oy - b.miny;
        txt(PX(b.minx) + 0.2, PY(b.maxy) + 0.4, th * 1.2, det.title, 'YAZI');
        det.items.forEach((m) => placeItem(m, PX, PY, layerOf));
        cursorY = oy - 2.2;                          // sonraki detay için boşluk
      });
    }

    return assemble(e);

    function placeItem(m, PX, PY, layerOf) {
      const lyr = layerOf[m.cls] || 'DONATI';
      if (m.t === 'line') line(PX(m.x1), PY(m.y1), PX(m.x2), PY(m.y2), lyr);
      else if (m.t === 'rect') {
        line(PX(m.x), PY(m.y), PX(m.x + m.w), PY(m.y), lyr);
        line(PX(m.x + m.w), PY(m.y), PX(m.x + m.w), PY(m.y + m.h), lyr);
        line(PX(m.x + m.w), PY(m.y + m.h), PX(m.x), PY(m.y + m.h), lyr);
        line(PX(m.x), PY(m.y + m.h), PX(m.x), PY(m.y), lyr);
      } else if (m.t === 'circle') circle(PX(m.x), PY(m.y), m.r * S, lyr);
      else if (m.t === 'pballoon') {
        circle(PX(m.x), PY(m.y), 0.13 * S, 'YAZI');
        txt(PX(m.x) - 0.08, PY(m.y) - 0.07, th * 0.7, String(m.poz), 'YAZI');
      } else if (m.t === 'text') {
        txt(PX(m.x), PY(m.y), Math.max(0.12, m.size) * S, m.s, lyr === 'OLCU' ? 'OLCU' : 'YAZI');
      }
    }

    // Büküm şeklini (cm bacaklar) DONATI katmanına gerçek geometriyle çizer
    function drawShapeDXF(shape, bx, by, bw, bh) {
      if (!shape || !shape.segs || !shape.segs.length) return;
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      shape.segs.forEach((s) => [[s.x1, s.y1], [s.x2, s.y2]].forEach(([x, yy]) => {
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, yy); maxy = Math.max(maxy, yy);
      }));
      const w = Math.max(1e-3, maxx - minx), h = Math.max(1e-3, maxy - miny);
      const sc = Math.min(bw / w, bh / h);
      const PX = (x) => bx + (x - minx) * sc;
      const PY = (yy) => by + (yy - miny) * sc;
      shape.segs.forEach((s) => {
        line(PX(s.x1), PY(s.y1), PX(s.x2), PY(s.y2), 'DONATI');
        if (s.len < 1) return;
        const mx = (PX(s.x1) + PX(s.x2)) / 2, my = (PY(s.y1) + PY(s.y2)) / 2;
        txt(mx, my + 0.05, th * 0.55, s.len.toFixed(0), 'OLCU');
      });
    }
  }

  function fmt(v) { return (Math.round(v * 100) / 100).toFixed(2); }

  // HEADER + TABLES(LAYER) + ENTITIES + EOF
  function assemble(entityCodes) {
    const out = [];
    const g = (code, val) => { out.push(code, val); };

    // HEADER
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSUNITS'); g(70, 4);           // 4 = millimetre
    g(0, 'ENDSEC');

    // TABLES — LAYER tanımları
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, LAYERS.length);
    LAYERS.forEach(([name, color]) => {
      g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS');
    });
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');

    // ENTITIES
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (let i = 0; i < entityCodes.length; i += 2) {
      out.push(entityCodes[i], entityCodes[i + 1]);
    }
    g(0, 'ENDSEC');

    g(0, 'EOF');

    // Grup kodu + değer satırları (her biri ayrı satır)
    return out.join('\n') + '\n';
  }

  return { build };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DXF;
}
