/* Пресейл DreamJob — дашборд активности. Без сборки, данные из data/*.json
   (зашифрованные AES-GCM или открытые — для локального preview). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const FILES = ['weeks', 'reasons', 'deals'];
  const OPT_FILES = ['tags', 'payments']; // необязательные: нет файла — блок/вкладка скрываются
  const SKEY = 'dash-key-v1';
  const te = new TextEncoder();
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64e = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('ru-RU');
  const fmtRub = (n) => `${fmt(Math.round(Number(n) || 0))}\u00a0₽`;
  const fmtRubShort = (n) => {
    const v = Math.round(Number(n) || 0);
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}\u00a0млн`;
    if (a >= 1000) return `${(v / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}\u00a0тыс.`;
    return fmtRub(v);
  };
  const plural = (n, one, few, many) => {
    const n10 = Math.abs(n) % 10, n100 = Math.abs(n) % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  };
  const MONTH_IN = { 1: 'январе', 2: 'феврале', 3: 'марте', 4: 'апреле', 5: 'мае', 6: 'июне', 7: 'июле', 8: 'августе', 9: 'сентябре', 10: 'октябре', 11: 'ноябре', 12: 'декабре' };
  const MONTH_NOM = { 1: 'январь', 2: 'февраль', 3: 'март', 4: 'апрель', 5: 'май', 6: 'июнь', 7: 'июль', 8: 'август', 9: 'сентябрь', 10: 'октябрь', 11: 'ноябрь', 12: 'декабрь' };
  const monthIn = (id) => {
    if (!id) return '';
    const [y, m] = id.split('-');
    return `${MONTH_IN[Number(m)]} ${y}`;
  };
  const monthNom = (id) => {
    if (!id) return '';
    const [y, m] = id.split('-');
    const n = MONTH_NOM[Number(m)] || '';
    return `${n ? n[0].toUpperCase() + n.slice(1) : id} ${y}`;
  };
  const dDay = (s) => {
    if (!s) return '—';
    const d = new Date(s + 'T00:00');
    return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };
  const isNum = (v) => v != null && v !== '' && !Number.isNaN(Number(v));
  const pct = (a, b) => (isNum(a) && isNum(b) && Number(b) ? Math.round((a / b) * 100) : 0);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const METRICS = {
    attempts:   { label: 'Попытки звонков', short: 'Попытки', color: '#4f46e5', icon: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>' },
    calls30:    { label: 'Звонки >30 сек', short: '>30 сек', color: '#7c3aed', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    emails:     { label: 'Письма', short: 'Письма', color: '#0ea5e9', icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' },
    messengers: { label: 'Мессенджеры', short: 'Мессенджеры', color: '#10b981', icon: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12z"/>' },
    meetings:   { label: 'Встречи', short: 'Встречи', color: '#f59e0b', icon: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>' },
    lost:       { label: 'Отказы', short: 'Отказы', color: '#e11d48', lowerBetter: true, icon: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>' },
    taken:      { label: 'Взяты в работу', short: 'В работу', color: '#14b8a6', icon: '<path d="M12 5v14M5 12h14"/>' },
  };
  const REASON_COLORS = ['#4f46e5', '#e11d48', '#f59e0b', '#0ea5e9', '#10b981', '#a855f7', '#94a3b8'];

  const S = { view: 'activity', data: null, week: null, mgr: 'all', tab: 'won', payTab: 'week', reason: null, q: '', sortK: 'date', sortDir: -1, dyn: 'attempts', charts: {}, encrypted: false };

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
    await Promise.all(FILES.concat(OPT_FILES).map(async (f) => {
      const opt = OPT_FILES.includes(f);
      let r;
      try { r = await fetch(`${f}.json`, { cache: 'no-cache' }); } catch (e) { if (opt) return; throw e; }
      if (!r.ok) { if (opt) return; throw new Error(`${f}.json: HTTP ${r.status}`); }
      out[f] = await r.json();
    }));
    return out;
  }
  async function decryptAll(raw, key) {
    const out = {};
    for (const f of FILES) out[f] = await decryptEnvelope(raw[f], key);
    for (const f of OPT_FILES) {
      if (!raw[f]) continue;
      try { out[f] = await decryptEnvelope(raw[f], key); } catch (e) { console.warn(`${f}.json не расшифровался`, e); }
    }
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
    $('#viewTagsBtn').hidden = !data.tags;
    if (data.tags && h.get('v') === 'tags') S.view = 'tags';
    $('#app').hidden = false;
    $('#logoutBtn').hidden = !S.encrypted;
    initControls();
    if (data.tags) initTags();
    applyView(true);
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
    Object.keys(METRICS).forEach((k) => {
      const nums = rows.map((r) => r[k]).filter(isNum).map(Number);
      t[k] = nums.length ? nums.reduce((s, v) => s + v, 0) : (rows.length ? null : 0);
    });
    t._n = rows.length;
    return t;
  }
  function saveHash() {
    const p = new URLSearchParams({ w: S.week });
    if (S.mgr !== 'all') p.set('m', S.mgr);
    if (S.view !== 'activity') p.set('v', S.view);
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
    $('#dealTabs').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      S.tab = b.dataset.t; if (S.tab === 'won') S.reason = null; renderReasonsSel(); renderDeals();
    };
    const payTabs = $('#payTabs');
    if (payTabs) payTabs.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      S.payTab = b.dataset.t; renderPayments();
    };
    $('#q').oninput = (e) => { S.q = e.target.value.trim().toLowerCase(); renderDeals(); };
    $$('#dealsCard .deals th[data-k]').forEach((th) => (th.onclick = () => {
      const k = th.dataset.k;
      if (S.sortK === k) S.sortDir *= -1; else { S.sortK = k; S.sortDir = k === 'date' ? -1 : 1; }
      renderDeals();
    }));
    $('#themeBtn').onclick = () => {
      const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('dash-theme', t); } catch (e) {}
      destroyCharts(); renderCurrent(false);
    };
    $('#views').onclick = (e) => {
      const b = e.target.closest('button[data-v]'); if (!b || b.dataset.v === S.view) return;
      S.view = b.dataset.v; applyView(true);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    $('#logoutBtn').onclick = () => { sessionStorage.removeItem(SKEY); location.reload(); };
  }
  const segOn = (root, b) => { $$(root + ' button').forEach((x) => x.classList.toggle('on', x === b)); };

  /* ---------------- views ---------------- */
  function applyView(animate) {
    const tags = S.view === 'tags';
    $('#viewActivity').hidden = tags;
    $('#viewTags').hidden = !tags;
    $('#weekSel').closest('.select').hidden = tags;
    $$('#views button').forEach((b) => { const on = b.dataset.v === S.view; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    document.title = tags ? 'Пресейл DreamJob — теги' : 'Пресейл DreamJob — активность';
    destroyCharts(); // графики скрытой вкладки имеют нулевой размер — пересоздаём на видимой
    renderCurrent(animate);
  }
  function renderCurrent(animate) {
    if (S.view === 'tags') { saveHash(); if (window.Chart) setChartDefaults(); renderTags(animate); }
    else renderAll(animate);
  }

  /* ---------------- render ---------------- */
  function renderAll(animate) {
    saveHash();
    $$('#chips .chip').forEach((c) => c.classList.toggle('on', c.dataset.m === S.mgr));
    const w = weekObj();
    const who = S.mgr === 'all' ? 'вся команда' : mgrName(S.mgr);
    $('#heroTitle').textContent = `Активность за ${w.week}`;
    let sub = `${who[0].toUpperCase() + who.slice(1)} · рабочая неделя${w.start ? ' ' + dRange(w.start, w.end) : ''}`;
    const upd = S.data.weeks.updated;
    if (upd && w.end && upd < w.end) sub += ` · данные на ${dLong(upd)}`;
    $('#heroSub').textContent = sub;
    $('#footSrc').textContent = `Источник: ${S.data.weeks.source || 'AmoCRM, воронка Телемаркетинг'}.`;
    $('#footUpd').textContent = dLong(S.data.weeks.updated);
    renderKpis(animate);
    renderFunnel();
    if (window.Chart) { setChartDefaults(); renderDynamics(); }
    renderReasons();
    renderDeals();
    renderPayments();
  }

  function dRange(s, e) { const f = (x) => new Date(x + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); return `${f(s)} — ${f(e)}`; }
  function dLong(s) { if (!s) return '—'; const d = new Date(s.length <= 10 ? s + 'T00:00' : s); return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function dShort(s) { const d = new Date(s); if (isNaN(d)) return esc(s); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
  function dateFromIso(s) {
    const [y, m, d] = String(s || '').split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function isoFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function mondayOf(s) {
    const d = dateFromIso(s);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function weekLabelMonFri(mon) {
    const fri = addDays(mon, 4);
    const pad = (n) => String(n).padStart(2, '0');
    if (mon.getMonth() === fri.getMonth() && mon.getFullYear() === fri.getFullYear()) {
      return `${pad(mon.getDate())}–${pad(fri.getDate())}.${pad(fri.getMonth() + 1)}.${fri.getFullYear()}`;
    }
    if (mon.getFullYear() === fri.getFullYear()) {
      return `${pad(mon.getDate())}.${pad(mon.getMonth() + 1)}–${pad(fri.getDate())}.${pad(fri.getMonth() + 1)}.${fri.getFullYear()}`;
    }
    return `${pad(mon.getDate())}.${pad(mon.getMonth() + 1)}.${mon.getFullYear()}–${pad(fri.getDate())}.${pad(fri.getMonth() + 1)}.${fri.getFullYear()}`;
  }
  function dDayRange(a, b) {
    const f = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${f(a)} – ${f(b)}`;
  }

  function countUp(el, to) {
    if (el._cu) { cancelAnimationFrame(el._cu); el._cu = 0; }
    if (!isNum(to)) {
      el.textContent = 'нет данных';
      el.dataset.v = '';
      el.classList.add('na');
      return;
    }
    el.classList.remove('na');
    const from = Number(el.dataset.v || 0);
    const target = Number(to);
    el.dataset.v = String(target);
    if (reduceMotion || from === target) { el.textContent = fmt(target); return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      if (el.dataset.v !== String(target)) { el._cu = 0; return; }
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (target - from) * e));
      el._cu = (p < 1) ? requestAnimationFrame(step) : 0;
    };
    el._cu = requestAnimationFrame(step);
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
      calls30: () => (isNum(cur.calls30) && isNum(cur.attempts) ? `${pct(cur.calls30, cur.attempts)}% от попыток` : ''),
      meetings: () => (isNum(cur.meetings) && isNum(cur.calls30) ? `${pct(cur.meetings, cur.calls30)}% от звонков >30 сек` : ''),
      lost: () => '',
      taken: () => '',
      emails: () => '', messengers: () => '', attempts: () => '',
    };
    Object.keys(METRICS).forEach((k) => {
      const card = $(`.kpi[data-k="${k}"]`, box);
      const v = $('.kpi-val', card);
      if (animate) countUp(v, cur[k]);
      else if (isNum(cur[k])) { v.textContent = fmt(cur[k]); v.dataset.v = cur[k]; v.classList.remove('na'); }
      else { v.textContent = 'нет данных'; v.dataset.v = ''; v.classList.add('na'); }
      let d = '';
      if (prev && prev._n && isNum(cur[k]) && isNum(prev[k])) {
        const diff = cur[k] - prev[k];
        const good = METRICS[k].lowerBetter ? diff < 0 : diff > 0;
        const cls = diff === 0 ? 'flat' : good ? 'up' : 'down';
        const p = prev[k] ? ` (${diff > 0 ? '+' : ''}${pct(diff, prev[k])}%)` : '';
        d = `<span class="delta ${cls}">${diff > 0 ? '▲ +' : diff < 0 ? '▼ ' : '● '}${fmt(diff)}${p}</span><span>к прошлой неделе</span>`;
      } else if (prev && prev._n && (!isNum(cur[k]) || !isNum(prev[k]))) {
        d = '<span>нет данных для сравнения</span>';
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
      const fontSize = opts.fontSize || 15;
      const offset = opts.offset || 16;
      const fmtFn = opts.format || ((v) => fmt(v));
      ctx.save();
      ctx.fillStyle = cssVar('--text');
      ctx.font = `700 ${fontSize}px ${Chart.defaults.font.family}`;
      ctx.textAlign = 'center';
      if (opts.stackTotal) {
        const n = chart.data.labels.length;
        for (let i = 0; i < n; i++) {
          let sum = 0, top = null;
          chart.data.datasets.forEach((ds, di) => {
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;
            const v = Number(ds.data[i]);
            if (isNum(v)) sum += v;
            const pt = meta.data[i];
            if (pt && (!top || pt.y < top.y)) top = pt;
          });
          if (!top || !sum) continue;
          const text = fmtFn(sum, i);
          if (text) ctx.fillText(text, top.x, top.y - (opts.offset || 8));
        }
        ctx.restore();
        return;
      }
      chart.data.datasets.forEach((ds, di) => chart.getDatasetMeta(di).data.forEach((pt, i) => {
        if (!isNum(ds.data[i])) return;
        const text = fmtFn(ds.data[i], i, ds);
        if (text) ctx.fillText(text, pt.x, pt.y - offset);
      }));
      ctx.restore();
    },
  };

  function officialWeekByMonday() {
    const map = new Map();
    (S.data.weeks.weeks || []).forEach((w) => {
      if (!w.start) return;
      map.set(isoFromDate(mondayOf(w.start)), w);
    });
    return map;
  }
  function payTeam() {
    const p = payData();
    return (p && p.managers && p.managers.length) ? p.managers : managers();
  }
  function allPayItems() {
    const p = payData();
    return (p && p.items) || [];
  }
  function payWeekRows() {
    const items = allPayItems().filter((it) => it.status === 'paid' && it.payDate);
    const official = officialWeekByMonday();
    const weeks = S.data.weeks.weeks || [];
    const last = weeks.length ? mondayOf(weeks[weeks.length - 1].start) : mondayOf(isoFromDate(new Date()));
    let first = last;
    items.forEach((it) => {
      const m = mondayOf(it.payDate);
      if (m < first) first = m;
    });
    const mgrs = payTeam();
    const rows = [];
    for (let mon = new Date(first.getTime()); mon <= last; mon = addDays(mon, 7)) {
      const key = isoFromDate(mon);
      const off = official.get(key);
      const sun = addDays(mon, 6);
      const days = new Set();
      for (let i = 0; i < 7; i++) days.add(isoFromDate(addDays(mon, i)));
      const weekItems = items.filter((it) => days.has(it.payDate));
      const byMgr = {};
      mgrs.forEach((m) => { byMgr[m.name] = { count: 0, amount: 0 }; });
      weekItems.forEach((it) => {
        const slot = byMgr[it.manager] || (byMgr[it.manager] = { count: 0, amount: 0 });
        slot.count += 1;
        slot.amount += Number(it.amount) || 0;
      });
      rows.push({
        mon: key,
        sun: isoFromDate(sun),
        label: off ? off.week : weekLabelMonFri(mon),
        short: `${String(mon.getDate()).padStart(2, '0')}.${String(mon.getMonth() + 1).padStart(2, '0')}`,
        weekId: off ? off.week : null,
        current: !!(off && off.week === S.week),
        count: weekItems.length,
        amount: weekItems.reduce((s, it) => s + (Number(it.amount) || 0), 0),
        byMgr,
        range: dDayRange(mon, sun),
      });
    }
    return { rows, mgrs };
  }
  function consentMonthRows() {
    const items = allPayItems();
    const mgrs = payTeam();
    const ids = new Set();
    items.forEach((it) => { if (it.consentMonth) ids.add(it.consentMonth); });
    ((payData() && payData().months) || []).forEach((m) => { if (m.id) ids.add(m.id); });
    (S.data.weeks.weeks || []).forEach((w) => { if (w.start) ids.add(w.start.slice(0, 7)); });
    const mid = payMonthId();
    const allRows = [...ids].sort().map((id) => {
      const consents = uniqueConsents(items, id);
      const byMgr = {};
      mgrs.forEach((m) => { byMgr[m.name] = { count: 0, amount: 0 }; });
      consents.forEach((it) => {
        const slot = byMgr[it.manager] || (byMgr[it.manager] = { count: 0, amount: 0 });
        slot.count += 1;
        slot.amount += Number(it.amount) || 0;
      });
      return {
        id,
        label: monthNom(id),
        short: monthNom(id).replace(/\s+\d+$/, ''),
        current: id === mid,
        count: consents.length,
        amount: consents.reduce((s, it) => s + (it.amount || 0), 0),
        byMgr,
      };
    });
    const lastKeep = allRows.reduce((acc, r, i) => (r.count || r.amount || r.current || r.id === mid) ? i : acc, -1);
    const rows = lastKeep >= 0 ? allRows.slice(0, lastKeep + 1) : allRows;
    return { rows, mgrs };
  }
  function dynMoneyCell(count, amount) {
    if (!count && !amount) return '<span class="muted">—</span>';
    return `<b>${fmt(count)}</b><span class="sep">·</span><span class="rub">${fmtRub(amount)}</span>`;
  }
  function renderDynMoneyTable(kind, rows, mgrs) {
    const box = $('#dynExtra');
    if (!box) return;
    const first = kind === 'pays' ? 'Неделя' : 'Месяц';
    const head = [`<th>${first}</th>`, '<th class="num">Всего</th>']
      .concat(mgrs.map((m) => `<th class="num">${esc(m.short || m.name)}</th>`)).join('');
    const body = rows.map((r, i) => {
      const cls = [r.current ? 'cur' : '', r.weekId ? 'clickable' : '', (kind === 'consents' && r.id) ? 'clickable' : ''].filter(Boolean).join(' ');
      const cells = [dynMoneyCell(r.count, r.amount)].concat(mgrs.map((m) => {
        const slot = r.byMgr[m.name] || { count: 0, amount: 0 };
        const dim = S.mgr !== 'all' && S.mgr !== m.id ? ' dim' : '';
        return `<td class="num${dim}">${dynMoneyCell(slot.count, slot.amount)}</td>`;
      }));
      const title = r.range ? ` title="${esc(r.range)}"` : '';
      return `<tr class="${cls}" data-i="${i}"${title}><td>${esc(r.label)}</td><td class="num">${cells[0]}</td>${cells.slice(1).join('')}</tr>`;
    }).join('');
    box.hidden = false;
    box.innerHTML = `<div class="dyn-table-wrap"><table class="dyn-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    const wrap = $('.dyn-table-wrap', box);
    const cur = $('tr.cur', box);
    if (wrap && cur) wrap.scrollTop = Math.max(0, cur.offsetTop - (wrap.clientHeight - cur.offsetHeight - 8));
    else if (wrap) wrap.scrollTop = wrap.scrollHeight;
    $$('tr.clickable', box).forEach((tr) => {
      tr.onclick = () => pickDynMoneyRow(kind, rows[Number(tr.dataset.i)]);
    });
  }
  function pickDynMoneyRow(kind, row) {
    if (!row) return;
    if (kind === 'pays' && row.weekId && row.weekId !== S.week) {
      S.week = row.weekId;
      S.reason = null;
      renderAll(true);
      return;
    }
    if (kind === 'consents' && row.id) {
      const weeks = (S.data.weeks.weeks || []).filter((w) => w.start && w.start.slice(0, 7) === row.id);
      if (!weeks.length) return;
      const next = weeks[weeks.length - 1].week;
      if (next !== S.week) {
        S.week = next;
        S.reason = null;
        renderAll(true);
      }
    }
  }
  function syncDynPayButtons() {
    const has = !!(payData() && (payData().items || []).length);
    $$('#dynSeg [data-m="pays"], #dynSeg [data-m="consents"]').forEach((b) => { b.hidden = !has; });
    if (!has && (S.dyn === 'pays' || S.dyn === 'consents')) {
      S.dyn = 'attempts';
      const b = $('#dynSeg [data-m="attempts"]');
      if (b) segOn('#dynSeg', b);
    }
  }
  function hideDynMoney() {
    const cap = $('#dynCap'), extra = $('#dynExtra');
    if (cap) cap.hidden = true;
    if (extra) { extra.hidden = true; extra.innerHTML = ''; }
  }
  function renderDynMoney() {
    const kind = S.dyn;
    const packed = kind === 'pays' ? payWeekRows() : consentMonthRows();
    const { rows, mgrs } = packed;
    const cap = $('#dynCap');
    const note = $('#dynNote');
    if (note) note.hidden = true;
    if (cap) {
      cap.hidden = false;
      cap.textContent = kind === 'pays'
        ? 'Оплаты — по дате поступления, понедельник–воскресенье. Недели без поступлений показаны нулём; в таблице — разбивка по менеджерам.'
        : 'Согласия в источнике без точной даты — показываем по месяцу согласия, не раскладываем по неделям.';
    }
    renderDynMoneyTable(kind, rows, mgrs);
    const shown = S.mgr === 'all' ? mgrs : mgrs.filter((m) => m.id === S.mgr);
    const series = shown.length ? shown : mgrs;
    const colors = series.map((m) => mgrColor(m.name));
    const labels = rows.map((r) => r.short);
    const datasets = series.map((m, i) => ({
      label: m.short || m.name,
      data: rows.map((r) => (r.byMgr[m.name] || {}).amount || 0),
      backgroundColor: rows.map((r) => alpha(colors[i], r.current ? 0.95 : 0.72)),
      hoverBackgroundColor: colors[i],
      borderColor: colors[i],
      borderWidth: rows.map((r) => (r.current ? 2 : 0)),
      borderSkipped: false,
      borderRadius: i === series.length - 1 ? { topLeft: 5, topRight: 5 } : 0,
      maxBarThickness: kind === 'pays' ? 22 : 48,
      stack: 'money',
    }));
    const totalsAmt = rows.map((r) => series.reduce((s, m) => s + ((r.byMgr[m.name] || {}).amount || 0), 0));
    const max = Math.max(0, ...totalsAmt);
    upsert('dynChart', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 28, bottom: 0 } },
        interaction: { mode: 'index', intersect: false },
        onClick: (_e, els) => { if (els.length) pickDynMoneyRow(kind, rows[els[0].index]); },
        onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        plugins: {
          legend: { display: series.length > 1, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'rectRounded', padding: 12 } },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items.length) return '';
                const r = rows[items[0].dataIndex];
                return kind === 'pays' ? `${r.label} · ${r.range}` : r.label;
              },
              label: (ctx) => {
                const r = rows[ctx.dataIndex];
                const m = series[ctx.datasetIndex];
                const slot = r.byMgr[m.name] || { count: 0, amount: 0 };
                if (!slot.count && !slot.amount) return `${m.short || m.name}: нет`;
                return `${m.short || m.name}: ${fmt(slot.count)} · ${fmtRub(slot.amount)}`;
              },
              footer: (items) => {
                if (!items.length) return '';
                const r = rows[items[0].dataIndex];
                const count = series.reduce((s, m) => s + ((r.byMgr[m.name] || {}).count || 0), 0);
                const amount = series.reduce((s, m) => s + ((r.byMgr[m.name] || {}).amount || 0), 0);
                const unit = kind === 'pays'
                  ? plural(count, 'оплата', 'оплаты', 'оплат')
                  : plural(count, 'согласие', 'согласия', 'согласий');
                return `Всего: ${fmt(count)} ${unit} на ${fmtRub(amount)}`;
              },
            },
          },
          pointLabel: {
            on: true,
            stackTotal: true,
            fontSize: kind === 'pays' ? 10 : 12,
            offset: 8,
            format: (_sum, i) => {
              const amtOf = (row) => series.reduce((s, m) => s + ((row.byMgr[m.name] || {}).amount || 0), 0);
              const cntOf = (row) => series.reduce((s, m) => s + ((row.byMgr[m.name] || {}).count || 0), 0);
              const amount = amtOf(rows[i]);
              if (!amount) return '';
              if (kind === 'pays') {
                if (amount < 80000) return '';
                for (let j = Math.max(0, i - 2); j < i; j++) {
                  const prev = amtOf(rows[j]);
                  if (prev >= 80000 && amount <= prev * 1.2) return '';
                }
              }
              return `${fmt(cntOf(rows[i]))} · ${fmtRubShort(amount)}`;
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 45, autoSkip: true, font: { size: 11 } } },
          y: {
            stacked: true, beginAtZero: true, suggestedMax: (max || 1) * 1.28,
            grid: { color: cssVar('--line') },
            ticks: { callback: (v) => fmtRubShort(v), maxTicksLimit: 5 },
          },
        },
      },
      plugins: [pointLabel],
    });
  }

  function renderDynamics() {
    syncDynPayButtons();
    if (S.dyn === 'pays' || S.dyn === 'consents') { renderDynMoney(); return; }
    hideDynMoney();
    const weeks = S.data.weeks.weeks;
    const labels = weeks.map((w) => w.week);
    const vals = weeks.map((w) => totals(w)[S.dyn]);
    const numeric = vals.filter(isNum);
    const single = weeks.length < 2;
    const color = METRICS[S.dyn].color;
    const missing = numeric.length === 0;
    $('#dynNote').hidden = !single && !missing;
    if (missing) $('#dynNote').textContent = 'Нет данных по этой метрике';
    else if (single) $('#dynNote').textContent = 'Динамика появится со следующей недели';
    upsert('dynChart', {
      type: 'line',
      data: { labels, datasets: [{ label: METRICS[S.dyn].label, data: vals, borderColor: color, backgroundColor: alpha(color, 0.12), fill: !single && numeric.length > 1, tension: 0.35, spanGaps: true, pointRadius: single ? 8 : 4, pointHoverRadius: 9, pointBackgroundColor: color, pointBorderColor: cssVar('--card'), pointBorderWidth: 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 26, bottom: (single || missing) ? 34 : 0 } },
        plugins: { legend: { display: false }, pointLabel: { on: true } },
        scales: { y: { beginAtZero: true, suggestedMax: (numeric.length ? Math.max(...numeric) : 1) * 1.25, grid: { color: cssVar('--line') }, ticks: { precision: 0 } }, x: { grid: { display: false }, offset: single } },
      },
      plugins: [pointLabel],
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
    $$('#dealsCard .deals th[data-k]').forEach((th) => { th.classList.toggle('sorted', th.dataset.k === k); th.classList.toggle('desc', th.dataset.k === k && dir < 0); });
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


  /* ---------------- согласия и оплаты ---------------- */
  function payData() { return S.data && S.data.payments; }
  function payMonthId(w = weekObj()) { return (w && w.start) ? w.start.slice(0, 7) : ''; }
  function weekDateSet(w = weekObj()) {
    // пн–вс календарной недели выбранного пн–пт (выходные относятся к этой же неделе).
    // Понедельник считаем от w.start, а не «start + 7 дней»: у первой неполной недели
    // 01–02.10 start — четверг, иначе захватили бы дни следующей недели и потеряли пн–ср.
    const out = new Set();
    if (!w || !w.start) return out;
    const mon = mondayOf(w.start);
    if (isNaN(mon)) return out;
    for (let i = 0; i < 7; i++) out.add(isoFromDate(addDays(mon, i)));
    return out;
  }
  function payItems() {
    const p = payData();
    if (!p) return [];
    const name = mgrName(S.mgr);
    return (p.items || []).filter((it) => S.mgr === 'all' || it.manager === name);
  }
  function uniqueConsents(items, monthId) {
    const map = new Map();
    items.filter((it) => it.consentMonth === monthId).forEach((it) => {
      const g = map.get(it.id) || { id: it.id, hhid: it.hhid, company: it.company, amount: 0, consentMonth: it.consentMonth, manager: it.manager, url: it.url, note: '', notes: [], selfSourced: false, statuses: new Set() };
      g.amount += Number(it.amount) || 0;
      g.selfSourced = g.selfSourced || !!it.selfSourced;
      if (it.note && !g.notes.includes(it.note)) g.notes.push(it.note);
      g.statuses.add(it.status);
      map.set(it.id, g);
    });
    return [...map.values()].map((g) => {
      const st = g.statuses;
      const status = st.has('paid') && st.has('invoiced') ? 'partial' : st.has('paid') ? 'paid' : st.has('invoiced') ? 'invoiced' : 'other';
      return { ...g, status, note: g.notes.join('; '), payDate: null };
    }).sort((a, b) => b.amount - a.amount || a.company.localeCompare(b.company, 'ru'));
  }
  function payStatusLabel(st) {
    return st === 'paid' ? 'Оплачено' : st === 'invoiced' ? 'Счёт выставлен' : st === 'partial' ? 'Частично' : st || '';
  }
  function payStatusClass(st) {
    return st === 'paid' ? 'paid' : st === 'invoiced' ? 'invoice' : st === 'partial' ? 'partial' : '';
  }

  function renderPayments() {
    const box = $('#payBlock');
    const p = payData();
    if (!box) return;
    if (!p || !(p.items || []).length) { box.hidden = true; return; }
    box.hidden = false;
    const w = weekObj();
    const mid = payMonthId(w);
    const days = weekDateSet(w);
    const items = payItems();
    const weekPays = items.filter((it) => it.status === 'paid' && it.payDate && days.has(it.payDate))
      .sort((a, b) => String(b.payDate).localeCompare(a.payDate) || b.amount - a.amount);
    const monthPays = items.filter((it) => it.status === 'paid' && it.payMonth === mid)
      .sort((a, b) => String(b.payDate).localeCompare(a.payDate) || b.amount - a.amount);
    const consents = uniqueConsents(items, mid);
    const invoices = items.filter((it) => it.status === 'invoiced')
      .sort((a, b) => b.amount - a.amount || a.company.localeCompare(b.company, 'ru'));
    const weekSum = weekPays.reduce((s, it) => s + (it.amount || 0), 0);
    const monthPaySum = monthPays.reduce((s, it) => s + (it.amount || 0), 0);
    const consSum = consents.reduce((s, it) => s + (it.amount || 0), 0);
    const invSum = invoices.reduce((s, it) => s + (it.amount || 0), 0);
    const monthName = monthIn(mid);

    $('#paySub').textContent = (p.source || 'Таблица оплат') + (p.updated ? ` · данные на ${dLong(p.updated)}` : '') + (monthName ? ` · согласия за ${monthName}` : '');

    const kpis = [
      { k: 'cons', color: '#4f46e5', label: monthName ? `Согласия в ${monthName}` : 'Согласия месяца', icon: '<path d="M8 11l3 3 5-6"/><path d="M20 6v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8"/>', val: consents.length, amt: consSum, foot: plural(consents.length, 'согласие', 'согласия', 'согласий') },
      { k: 'week', color: '#059669', label: 'Оплаты за неделю', icon: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 15h4"/>', val: weekPays.length, amt: weekSum, foot: weekPays.length ? plural(weekPays.length, 'поступление', 'поступления', 'поступлений') : 'на этой неделе пока нет' },
      { k: 'mpay', color: '#0ea5e9', label: monthName ? `Оплаты в ${monthName}` : 'Оплаты месяца', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5C10 8.5 11 8 12 8s2 .6 2 2-1 2-2 2-2 .7-2 2 1 2 2 2 2-.5 2.5-1.5"/>', val: monthPays.length, amt: monthPaySum, foot: plural(monthPays.length, 'оплата', 'оплаты', 'оплат') },
      { k: 'inv', color: '#d97706', label: 'Ждём оплату', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>', val: invoices.length, amt: invSum, foot: 'счета без оплаты' },
    ];
    $('#payKpis').innerHTML = kpis.map((k, n) => `
      <div class="pay-kpi" style="--kc:${k.color};animation-delay:${n * 40}ms">
        <div class="kpi-top"><span class="kpi-ic"><svg viewBox="0 0 24 24">${k.icon}</svg></span>${esc(k.label)}</div>
        <div class="kpi-val">${fmt(k.val)}</div>
        <div class="kpi-amt">${fmtRub(k.amt)}</div>
        <div class="kpi-foot">${esc(k.foot)}</div>
      </div>`).join('');

    const short = (n) => (managers().find((m) => m.name === n) || {}).short || n;
    const mgrList = (p.managers && p.managers.length ? p.managers : managers());
    $('#payMgrs').innerHTML = mgrList.map((m) => {
      const name = m.name;
      const c = uniqueConsents(items.filter((it) => it.manager === name), mid);
      const wp = weekPays.filter((it) => it.manager === name);
      const mp = monthPays.filter((it) => it.manager === name);
      const inv = invoices.filter((it) => it.manager === name);
      const dim = S.mgr !== 'all' && S.mgr !== m.id;
      return `<div class="pay-mgr${dim ? ' dim' : ''}">
        <div class="who"><i style="background:${mgrColor(name)}"></i>${esc(m.short || short(name))}</div>
        <dl>
          <dt>Согласия месяца</dt><dd><b>${fmt(c.length)}</b><span class="sep">·</span><span class="rub">${fmtRub(c.reduce((s, it) => s + it.amount, 0))}</span></dd>
          <dt>Оплаты за неделю</dt><dd><b>${fmt(wp.length)}</b><span class="sep">·</span><span class="rub">${fmtRub(wp.reduce((s, it) => s + it.amount, 0))}</span></dd>
          <dt>Оплаты месяца</dt><dd><b>${fmt(mp.length)}</b><span class="sep">·</span><span class="rub">${fmtRub(mp.reduce((s, it) => s + it.amount, 0))}</span></dd>
          <dt>Ждём оплату</dt><dd><b>${fmt(inv.length)}</b><span class="sep">·</span><span class="rub">${fmtRub(inv.reduce((s, it) => s + it.amount, 0))}</span></dd>
        </dl>
      </div>`;
    }).join('');

    $('#cntPayWeek').textContent = weekPays.length;
    $('#cntPayCons').textContent = consents.length;
    $('#cntPayMonth').textContent = monthPays.length;
    $('#cntPayInv').textContent = invoices.length;
    $$('#payTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === S.payTab));

    const lists = { week: weekPays, consents, month: monthPays, invoice: invoices };
    const rows = lists[S.payTab] || [];
    const emptyMsg = {
      week: 'На этой неделе оплат пока нет. Согласия и оплаты месяца — на соседних вкладках.',
      consents: monthName ? `В ${monthName} согласий пока нет.` : 'Согласий за этот месяц нет.',
      month: monthName ? `В ${monthName} оплат пока нет.` : 'Оплат за этот месяц нет.',
      invoice: 'Открытых счетов нет — все согласия уже оплачены.',
    }[S.payTab] || 'Нет записей';

    const amo = (url) => /^https:\/\//.test(url || '') ? `<a class="open" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Открыть в AmoCRM" aria-label="Открыть в AmoCRM"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg></a>` : '';

    $('#payRows').innerHTML = rows.map((it) => {
      const stc = payStatusClass(it.status);
      const dateTxt = it.payDate ? dDay(it.payDate) : (it.consentMonth ? monthNom(it.consentMonth) : '—');
      const pills = [`<span class="pill ${stc}">${esc(payStatusLabel(it.status))}</span>`];
      if (it.selfSourced) pills.push('<span class="pill self">самоход</span>');
      const sub = it.note && !/^самоход$/i.test(it.note) ? `<span class="rsub">${esc(it.note)}</span>` : '';
      return `<tr>
        <td class="co">${esc(it.company)}${sub}</td>
        <td><span class="who"><i style="background:${mgrColor(it.manager)}"></i>${esc(short(it.manager))}</span></td>
        <td class="dt">${esc(dateTxt)}</td>
        <td class="num">${fmtRub(it.amount)}</td>
        <td class="stg">${pills.join('')}</td>
        <td class="lk">${amo(it.url)}</td>
      </tr>`;
    }).join('');
    const empty = $('#payEmpty');
    empty.hidden = rows.length > 0;
    empty.textContent = emptyMsg;

    const tot = p.totals || {};
    const allDeals = tot.deals || 0;
    const note = $('#payNote');
    const bits = [];
    if (allDeals) bits.push(`Всего с июля: ${fmt(allDeals)} ${plural(allDeals, 'согласие', 'согласия', 'согласий')} на ${fmtRub(tot.consented || 0)}, оплачено ${fmtRub(tot.paid || 0)}, в счетах ${fmtRub(tot.invoiced || 0)}.`);
    bits.push('Согласия в источнике без точной даты — считаем за месяц; оплаты — по дате поступления.');
    bits.push('Фильтр группы 4+ здесь не применяется.');
    note.textContent = bits.join(' ');
  }

  /* ---------------- теги ---------------- */
  const TAG_COLORS = ['#4f46e5', '#0ea5e9', '#e11d48', '#f59e0b', '#10b981', '#a855f7', '#64748b'];
  const T = { tag: '', dist: 'tag', web: '', webDist: 'tag', tagVis: {}, webVis: {} };
  const TAG_VIS_KEY = 'dash-tag-vis-v1';
  const WEB_VIS_KEY = 'dash-web-vis-v1';
  const EYE_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4"/><path d="M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 3.8"/><path d="M6.6 6.6C4.1 8.3 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4.3-.9"/></svg>';
  function loadVis(key) {
    try {
      const o = JSON.parse(localStorage.getItem(key) || '{}');
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }
  function saveVis(key, map) {
    try { localStorage.setItem(key, JSON.stringify(map)); } catch (e) {}
  }
  const isOn = (map, id) => map[String(id)] !== false;
  function setVis(kind, id, on) {
    const key = kind === 'web' ? WEB_VIS_KEY : TAG_VIS_KEY;
    const map = kind === 'web' ? T.webVis : T.tagVis;
    map[String(id)] = !!on;
    saveVis(key, map);
  }
  function showAll(kind) {
    if (kind === 'web') { T.webVis = {}; saveVis(WEB_VIS_KEY, T.webVis); }
    else { T.tagVis = {}; saveVis(TAG_VIS_KEY, T.tagVis); }
  }
  const eyeBtn = (kind, id, on) => `<button type="button" class="eye${on ? '' : ' off'}" data-kind="${kind}" data-id="${esc(String(id))}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? 'Скрыть' : 'Показать'} выгрузку" title="${on ? 'Скрыть выгрузку' : 'Показать выгрузку'}">${on ? EYE_ON : EYE_OFF}</button>`;

  const wdColor = (p) => (p >= 100 ? 'var(--good)' : p >= 50 ? 'var(--accent)' : p >= 20 ? '#f59e0b' : 'var(--bad)');
  const wdPct = (w, d) => (d ? Math.round((w / d) * 100) : 0);
  const tagColor = (id) => TAG_COLORS[(S.data.tags.tags.findIndex((t) => t.id === id) + TAG_COLORS.length) % TAG_COLORS.length];
  const WEB_COLORS = ['#0d9488', '#0284c7', '#7c3aed', '#c026d3', '#ea580c', '#2563eb'];
  const webColor = (id) => {
    const list = (S.data.tags.webinars && S.data.tags.webinars.tags) || [];
    return WEB_COLORS[(list.findIndex((t) => t.id === id) + WEB_COLORS.length) % WEB_COLORS.length];
  };
  const tMgrs = () => S.data.tags.managers;
  const tMgrColor = (n) => { const i = tMgrs().findIndex((m) => m.name === n); return i >= 0 && i < 3 ? cssVar(`--m${i + 1}`) : '#94a3b8'; };
  const pct1 = (a, b) => (b ? (a / b) * 100 : 0);
  const fmtPct = (v) => (Math.round(v * 10) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%';

  function tagStats() {
    const deals = S.data.tags.deals;
    const row = (ds) => {
      const r = { total: ds.length, g4: 0, worked: 0, worked4: 0, m: {}, d: {}, g4m: {}, m4: {} };
      tMgrs().forEach((m) => { r.m[m.name] = 0; r.d[m.name] = 0; r.g4m[m.name] = 0; r.m4[m.name] = 0; });
      ds.forEach((d) => {
        if (d.g4) { r.g4++; if (d.manager) r.g4m[d.manager] = (r.g4m[d.manager] || 0) + 1; }
        if (d.manager) r.d[d.manager] = (r.d[d.manager] || 0) + 1;
        if (d.worked) {
          r.worked++;
          if (d.manager) r.m[d.manager] = (r.m[d.manager] || 0) + 1;
          if (d.g4) { r.worked4++; if (d.manager) r.m4[d.manager] = (r.m4[d.manager] || 0) + 1; }
        }
      });
      r.pct = pct1(r.worked4, r.g4);
      return r;
    };
    const rows = S.data.tags.tags.map((t) => ({ tag: t, on: isOn(T.tagVis, t.id), ...row(deals.filter((d) => d.tag === t.id)) }));
    const vis = rows.filter((r) => r.on);
    const total = row(deals.filter((d) => isOn(T.tagVis, d.tag)));
    return { rows, vis, total, hidden: rows.length - vis.length };
  }

  function initTags() {
    T.tagVis = loadVis(TAG_VIS_KEY);
    T.webVis = loadVis(WEB_VIS_KEY);
    $('#distSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; T.dist = b.dataset.d; segOn('#distSeg', b); renderDist(); };
    const webSeg = $('#webDistSeg');
    if (webSeg) webSeg.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; T.webDist = b.dataset.d; segOn('#webDistSeg', b); renderWebDist(); };
    const showTags = $('#tagShowAll');
    if (showTags) showTags.onclick = () => { showAll('tag'); renderTags(false); };
    const showWeb = $('#webShowAll');
    if (showWeb) showWeb.onclick = () => { showAll('web'); renderWebinars(); };
  }

  function renderTags(animate) {
    const td = S.data.tags, st = tagStats(), tot = st.total;
    const asOf = new Date(td.updated + 'T00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    $('#tagAsOf').textContent = `Данные на ${asOf}`;
    const nAll = td.tags.length, nVis = nAll - st.hidden;
    $('#tagSub').textContent = st.hidden
      ? `Воронка «Телемаркетинг» · ${fmt(nVis)} из ${fmt(nAll)} тегов · ${fmt(tot.total)} сделок · данные на ${asOf}`
      : `Воронка «Телемаркетинг» · ${fmt(nAll)} тегов · ${fmt(tot.total)} сделок · данные на ${asOf}`;
    const showAllBtn = $('#tagShowAll');
    if (showAllBtn) showAllBtn.hidden = !st.hidden;
    $('#footSrc').textContent = `Источник: ${td.source || 'AmoCRM'}.`;
    $('#footUpd').textContent = dLong(td.updated);

    // таблица по тегам
    const ms = tMgrs();
    const tbl = $('#tagTable');
    $('thead', tbl).innerHTML = `<tr><th>Тег</th><th class="num">Всего</th><th class="num">Группа 4+</th><th class="num">Отработано</th><th class="pc">% от группы 4+</th>${ms.map((m) => `<th class="mg" title="взято в работу из 4+ / распределено из 4+ · только сделки группы 4+"><span class="who"><i style="background:${tMgrColor(m.name)}"></i>${esc(m.short)}</span></th>`).join('')}</tr>`;
    const cells = (r) => `<td class="num">${fmt(r.total)}</td><td class="num">${fmt(r.g4)}</td><td class="num b">${fmt(r.worked)}</td>
      <td class="pc"><div class="pcell"><span class="pbar"><i data-w="${Math.min(100, r.pct)}" style="background:${r.pct >= 100 ? 'var(--good)' : r.pct >= 50 ? 'var(--accent)' : r.pct >= 20 ? '#f59e0b' : 'var(--bad)'}"></i></span><b>${fmtPct(r.pct)}</b></div></td>
      ${ms.map((m) => {
        const w4 = r.m4[m.name] || 0, g4 = r.g4m[m.name] || 0, p = wdPct(w4, g4);
        return g4 ? `<td class="mg wd" title="${esc(m.short)}: взято в работу ${w4} из ${g4} распределённых сделок группы 4+"><div class="wd-c"><span class="wd-n"><b>${fmt(w4)}</b>/${fmt(g4)}</span><span class="wd-p">${p}%</span></div><span class="pbar xs"><i data-w="${p}" style="background:${wdColor(p)}"></i></span></td>`
          : '<td class="mg wd zero"><div class="wd-c"><span class="wd-n">—</span></div></td>'; }).join('')}`;
    if (T.tag && !isOn(T.tagVis, T.tag)) T.tag = '';
    const emptyCells = () => `<td class="num"></td><td class="num"></td><td class="num"></td><td class="pc"></td>${ms.map(() => '<td class="mg wd"></td>').join('')}`;
    $('tbody', tbl).innerHTML = st.rows.map((r) => `<tr data-t="${r.tag.id}" tabindex="${r.on ? '0' : '-1'}" class="${r.on ? '' : 'dim'}${r.on && String(r.tag.id) === T.tag ? ' on' : ''}">
      <td class="tname" title="${esc(r.tag.name)}"><span class="tname-in">${eyeBtn('tag', r.tag.id, r.on)}<span class="tdot" style="background:${tagColor(r.tag.id)}"></span><span class="tlabel">${esc(r.tag.name)}</span></span></td>${r.on ? cells(r) : emptyCells()}</tr>`).join('');
    $('tfoot', tbl).innerHTML = `<tr><td class="tname"><span class="tname-in"><span>Итого${st.hidden ? ` <span class="muted sm">(${fmt(nVis)} из ${fmt(nAll)})</span>` : ''}</span></span></td>${cells(tot)}</tr>`;
    requestAnimationFrame(() => $$('#tagTable .pbar i[data-w]').forEach((b) => (b.style.width = b.dataset.w + '%')));
    $$('#tagTable tbody tr').forEach((tr) => {
      const pick = (e) => {
        if (e && e.target.closest && e.target.closest('.eye')) return;
        if (tr.classList.contains('dim')) return;
        T.tag = T.tag === tr.dataset.t ? '' : tr.dataset.t;
        $$('#tagTable tbody tr').forEach((x) => x.classList.toggle('on', x.dataset.t === T.tag));
      };
      tr.onclick = pick;
      tr.onkeydown = (e) => { if (e.target.closest && e.target.closest('.eye')) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } };
    });
    $$('#tagTable .eye').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        setVis('tag', btn.dataset.id, !isOn(T.tagVis, btn.dataset.id));
        renderTags(false);
      };
    });

    renderDist();
    renderWebinars();
  }

  function renderDist() {
    const st = tagStats(), ms = tMgrs();
    const bar = (label, dot, w4, g4) => {
      const p = wdPct(w4, g4);
      return `<div class="dist-row${g4 ? '' : ' none'}">
        <span class="dist-l"><i style="background:${dot}"></i>${esc(label)}</span>
        <span class="dist-bar"><i data-w="${p}" style="background:${wdColor(p)}"></i></span>
        <span class="dist-v"><b>${fmt(w4)}</b>/${fmt(g4)} <em>(${g4 ? p + '%' : '—'})</em></span></div>`;
    };
    let html;
    const vis = st.vis || st.rows.filter((r) => r.on !== false);
    if (T.dist === 'tag') {
      html = vis.map((r) => `<div class="dist-g">
        <div class="dist-h"><span class="tdot" style="background:${tagColor(r.tag.id)}"></span><b>${esc(r.tag.name)}</b>
          <span class="dist-t" title="взято в работу из 4+ / распределено из 4+">${fmt(r.worked4)}/${fmt(r.g4)}</span></div>
        ${ms.filter((m) => r.g4m[m.name]).map((m) => bar(m.short, tMgrColor(m.name), r.m4[m.name] || 0, r.g4m[m.name])).join('')}
      </div>`).join('');
    } else {
      html = ms.map((m) => `<div class="dist-g">
        <div class="dist-h"><span class="tdot round" style="background:${tMgrColor(m.name)}"></span><b>${esc(m.name)}</b>
          <span class="dist-t" title="взято в работу из 4+ / распределено из 4+">${fmt(st.total.m4[m.name] || 0)}/${fmt(st.total.g4m[m.name] || 0)}</span></div>
        ${vis.filter((r) => r.g4m[m.name]).map((r) => bar(r.tag.short, tagColor(r.tag.id), r.m4[m.name] || 0, r.g4m[m.name])).join('')}
      </div>`).join('');
    }
    $('#distGrid').innerHTML = html;
    $('#distGrid').classList.toggle('by-mgr', T.dist === 'mgr');
    requestAnimationFrame(() => $$('#distGrid .dist-bar i').forEach((b) => (b.style.width = b.dataset.w + '%')));
  }

  function wBlock() { return S.data.tags && S.data.tags.webinars; }
  function wMgrs() {
    const w = wBlock();
    if (w && w.managers && w.managers.length) return w.managers;
    return tMgrs();
  }
  function webStats() {
    const w = wBlock();
    const deals = (w && w.deals) || [];
    const ms = wMgrs();
    const row = (ds) => {
      const r = { total: ds.length, worked: 0, m: {}, d: {} };
      ms.forEach((m) => { r.m[m.name] = 0; r.d[m.name] = 0; });
      ds.forEach((d) => {
        if (d.manager) r.d[d.manager] = (r.d[d.manager] || 0) + 1;
        if (d.worked) {
          r.worked++;
          if (d.manager) r.m[d.manager] = (r.m[d.manager] || 0) + 1;
        }
      });
      r.pct = pct1(r.worked, r.total);
      return r;
    };
    const rows = ((w && w.tags) || []).map((t) => ({ tag: t, on: isOn(T.webVis, t.id), ...row(deals.filter((d) => d.tag === t.id)) }));
    const vis = rows.filter((r) => r.on);
    const total = row(deals.filter((d) => isOn(T.webVis, d.tag)));
    return { rows, vis, total, hidden: rows.length - vis.length };
  }
  function renderWebinars() {
    const box = $('#webinarsBlock');
    const w = wBlock();
    if (!box) return;
    if (!w || !w.tags || !w.tags.length) { box.hidden = true; return; }
    box.hidden = false;
    const st = webStats(), tot = st.total, ms = wMgrs();
    const note = w.note || 'все сделки, без фильтра по группе';
    if ($('#webNote')) $('#webNote').textContent = note + (st.hidden ? ` · ${fmt(st.rows.length - st.hidden)} из ${fmt(st.rows.length)} тегов` : '');
    const webAll = $('#webShowAll');
    if (webAll) webAll.hidden = !st.hidden;
    const asEl = $('#webAsOf');
    if (asEl) {
      if (w.updated) {
        const asOf = new Date(w.updated + 'T00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        asEl.textContent = `Данные на ${asOf}`;
        asEl.hidden = false;
        asEl.title = w.source || '';
      } else { asEl.hidden = true; }
    }
    const tbl = $('#webTable');
    $('thead', tbl).innerHTML = `<tr><th>Тег</th><th class="num">Всего</th><th class="num">Отработано</th><th class="pc">% отработано</th>${ms.map((m) => `<th class="mg" title="взято в работу / всего · все сделки, без фильтра по группе"><span class="who"><i style="background:${tMgrColor(m.name)}"></i>${esc(m.short)}</span></th>`).join('')}</tr>`;
    const cells = (r) => `<td class="num">${fmt(r.total)}</td><td class="num b">${fmt(r.worked)}</td>
      <td class="pc"><div class="pcell"><span class="pbar"><i data-w="${Math.min(100, r.pct)}" style="background:${r.pct >= 100 ? 'var(--good)' : r.pct >= 50 ? 'var(--accent)' : r.pct >= 20 ? '#f59e0b' : 'var(--bad)'}"></i></span><b>${fmtPct(r.pct)}</b></div></td>
      ${ms.map((m) => {
        const ww = r.m[m.name] || 0, tt = r.d[m.name] || 0, p = wdPct(ww, tt);
        return tt ? `<td class="mg wd" title="${esc(m.short)}: взято в работу ${ww} из ${tt} сделок"><div class="wd-c"><span class="wd-n"><b>${fmt(ww)}</b>/${fmt(tt)}</span><span class="wd-p">${p}%</span></div><span class="pbar xs"><i data-w="${p}" style="background:${wdColor(p)}"></i></span></td>`
          : '<td class="mg wd zero"><div class="wd-c"><span class="wd-n">—</span></div></td>'; }).join('')}`;
    if (T.web && !isOn(T.webVis, T.web)) T.web = '';
    const emptyCells = () => `<td class="num"></td><td class="num"></td><td class="pc"></td>${ms.map(() => '<td class="mg wd"></td>').join('')}`;
    $('tbody', tbl).innerHTML = st.rows.map((r) => `<tr data-t="${esc(String(r.tag.id))}" tabindex="${r.on ? '0' : '-1'}" class="${r.on ? '' : 'dim'}${r.on && String(r.tag.id) === T.web ? ' on' : ''}">
      <td class="tname" title="${esc(r.tag.name)}${r.tag.crm ? ' · тег ' + r.tag.crm : ''}"><span class="tname-in">${eyeBtn('web', r.tag.id, r.on)}<span class="tdot" style="background:${webColor(r.tag.id)}"></span><span class="tlabel">${esc(r.tag.name)}</span></span></td>${r.on ? cells(r) : emptyCells()}</tr>`).join('');
    $('tfoot', tbl).innerHTML = `<tr><td class="tname"><span class="tname-in"><span>Итого${st.hidden ? ` <span class="muted sm">(${fmt(st.rows.length - st.hidden)} из ${fmt(st.rows.length)})</span>` : ''}</span></span></td>${cells(tot)}</tr>`;
    requestAnimationFrame(() => $$('#webTable .pbar i[data-w]').forEach((b) => (b.style.width = b.dataset.w + '%')));
    $$('#webTable tbody tr').forEach((tr) => {
      const pick = (e) => {
        if (e && e.target.closest && e.target.closest('.eye')) return;
        if (tr.classList.contains('dim')) return;
        T.web = T.web === tr.dataset.t ? '' : tr.dataset.t;
        $$('#webTable tbody tr').forEach((x) => x.classList.toggle('on', x.dataset.t === T.web));
      };
      tr.onclick = pick;
      tr.onkeydown = (e) => { if (e.target.closest && e.target.closest('.eye')) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } };
    });
    $$('#webTable .eye').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        setVis('web', btn.dataset.id, !isOn(T.webVis, btn.dataset.id));
        renderWebinars();
      };
    });
    renderWebDist();
  }
  function renderWebDist() {
    const grid = $('#webDistGrid');
    if (!grid || !wBlock()) return;
    const st = webStats(), ms = wMgrs();
    const bar = (label, dot, ww, tt) => {
      const p = wdPct(ww, tt);
      return `<div class="dist-row${tt ? '' : ' none'}">
        <span class="dist-l"><i style="background:${dot}"></i>${esc(label)}</span>
        <span class="dist-bar"><i data-w="${p}" style="background:${wdColor(p)}"></i></span>
        <span class="dist-v"><b>${fmt(ww)}</b>/${fmt(tt)} <em>(${tt ? p + '%' : '—'})</em></span></div>`;
    };
    let html;
    const vis = st.vis || st.rows.filter((r) => r.on !== false);
    if (T.webDist === 'tag') {
      html = vis.map((r) => `<div class="dist-g">
        <div class="dist-h"><span class="tdot" style="background:${webColor(r.tag.id)}"></span><b>${esc(r.tag.name)}</b>
          <span class="dist-t" title="взято в работу / всего">${fmt(r.worked)}/${fmt(r.total)}</span></div>
        ${ms.filter((m) => r.d[m.name]).map((m) => bar(m.short, tMgrColor(m.name), r.m[m.name] || 0, r.d[m.name])).join('')}
      </div>`).join('');
    } else {
      html = ms.map((m) => `<div class="dist-g">
        <div class="dist-h"><span class="tdot round" style="background:${tMgrColor(m.name)}"></span><b>${esc(m.name)}</b>
          <span class="dist-t" title="взято в работу / всего">${fmt(st.total.m[m.name] || 0)}/${fmt(st.total.d[m.name] || 0)}</span></div>
        ${vis.filter((r) => r.d[m.name]).map((r) => bar(r.tag.short, webColor(r.tag.id), r.m[m.name] || 0, r.d[m.name])).join('')}
      </div>`).join('');
    }
    grid.innerHTML = html;
    grid.classList.toggle('by-mgr', T.webDist === 'mgr');
    requestAnimationFrame(() => $$('#webDistGrid .dist-bar i').forEach((b) => (b.style.width = b.dataset.w + '%')));
  }

    // перерисовать графики при смене системной темы, если пользователь тему не выбирал
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    try { if (localStorage.getItem('dash-theme')) return; } catch (_) {}
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    if (S.data) { destroyCharts(); renderCurrent(false); }
  });

  boot();
})();
