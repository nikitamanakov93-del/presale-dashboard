/* Пресейл DreamJob — дашборд активности. Без сборки, данные из data/*.json
   (зашифрованные AES-GCM или открытые — для локального preview). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const FILES = ['weeks', 'reasons', 'deals'];
  const SKEY = 'dash-key-v1';
  const te = new TextEncoder();
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64e = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('ru-RU');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const METRICS = {
    attempts:   { label: 'Попытки звонков', short: 'Попытки', color: '#4f46e5', icon: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>' },
    calls30:    { label: 'Звонки >30 сек', short: '>30 сек', color: '#7c3aed', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    emails:     { label: 'Письма', short: 'Письма', color: '#0ea5e9', icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' },
    messengers: { label: 'Мессенджеры', short: 'Мессенджеры', color: '#10b981', icon: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12z"/>' },
    meetings:   { label: 'Встречи', short: 'Встречи', color: '#f59e0b', icon: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>' },
    lost:       { label: 'Отказы', short: 'Отказы', color: '#e11d48', lowerBetter: true, icon: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>' },
    taken:      { label: 'Взяты в работу', short: 'В работу', color: '#14b8a6', icon: '<path d="M12 5v14M5 12h14"/>' },
    instantLost:{ label: 'Сразу в отказ', short: 'Сразу в отказ', color: '#f97316', lowerBetter: true, icon: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>' },
  };
  const CMP_GROUPS = {
    calls: ['attempts', 'calls30'],
    touch: ['emails', 'messengers'],
    result: ['meetings', 'taken', 'lost', 'instantLost'],
  };
  const RADAR_AXES = ['attempts', 'calls30', 'emails', 'messengers', 'meetings', 'taken'];
  const REASON_COLORS = ['#4f46e5', '#e11d48', '#f59e0b', '#0ea5e9', '#10b981', '#a855f7', '#94a3b8'];

  const S = { data: null, week: null, mgr: 'all', tab: 'won', reason: null, q: '', sortK: 'date', sortDir: -1, dyn: 'attempts', cmp: 'calls', charts: {}, encrypted: false };

  /* ---------------- crypto ---------------- */
  async function deriveKey(pw, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }
  async function decryptEnvelope(env, key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(env.iv), additionalData: te.encode(env.aad || '') }, key, b64d(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  const isEnvelope = (o) => o && typeof o === 'object' && 'ct' in o && 'iv' in o && 'salt' in o;

  async function fetchRaw() {
    const out = {};
    await Promise.all(FILES.map(async (f) => {
      const r = await fetch(`${f}.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`${f}.json: HTTP ${r.status}`);
      out[f] = await r.json();
    }));
    return out;
  }
  async function decryptAll(raw, key) {
    const out = {};
    for (const f of FILES) out[f] = await decryptEnvelope(raw[f], key);
    return out;
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    let raw;
    try { raw = await fetchRaw(); } catch (e) { return fatal('Не удалось загрузить данные: ' + e.message); }
    $('#loading').hidden = true;
    if (!isEnvelope(raw.weeks)) { start(raw); return; }
    S.encrypted = true;
    // ключ из сессии
    try {
      const saved = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
      if (saved && saved.salt === raw.weeks.salt) {
        const key = await crypto.subtle.importKey('raw', b64d(saved.k), { name: 'AES-GCM' }, false, ['decrypt']);
        start(await decryptAll(raw, key));
        return;
      }
    } catch (e) { sessionStorage.removeItem(SKEY); }
    showLogin(raw);
  }

  function showLogin(raw) {
    const box = $('#login'), form = $('#loginForm'), err = $('#loginErr'), btn = $('#loginBtn');
    box.hidden = false;
    $('#pw').focus();
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'Расшифровываю…';
      try {
        const env = raw.weeks;
        const key = await deriveKey($('#pw').value, b64d(env.salt), env.iter);
        const data = await decryptAll(raw, key);
        if ($('#remember').checked) {
          sessionStorage.setItem(SKEY, JSON.stringify({ salt: env.salt, k: b64e(await crypto.subtle.exportKey('raw', key)) }));
        }
        $('#pw').value = '';
        box.hidden = true;
        start(data);
      } catch (e) {
        err.textContent = 'Неверный пароль';
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      } finally { btn.disabled = false; btn.textContent = 'Открыть'; }
    };
  }

  function fatal(msg) {
    $('#loading').innerHTML = `<p class="muted" style="padding:24px;text-align:center">${esc(msg)}</p>`;
  }

  /* ---------------- state ---------------- */
  function start(data) {
    S.data = data;
    const weeks = data.weeks.weeks;
    const h = new URLSearchParams(location.hash.slice(1));
    S.week = weeks.some((w) => w.week === h.get('w')) ? h.get('w') : weeks[weeks.length - 1].week;
    if (data.weeks.managers.some((m) => m.id === h.get('m'))) S.mgr = h.get('m');
    $('#app').hidden = false;
    $('#logoutBtn').hidden = !S.encrypted;
    initControls();
    renderAll(true);
  }

  const managers = () => S.data.weeks.managers;
  const mgrName = (id) => (managers().find((m) => m.id === id) || {}).name;
  const mgrColor = (name) => {
    const i = managers().findIndex((m) => m.name === name);
    return cssVar(`--m${(i % 3) + 1}`);
  };
  const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const weekIdx = () => S.data.weeks.weeks.findIndex((w) => w.week === S.week);
  const weekObj = (i = weekIdx()) => S.data.weeks.weeks[i];
  function totals(w, mgr = S.mgr) {
    const rows = (w ? w.rows : []).filter((r) => mgr === 'all' || r.manager === mgrName(mgr));
    const t = {};
    Object.keys(METRICS).forEach((k) => (t[k] = rows.reduce((s, r) => s + (r[k] || 0), 0)));
    t._n = rows.length;
    return t;
  }
  function saveHash() {
    const p = new URLSearchParams({ w: S.week });
    if (S.mgr !== 'all') p.set('m', S.mgr);
    history.replaceState(null, '', '#' + p.toString());
  }

  function initControls() {
    const sel = $('#weekSel');
    sel.innerHTML = S.data.weeks.weeks.slice().reverse().map((w) => `<option value="${esc(w.week)}">${esc(w.week)}</option>`).join('');
    sel.value = S.week;
    sel.onchange = () => { S.week = sel.value; S.reason = null; renderAll(true); };

    const chips = $('#chips');
    chips.innerHTML = [`<button class="chip" data-m="all" role="tab">Все</button>`]
      .concat(managers().map((m, i) => `<button class="chip" data-m="${m.id}" role="tab"><span class="dot" style="background:var(--m${(i % 3) + 1})"></span>${esc(m.short)}</button>`))
      .join('');
    chips.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      S.mgr = b.dataset.m; S.reason = null; renderAll(true);
    };

    $('#dynSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.dyn = b.dataset.m; segOn('#dynSeg', b); renderDynamics(); };
    $('#cmpSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.cmp = b.dataset.g; segOn('#cmpSeg', b); renderCompare(); };
    $('#dealTabs').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      S.tab = b.dataset.t; if (S.tab === 'won') S.reason = null; renderReasonsSel(); renderDeals();
    };
    $('#q').oninput = (e) => { S.q = e.target.value.trim().toLowerCase(); renderDeals(); };
    $$('.deals th[data-k]').forEach((th) => (th.onclick = () => {
      const k = th.dataset.k;
      if (S.sortK === k) S.sortDir *= -1; else { S.sortK = k; S.sortDir = k === 'date' ? -1 : 1; }
      renderDeals();
    }));
    $('#themeBtn').onclick = () => {
      const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('dash-theme', t); } catch (e) {}
      destroyCharts(); renderAll(false);
    };
    $('#logoutBtn').onclick = () => { sessionStorage.removeItem(SKEY); location.reload(); };
  }
  const segOn = (root, b) => { $$(root + ' button').forEach((x) => x.classList.toggle('on', x === b)); };

  /* ---------------- render ---------------- */
  function renderAll(animate) {
    saveHash();
    $$('#chips .chip').forEach((c) => c.classList.toggle('on', c.dataset.m === S.mgr));
    const w = weekObj();
    const who = S.mgr === 'all' ? 'вся команда' : mgrName(S.mgr);
    $('#heroTitle').textContent = `Активность за ${w.week}`;
    $('#heroSub').textContent = `${who[0].toUpperCase() + who.slice(1)} · рабочая неделя${w.start ? ' ' + dRange(w.start, w.end) : ''}`;
    $('#footSrc').textContent = `Источник: ${S.data.weeks.source || 'AmoCRM, воронка Телемаркетинг'}.`;
    $('#footUpd').textContent = dLong(S.data.weeks.updated);
    renderKpis(animate);
    renderFunnel();
    if (window.Chart) { setChartDefaults(); renderDynamics(); renderCompare(); renderRadar(); }
    renderReasons();
    renderDeals();
  }

  function dRange(s, e) { const f = (x) => new Date(x + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); return `${f(s)} — ${f(e)}`; }
  function dLong(s) { if (!s) return '—'; const d = new Date(s.length <= 10 ? s + 'T00:00' : s); return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function dShort(s) { const d = new Date(s); if (isNaN(d)) return esc(s); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }

  function countUp(el, to) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (reduceMotion || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderKpis(animate) {
    const i = weekIdx(), cur = totals(weekObj(i)), prev = i > 0 ? totals(weekObj(i - 1)) : null;
    const box = $('#kpis');
    if (!box.children.length) {
      box.innerHTML = Object.entries(METRICS).map(([k, m], n) => `
        <div class="kpi" data-k="${k}" style="--kc:${m.color};animation-delay:${n * 40}ms">
          <div class="kpi-top"><span class="kpi-ic"><svg viewBox="0 0 24 24">${m.icon}</svg></span>${esc(m.label)}</div>
          <div class="kpi-val" data-v="0">0</div>
          <div class="kpi-foot"></div>
        </div>`).join('');
    }
    const hint = {
      calls30: () => `${pct(cur.calls30, cur.attempts)}% от попыток`,
      meetings: () => `${pct(cur.meetings, cur.calls30)}% от звонков >30 сек`,
      lost: () => '',
      taken: () => '',
      instantLost: () => cur.taken + cur.instantLost ? `${pct(cur.instantLost, cur.taken + cur.instantLost)}% новых лидов` : '',
      emails: () => '', messengers: () => '', attempts: () => '',
    };
    Object.keys(METRICS).forEach((k) => {
      const card = $(`.kpi[data-k="${k}"]`, box);
      const v = $('.kpi-val', card);
      if (animate) countUp(v, cur[k]); else { v.textContent = fmt(cur[k]); v.dataset.v = cur[k]; }
      let d = '';
      if (prev && prev._n) {
        const diff = cur[k] - prev[k];
        const good = METRICS[k].lowerBetter ? diff < 0 : diff > 0;
        const cls = diff === 0 ? 'flat' : good ? 'up' : 'down';
        const p = prev[k] ? ` (${diff > 0 ? '+' : ''}${pct(diff, prev[k])}%)` : '';
        d = `<span class="delta ${cls}">${diff > 0 ? '▲ +' : diff < 0 ? '▼ ' : '● '}${fmt(diff)}${p}</span><span>к прошлой неделе</span>`;
      }
      const h = hint[k]();
      $('.kpi-foot', card).innerHTML = d + (h ? `<span>${esc(h)}</span>` : '');
    });
  }

  function renderFunnel() {
    const t = totals(weekObj());
    const steps = [
      ['Попытки', 'все звонки', t.attempts],
      ['Звонки >30 сек', 'качественные', t.calls30],
      ['Встречи', 'передан в продажи', t.meetings],
    ];
    const max = Math.max(1, t.attempts);
    const conv = [pct(t.calls30, t.attempts), pct(t.meetings, t.calls30)];
    $('#funnel').innerHTML = steps.map(([l, s, v], i) => `
      <div class="f-row"><div class="f-label">${l}<small>${s}</small></div>
        <div class="f-bar"><div class="f-fill" data-w="${Math.max(v ? 6 : 0, (v / max) * 100)}" style="opacity:${1 - i * 0.18}"></div><div class="f-num">${fmt(v)}</div></div></div>
      ${i < 2 ? `<div class="f-conv"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 5v14M6 13l6 6 6-6"/></svg>конверсия <b>${conv[i]}%</b></div>` : ''}`).join('');
    requestAnimationFrame(() => $$('#funnel .f-fill').forEach((f) => (f.style.width = f.dataset.w + '%')));
    // число на светлом фоне, если полоса короткая
    $$('#funnel .f-row').forEach((r) => {
      const w = Number($('.f-fill', r).dataset.w);
      $('.f-num', r).style.color = w < 18 ? 'var(--text)' : '#fff';
      $('.f-num', r).style.textShadow = w < 18 ? 'none' : '';
      if (w < 18) $('.f-num', r).style.paddingLeft = `calc(${w}% + 12px)`;
    });
  }

  /* ---------------- charts ---------------- */
  function setChartDefaults() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = cssVar('--muted');
    Chart.defaults.borderColor = cssVar('--line');
    Chart.defaults.plugins.tooltip.backgroundColor = cssVar('--text');
    Chart.defaults.plugins.tooltip.titleColor = cssVar('--bg');
    Chart.defaults.plugins.tooltip.bodyColor = cssVar('--bg');
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    Chart.defaults.animation.duration = reduceMotion ? 0 : 700;
  }
  function destroyCharts() { Object.values(S.charts).forEach((c) => c && c.destroy()); S.charts = {}; }
  function upsert(id, cfg) {
    const c = S.charts[id];
    if (c && c.config.type === cfg.type) { c.data = cfg.data; c.options = cfg.options; c.update(); return c; }
    if (c) c.destroy();
    return (S.charts[id] = new Chart(document.getElementById(id), cfg));
  }
  const alpha = (hex, a) => { const c = hex.trim(); if (!c.startsWith('#')) return c; const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  const pointLabel = {
    id: 'pointLabel',
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.on) return;
      const { ctx } = chart;
      chart.data.datasets.forEach((ds, di) => chart.getDatasetMeta(di).data.forEach((pt, i) => {
        ctx.save(); ctx.fillStyle = cssVar('--text'); ctx.font = `700 15px ${Chart.defaults.font.family}`; ctx.textAlign = 'center';
        ctx.fillText(fmt(ds.data[i]), pt.x, pt.y - 16); ctx.restore();
      }));
    },
  };

  function renderDynamics() {
    const weeks = S.data.weeks.weeks;
    const labels = weeks.map((w) => w.week);
    const vals = weeks.map((w) => totals(w)[S.dyn]);
    const single = weeks.length < 2;
    const color = METRICS[S.dyn].color;
    $('#dynNote').hidden = !single;
    upsert('dynChart', {
      type: 'line',
      data: { labels, datasets: [{ label: METRICS[S.dyn].label, data: vals, borderColor: color, backgroundColor: alpha(color, 0.12), fill: !single, tension: 0.35, pointRadius: single ? 8 : 4, pointHoverRadius: 9, pointBackgroundColor: color, pointBorderColor: cssVar('--card'), pointBorderWidth: 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 26, bottom: single ? 34 : 0 } },
        plugins: { legend: { display: false }, pointLabel: { on: true } },
        scales: { y: { beginAtZero: true, suggestedMax: Math.max(...vals) * 1.25 || 1, grid: { color: cssVar('--line') }, ticks: { precision: 0 } }, x: { grid: { display: false }, offset: single } },
      },
      plugins: [pointLabel],
    });
  }

  function renderCompare() {
    const keys = CMP_GROUPS[S.cmp];
    const w = weekObj();
    const sel = S.mgr === 'all' ? null : mgrName(S.mgr);
    const datasets = managers().map((m) => {
      const r = w.rows.find((x) => x.manager === m.name) || {};
      const c = mgrColor(m.name), on = !sel || sel === m.name;
      return { label: m.short, data: keys.map((k) => r[k] || 0), backgroundColor: on ? c : alpha(c, 0.18), borderRadius: 8, borderSkipped: false, maxBarThickness: 38 };
    });
    upsert('cmpChart', {
      type: 'bar',
      data: { labels: keys.map((k) => METRICS[k].short), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 16 } } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: cssVar('--line') } }, x: { grid: { display: false } } },
      },
    });
  }

  function renderRadar() {
    const w = weekObj();
    const sel = S.mgr === 'all' ? null : mgrName(S.mgr);
    const max = {};
    RADAR_AXES.forEach((k) => (max[k] = Math.max(1, ...w.rows.map((r) => r[k] || 0))));
    const datasets = managers().map((m) => {
      const r = w.rows.find((x) => x.manager === m.name) || {};
      const c = mgrColor(m.name), on = !sel || sel === m.name;
      return { label: m.short, data: RADAR_AXES.map((k) => Math.round(((r[k] || 0) / max[k]) * 100)), raw: RADAR_AXES.map((k) => r[k] || 0),
        borderColor: on ? c : alpha(c, 0.25), backgroundColor: alpha(c, on ? (sel ? 0.28 : 0.12) : 0.03), pointBackgroundColor: on ? c : alpha(c, 0.25), borderWidth: on && sel ? 3 : 2, pointRadius: 3 };
    });
    upsert('radarChart', {
      type: 'radar',
      data: { labels: RADAR_AXES.map((k) => METRICS[k].short), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 16 } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.dataset.raw[c.dataIndex]} (${c.raw}% от лидера)` } },
        },
        scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, grid: { color: cssVar('--line') }, angleLines: { color: cssVar('--line') }, pointLabels: { font: { size: 12, weight: '600' }, color: cssVar('--muted') } } },
      },
    });
  }

  /* ---------------- reasons ---------------- */
  function reasonData() {
    const cats = S.data.reasons.categories || [];
    const sheet = (S.data.reasons.weeks || {})[S.week];
    if (S.mgr === 'all' && sheet) return sheet.filter((r) => r.count > 0);
    const name = mgrName(S.mgr);
    const cnt = {};
    S.data.deals.deals.filter((d) => d.week === S.week && d.type === 'lost' && (S.mgr === 'all' || d.manager === name))
      .forEach((d) => (cnt[d.category] = (cnt[d.category] || 0) + 1));
    return cats.filter((c) => cnt[c]).map((c) => ({ reason: c, count: cnt[c] }));
  }
  const catColor = (name) => {
    const cats = S.data.reasons.categories || [];
    if (/не собран/i.test(name)) return REASON_COLORS[6];
    const i = cats.indexOf(name);
    return REASON_COLORS[(i < 0 ? 5 : i) % 6];
  };

  function renderReasons() {
    const rows = reasonData();
    const total = rows.reduce((s, r) => s + r.count, 0);
    const max = Math.max(1, ...rows.map((r) => r.count));
    countUp($('#lostTotal'), total);
    const notC = rows.filter((r) => /не собран/i.test(r.reason)).reduce((s, r) => s + r.count, 0);
    $('#reasonNote').textContent = total ? `Причина известна по ${total - notC} из ${total} отказов.` + (notC ? ` «Не собрано» — причина не выгружена или не указана в карточке.` : '') : 'Отказов за неделю нет.';
    $('#reasonList').innerHTML = rows.map((r) => `
      <li data-r="${esc(r.reason)}" tabindex="0" role="button"><span class="sw" style="background:${catColor(r.reason)}"></span>
      <span class="nm">${esc(r.reason)}</span><span class="bar"><i style="width:0;background:${catColor(r.reason)}" data-w="${(r.count / max) * 100}"></i></span>
      <span class="ct">${r.count}</span></li>`).join('');
    requestAnimationFrame(() => $$('#reasonList .bar i').forEach((b) => (b.style.width = b.dataset.w + '%')));
    $$('#reasonList li').forEach((li) => {
      li.onclick = () => pickReason(li.dataset.r);
      li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickReason(li.dataset.r); } };
    });
    if (window.Chart) {
      upsert('reasonChart', {
        type: 'doughnut',
        data: { labels: rows.map((r) => r.reason), datasets: [{ data: rows.map((r) => r.count), backgroundColor: rows.map((r) => catColor(r.reason)), borderColor: cssVar('--card'), borderWidth: 3, hoverOffset: 10, offset: rows.map(() => 0) }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%', layout: { padding: 12 },
          plugins: { legend: { display: false } },
          onClick: (_e, els) => { if (els.length) pickReason(rows[els[0].index].reason); },
          onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        },
      });
    }
    renderReasonsSel();
  }
  function renderReasonsSel() {
    $$('#reasonList li').forEach((li) => { li.classList.toggle('on', li.dataset.r === S.reason); li.classList.toggle('dim', !!S.reason && li.dataset.r !== S.reason); });
    const c = S.charts.reasonChart;
    if (c) { c.data.datasets[0].offset = c.data.labels.map((l) => (l === S.reason ? 14 : 0)); c.update(); }
  }
  function pickReason(r) {
    S.reason = S.reason === r ? null : r;
    if (S.reason) S.tab = 'lost';
    renderReasonsSel(); renderDeals();
    if (S.reason) $('#dealsCard').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------------- deals ---------------- */
  function renderDeals() {
    const name = mgrName(S.mgr);
    const base = S.data.deals.deals.filter((d) => d.week === S.week && (S.mgr === 'all' || d.manager === name));
    $('#cntWon').textContent = base.filter((d) => d.type === 'won').length;
    $('#cntLost').textContent = base.filter((d) => d.type === 'lost').length;
    $$('#dealTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === S.tab));
    $('#dealsCard').classList.toggle('hide-reason', S.tab === 'won');
    const pill = $('#reasonFilter');
    pill.hidden = !S.reason;
    if (S.reason) {
      pill.innerHTML = `Причина: ${esc(S.reason)} <button type="button" aria-label="Сбросить фильтр">×</button>`;
      $('button', pill).onclick = () => { S.reason = null; renderReasonsSel(); renderDeals(); };
    }
    let rows = base.filter((d) => d.type === S.tab && (!S.reason || d.category === S.reason));
    if (S.q) rows = rows.filter((d) => [d.company, d.fromStage, d.reason, d.category, d.manager].join(' ').toLowerCase().includes(S.q));
    const k = S.sortK, dir = S.sortDir;
    rows.sort((a, b) => String(a[k] || '').localeCompare(String(b[k] || ''), 'ru') * dir);
    $$('.deals th[data-k]').forEach((th) => { th.classList.toggle('sorted', th.dataset.k === k); th.classList.toggle('desc', th.dataset.k === k && dir < 0); });
    const short = (n) => (managers().find((m) => m.name === n) || {}).short || n;
    $('#dealRows').innerHTML = rows.map((d) => {
      const rc = d.category ? catColor(d.category) : '';
      const sub = d.reason && d.reason !== d.category ? `<span class="rsub">${esc(d.reason)}</span>` : '';
      return `<tr>
        <td class="co">${esc(d.company)}</td>
        <td><span class="who"><i style="background:${mgrColor(d.manager)}"></i>${esc(short(d.manager))}</span></td>
        <td class="dt">${dShort(d.date)}</td>
        <td><span class="stage">${esc(d.fromStage)}</span></td>
        <td class="col-reason">${d.category ? `<span class="rtag" style="color:${rc};background:${alpha(rc, 0.12)}">${esc(d.category)}</span>${sub}` : ''}</td>
        <td class="lk">${/^https:\/\//.test(d.url) ? `<a class="open" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer" title="Открыть в AmoCRM" aria-label="Открыть в AmoCRM"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg></a>` : ''}</td>
      </tr>`;
    }).join('');
    $('#dealEmpty').hidden = rows.length > 0;
  }

  // перерисовать графики при смене системной темы, если пользователь тему не выбирал
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    try { if (localStorage.getItem('dash-theme')) return; } catch (_) {}
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    if (S.data) { destroyCharts(); renderAll(false); }
  });

  boot();
})();
