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

  function build(geo, rebar, opts) {
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
        polyLines(b.poly, 'DONATI', false);
        if (b.label) txt(b.labelPos.x, b.labelPos.y, th * 0.85, b.label, 'YAZI');
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

    return assemble(e);
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
