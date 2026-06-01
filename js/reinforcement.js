/*
 * reinforcement.js
 * Konsol (betonarme) istinat duvarı — donatı ön tasarımı, poz listesi (açılım),
 * metraj ve kesim/zayiat hesabı.
 *
 * Poz şeması (TS500 uygulama paftalarına uygun):
 *   1  Taban enine üst        (U, kancalı)
 *   2  Taban enine alt        (U, kancalı)
 *   3  Perde ön düşey         (üst kancalı)
 *   4  Perde ön filiz         (L, temelden çıkan)
 *   5  Perde arka düşey       (üst kancalı, ana çekme)
 *   6  Perde arka filiz       (L, temelden çıkan, ana çekme bindirme)
 *   7  Perde ön yatay         (boyuna dağıtma)
 *   8  Perde arka yatay       (boyuna dağıtma)
 *   9  Taban ön üst boyuna
 *   10 Taban (topuk) üst boyuna
 *   11 Taban ön alt boyuna
 *   12 Taban (topuk) alt boyuna
 *   Ç  Çiroz (gövde bağ donatısı)
 *   + Barbakan (drenaj) notu
 *
 * Gösterim: adetØçap/aralık(cm) L=boy(cm). Şekiller gerçek kancalı (90°).
 *
 * NOT: Ön tasarımdır. Kesme/çatlak, gerçek kombinasyonlar ve detaylandırma
 * nihai projede yönetmeliğe göre yapılmalıdır.
 */

const Rebar = (function () {
  'use strict';

  const rad = (d) => (d * Math.PI) / 180;
  const barArea = (dia) => (Math.PI * dia * dia) / 4;        // mm²
  const barMass = (dia) => (dia * dia) / 162;                // kg/m

  /* Kenetlenme ve bindirme (TS500, nervürlü) — mm */
  function lapLength(dia, fck, fyk, lapFactor) {
    const fctk = 0.35 * Math.sqrt(fck);
    const fctd = fctk / 1.5;
    const fyd = fyk / 1.15;
    const lb = Math.max(0.12 * (fyd / fctd) * dia, 20 * dia);
    let l0 = Math.max((lapFactor || 1.4) * lb, 20 * dia, 150);
    l0 = Math.ceil(l0 / 50) * 50;
    return { lb, l0 };
  }

  function integrate(f, a, b, n) {
    if (b <= a) return 0;
    n = n || 40;
    const h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
    return (s * h) / 3;
  }

  function flexAs(Mu_kNm, d, fck, fyk) {
    const b = 1000;
    const fcd = fck / 1.5;
    const fyd = fyk / 1.15;
    const Mu = Math.max(0, Mu_kNm) * 1e6;
    let warn = null;
    if (d <= 0) return { As: 0, warn: 'Faydalı yükseklik ≤ 0', fcd, fyd, m: 0 };
    let m = Mu / (b * d * d * fcd);
    if (m > 0.295) { warn = 'Kesit yetersiz: tek sıra donatı yetmiyor — kalınlığı artırın.'; m = 0.295; }
    const omega = 1 - Math.sqrt(Math.max(0, 1 - 2 * m));
    const As = (omega * b * d * fcd) / fyd;
    return { As, warn, fcd, fyd, m };
  }

  function chooseSpacing(AsReq, dia, sMin, sMax, step) {
    sMin = sMin || 100; sMax = sMax || 250; step = step || 10;
    const a1 = barArea(dia);
    let s = (!(AsReq > 0)) ? sMax : Math.floor((1000 * a1) / AsReq / step) * step;
    if (!isFinite(s) || s > sMax) s = sMax;
    if (s < sMin) s = sMin;
    return { s, AsProv: (1000 / s) * a1, a1 };
  }

  function designGroup(label, position, Mu, thickness_m, dia, mat, opts) {
    opts = opts || {};
    const d = thickness_m * 1000 - mat.cover - dia / 2;
    const flex = flexAs(Mu, d, mat.fck, mat.fyk);
    const rhoMin = opts.rhoMin != null ? opts.rhoMin : 0.0020;
    const AsMin = rhoMin * 1000 * d;
    const AsReq = Math.max(flex.As, AsMin);
    const sel = chooseSpacing(AsReq, dia, opts.sMin, opts.sMax);
    return {
      label, position, Mu, d, dia, spacing: sel.s,
      AsFlex: flex.As, AsMin, AsReq, AsProv: sel.AsProv,
      governedByMin: AsMin > flex.As, warn: flex.warn,
    };
  }

  /* ---- Şekil (açılım) yardımcıları — yerel koordinat, cm ---- */
  const sgo = (x1, y1, x2, y2) => ({ x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1) });
  const shpDuz = (L) => ({ type: 'duz', segs: [sgo(0, 0, L, 0)] });
  const shpL = (v, h) => ({ type: 'L', segs: [sgo(0, 0, 0, v), sgo(0, 0, h, 0)] });        // düşey v + alt yatay h (filiz)
  const shpU = (w, h, dir) => ({ type: 'U', segs: [sgo(0, 0, w, 0), sgo(0, 0, 0, (dir || 1) * h), sgo(w, 0, w, (dir || 1) * h)] });
  const shpTop = (v, hk) => ({ type: 'Ltop', segs: [sgo(0, 0, 0, v), sgo(0, v, hk, v)] });   // düşey v + üst kanca hk

  /* =====================================================================
   * KONSOL DUVARI — DONATI TASARIMI + POZ LİSTESİ
   * ===================================================================== */
  function designCantilever(geo, model, res, mat) {
    const d = geo.dims;
    const Ka = res.Ka, g = model.gammaSoil, q = model.q || 0, LF = mat.loadFactor;
    const gc = (geo.concrete[0] && geo.concrete[0].gamma) || 24;
    const cosB = Math.cos(rad(model.beta || 0));
    const B = geo.B, H = d.H, tf = d.tf, Hs = d.Hs, Lt = d.Lt, Lh = d.Lh;
    const xb = d.xStemBackBot;

    /* 1) GÖVDE çekme */
    const Mstem = (0.5 * Ka * g * Hs * Hs * (Hs / 3) + Ka * q * Hs * (Hs / 2)) * cosB;
    const stem = designGroup('Gövde düşey (çekme)', 'stemBack', LF * Mstem, d.tBot, mat.diaStem, mat);

    /* Taban basıncı (servis) */
    let qAt;
    if (res.pressureValid) qAt = (x) => res.qMax - (res.qMax - res.qMin) * (x / B);
    else { const aLen = Math.max(3 * res.xbar, 1e-6); qAt = (x) => (x <= aLen ? res.qMax * (1 - x / aLen) : 0); }

    /* 2) ÖN ÖKÇE */
    const wSlab = gc * tf;
    const M_toe = integrate((x) => (qAt(x) - wSlab) * (Lt - x), 0, Lt, 40);
    const toe = designGroup('Taban alt (ön ökçe)', 'footBot', LF * Math.max(0, M_toe), tf, mat.diaFoot, mat);

    /* 3) ARKA TOPUK */
    const wDown = g * (H - tf) + q + wSlab;
    const M_heel = integrate((x) => (wDown - qAt(x)) * (x - xb), xb, B, 40);
    const heel = designGroup('Taban üst (arka topuk)', 'footTop', LF * Math.max(0, M_heel), tf, mat.diaFoot, mat);

    /* 4) YATAY / DAĞITMA */
    const AsDistReq = Math.max(0.20 * stem.AsProv, 0.0015 * 1000 * (d.tBot * 1000 - mat.cover));
    const distSel = chooseSpacing(AsDistReq, mat.diaDist, 100, 300);
    const dist = { label: 'Yatay / dağıtma', position: 'dist', dia: mat.diaDist, spacing: distSel.s, AsReq: AsDistReq, AsProv: distSel.AsProv };

    /* Bindirmeler */
    const laps = {
      stem: lapLength(mat.diaStem, mat.fck, mat.fyk, mat.lapFactor),
      foot: lapLength(mat.diaFoot, mat.fck, mat.fyk, mat.lapFactor),
      dist: lapLength(mat.diaDist, mat.fck, mat.fyk, mat.lapFactor),
    };
    const groups = [stem, toe, heel];
    const warnings = groups.filter((x) => x.warn).map((x) => `${x.label}: ${x.warn}`);

    /* ---- Ortak boyutlar ---- */
    const c = mat.cover / 1000;
    const L = mat.wallLength > 0 ? mat.wallLength : 1;
    const lapS = laps.stem.l0 / 1000, lapDi = laps.dist.l0 / 1000, lapF = laps.foot.l0 / 1000;
    const hookS = Math.max(0.15, 12 * mat.diaStem / 1000);
    const hookFr = Math.max(0.15, 12 * mat.diaDist / 1000);
    const hookB = Math.max(0.10, tf - 2 * c);             // taban içi düşey kanca
    const backX = (y) => xb + (d.xStemBackTop - xb) * ((y - tf) / Hs);

    const ciroz = { sH: mat.cirozH || 50, sV: mat.cirozV || 50, dia: mat.diaCiroz || 8 };
    const barb = { dia: mat.barbakanDia || 100, s: mat.barbakanS || 100 };

    const cm = (m) => Math.round(m * 100);
    const spCm = (mm) => Math.round(mm / 10);
    const callout = (n, dia, sp, Lc) => `${n}Ø${dia}/${spCm(sp)} L=${Math.round(Lc)}`;
    const nLen = (sp) => Math.ceil((L * 1000) / sp) + 1;        // boy yönünde adet
    const nAcr = (dim, sp) => Math.max(2, Math.ceil((dim * 1000) / sp) + 1);

    const sBase = Math.min(toe.spacing, heel.spacing);
    const sLong = 230;
    const pozlar = [];
    const addP = (poz, name, face, dia, sp, count, shape, axis) => {
      const Lc = axis === 'len' ? cm(L) : shape.segs.reduce((s, x) => s + x.len, 0);
      pozlar.push({ poz, name, face, dia, spacing: sp, count, shape, axis, Lcm: Lc, detail: `Ø${dia}/${spCm(sp)}`, callout: callout(count, dia, sp, Lc) });
    };

    // 1-2 Taban enine (U) — üst kancalar aşağı, alt kancalar yukarı
    addP('1', 'Taban enine üst', '', mat.diaFoot, sBase, nLen(sBase), shpU(cm(B - 2 * c), cm(hookB), -1), 'across');
    addP('2', 'Taban enine alt', '', mat.diaFoot, sBase, nLen(sBase), shpU(cm(B - 2 * c), cm(hookB), 1), 'across');
    // 3-4 Perde ön düşey + filiz
    addP('3', 'Perde ön düşey', 'Ön', mat.diaDist, stem.spacing, nLen(stem.spacing), shpTop(cm(Hs - c), cm(hookFr)), 'across');
    addP('4', 'Perde ön filiz', 'Ön', mat.diaDist, stem.spacing, nLen(stem.spacing), shpL(cm((tf - 2 * c) + lapDi), cm(hookFr)), 'across');
    // 5-6 Perde arka düşey (ana) + filiz
    addP('5', 'Perde arka düşey', 'Arka', mat.diaStem, stem.spacing, nLen(stem.spacing), shpTop(cm(Hs - c), cm(hookS)), 'across');
    addP('6', 'Perde arka filiz', 'Arka', mat.diaStem, stem.spacing, nLen(stem.spacing), shpL(cm((tf - 2 * c) + lapS), cm(hookS)), 'across');
    // 7-8 Perde yatay (boyuna)
    addP('7', 'Perde ön yatay', 'Ön', mat.diaDist, dist.spacing, nAcr(Hs, dist.spacing), shpDuz(cm(L)), 'len');
    addP('8', 'Perde arka yatay', 'Arka', mat.diaDist, dist.spacing, nAcr(Hs, dist.spacing), shpDuz(cm(L)), 'len');
    // 9-12 Taban boyuna
    addP('9', 'Taban ön üst boyuna', '', mat.diaDist, sLong, nAcr(Lt, sLong), shpDuz(cm(L)), 'len');
    addP('10', 'Taban üst boyuna', '', mat.diaDist, sLong, nAcr(Lh, sLong), shpDuz(cm(L)), 'len');
    addP('11', 'Taban ön alt boyuna', '', mat.diaDist, sLong, nAcr(Lt, sLong), shpDuz(cm(L)), 'len');
    addP('12', 'Taban alt boyuna', '', mat.diaDist, sLong, nAcr(Lh, sLong), shpDuz(cm(L)), 'len');
    // Çiroz
    const nCiroz = Math.ceil(Hs / (ciroz.sV / 100)) * Math.ceil(L / (ciroz.sH / 100));
    addP('Ç', 'Çiroz', '', ciroz.dia, ciroz.sH * 10, nCiroz, shpU(cm(d.tBot - 2 * c), cm(0.06), 1), 'across');

    const notes = {
      ciroz: `Yatayda ${ciroz.sH}cm, düşeyde ${ciroz.sV}cm aralıkla çiroz (Ø${ciroz.dia})`,
      barbakan: `Ø${barb.dia} barbakan; yatay/düşey ${barb.s}cm aralıkla`,
      barbData: barb, cirozData: ciroz,
    };

    /* ---- KESİT donatı geometrisi (metre) ---- */
    const bars = [];
    // P2 taban alt U (kancalar yukarı)
    bars.push({ kind: 'main', poz: '2', label: `Ø${mat.diaFoot}/${spCm(sBase)}`, poly: [{ x: c, y: c + hookB }, { x: c, y: c }, { x: B - c, y: c }, { x: B - c, y: c + hookB }], labelPos: { x: Lt * 0.5 + c, y: c + 0.06 } });
    // P1 taban üst U (kancalar aşağı)
    bars.push({ kind: 'main', poz: '1', label: `Ø${mat.diaFoot}/${spCm(sBase)}`, poly: [{ x: c, y: tf - c - hookB }, { x: c, y: tf - c }, { x: B - c, y: tf - c }, { x: B - c, y: tf - c - hookB }], labelPos: { x: (xb + B) / 2, y: tf - c - 0.06 } });
    // P6 arka filiz
    bars.push({ kind: 'filiz', poz: '6', label: `Ø${mat.diaStem}/${spCm(stem.spacing)}`, poly: [{ x: xb - c - hookS, y: c }, { x: xb - c - 0.03, y: c }, { x: backX(tf + lapS) - c - 0.03, y: tf + lapS }], labelPos: { x: Lt + c + 0.04, y: tf + lapS * 0.5 } });
    // P5 arka ana düşey
    bars.push({ kind: 'main', poz: '5', label: `Ø${mat.diaStem}/${spCm(stem.spacing)}`, poly: [{ x: xb - c, y: tf }, { x: d.xStemBackTop - c, y: H - c }], labelPos: { x: backX(tf + Hs * 0.62) - c, y: tf + Hs * 0.62 } });
    // P4 ön filiz
    bars.push({ kind: 'filiz', poz: '4', label: `Ø${mat.diaDist}/${spCm(stem.spacing)}`, poly: [{ x: Lt + c + hookFr, y: c }, { x: Lt + c + 0.03, y: c }, { x: Lt + c + 0.03, y: tf + lapDi }] });
    // P3 ön düşey
    bars.push({ kind: 'sec', poz: '3', label: `Ø${mat.diaDist}/${spCm(stem.spacing)}`, poly: [{ x: Lt + c, y: tf }, { x: Lt + c, y: H - c }], labelPos: { x: Lt + c - 0.02, y: tf + Hs * 0.4 } });
    // Bindirme kotası (filiz↔ana)
    bars.push({ kind: 'lapdim', label: `L₀=${Math.round(laps.stem.l0)}`, a: { x: xb - c, y: tf }, b: { x: xb - c, y: tf + lapS } });

    // P7/P8 yatay donatı (kesite dik → daire), front & back yüz boyunca
    const sh = dist.spacing / 1000, rD = Math.max(0.006, mat.diaDist / 2 / 1000);
    const nStem = Math.max(2, Math.min(20, Math.round((Hs - 0.2) / sh)));
    for (let i = 0; i <= nStem; i++) {
      const yy = tf + 0.1 + (Hs - 0.2) * (i / nStem);
      bars.push({ kind: 'dot', r: rD, x: backX(yy) - c, y: yy });   // arka (P8)
      bars.push({ kind: 'dot', r: rD, x: Lt + c, y: yy });          // ön (P7)
    }
    bars.push({ kind: 'note', poz: '8', label: `Arka Ø${mat.diaDist}/${spCm(dist.spacing)}`, labelPos: { x: backX(tf + Hs * 0.85) - c + 0.04, y: tf + Hs * 0.85 } });
    bars.push({ kind: 'note', poz: '7', label: `Ön Ø${mat.diaDist}/${spCm(dist.spacing)}`, labelPos: { x: Lt + c - 0.34, y: tf + Hs * 0.3 } });

    // P9-12 taban boyuna (daire) — üst sıra (9,10) ve alt sıra (11,12)
    const nFoot = Math.max(2, Math.min(22, Math.round((B - 0.2) / 0.23)));
    for (let i = 0; i <= nFoot; i++) {
      const xx = c + 0.1 + (B - 0.2) * (i / nFoot);
      bars.push({ kind: 'dot', r: rD, x: xx, y: c });          // alt (11/12)
      bars.push({ kind: 'dot', r: rD, x: xx, y: tf - c });     // üst (9/10)
    }

    // Çiroz işaretleri (gövde ön-arka yüz arası bağ)
    const nCz = Math.max(1, Math.round(Hs / (ciroz.sV / 100)));
    for (let i = 1; i < nCz; i++) {
      const yy = tf + (Hs) * (i / nCz);
      bars.push({ kind: 'ciroz', x1: Lt + c, x2: backX(yy) - c, y: yy });
    }
    bars.push({ kind: 'note', poz: 'Ç', label: `Çiroz Ø${ciroz.dia} (${ciroz.sH}/${ciroz.sV})`, labelPos: { x: Lt - 0.02, y: tf + Hs * 0.5 }, side: 'left' });

    // Barbakan (drenaj) — gövde ortasında simge
    bars.push({ kind: 'barbakan', x: (Lt + backX(tf + Hs * 0.45)) / 2, y: tf + Hs * 0.45, label: `Ø${barb.dia} barbakan` });

    return {
      type: 'cantilever', groups, dist, laps, bars, warnings, pozlar, notes,
      filiz: { dia: stem.dia, spacing: stem.spacing, l0: laps.stem.l0 },
      moments: { Mstem, M_toe, M_heel, LF },
      geomCache: { c, L, hookB, sBase, sLong, dist, stem, ciroz, barb },
    };
  }

  /* Kesim planı + zayiat (stok çubuk) */
  function cutPlan(pieceLen, count, dia, stock, lap) {
    const placed = pieceLen * count;
    let stockBars, lapExtra = 0;
    if (pieceLen <= stock) stockBars = Math.ceil(count / Math.floor(stock / pieceLen));
    else { const segs = Math.ceil(pieceLen / stock); lapExtra = (segs - 1) * lap * count; stockBars = Math.ceil((placed + lapExtra) / stock); }
    const ordered = stockBars * stock;
    const waste = ordered - placed - lapExtra;
    return { pieceLen, count, placed, lapExtra, stockBars, ordered, waste, wastePct: ordered > 0 ? (waste / ordered) * 100 : 0, mass: ordered * barMass(dia), netMass: placed * barMass(dia) };
  }

  /* =====================================================================
   * METRAJ + KESİM LİSTESİ — poz listesinden
   * ===================================================================== */
  function quantities(geo, rebar, mat, wallLength) {
    const L = wallLength > 0 ? wallLength : 1;
    const stock = mat.stockLength > 0 ? mat.stockLength : 12;
    const d = geo.dims;

    let concPerM = 0;
    geo.concrete.forEach((cmp) => { concPerM += polyArea(cmp.points); });
    let formPerM;
    if (geo.type === 'cantilever' || geo.type === 'lwall') formPerM = d.Hs + Math.hypot(d.Hs, d.tBot - d.tTop) + 2 * d.tf;
    else formPerM = d.H + Math.hypot(d.H, d.b - d.a);

    const schedule = [];
    if (rebar && rebar.pozlar) {
      const lapD = rebar.laps.dist.l0 / 1000;
      rebar.pozlar.forEach((p) => {
        const pieceLen = p.axis === 'len' ? L : p.Lcm / 100;
        const lap = p.axis === 'len' ? lapD : 0;
        const cp = cutPlan(pieceLen, p.count, p.dia, stock, lap);
        schedule.push(Object.assign({ poz: p.poz, label: p.name, face: p.face, dia: p.dia, spacing: p.spacing, detail: p.detail, callout: p.callout, shape: p.shape }, cp));
      });
    }

    const totMass = schedule.reduce((s, r) => s + r.mass, 0);
    const totNet = schedule.reduce((s, r) => s + r.netMass, 0);
    const totWaste = schedule.reduce((s, r) => s + r.waste, 0);
    const totBars = schedule.reduce((s, r) => s + r.stockBars, 0);
    const totConc = concPerM * L;

    return {
      wallLength: L, stock,
      perMeter: { concrete: concPerM, formwork: formPerM, steel: totMass / L },
      total: { concrete: totConc, formwork: formPerM * L, steel: totMass },
      steelNet: totNet,
      steelWastePct: totMass > 0 ? ((totMass - totNet) / totMass) * 100 : 0,
      cutWasteLen: totWaste, stockBars: totBars, schedule,
      steelRatio: totConc > 0 ? (totMass / totConc) : 0,
      notes: rebar ? rebar.notes : null,
    };
  }

  function polyArea(points) {
    let a = 0;
    for (let i = 0; i < points.length; i++) { const p = points[i], qq = points[(i + 1) % points.length]; a += p.x * qq.y - qq.x * p.y; }
    return Math.abs(a) / 2;
  }

  return { designCantilever, quantities, lapLength, cutPlan, barArea, barMass };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rebar;
}
