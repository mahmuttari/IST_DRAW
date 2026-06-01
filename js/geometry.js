/*
 * geometry.js
 * Girilen ölçülerden duvar kesit geometrisini üretir.
 *
 * Koordinat sistemi (model uzayı, metre):
 *   - x: tabanın ön (ayak/parmak) ucundan arkaya (dolgu tarafına) doğru
 *   - y: taban altından yukarı doğru
 *   - Orijin (0,0): taban ön alt köşesi
 *
 * Çıktı, hem çizim (draw.js) hem de hesap (engineering.js) tarafından kullanılır.
 */

const Geometry = (function () {
  'use strict';

  /* ---------- KONSOL (BETONARME) İSTİNAT DUVARI ---------- */
  function cantilever(d) {
    const H = d.H;            // toplam yükseklik
    const tf = d.tf;          // temel kalınlığı
    const Lt = d.Lt;          // ön ökçe (parmak) uzunluğu
    const Lh = d.Lh;          // arka topuk uzunluğu
    const tTop = d.tTop;      // gövde üst kalınlığı
    const tBot = d.tBot;      // gövde alt kalınlığı
    const B = Lt + tBot + Lh; // toplam taban genişliği
    const Hs = H - tf;        // gövde yüksekliği

    const xStemFront = Lt;            // gövde ön yüzü (düşey)
    const xStemBackBot = Lt + tBot;   // gövde arka yüzü taban kotunda
    const xStemBackTop = Lt + tTop;   // gövde arka yüzü üst kotunda

    // Taban plağı (saat yönü tersi)
    const base = [
      { x: 0, y: 0 }, { x: B, y: 0 }, { x: B, y: tf }, { x: 0, y: tf },
    ];

    // Gövde (ön yüz düşey, arka yüz şevli)
    const stem = [
      { x: xStemFront, y: tf },
      { x: xStemBackBot, y: tf },
      { x: xStemBackTop, y: H },
      { x: xStemFront, y: H },
    ];

    // Topuk üzerindeki dolgu (gövde arka yüzünden taban arka ucuna kadar)
    const soil = [
      { x: xStemBackBot, y: tf },
      { x: B, y: tf },
      { x: B, y: H },
      { x: xStemBackTop, y: H },
    ];

    // Ölçülendirme için anahtar noktalar
    const dims = {
      B, H, Hs, tf, Lt, Lh, tTop, tBot,
      xStemFront, xStemBackBot, xStemBackTop,
    };

    return {
      type: 'cantilever',
      B, H,
      concrete: [
        { label: 'Taban plağı', gamma: d.gammaConcrete, points: base },
        { label: 'Gövde', gamma: d.gammaConcrete, points: stem },
      ],
      soil: [
        { label: 'Topuk üstü dolgu', gamma: d.gammaSoil, points: soil },
      ],
      outline: { base, stem, soil },
      dims,
    };
  }

  /* ---------- AĞIRLIK DUVARI ---------- */
  function gravity(d) {
    const H = d.H;        // yükseklik
    const a = d.a;        // üst genişlik
    const b = d.b;        // alt (taban) genişlik
    const B = b;

    // Ön yüz düşey (x=0), arka yüz şevli
    const body = [
      { x: 0, y: 0 },
      { x: b, y: 0 },
      { x: a, y: H },
      { x: 0, y: H },
    ];

    // Arka yüze yaslanan dolgu kaması (x=b düşey düzlemine kadar)
    const soil = (b > a)
      ? [
          { x: b, y: 0 },
          { x: b, y: H },
          { x: a, y: H },
        ]
      : [];

    const dims = { B, H, a, b };

    const soilBodies = soil.length
      ? [{ label: 'Arka dolgu kaması', gamma: d.gammaSoil, points: soil }]
      : [];

    return {
      type: 'gravity',
      B, H,
      concrete: [
        { label: 'Duvar gövdesi', gamma: d.gammaConcrete, points: body },
      ],
      soil: soilBodies,
      outline: { body, soil },
      dims,
    };
  }

  /* ---------- L TİPİ KONSOL (ÖN ÖKÇESİZ) ---------- */
  // Ön ökçe (parmak) olmayan konsol duvar — yalnız arka topuk. cantilever'in
  // Lt=0 özel hali; statik/donatı motoru aynen kullanılır.
  function lwall(d) {
    const geo = cantilever(Object.assign({}, d, { Lt: 0 }));
    geo.type = 'lwall';
    return geo;
  }

  /* ---------- PAYANDALI (CONTRFORT) İSTİNAT DUVARI ----------
   * Dolgu tarafında, gövdeyi ve topuğu bağlayan düşey payandalar (s aralıkla).
   * Kesit, bir payanda hizasından alınır: taban + sabit kalınlıklı gövde +
   * arka tarafta üçgen payanda. Stabilite metre başına hesaplandığından, payanda
   * betonu (tc/s) oranıyla "yayılmış" gamma ile modele katılır.
   *   d: { H, tf, Lt, Lh, tStem, s, tc, gammaConcrete, gammaSoil, ... }
   */
  function counterfort(d) {
    const H = d.H, tf = d.tf, Lt = d.Lt, Lh = d.Lh;
    const tStem = d.tStem;                 // gövde (sabit) kalınlığı
    const s = d.s;                          // payanda aks aralığı
    const tc = d.tc;                        // payanda kalınlığı (genişliği)
    const B = Lt + tStem + Lh;
    const Hs = H - tf;
    const xSF = Lt;                         // gövde ön yüzü
    const xSB = Lt + tStem;                 // gövde arka yüzü (payanda ön yüzü)

    const base = [
      { x: 0, y: 0 }, { x: B, y: 0 }, { x: B, y: tf }, { x: 0, y: tf },
    ];
    // Gövde (sabit kalınlık, düşey yüzler)
    const stem = [
      { x: xSF, y: tf }, { x: xSB, y: tf }, { x: xSB, y: H }, { x: xSF, y: H },
    ];
    // Payanda üçgeni (gövde arka yüzünden topuk arka ucuna, tepede gövde üstüne)
    const counter = [
      { x: xSB, y: tf }, { x: B, y: tf }, { x: xSB, y: H },
    ];
    // Dolgu: topuk üzerinde, payanda üçgeninin üstünde kalan kama
    const soil = [
      { x: xSB, y: tf }, { x: B, y: tf }, { x: B, y: H }, { x: xSB, y: H },
    ];

    // Payanda betonunu metre başına yay (tc/s). Üçgen bölgede payanda dolguyu
    // BETONLA DEĞİŞTİRİR → net ek ağırlık (γc − γs)·smear; dolgu tam sayılır.
    const smear = Math.min(1, tc / s);
    const dims = { B, H, Hs, tf, Lt, Lh, tStem, s, tc, smear,
      xStemFront: xSF, xStemBackBot: xSB, xStemBackTop: xSB,
      tTop: tStem, tBot: tStem };

    return {
      type: 'counterfort',
      B, H,
      concrete: [
        { label: 'Taban plağı', gamma: d.gammaConcrete, points: base },
        { label: 'Gövde', gamma: d.gammaConcrete, points: stem },
        { label: 'Payanda (net, yayılmış)',
          gamma: Math.max(0, (d.gammaConcrete - d.gammaSoil) * smear), points: counter },
      ],
      soil: [
        { label: 'Topuk üstü dolgu', gamma: d.gammaSoil, points: soil },
      ],
      // Çizim: payanda üçgenini ayrı göstermek için outline'a ekle
      outline: { base, stem, counter, soil },
      dims,
    };
  }

  // Hesap motoruna verilecek modeli derler.
  function toAnalysisModel(geo, d) {
    return {
      B: geo.B,
      H: geo.H,
      concrete: geo.concrete,
      soil: geo.soil,
      gammaSoil: d.gammaSoil,
      phi: d.phi,
      beta: d.beta || 0,
      q: d.q || 0,
      baseFrictionDeg: d.baseFrictionDeg || d.phi,
      sigmaAllow: d.sigmaAllow,
      fsOtMin: d.fsOtMin || 1.5,
      fsSlMin: d.fsSlMin || 1.5,
    };
  }

  return { cantilever, lwall, counterfort, gravity, toAnalysisModel };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Geometry;
}
