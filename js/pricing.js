/*
 * pricing.js
 * BİRİM FİYAT TEKLİF CETVELİ
 * Metraj (reinforcement.js) ve geometri (geometry.js) çıktısından istinat
 * duvarı imalat kalemlerinin miktarlarını türetir ve birim fiyatlarla
 * çarparak teklif cetvelini üretir.
 *
 * NOT (mühendislik): Birim fiyatlar 2026 için YAKLAŞIK, KDV hariç değerlerdir
 * ve piyasa/ÇŞB Birim Fiyat Kitabı ile güncellenmelidir. Poz numaraları ilgili
 * poz ailelerini gösterir; sözleşmedeki yıl kitabına göre teyit ediniz.
 */

const Pricing = (function () {
  'use strict';

  // Varsayılan birim fiyatlar (₺, KDV hariç, ~2026 yaklaşık)
  const DEFAULTS = {
    kazi:      260,    // ₺/m³  temel kazısı (makine ile, her derinlik)
    grobeton:  2800,   // ₺/m³  C16/20 grobeton (temel altı 10 cm)
    beton25:   3150,   // ₺/m³  C25/30 betonarme beton (santral, pompalı)
    beton30:   3350,   // ₺/m³  C30/37 betonarme beton
    betonDus:  2950,   // ₺/m³  düşük sınıf / kütle beton (ağırlık duvarı)
    kalip:     560,    // ₺/m²  düz yüzeyli betonarme kalıbı (plywood)
    celik:     42000,  // ₺/ton nervürlü çelik B420C (kesme-bükme-yerine koyma)
    dolgu:     720,    // ₺/m³  granüler geri dolgu/filtre (serme + sıkıştırma)
    barbakan:  185,    // ₺/ad  PVC barbakan teşkili
    drenBoru:  325,    // ₺/m   delikli koruge drenaj borusu Ø100
    yalitim:   470,    // ₺/m²  arka yüz su yalıtımı + drenaj levhası
  };

  function polyArea(points) {
    let a = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  /*
   * build(geo, quant, mat) → { rows:[{poz,name,unit,qty,unitPrice}], notes }
   * Miktar türetme varsayımları satır notlarında verilir.
   */
  function build(geo, quant, mat) {
    const d = geo.dims;
    const L = quant.wallLength > 0 ? quant.wallLength : 1;
    const isRC = geo.type !== 'gravity';
    const tf = d.tf != null ? d.tf : 0.0;
    const B = geo.B;                       // taban genişliği
    const Hs = (d.Hs != null) ? d.Hs : geo.H;  // gövde (perde) yüksekliği
    const grobH = 0.10;                    // grobeton kalınlığı (varsayım)
    const workW = 0.60;                    // kazı çalışma payı (2 × 0.30)
    const filterW = 0.60;                  // drenaj/granüler dolgu şerit genişliği

    // Türetilen miktarlar
    const kaziVol   = (B + workW) * (tf + grobH) * L;      // temel kazısı
    const grobVol   = B * grobH * L;                       // temel altı grobeton
    const betonVol  = quant.total.concrete;                // betonarme/kütle beton
    const kalipArea = quant.total.formwork;                // kalıp
    const celikTon  = (quant.total.steel || 0) / 1000;     // nervürlü çelik (ton)

    // Geri dolgu: gövde arkasındaki granüler filtre bölgesi (şerit × perde yük.)
    let dolguVol = filterW * Hs * L;
    // Ayrıca tutulan dolgu takozu varsa (soil poligonu) küçük kama katkısı yerine
    // yalnız filtre bölgesini pay kalemi sayıyoruz (mevcut zemin ayrı değerlendirilir).

    // Barbakan adedi: yatay aralık + düşey sıra sayısı (~2 m'de bir)
    const sH = (mat && mat.barbakanS ? mat.barbakanS : 100) / 100; // m
    const rows = Math.max(1, Math.floor(Hs / 2));
    const barbakanAd = Math.ceil(L / sH) * rows;

    const drenBoruLen = L;                 // taban arkası tek sıra drenaj borusu
    const yalitimArea = Hs * L;            // arka yüz su yalıtımı

    // Beton sınıfına göre poz/fiyat seçimi
    const fck = (mat && mat.fck) ? mat.fck : 25;
    let betonKey, betonName, betonPoz;
    if (!isRC) {
      betonKey = 'betonDus'; betonName = 'Beton (ağırlık duvarı gövdesi, C20/25)'; betonPoz = '16.057';
    } else if (fck >= 30) {
      betonKey = 'beton30'; betonName = 'Betonarme beton C30/37 (santral, pompalı)'; betonPoz = '16.059';
    } else {
      betonKey = 'beton25'; betonName = 'Betonarme beton C25/30 (santral, pompalı)'; betonPoz = '16.058';
    }

    const rowsOut = [];
    const push = (poz, name, unit, qty, unitPrice) => {
      if (qty > 0) rowsOut.push({ poz, name, unit, qty, unitPrice });
    };

    push('15.140', 'Temel kazısı (makine ile, her derinlikte)', 'm³', kaziVol, DEFAULTS.kazi);
    push('16.056', 'Grobeton C16/20 (temel altı, 10 cm)', 'm³', grobVol, DEFAULTS.grobeton);
    push(betonPoz, betonName, 'm³', betonVol, DEFAULTS[betonKey]);
    push('21.011', 'Düz yüzeyli betonarme kalıbı', 'm²', kalipArea, DEFAULTS.kalip);
    if (isRC) push('23.014', 'Nervürlü çelik donatı B420C (yerine konmuş)', 'ton', celikTon, DEFAULTS.celik);
    push('15.180', 'Granüler geri dolgu / filtre malzemesi (serme + sıkıştırma)', 'm³', dolguVol, DEFAULTS.dolgu);
    push('19.100', 'Barbakan teşkili (PVC)', 'ad', barbakanAd, DEFAULTS.barbakan);
    push('18.461', 'Delikli koruge drenaj borusu Ø100', 'm', drenBoruLen, DEFAULTS.drenBoru);
    push('04.613', 'Arka yüz su yalıtımı + drenaj levhası', 'm²', yalitimArea, DEFAULTS.yalitim);

    return {
      rows: rowsOut,
      meta: {
        kaziVol, grobVol, betonVol, kalipArea, celikTon, dolguVol,
        barbakanAd, drenBoruLen, yalitimArea, L, B, Hs, tf,
      },
    };
  }

  // İstanbul/tr-TR para biçimi
  function money(v) {
    return (Math.round(v * 100) / 100).toLocaleString('tr-TR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }
  function qtyFmt(v, unit) {
    const dec = (unit === 'ad') ? 0 : (unit === 'ton' ? 3 : 2);
    return (Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec))
      .toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  const KDV = 0.20;

  return { build, money, qtyFmt, DEFAULTS, KDV };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pricing;
}
