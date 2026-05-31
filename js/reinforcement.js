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

  /*
   * Kenetlenme ve bindirme (ek) boyu — TS500 (nervürlü çubuk).
   *   fctk = 0.35·√fck,  fctd = fctk/1.5,  fyd = fyk/1.15
   *   ℓb = 0.12·(fyd/fctd)·φ ≥ 20φ      (temel kenetlenme boyu)
   *   ℓ0 = α·ℓb ≥ max(20φ, 150 mm)      (bindirme/ek boyu)
   * Sonuç mm; ℓ0 5 cm'e yuvarlanır.
   */
  function lapLength(dia, fck, fyk, lapFactor) {
    const fctk = 0.35 * Math.sqrt(fck);
    const fctd = fctk / 1.5;
    const fyd = fyk / 1.15;
    const lb = Math.max(0.12 * (fyd / fctd) * dia, 20 * dia);
    let l0 = Math.max((lapFactor || 1.4) * lb, 20 * dia, 150);
    l0 = Math.ceil(l0 / 50) * 50;            // 5 cm yuvarlama
    return { lb, l0 };                        // mm
  }

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

    /* --- 4) YATAY / DAĞITMA donatı (büzülme + dağıtma) --- */
    const AsDistReq = Math.max(0.20 * stem.AsProv, 0.0015 * 1000 * (d.tBot * 1000 - mat.cover));
    const distSel = chooseSpacing(AsDistReq, mat.diaDist, 100, 300);
    const dist = {
      label: 'Yatay / dağıtma', position: 'dist',
      dia: mat.diaDist, spacing: distSel.s,
      AsReq: AsDistReq, AsProv: distSel.AsProv,
    };

    /* --- Bindirme boyları --- */
    const lapStem = lapLength(mat.diaStem, mat.fck, mat.fyk, mat.lapFactor);
    const lapFoot = lapLength(mat.diaFoot, mat.fck, mat.fyk, mat.lapFactor);
    const lapDist = lapLength(mat.diaDist, mat.fck, mat.fyk, mat.lapFactor);
    const laps = { stem: lapStem, foot: lapFoot, dist: lapDist };

    const groups = [stem, toe, heel];
    const warnings = groups.filter((x) => x.warn).map((x) => `${x.label}: ${x.warn}`);

    /* --- Donatı geometrisi (model uzayı) — SVG ve DXF ortak kullanır --- */
    const c = mat.cover / 1000;                       // paspayı (m)
    const l0s = lapStem.l0 / 1000;                    // gövde bindirme (m)
    const bendS = Math.max(0.15, 12 * mat.diaStem / 1000);
    const bendF = Math.max(0.15, 12 * mat.diaFoot / 1000);
    const bars = [];
    // Arka yüz x'i (yükseklik y'de) — şevli yüz
    const backX = (y) => xb + (d.xStemBackTop - xb) * ((y - tf) / Hs);

    // (a) FİLİZ — temelden çıkan, alt kancalı, gövde içine l0 kadar uzanır
    const yFilizTop = tf + l0s;
    bars.push({
      layer: 'DONATI', kind: 'filiz',
      label: `Filiz Ø${stem.dia}/${stem.spacing}`,
      poly: [
        { x: xb - c - bendS, y: c },                  // temel içi yatay kanca
        { x: xb - c - 0.035, y: c },                  // (devam donatısından hafif ayrık)
        { x: backX(yFilizTop) - c - 0.035, y: yFilizTop },
      ],
      labelPos: { x: Lt + c + 0.05, y: tf + l0s * 0.5 },
    });
    // (b) GÖVDE DÜŞEY (devam) — temel üstünden gövde tepesine
    bars.push({
      layer: 'DONATI', kind: 'main',
      label: `Ø${stem.dia}/${stem.spacing}`,
      poly: [
        { x: xb - c, y: tf },
        { x: d.xStemBackTop - c, y: H - c },
      ],
      labelPos: { x: backX(tf + Hs * 0.6) - c, y: tf + Hs * 0.6 },
    });
    // Bindirme kotası (filiz ↔ devam)
    bars.push({
      layer: 'YAZI', kind: 'lapdim',
      label: `L₀=${Math.round(lapStem.l0)}`,
      a: { x: xb - c, y: tf }, b: { x: xb - c, y: yFilizTop },
    });
    // (c) GÖVDE ÖN YÜZ nominal düşey donatı
    bars.push({
      layer: 'DONATI', kind: 'sec', label: '',
      poly: [ { x: Lt + c, y: tf }, { x: Lt + c, y: H - c } ],
    });
    // (d) TABAN ALT (ön ökçe → boydan boya, uçları yukarı kancalı)
    bars.push({
      layer: 'DONATI', kind: 'main',
      label: `Ø${toe.dia}/${toe.spacing}`,
      poly: [
        { x: c, y: c + bendF }, { x: c, y: c },
        { x: B - c, y: c }, { x: B - c, y: c + bendF },
      ],
      labelPos: { x: Lt * 0.5 + c, y: c + 0.07 },
    });
    // (e) TABAN ÜST (arka topuk, uçları aşağı kancalı)
    bars.push({
      layer: 'DONATI', kind: 'main',
      label: `Ø${heel.dia}/${heel.spacing}`,
      poly: [
        { x: c, y: tf - c - bendF }, { x: c, y: tf - c },
        { x: B - c, y: tf - c }, { x: B - c, y: tf - c - bendF },
      ],
      labelPos: { x: (xb + B) / 2, y: tf - c - 0.07 },
    });

    // (f) YATAY donatı — gövde iki yüzü (kesite dik → nokta/daire)
    const sh = dist.spacing / 1000;                    // m
    const rDist = (mat.diaDist / 2) / 1000;
    const nStem = Math.max(2, Math.min(16, Math.round((Hs - 0.2) / sh)));
    for (let i = 0; i <= nStem; i++) {
      const yy = tf + 0.1 + (Hs - 0.2) * (i / nStem);
      bars.push({ layer: 'DONATI', kind: 'dot', r: rDist, x: backX(yy) - c, y: yy });
      bars.push({ layer: 'DONATI', kind: 'dot', r: rDist, x: Lt + c, y: yy });
    }
    bars.push({ layer: 'YAZI', kind: 'note',
      label: `Yatay Ø${dist.dia}/${dist.spacing}`,
      labelPos: { x: Lt + c + 0.05, y: tf + Hs * 0.85 } });

    // (g) TABAN boyuna (yatay) donatı — alt ve üst sıra (nokta)
    const nFoot = Math.max(2, Math.min(18, Math.round((B - 0.2) / 0.25)));
    for (let i = 0; i <= nFoot; i++) {
      const xx = c + 0.1 + (B - 0.2) * (i / nFoot);
      bars.push({ layer: 'DONATI', kind: 'dot', r: rDist, x: xx, y: c });
      bars.push({ layer: 'DONATI', kind: 'dot', r: rDist, x: xx, y: tf - c });
    }

    return { type: 'cantilever', groups, dist, laps, bars, warnings,
      filiz: { dia: stem.dia, spacing: stem.spacing, l0: lapStem.l0 },
      moments: { Mstem, M_toe, M_heel, LF } };
  }

  /*
   * Bir donatı pozisyonu için 12 m (stok) çubuktan kesim planı + zayiat.
   *   pieceLen: tek çubuğun boyu (m, kanca/bindirme dahil)
   *   count:    toplam adet
   *   lap:      pieceLen > stok ise eklerde kullanılacak bindirme (m)
   */
  function cutPlan(pieceLen, count, dia, stock, lap) {
    const placed = pieceLen * count;              // net yerleşen boy (m)
    let stockBars, lapExtra = 0, ordered;
    if (pieceLen <= stock) {
      const per = Math.floor(stock / pieceLen);   // bir stoktan kaç parça
      stockBars = Math.ceil(count / per);
    } else {
      // Stoktan uzun: her çubuk eklerle yapılır (her ekte +lap)
      const segs = Math.ceil(pieceLen / stock);
      lapExtra = (segs - 1) * lap * count;
      stockBars = Math.ceil((placed + lapExtra) / stock);
    }
    ordered = stockBars * stock;                  // satın alınan toplam boy (m)
    const waste = ordered - placed - lapExtra;    // fire (artık parçalar)
    return {
      pieceLen, count, placed, lapExtra, stockBars, ordered, waste,
      wastePct: ordered > 0 ? (waste / ordered) * 100 : 0,
      mass: ordered * barMass(dia),               // satın alınan ağırlık (kg)
      netMass: placed * barMass(dia),
    };
  }

  /* =====================================================================
   * METRAJ + DONATI KESİM LİSTESİ (12 m stok, zayiat)
   * ===================================================================== */
  function quantities(geo, rebar, mat, wallLength) {
    const L = wallLength > 0 ? wallLength : 1;
    const stock = mat.stockLength > 0 ? mat.stockLength : 12;
    const d = geo.dims;
    const c = mat.cover / 1000;

    // Beton hacmi (m³/m)
    let concPerM = 0;
    geo.concrete.forEach((cmp) => { concPerM += polyArea(cmp.points); });

    // Kalıp alanı (m²/m)
    let formPerM = 0;
    if (geo.type === 'cantilever') {
      const backLen = Math.hypot(d.Hs, d.tBot - d.tTop);
      formPerM = d.Hs + backLen + 2 * d.tf;
    } else {
      formPerM = d.H + Math.hypot(d.H, d.b - d.a);
    }

    const schedule = [];
    if (rebar && geo.type === 'cantilever') {
      const g = rebar.groups.reduce((o, x) => (o[x.position] = x, o), {});
      const stem = g.stemBack, toe = g.footBot, heel = g.footTop;
      const lapS = rebar.laps.stem.l0 / 1000;
      const lapF = rebar.laps.foot.l0 / 1000;
      const lapD = rebar.laps.dist.l0 / 1000;
      const bendS = Math.max(0.15, 12 * stem.dia / 1000);
      const bendF = Math.max(0.15, 12 * toe.dia / 1000);

      // Enine (kesit düzlemindeki) çubuklar: adet = (1000/s)·L
      const nTrans = (s) => Math.ceil((1000 / s) * L);

      // (1) FİLİZ — temel içi (tf−c + alt kanca) + gövdeye l0 uzantı
      add('Filiz (düşey)', stem.dia, stem.spacing,
        (d.tf - c) + bendS + lapS, nTrans(stem.spacing));
      // (2) GÖVDE DÜŞEY (devam) — gövde boyu + üst paspayı
      add('Gövde düşey (devam)', stem.dia, stem.spacing,
        (d.H - d.tf) - c, nTrans(stem.spacing));
      // (3) GÖVDE ÖN YÜZ nominal (Ø dağıtma, /250)
      add('Gövde ön yüz', rebar.dist.dia, 250,
        (d.H - d.tf) - c, nTrans(250));
      // (4) TABAN ALT (enine) — boydan boya + 2 kanca
      add('Taban alt (enine)', toe.dia, toe.spacing,
        (geo.B - 2 * c) + 2 * bendF, nTrans(toe.spacing));
      // (5) TABAN ÜST (enine) — topuk + gövde + kenetlenme
      add('Taban üst (enine)', heel.dia, heel.spacing,
        Math.min(geo.B - 2 * c, d.Lh + d.tBot + lapF) + bendF, nTrans(heel.spacing));
      // (6) GÖVDE YATAY — duvar boyunca (her iki yüz), adet = katman×2
      const nStemH = Math.max(1, Math.round(d.Hs / (rebar.dist.spacing / 1000))) * 2;
      addLong('Gövde yatay', rebar.dist.dia, rebar.dist.spacing, L, nStemH, lapD);
      // (7) TABAN BOYUNA — duvar boyunca (alt+üst), adet = sıra×2
      const nFootL = Math.max(1, Math.round((geo.B - 2 * c) / 0.25)) * 2;
      addLong('Taban boyuna', rebar.dist.dia, 250, L, nFootL, lapD);

      function add(label, dia, spacing, pieceLen, count) {
        const cp = cutPlan(pieceLen, count, dia, stock, 0);
        schedule.push(Object.assign({ label, dia, spacing, detail: `Ø${dia}/${spacing}` }, cp));
      }
      function addLong(label, dia, spacing, pieceLen, count, lap) {
        const cp = cutPlan(pieceLen, count, dia, stock, lap);
        schedule.push(Object.assign({ label, dia, spacing, detail: `Ø${dia}/${spacing}` }, cp));
      }
    }

    const totMass = schedule.reduce((s, r) => s + r.mass, 0);        // satın alınan
    const totNet = schedule.reduce((s, r) => s + r.netMass, 0);      // net
    const totWaste = schedule.reduce((s, r) => s + r.waste, 0);      // fire (m)
    const totBars = schedule.reduce((s, r) => s + r.stockBars, 0);   // 12 m çubuk adedi
    const totConc = concPerM * L;

    return {
      wallLength: L, stock,
      perMeter: { concrete: concPerM, formwork: formPerM, steel: totMass / L },
      total: { concrete: totConc, formwork: formPerM * L, steel: totMass },
      steelNet: totNet,
      steelWastePct: totMass > 0 ? ((totMass - totNet) / totMass) * 100 : 0,
      cutWasteLen: totWaste,
      stockBars: totBars,
      schedule,
      steelRatio: totConc > 0 ? (totMass / totConc) : 0,             // kg/m³
    };
  }

  function polyArea(points) {
    let a = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], qq = points[(i + 1) % points.length];
      a += p.x * qq.y - qq.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  return { designCantilever, quantities, lapLength, cutPlan, barArea, barMass };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rebar;
}
