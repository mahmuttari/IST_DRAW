/*
 * reinforcement.js
 * Konsol (betonarme) istinat duvarı için ön tasarım donatı hesabı ve metraj.
 *
 * Yöntem: TS500 / EC2 dikdörtgen gerilme bloğu (tek sıra donatı).
 *   - Beton: fcd = fck / 1.5
 *   - Çelik: fyd = fyk / 1.15
 *   - Tasarım momenti = yük katsayısı (LF) x servis momenti
 *
 * Birimler: kesit ölçüleri m; momentler kNm/m; donatı çapı mm; As mm²/m.
 *
 * NOT: Ön tasarım amaçlıdır. Nihai projede kesme, çatlak, aderans (kenetlenme
 * boyu), gerçek yük kombinasyonları ve yönetmelik kontrolleri gereklidir.
 */

const Rebar = (function () {
  'use strict';

  const rad = (d) => (d * Math.PI) / 180;
  const barArea = (dia) => (Math.PI * dia * dia) / 4;        // mm²
  const barMass = (dia) => (dia * dia) / 162;                // kg/m (≈ ρ·A)

  // Simpson ile sayısal integral (n çift)
  function integrate(f, a, b, n) {
    if (b <= a) return 0;
    n = n || 40;
    const h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
    return (s * h) / 3;
  }

  /*
   * Verilen tasarım momenti için gerekli çekme donatısı alanı (mm²/m).
   * b = 1000 mm (1 m şerit), d = faydalı yükseklik (mm).
   */
  function flexAs(Mu_kNm, d, fck, fyk) {
    const b = 1000;
    const fcd = fck / 1.5;
    const fyd = fyk / 1.15;
    const Mu = Math.max(0, Mu_kNm) * 1e6;     // N·mm
    let warn = null;
    if (d <= 0) return { As: 0, warn: 'Faydalı yükseklik ≤ 0', fcd, fyd, m: 0 };
    let m = Mu / (b * d * d * fcd);
    if (m > 0.295) {                          // tek sıra donatı sınırı (~ξ_bal)
      warn = 'Kesit yetersiz: tek sıra donatı ile karşılanamıyor — kalınlığı artırın.';
      m = 0.295;
    }
    const omega = 1 - Math.sqrt(Math.max(0, 1 - 2 * m));
    const As = (omega * b * d * fcd) / fyd;
    return { As, warn, fcd, fyd, m };
  }

  // Seçilen çap için uygun donatı aralığı (mm). As_req: mm²/m.
  function chooseSpacing(AsReq, dia, sMin, sMax, step) {
    sMin = sMin || 100; sMax = sMax || 250; step = step || 10;
    const a1 = barArea(dia);
    let s;
    if (!(AsReq > 0)) {
      s = sMax;
    } else {
      s = Math.floor((1000 * a1) / AsReq / step) * step;   // s ≤ 1000·a1/AsReq
    }
    if (!isFinite(s) || s > sMax) s = sMax;
    if (s < sMin) s = sMin;
    const AsProv = (1000 / s) * a1;
    return { s, AsProv, a1 };
  }

  // Tek bir donatı grubu için tasarım + seçim sonucu üretir.
  function designGroup(label, position, Mu, thickness_m, dia, mat, opts) {
    opts = opts || {};
    const cover = mat.cover;                        // mm
    const d = thickness_m * 1000 - cover - dia / 2; // mm
    const flex = flexAs(Mu, d, mat.fck, mat.fyk);
    // Minimum donatı (TS500 ~ %0.2): As,min = ρmin·b·d
    const rhoMin = opts.rhoMin != null ? opts.rhoMin : 0.0020;
    const AsMin = rhoMin * 1000 * d;
    const AsReq = Math.max(flex.As, AsMin);
    const sel = chooseSpacing(AsReq, dia, opts.sMin, opts.sMax);
    return {
      label, position,
      Mu,                       // kNm/m (tasarım)
      d,                        // mm
      dia,                      // mm
      spacing: sel.s,           // mm
      AsFlex: flex.As,          // mm²/m
      AsMin,                    // mm²/m
      AsReq,                    // mm²/m
      AsProv: sel.AsProv,       // mm²/m
      governedByMin: AsMin > flex.As,
      warn: flex.warn,
    };
  }

  /* =====================================================================
   * KONSOL DUVARI — DONATI TASARIMI
   * geo: Geometry.cantilever çıktısı
   * model: Geometry.toAnalysisModel çıktısı
   * res: Eng.analyze çıktısı (qMax, qMin, xbar, pressureValid)
   * mat: { fck, fyk, cover(mm), loadFactor, diaStem, diaFoot, diaDist }
   * ===================================================================== */
  function designCantilever(geo, model, res, mat) {
    const d = geo.dims;
    const Ka = res.Ka;
    const g = model.gammaSoil;
    const gc = (geo.concrete[0] && geo.concrete[0].gamma) || 24;
    const q = model.q || 0;
    const LF = mat.loadFactor;
    const cosB = Math.cos(rad(model.beta || 0));
    const B = geo.B, H = d.H, tf = d.tf, Hs = d.Hs, Lt = d.Lt, Lh = d.Lh;
    const xb = d.xStemBackBot;       // gövde arka yüzü (taban kotunda)

    /* --- 1) GÖVDE (stem) — çekme arka (dolgu) yüzde --- */
    const M_earth = 0.5 * Ka * g * Hs * Hs * (Hs / 3);
    const M_sur = Ka * q * Hs * (Hs / 2);
    const Mstem = (M_earth + M_sur) * cosB;          // servis
    const stem = designGroup('Gövde düşey (çekme)', 'stemBack',
      LF * Mstem, d.tBot, mat.diaStem, mat);

    /* --- Taban basınç dağılımı (servis) --- */
    let qAt;
    if (res.pressureValid) {
      qAt = (x) => res.qMax - (res.qMax - res.qMin) * (x / B);
    } else {
      const aLen = Math.max(3 * res.xbar, 1e-6);     // ön uçtan basınç bölgesi
      qAt = (x) => (x <= aLen ? res.qMax * (1 - x / aLen) : 0);
    }

    /* --- 2) ÖN ÖKÇE (toe) — net yukarı basınç, alt yüzde çekme --- */
    const wSlab = gc * tf;                            // taban öz ağırlığı (kPa)
    const M_toe = integrate((x) => (qAt(x) - wSlab) * (Lt - x), 0, Lt, 40);
    const toe = designGroup('Taban alt (ön ökçe)', 'footBot',
      LF * Math.max(0, M_toe), tf, mat.diaFoot, mat);

    /* --- 3) ARKA TOPUK (heel) — net aşağı yük, üst yüzde çekme --- */
    const wDown = g * (H - tf) + q + wSlab;           // dolgu + sürşarj + öz ağırlık
    const M_heel = integrate((x) => (wDown - qAt(x)) * (x - xb), xb, B, 40);
    const heel = designGroup('Taban üst (arka topuk)', 'footTop',
      LF * Math.max(0, M_heel), tf, mat.diaFoot, mat);

    /* --- 4) DAĞITMA / YATAY donatı (büzülme + dağıtma) --- */
    const AsDistReq = Math.max(0.20 * stem.AsProv, 0.0015 * 1000 * (d.tBot * 1000 - mat.cover));
    const distSel = chooseSpacing(AsDistReq, mat.diaDist, 100, 300);
    const dist = {
      label: 'Dağıtma / yatay', position: 'dist',
      dia: mat.diaDist, spacing: distSel.s,
      AsReq: AsDistReq, AsProv: distSel.AsProv,
    };

    const groups = [stem, toe, heel];
    const warnings = groups.filter((x) => x.warn).map((x) => `${x.label}: ${x.warn}`);

    /* --- Donatı geometrisi (model uzayı) — SVG ve DXF ortak kullanır --- */
    const c = mat.cover / 1000;          // m cinsinden paspayı
    const hook = 0.20;                   // m, kanca/kenetlenme temsili
    const bars = [];

    // Gövde çekme donatısı (arka yüze paralel, tabana kancalı)
    bars.push({
      layer: 'DONATI', kind: 'main',
      label: `Ø${stem.dia}/${stem.spacing}`,
      poly: [
        { x: xb - c - hook, y: c },      // taban içi yatay kanca
        { x: xb - c, y: c },
        { x: d.xStemBackTop - c, y: H - c }, // gövde boyunca yukarı (şevli)
      ],
      labelPos: { x: xb - c, y: tf + Hs * 0.55 },
    });
    // Gövde ön yüz nominal düşey donatı
    bars.push({
      layer: 'DONATI', kind: 'sec',
      label: '',
      poly: [ { x: Lt + c, y: tf }, { x: Lt + c, y: H - c } ],
    });
    // Taban alt donatısı (uçları yukarı kancalı, U)
    bars.push({
      layer: 'DONATI', kind: 'main',
      label: `Ø${toe.dia}/${toe.spacing}`,
      poly: [
        { x: c, y: c + hook }, { x: c, y: c },
        { x: B - c, y: c }, { x: B - c, y: c + hook },
      ],
      labelPos: { x: Lt * 0.5 + c, y: c + 0.06 },
    });
    // Taban üst donatısı (uçları aşağı kancalı)
    bars.push({
      layer: 'DONATI', kind: 'main',
      label: `Ø${heel.dia}/${heel.spacing}`,
      poly: [
        { x: c, y: tf - c - hook }, { x: c, y: tf - c },
        { x: B - c, y: tf - c }, { x: B - c, y: tf - c - hook },
      ],
      labelPos: { x: (xb + B) / 2, y: tf - c - 0.06 },
    });

    return { type: 'cantilever', groups, dist, bars, warnings,
      moments: { Mstem, M_toe, M_heel, LF } };
  }

  /* =====================================================================
   * METRAJ (quantity take-off) — 1 m duvar uzunluğu için, L ile ölçeklenir
   * ===================================================================== */
  function quantities(geo, rebar, mat, wallLength) {
    const L = wallLength > 0 ? wallLength : 1;
    const STEEL = 7850; // kg/m³

    // Beton hacmi (m³/m): tüm beton poligon alanlarının toplamı
    let concPerM = 0;
    geo.concrete.forEach((cmp) => { concPerM += polyArea(cmp.points); });

    // Kalıp alanı (m²/m): kalıp gerektiren düşey/eğik yüzeyler
    const d = geo.dims;
    let formPerM = 0;
    if (geo.type === 'cantilever') {
      const backLen = Math.hypot(d.Hs, d.tBot - d.tTop);   // gövde arka yüz (şevli)
      formPerM = d.Hs + backLen + 2 * d.tf;                // gövde ön+arka + taban iki uç
    } else {
      formPerM = d.H + Math.hypot(d.H, d.b - d.a);         // ön (düşey) + arka (şevli)
    }

    // Donatı ağırlığı (kg/m duvar)
    const steelLines = [];
    let steelPerM = 0;
    if (rebar && geo.type === 'cantilever') {
      const cM = mat.cover / 1000;
      const anchor = 0.30;  // m, kenetlenme/bindirme payı (yaklaşık)
      const g = rebar.groups.reduce((o, x) => (o[x.position] = x, o), {});
      // Gövde düşey: 1000/s adet/m, boy ≈ Hs + temel ankrajı + kanca
      addSteel(steelLines, 'Gövde düşey', g.stemBack,
        d.Hs + (d.tf - cM) + 0.15, '1000/s adet/m');
      // Taban alt (enine): boy ≈ B + 2 kanca
      addSteel(steelLines, 'Taban alt', g.footBot, geo.B + 0.40, '1000/s adet/m');
      // Taban üst (enine): boy ≈ B + kanca
      addSteel(steelLines, 'Taban üst', g.footTop, geo.B + 0.30, '1000/s adet/m');
      // Dağıtma/yatay: gövde + taban yüksekliği boyunca, boy 1 m/m duvar
      const distCount = (d.Hs / rebar.dist.spacing) * 1000 / 1000; // adet/m yükseklik → toplam adet = Hs/s
      const distW = (d.Hs / (rebar.dist.spacing / 1000)) * 1.0 * barMass(rebar.dist.dia);
      steelLines.push({
        label: 'Dağıtma / yatay', detail: `Ø${rebar.dist.dia}/${rebar.dist.spacing}`,
        kgPerM: distW,
      });
      steelPerM = steelLines.reduce((s, x) => s + x.kgPerM, 0);
    }

    return {
      wallLength: L,
      perMeter: { concrete: concPerM, formwork: formPerM, steel: steelPerM },
      total: { concrete: concPerM * L, formwork: formPerM * L, steel: steelPerM * L },
      steelLines,
      steelRatio: concPerM > 0 ? (steelPerM / concPerM) : 0, // kg/m³
    };

    function addSteel(arr, label, grp, barLen, detail) {
      if (!grp) return;
      const nPerM = 1000 / grp.spacing;               // adet / m duvar
      const kgPerM = nPerM * barLen * barMass(grp.dia);
      arr.push({ label, detail: `Ø${grp.dia}/${grp.spacing}`, kgPerM, barLen, nPerM });
    }
  }

  function polyArea(points) {
    let a = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], qq = points[(i + 1) % points.length];
      a += p.x * qq.y - qq.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  return { designCantilever, quantities, barArea, barMass };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rebar;
}
