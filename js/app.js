/*
 * app.js
 * Arayüz mantığı: ölçüleri okur, geometriyi kurar, hesabı çalıştırır,
 * çizimi ve sonuç tablosunu üretir.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const num = (id) => parseFloat($(id).value);
  const fmt = (v, n = 2) =>
    (v === Infinity ? '∞' : (Math.round(v * Math.pow(10, n)) / Math.pow(10, n)).toFixed(n));

  // Duvar tipine göre görünür alanlar
  function setWallType(type) {
    document.querySelectorAll('[data-type]').forEach((el) => {
      el.style.display = el.dataset.type === type ? '' : 'none';
    });
    document.querySelectorAll('.type-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.type === type);
    });
    app.type = type;
  }

  function readCommon() {
    return {
      gammaConcrete: num('gammaConcrete'),
      gammaSoil: num('gammaSoil'),
      phi: num('phi'),
      beta: num('beta'),
      q: num('q'),
      baseFrictionDeg: $('baseFriction').value ? num('baseFriction') : num('phi'),
      sigmaAllow: num('sigmaAllow'),
      fsOtMin: num('fsOtMin'),
      fsSlMin: num('fsSlMin'),
    };
  }

  function readCantilever() {
    return Object.assign(readCommon(), {
      H: num('c_H'), tf: num('c_tf'), Lt: num('c_Lt'),
      Lh: num('c_Lh'), tTop: num('c_tTop'), tBot: num('c_tBot'),
    });
  }

  function readLwall() {
    return Object.assign(readCommon(), {
      H: num('l_H'), tf: num('l_tf'), Lt: 0,
      Lh: num('l_Lh'), tTop: num('l_tTop'), tBot: num('l_tBot'),
    });
  }

  function readCounterfort() {
    return Object.assign(readCommon(), {
      H: num('cf_H'), tf: num('cf_tf'), Lt: num('cf_Lt'), Lh: num('cf_Lh'),
      tStem: num('cf_tStem'), s: num('cf_s'), tc: num('cf_tc'),
    });
  }

  function readMaterial() {
    return {
      fck: num('fck'), fyk: num('fyk'), cover: num('cover'),
      loadFactor: num('loadFactor'),
      diaStem: num('diaStem'), diaFoot: num('diaFoot'), diaDist: num('diaDist'),
      lapFactor: num('lapFactor'), stockLength: num('stockLength'),
      wallLength: num('wallLength'),
      diaCiroz: num('diaCiroz'), cirozH: num('cirozH'), cirozV: num('cirozV'),
      barbakanDia: num('barbakanDia'), barbakanS: num('barbakanS'),
      showRebar: $('showRebar').checked,
    };
  }

  function readGravity() {
    return Object.assign(readCommon(), {
      H: num('g_H'), a: num('g_a'), b: num('g_b'),
    });
  }

  function validate(d, type) {
    const errs = [];
    const pos = (v, name) => { if (!(v > 0)) errs.push(`${name} pozitif olmalı.`); };
    pos(d.H, 'Yükseklik H');
    pos(d.gammaSoil, 'Dolgu birim ağırlığı');
    pos(d.gammaConcrete, 'Beton birim ağırlığı');
    pos(d.sigmaAllow, 'Zemin emniyet gerilmesi');
    if (!(d.phi > 0 && d.phi < 45)) errs.push('Sürtünme açısı φ 0–45° arası olmalı.');
    if (type === 'counterfort') {
      pos(d.tf, 'Temel kalınlığı'); pos(d.tStem, 'Gövde kalınlığı');
      pos(d.Lh, 'Arka topuk Lh'); pos(d.s, 'Payanda aralığı s'); pos(d.tc, 'Payanda kalınlığı tc');
      if (d.tf >= d.H) errs.push('Temel kalınlığı toplam yükseklikten küçük olmalı.');
      if (d.tc > d.s) errs.push('Payanda kalınlığı tc, aralık s’den büyük olamaz.');
      if (!(d.Lt >= 0)) errs.push('Ön ökçe negatif olamaz.');
    } else if (type === 'cantilever' || type === 'lwall') {
      pos(d.tf, 'Temel kalınlığı'); pos(d.tBot, 'Gövde alt kalınlığı');
      pos(d.Lh, 'Arka topuk Lh');
      if (d.tf >= d.H) errs.push('Temel kalınlığı toplam yükseklikten küçük olmalı.');
      if (d.tTop > d.tBot) errs.push('Gövde üst kalınlığı, alt kalınlıktan büyük olamaz.');
      if (!(d.Lt >= 0 && d.Lh >= 0)) errs.push('Ökçe/topuk uzunlukları negatif olamaz.');
    } else {
      pos(d.b, 'Alt genişlik b');
      if (d.a > d.b) errs.push('Üst genişlik a, alt genişlik b’den büyük olamaz.');
      if (!(d.a >= 0)) errs.push('Üst genişlik negatif olamaz.');
    }
    return errs;
  }

  let lastSVG = '';
  const last = { geo: null, rebar: null, mat: null, quant: null, details: null };

  function run() {
    const type = app.type;
    const d = type === 'gravity' ? readGravity()
      : (type === 'lwall' ? readLwall()
        : (type === 'counterfort' ? readCounterfort() : readCantilever()));

    const errs = validate(d, type);
    const msg = $('messages');
    if (errs.length) {
      msg.className = 'messages error';
      msg.innerHTML = '<strong>Girdi hatası:</strong><ul>' +
        errs.map((e) => `<li>${e}</li>`).join('') + '</ul>';
      return;
    }
    msg.className = 'messages';
    msg.textContent = '';

    const hasRebar = (type === 'cantilever' || type === 'lwall' || type === 'counterfort');
    const geo = type === 'gravity' ? Geometry.gravity(d)
      : (type === 'lwall' ? Geometry.lwall(d)
        : (type === 'counterfort' ? Geometry.counterfort(d) : Geometry.cantilever(d)));
    const model = Geometry.toAnalysisModel(geo, d);
    const res = Eng.analyze(model);

    const mat = readMaterial();
    const rebar = type === 'counterfort' ? Rebar.designCounterfort(geo, model, res, mat)
      : (hasRebar ? Rebar.designCantilever(geo, model, res, mat) : null);
    const quant = Rebar.quantities(geo, rebar, mat, mat.wallLength);
    const details = (rebar && hasRebar) ? Details.build(geo, rebar, mat) : null;

    last.geo = geo; last.rebar = rebar; last.mat = mat; last.quant = quant; last.details = details;

    lastSVG = Draw.render(geo, {
      showPressure: true,
      interactive: true,
      rebar: (mat.showRebar && rebar) ? rebar : null,
    });
    $('drawing').innerHTML = lastSVG;
    $('schedule').innerHTML = Draw.renderSchedule(
      rebar ? quant.schedule : [], { stock: mat.stockLength, notes: quant.notes });
    $('detailElevation').innerHTML = Details.renderSVG(details ? details.elevation : null);
    $('detailPlan').innerHTML = Details.renderSVG(details ? details.plan : null);

    renderResults(res, geo, rebar, quant);
  }

  function rebarSection(rebar, geo) {
    if (geo.type !== 'cantilever' || !rebar) {
      return `<h3>Donatı</h3>
        <p class="note">Ağırlık duvarı donatısız (sade beton) olarak tasarlanır;
        donatı hesabı yalnızca konsol (betonarme) tip için yapılır.</p>`;
    }
    const grp = (g) => `
      <tr class="${g.warn ? 'r-fail' : ''}">
        <td>${g.label}</td>
        <td class="numv">${fmt(g.Mu, 1)}</td>
        <td class="numv">${Math.round(g.AsReq)}</td>
        <td class="numv"><strong>Ø${g.dia}/${g.spacing}</strong></td>
        <td class="numv">${Math.round(g.AsProv)}${g.governedByMin ? ' *' : ''}</td>
      </tr>`;
    const warnHtml = rebar.warnings.length
      ? `<div class="messages error" style="margin:8px 0">⚠ ${rebar.warnings.join('<br>')}</div>`
      : '';
    const L = rebar.laps;
    const lapRow = (lbl, lp, dia) => `
      <tr><td>${lbl} (Ø${dia})</td>
        <td class="numv">${Math.round(lp.lb)} mm</td>
        <td class="numv"><strong>${Math.round(lp.l0)} mm</strong> (≈${Math.round(lp.l0 / dia)}Ø)</td></tr>`;
    return `
      <h3>Donatı (ön tasarım)</h3>
      ${warnHtml}
      <table class="res-table small">
        <thead><tr><th>Konum</th><th>M_d (kNm/m)</th><th>As,ger (mm²/m)</th>
          <th>Seçim</th><th>As,var (mm²/m)</th></tr></thead>
        <tbody>
          <tr><td>Filiz (düşey, temelden)</td><td class="numv">—</td>
            <td class="numv">= gövde</td>
            <td class="numv"><strong>Ø${rebar.filiz.dia}/${rebar.filiz.spacing}</strong></td>
            <td class="numv">l₀=${Math.round(rebar.filiz.l0)} mm</td></tr>
          ${rebar.groups.map(grp).join('')}
          <tr><td>${rebar.dist.label}</td><td class="numv">—</td>
            <td class="numv">${Math.round(rebar.dist.AsReq)}</td>
            <td class="numv"><strong>Ø${rebar.dist.dia}/${rebar.dist.spacing}</strong></td>
            <td class="numv">${Math.round(rebar.dist.AsProv)}</td></tr>
        </tbody>
      </table>

      <h3>Bindirme (ek) Boyları <small>TS500</small></h3>
      <table class="res-table small">
        <thead><tr><th>Donatı</th><th>ℓb (kenetlenme)</th><th>ℓ₀ (bindirme)</th></tr></thead>
        <tbody>
          ${lapRow('Gövde / filiz', L.stem, rebar.filiz.dia)}
          ${lapRow('Temel', L.foot, rebar.groups[1].dia)}
          ${lapRow('Yatay / dağıtma', L.dist, rebar.dist.dia)}
        </tbody>
      </table>
      <p class="note">* minimum donatı belirleyici. Yük katsayısı = ${fmt(rebar.moments.LF, 2)}.
      Filiz, gövde düşey donatısıyla ℓ₀ kadar bindirmeli eklenir. Kesme/çatlak
      kontrolü ve çiroz dahil değildir.</p>`;
  }

  function quantitySection(quant) {
    const q = quant;
    const cut = q.schedule.length ? `
      <h3>Donatı Kesim Listesi <small>(stok ${fmt(q.stock, 0)} m)</small></h3>
      <table class="res-table small">
        <thead><tr><th>Poz</th><th>Çap/Aralık</th><th>Boy (m)</th><th>Adet</th>
          <th>${fmt(q.stock, 0)}m çubuk</th><th>Fire (m)</th><th>kg</th></tr></thead>
        <tbody>
          ${q.schedule.map((r) => `
          <tr><td>${r.label}</td><td>${r.detail}</td>
            <td class="numv">${fmt(r.pieceLen, 2)}</td>
            <td class="numv">${r.count}</td>
            <td class="numv">${r.stockBars}</td>
            <td class="numv">${fmt(r.waste, 1)} (${fmt(r.wastePct, 0)}%)</td>
            <td class="numv">${fmt(r.mass, 0)}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="note">Filiz ve gövde devam donatısı ayrı pozlardır; uzun (yatay)
      donatılarda stok boyu aşıldığında bindirme payı eklenir.</p>` : '';

    return `
      <h3>Metraj <small>(L = ${fmt(q.wallLength, 1)} m)</small></h3>
      <table class="res-table small">
        <thead><tr><th>Kalem</th><th>Birim/m</th><th>Toplam</th></tr></thead>
        <tbody>
          <tr><td>Beton hacmi</td><td class="numv">${fmt(q.perMeter.concrete, 3)} m³/m</td>
            <td class="numv"><strong>${fmt(q.total.concrete, 2)} m³</strong></td></tr>
          <tr><td>Kalıp alanı</td><td class="numv">${fmt(q.perMeter.formwork, 2)} m²/m</td>
            <td class="numv"><strong>${fmt(q.total.formwork, 2)} m²</strong></td></tr>
          <tr><td>Donatı (net)</td><td class="numv">—</td>
            <td class="numv">${fmt(q.steelNet, 1)} kg</td></tr>
          <tr><td>Donatı (fireli, sipariş)</td><td class="numv">${fmt(q.perMeter.steel, 1)} kg/m</td>
            <td class="numv"><strong>${fmt(q.total.steel, 1)} kg</strong></td></tr>
          ${q.stockBars ? `<tr><td>${fmt(q.stock, 0)} m çubuk adedi</td><td class="numv">—</td>
            <td class="numv"><strong>${q.stockBars} adet</strong></td></tr>` : ''}
          ${q.stockBars ? `<tr><td>Zayiat (fire) oranı</td><td class="numv">${fmt(q.cutWasteLen, 1)} m</td>
            <td class="numv">${fmt(q.steelWastePct, 1)}%</td></tr>` : ''}
          ${q.steelRatio ? `<tr><td>Donatı oranı</td><td class="numv">—</td>
            <td class="numv">${fmt(q.steelRatio, 1)} kg/m³</td></tr>` : ''}
        </tbody>
      </table>
      ${cut}`;
  }

  function renderResults(res, geo, rebar, quant) {
    const c = res.checks;
    const badge = (ok) => ok
      ? '<span class="badge ok">UYGUN ✓</span>'
      : '<span class="badge fail">YETERSİZ ✗</span>';

    const row = (chk, dec = 2) => `
      <tr class="${chk.ok ? 'r-ok' : 'r-fail'}">
        <td>${chk.label}</td>
        <td class="numv">${fmt(chk.value, dec)} ${chk.unit}</td>
        <td class="numv">${chk.required != null ? '≥ ' + fmt(chk.required, dec) + ' ' + chk.unit : ''}</td>
        <td>${badge(chk.ok)}</td>
      </tr>`;

    // Zemin gerilmesi için "≤" gösterimi
    const bearingRow = `
      <tr class="${c.bearing.ok ? 'r-ok' : 'r-fail'}">
        <td>${c.bearing.label}</td>
        <td class="numv">${fmt(c.bearing.value, 1)} kPa</td>
        <td class="numv">≤ ${fmt(c.bearing.required, 1)} kPa</td>
        <td>${badge(c.bearing.ok)}</td>
      </tr>`;

    const eccRow = `
      <tr class="${c.eccentricity.ok ? 'r-ok' : 'r-fail'}">
        <td>${c.eccentricity.label}</td>
        <td class="numv">${fmt(c.eccentricity.value, 3)} m</td>
        <td class="numv">≤ ${fmt(c.eccentricity.required, 3)} m</td>
        <td>${badge(c.eccentricity.ok)}</td>
      </tr>`;

    const comps = res.components.map((k) => `
      <tr>
        <td>${k.label}</td>
        <td class="numv">${k.weight.toFixed(2)}</td>
        <td class="numv">${k.arm.toFixed(3)}</td>
        <td class="numv">${k.moment.toFixed(2)}</td>
      </tr>`).join('');

    $('results').innerHTML = `
      <div class="overall ${res.allOk ? 'ok' : 'fail'}">
        ${res.allOk ? '✓ Tüm kontroller sağlandı — kesit uygun.'
                    : '✗ En az bir kontrol sağlanmadı — kesiti revize edin.'}
      </div>

      <h3>Güvenlik Kontrolleri</h3>
      <table class="res-table">
        <thead><tr><th>Kontrol</th><th>Değer</th><th>Sınır</th><th>Durum</th></tr></thead>
        <tbody>
          ${row(c.overturning)}
          ${row(c.sliding)}
          ${bearingRow}
          ${eccRow}
        </tbody>
      </table>

      <h3>Toprak İtkisi ve Yükler</h3>
      <table class="res-table small">
        <tbody>
          <tr><td>Aktif itki katsayısı Ka</td><td class="numv">${fmt(res.Ka, 3)}</td></tr>
          <tr><td>Aktif itki Pa</td><td class="numv">${fmt(res.Pa, 2)} kN/m</td></tr>
          <tr><td>Sürşarj itkisi Pq</td><td class="numv">${fmt(res.Pq, 2)} kN/m</td></tr>
          <tr><td>Yatay itki ΣPh</td><td class="numv">${fmt(res.Ph, 2)} kN/m</td></tr>
          <tr><td>Toplam düşey yük ΣV</td><td class="numv">${fmt(res.sumV, 2)} kN/m</td></tr>
          <tr><td>Tutucu moment Mr</td><td class="numv">${fmt(res.Mr, 2)} kNm/m</td></tr>
          <tr><td>Devirici moment Mo</td><td class="numv">${fmt(res.Mo, 2)} kNm/m</td></tr>
          <tr><td>Dış merkezlik e</td><td class="numv">${fmt(res.e, 3)} m</td></tr>
          <tr><td>Taban gerilmeleri σ_max / σ_min</td><td class="numv">${fmt(res.qMax, 1)} / ${fmt(res.qMin, 1)} kPa</td></tr>
        </tbody>
      </table>

      <h3>Yük Bileşenleri (taban ön ucuna göre moment)</h3>
      <table class="res-table small">
        <thead><tr><th>Bileşen</th><th>W (kN/m)</th><th>x̄ (m)</th><th>M (kNm/m)</th></tr></thead>
        <tbody>${comps}</tbody>
      </table>

      ${rebarSection(rebar, geo)}
      ${quantitySection(quant)}
    `;
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSVG() {
    if (!lastSVG) run();
    if (!lastSVG) return;
    downloadBlob(lastSVG, `istinat_duvari_${app.type}.svg`, 'image/svg+xml');
  }

  function downloadDXF() {
    if (!last.geo) run();
    if (!last.geo) return;
    const dxf = DXF.build(last.geo, last.rebar, last.quant, { details: last.details });
    downloadBlob(dxf, `istinat_duvari_${app.type}.dxf`, 'application/dxf');
  }

  const app = { type: 'cantilever' };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.type-btn').forEach((b) =>
      b.addEventListener('click', () => { setWallType(b.dataset.type); run(); }));
    $('btnCalc').addEventListener('click', run);
    $('btnDXF').addEventListener('click', downloadDXF);
    $('btnDownload').addEventListener('click', downloadSVG);
    $('btnPrint').addEventListener('click', () => window.print());

    // Önizleme üzerinden ölçü düzenleme (tıkla-düzenle + sürükleme)
    if (typeof Interactive !== 'undefined') {
      Interactive.attach({
        host: $('drawing'),
        getInput: (id) => document.getElementById(id),
        onChange: run,
      });
    }

    setWallType('cantilever');
    run(); // varsayılan örnekle başla
  });

  window.IstinatApp = { run };
})();
