'use strict';
// The focus clock: focus and break periods counted as golden orbits round the dial, your place and name,
// the side cards (Moon, Sun, what is above you, your focus record) and the bell.
(function () {
  const A = window.Astro, ST = window.Stars;
  // ?at=2026-11-15T23:00 shows the sky and the dial at another moment (for trying it out); the timer keeps real time
  const atQ = new URLSearchParams(location.search).get('at'), shift = atQ && !isNaN(Date.parse(atQ)) ? Date.parse(atQ) - Date.now() : 0;
  const nowD = () => new Date(Date.now() + shift);
  const HM = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('orloj.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('orloj.' + k, JSON.stringify(v)); } catch { /* private window: not kept */ } },
  };

  // ---------- your settings (Lisbon by default)
  const cfg = Object.assign({ name: '', place: 'Lisboa', lat: 38.7223, lon: -9.1393, focus: 25, short: 5, long: 15, every: 4, auto: false, sound: true }, store.get('cfg', {}));
  // Stored values are only trusted as numbers (another page on the same origin could write them).
  const num0 = v => (Number.isFinite(+v) ? +v : 0);
  for (const [k, d] of [['lat', 38.7223], ['lon', -9.1393], ['focus', 25], ['short', 5], ['long', 15], ['every', 4]]) {
    if (!Number.isFinite(+cfg[k])) cfg[k] = d; else cfg[k] = +cfg[k];
  }
  cfg.name = String(cfg.name ?? ''); cfg.place = String(cfg.place ?? '');
  const PRESETS = [[25, 5, 15], [50, 10, 20], [90, 20, 30]];

  // ---------- the timer: it keeps its end time, so a reload or a sleeping laptop does not lose it
  const T = Object.assign({ mode: 'focus', running: false, endAt: 0, left: cfg.focus * 60e3, cycle: 1, startedAt: 0 }, store.get('timer', {}));
  const totalOf = mode => (mode === 'focus' ? cfg.focus : mode === 'short' ? cfg.short : cfg.long) * 60e3;
  const leftNow = () => T.running ? Math.max(0, T.endAt - Date.now()) : T.left;
  const save = () => store.set('timer', T);
  function start() { if (T.running) return; T.running = true; T.endAt = Date.now() + T.left; if (!T.startedAt) T.startedAt = Date.now(); save(); unlockAudio(); askNotify(); render(); }
  function pause() { if (!T.running) return; T.left = leftNow(); T.running = false; save(); render(); }
  function reset() { T.running = false; T.left = totalOf(T.mode); T.startedAt = 0; save(); render(); }
  function setMode(mode) { T.mode = mode; T.running = false; T.left = totalOf(mode); T.startedAt = 0; save(); }
  function finish(skipped) {
    const was = T.mode;
    if (was === 'focus') {
      if (!skipped) record(cfg.focus);
      const next = T.cycle % cfg.every === 0 ? 'long' : 'short';
      setMode(next);
      if (!skipped) toll(3, 'The bell tolls: orbit ' + T.cycle + ' complete', next === 'long' ? 'A long rest: ' + cfg.long + ' minutes.' : 'Rest for ' + cfg.short + ' minutes.');
    } else {
      T.cycle = was === 'long' ? 1 : T.cycle + 1;
      setMode('focus');
      if (!skipped) toll(1, 'Back to the work', 'Orbit ' + T.cycle + ' of ' + cfg.every + '.');
    }
    if (cfg.auto && !skipped) start();
    render();
  }

  // ---------- your record: focused minutes and orbits per day
  const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function record(min) {
    const days = store.get('days', {}), k = dayKey(new Date());
    days[k] = { min: num0((days[k] || {}).min) + min, orbits: num0((days[k] || {}).orbits) + 1 };
    store.set('days', days);
  }
  function streak(days) {
    let n = 0; const d = new Date();
    if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ---------- the bell (like the Orloj's: a few slow strokes), and a notification when the window is hidden
  let ac = null;
  function unlockAudio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { /* no sound */ } }
  function strike(at) {
    const partials = [[1, 0.6], [2.01, 0.25], [2.76, 0.18], [5.4, 0.08], [0.5, 0.2]];
    for (const [f, g] of partials) {
      const o = ac.createOscillator(), v = ac.createGain();
      o.type = 'sine'; o.frequency.value = 330 * f;
      v.gain.setValueAtTime(0, at); v.gain.linearRampToValueAtTime(g * 0.5, at + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, at + 3.6 / Math.sqrt(f));
      o.connect(v).connect(ac.destination); o.start(at); o.stop(at + 4);
    }
  }
  function toll(n, title, sub) {
    if (cfg.sound && ac) for (let i = 0; i < n; i++) strike(ac.currentTime + 0.05 + i * 1.6);
    const b = $('#bell'); b.innerHTML = '🔔 ' + esc(title) + '<small>' + esc(sub) + '</small>'; b.classList.add('show');
    clearTimeout(toll.t); toll.t = setTimeout(() => b.classList.remove('show'), 7000);
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body: sub, icon: 'icon.svg', silent: !cfg.sound }); } catch { /* not allowed */ } }
  }
  function askNotify() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- drawing
  const place = () => ({ lat: Number(cfg.lat), lon: Number(cfg.lon) });
  const fmtTime = d => d ? d.toLocaleTimeString([], HM) : '—';
  const mmss = ms => { const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const dir = az => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(az / 45) % 8];

  function drawDial() {
    const cv = $('#dial'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(cv.clientWidth * dpr);
    if (!size) return;
    if (cv.width !== size) { cv.width = size; cv.height = size; }
    const total = totalOf(T.mode), left = leftNow();
    window.Orloj.drawDial(cv.getContext('2d'), size, nowD(), place(), { total, done: total - left, mode: T.mode === 'focus' ? 'focus' : 'break' });
  }

  function render() {
    const now = nowD(), left = leftNow();
    const h = now.getHours();
    $('#greet').textContent = (h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (cfg.name ? ', ' + cfg.name : '');
    $('#clock').textContent = now.toLocaleTimeString([], HM);
    $('#date').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    $('#place').textContent = `${cfg.place} · ${Math.abs(cfg.lat).toFixed(2)}°${cfg.lat >= 0 ? 'N' : 'S'} ${Math.abs(cfg.lon).toFixed(2)}°${cfg.lon >= 0 ? 'E' : 'W'}`;
    const label = { focus: 'Focus', short: 'Short break', long: 'Long break' }[T.mode];
    $('#mode').textContent = label; $('#mode').classList.toggle('break', T.mode !== 'focus');
    $('#remain').textContent = mmss(left);
    $('#orbit').textContent = T.mode === 'focus' ? `Orbit ${T.cycle} of ${cfg.every}` : 'Look away from the screen. Breathe.';
    $('#go').textContent = T.running ? 'Pause' : left < totalOf(T.mode) ? 'Resume' : T.mode === 'focus' ? 'Begin' : 'Begin break';
    document.title = T.running ? `${mmss(left)} · ${label}` : 'Orloj';
    $('#presets').innerHTML = PRESETS.map(([f, s, l], i) => `<button class="chip${cfg.focus === f && cfg.short === s ? ' on' : ''}" data-preset="${i}" title="Press ${i + 1}">${f} / ${s}</button>`).join('');
  }

  // the side cards: worked out once a minute
  function cards() {
    const now = nowD(), p = place();
    const ph = A.moonPhase(now), mo = A.moon(now), mq = A.eqToHorizon(mo.ra, mo.dec, now, p.lat, p.lon);
    const full = A.nextPhase(now, 180), nw = A.nextPhase(now, 0);
    const days = d => Math.max(0, Math.round((d - now) / 864e5));
    $('#moonTxt').innerHTML = `<b>${ph.name}</b> · ${Math.round(ph.lit * 100)}% lit<br><span class="mut">${mq.alt > 0 ? `${Math.round(mq.alt)}° up in the ${dir(mq.az)}` : 'below the horizon'} · ${Math.round(mo.distKm).toLocaleString()} km away</span><br>Full moon ${days(full) === 0 ? 'today' : 'in ' + days(full) + ' days'} · new moon ${days(nw) === 0 ? 'today' : 'in ' + days(nw) + ' days'}`;
    const mc = $('#moonIcon'), m = mc.getContext('2d'); m.clearRect(0, 0, 120, 120); window.Orloj.drawMoon(m, 60, 60, 46, ph);

    const st = A.sunTimes(now, p.lat, p.lon), su = A.sun(now), sq = A.eqToHorizon(su.ra, su.dec, now, p.lat, p.lon);
    const dayLen = st.rise && st.set ? (st.set - st.rise) / 36e5 : null;
    $('#sunTxt').innerHTML = `Rises <b>${fmtTime(st.rise)}</b><br>Sets <b>${fmtTime(st.set)}</b><br><span class="mut">${dayLen ? Math.floor(dayLen) + ' h ' + Math.round((dayLen % 1) * 60) + ' min of daylight' : ''}<br>${sq.alt > 0 ? Math.round(sq.alt) + '° up' : Math.round(-sq.alt) + '° below the horizon'}</span>`;

    const up = A.PLANETS.map(n => ({ n, q: (pl => A.eqToHorizon(pl.ra, pl.dec, now, p.lat, p.lon))(A.planet(n, now)) })).filter(x => x.q.alt > 3);
    const stars = Object.entries(ST.S).filter(([, s]) => s[2] < 1.3).map(([k, s]) => ({ k, q: A.eqToHorizon(s[0] * 15, s[1], now, p.lat, p.lon) })).filter(x => x.q.alt > 10).sort((a, b) => b.q.alt - a.q.alt).slice(0, 3);
    const sid = A.lst(now, p.lon) / 15;
    $('#aboveTxt').innerHTML = (up.length ? up.map(x => `<b>${x.n}</b> ${Math.round(x.q.alt)}° ${dir(x.q.az)}`).join('<br>') : '<span class="mut">No planet above the horizon</span>')
      + (stars.length ? `<br><span class="mut">${stars.map(x => ST.label(x.k)).join(', ')}</span>` : '')
      + `<br><span class="mut">Star time ${Math.floor(sid)}h ${String(Math.floor((sid % 1) * 60)).padStart(2, '0')}m</span>`;

    const dd = store.get('days', {}), t0 = dd[dayKey(now)] || {}, today = { min: num0(t0.min), orbits: num0(t0.orbits) };
    const week = []; for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); week.push({ k: dayKey(d), min: num0((dd[dayKey(d)] || {}).min), today: i === 0 }); }
    const max = Math.max(60, ...week.map(x => x.min));
    $('#statTxt').innerHTML = `Today <b>${Math.floor(today.min / 60) ? Math.floor(today.min / 60) + ' h ' : ''}${today.min % 60} min</b> · ${today.orbits} orbit${today.orbits === 1 ? '' : 's'}<br><span class="mut">${streak(dd)} day streak · this week ${Math.round(week.reduce((a, x) => a + x.min, 0) / 6) / 10} h</span>`;
    $('#week').replaceChildren(...week.map(x => {
      const bar = document.createElement('i');
      if (x.today) bar.className = 'today';
      bar.style.height = Math.max(4, x.min / max * 100) + '%';
      bar.title = `${x.k}: ${x.min} min`;
      return bar;
    }));
  }

  // ---------- a line of cosmic perspective, with real numbers, changing every 25 seconds
  function cosmicLines() {
    const now = nowD(), p = place(), out = [];
    const sessionS = T.startedAt ? (Date.now() - T.startedAt) / 1000 : 0;
    if (sessionS > 60) out.push(`Since this orbit began, the Earth has carried you ${Math.round(sessionS * 29.78).toLocaleString()} km round the Sun.`);
    out.push(`The ground under ${cfg.place} turns at ${Math.round(1674.4 * Math.cos(p.lat * Math.PI / 180)).toLocaleString()} km/h. You don't feel a thing.`);
    const su = A.sun(now), lt = su.dist * 499.005;
    out.push(`The sunlight in your room left the Sun ${Math.floor(lt / 60)} min ${Math.round(lt % 60)} s ago.`);
    const mo = A.moon(now); out.push(`The Moon is ${Math.round(mo.distKm).toLocaleString()} km away: its light takes ${(mo.distKm / 299792).toFixed(2)} s to reach you.`);
    const year = now.getFullYear();
    for (const [k, s] of Object.entries(ST.S)) {
      if (!s[3] || s[2] > 1.5) continue;
      const q = A.eqToHorizon(s[0] * 15, s[1], now, p.lat, p.lon); if (q.alt < 10) continue;
      const left = Math.round(year - s[3]);
      out.push(`${ST.label(k)} is ${Math.round(q.alt)}° up in the ${dir(q.az)}. Its light reaching you now left it ${s[3] < 2000 ? 'in ' + (left > 0 ? left : Math.abs(left) + ' BC') : 'about ' + Math.round(s[3]).toLocaleString() + ' years ago'}.`);
    }
    for (const n of ['Jupiter', 'Saturn', 'Mars', 'Venus']) {
      const pl = A.planet(n, now), q = A.eqToHorizon(pl.ra, pl.dec, now, p.lat, p.lon); if (q.alt < 5) continue;
      out.push(`${n} is ${pl.dist.toFixed(2)} AU away in the ${dir(q.az)}: the light you'd see left it ${Math.round(pl.dist * 8.317)} minutes ago.`);
    }
    const nextBig = events.find(e => e.big && e.at > now.getTime());
    if (nextBig) out.push(`Next in the sky: ${nextBig.title}, ${whenTxt(nextBig.at, now)}. ${nextBig.detail}`);
    if (issEl) { const q = window.ISS.look(issEl, now, p.lat, p.lon); out.push(`Right now the space station is ${Math.round(q.height)} km up, ${Math.round(q.range).toLocaleString()} km from you, going round the Earth every 93 minutes. Seven people live on it.`); }
    out.push(`Since 1410 the Prague clock has turned through about ${Math.round((year - 1410) * 366.24).toLocaleString()} sidereal days. This one started today.`);
    return out;
  }
  let cosmicI = 0;
  function cosmic() {
    const lines = cosmicLines(), el = $('#cosmic');
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = lines[cosmicI++ % lines.length]; el.style.opacity = 1; }, 700);
  }

  // ---------- what is coming up in the sky (worked out here) and the space station (its orbit fetched twice a day)
  let events = [], issEl = null, issPasses = [], issErr = '';
  const whenTxt = (ms, now) => {
    const d = new Date(ms), days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
    const hm = d.toLocaleTimeString([], HM);
    if (days === 0) return 'today ' + hm; if (days === 1) return 'tomorrow ' + hm; if (days === -1) return 'last night ' + hm;
    if (days < 7) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + hm;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  };
  function computeEvents() {
    const now = nowD(), all = window.SkyEvents.upcoming(now, { ...place(), name: cfg.place }, 60), soon = now.getTime() + 45 * 864e5;
    // the next weeks in full, and the next two eclipses you can see from here, however far ahead
    const near = all.filter(e => e.at <= soon && !(e.type === 'eclipse' && !e.here && e.title.startsWith('Penumbral')));
    const far = all.filter(e => e.type === 'eclipse' && e.here && e.at > soon).slice(0, 2);
    events = near.concat(far);
  }
  function computePasses() { if (issEl) issPasses = window.ISS.passes(issEl, nowD(), Number(cfg.lat), Number(cfg.lon), 7); }
  async function loadISS() {
    try { issEl = await window.ISS.orbit(); issErr = ''; computePasses(); }
    catch (e) { issErr = navigator.onLine === false ? 'offline' : 'unavailable'; }
    showSky();
  }
  const cardinal = az => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];
  function showSky() {
    const now = nowD();
    // the station: overhead now, or the next pass you can see
    let iss = '';
    if (issEl) {
      const q = window.ISS.look(issEl, now, Number(cfg.lat), Number(cfg.lon));
      const cur = issPasses.find(p => p.start <= now && p.end >= now);
      const next = issPasses.find(p => p.start > now);
      if (cur) iss = `<span class="live">🛰️ The space station is crossing your sky now</span>: look ${dir(q.az)}, ${Math.round(q.alt)}° up, until ${cur.end.toLocaleTimeString([], HM)}.`;
      else if (next) iss = `🛰️ <b>Space station</b> <span class="mut">next visible pass</span> ${whenTxt(next.start.getTime(), now)}: ${Math.round(next.max)}° high, ${cardinal(next.startAz)} → ${cardinal(next.endAz)}, ${Math.max(1, Math.round((next.end - next.start) / 6e4))} min${next.max >= 40 ? ' · <b>a bright one</b>' : ''}`;
      else iss = '🛰️ <b>Space station</b> <span class="mut">no visible pass over you in the next 7 days (it is in daylight or too low)</span>';
      iss += `<br><span class="mut">Right now ${Math.round(q.height)} km up, ${q.alt > 0 ? Math.round(q.alt) + '° above your horizon' : 'below your horizon'}.</span>`;
    } else iss = `🛰️ <span class="mut">Space station: ${issErr === 'offline' ? 'no internet, so no orbit yet' : issErr ? 'its orbit could not be fetched' : 'fetching its orbit…'}</span>`;
    $('#issTxt').innerHTML = iss;
    const list = events.filter(e => e.at > now.getTime() - 12 * 36e5).slice(0, 5);
    $('#eventsTxt').innerHTML = list.map(e => {
      const today = new Date(e.at).toDateString() === now.toDateString();
      return `<div class="ev${e.big ? ' big' : ''}${today ? ' now' : ''}"><span class="ic">${e.icon}</span><span><span class="t">${esc(e.title)}</span><span class="w">${whenTxt(e.at, now)}</span></span><span class="d">${esc(e.detail)}</span></div>`;
    }).join('') || '<span class="mut">Nothing special in the next weeks.</span>';
  }
  // the live station for the background sky: where it is now and where it was over the last 90 seconds
  window.SkyLive = () => {
    if (!issEl) return null;
    const now = nowD(), lat = Number(cfg.lat), lon = Number(cfg.lon);
    const q = window.ISS.look(issEl, now, lat, lon);
    if (q.alt < -1) return { now: q };
    const trail = []; for (let k = 90; k > 0; k -= 10) trail.push(window.ISS.look(issEl, new Date(now.getTime() - k * 1000), lat, lon));
    return { now: q, trail: trail.filter(x => x.alt > -1) };
  };
  // a heads-up: five minutes before a good station pass, and on the morning of a big sky event (once each)
  function skyAlerts() {
    const now = nowD(), told = store.get('told', {});
    const tell = (key, title, sub) => { if (told[key]) return; told[key] = Date.now(); store.set('told', told); toll(1, title, sub); };
    for (const p of issPasses) {
      const mins = (p.start - now) / 6e4;
      if (p.max >= 25 && mins > 0 && mins <= 5) tell('iss' + p.start.getTime(), 'The space station passes in ' + Math.ceil(mins) + ' min', `Look ${dir(p.startAz)}: it rises to ${Math.round(p.max)}° and sets ${dir(p.endAz)}.`);
    }
    for (const e of events) if (e.big && new Date(e.at).toDateString() === now.toDateString()) tell('ev' + e.type + e.at, e.icon + ' ' + e.title + ' today', e.detail);
    for (const k of Object.keys(told)) if (Date.now() - told[k] > 30 * 864e5) delete told[k];
    store.set('told', told);
  }

  // ---------- controls
  $('#go').onclick = () => (T.running ? pause() : start());
  $('#reset').onclick = reset;
  $('#skip').onclick = () => finish(true);
  $('#presets').onclick = e => { const b = e.target.closest('[data-preset]'); if (b) usePreset(Number(b.dataset.preset)); };
  function usePreset(i) { [cfg.focus, cfg.short, cfg.long] = PRESETS[i]; store.set('cfg', cfg); if (!T.running) { T.left = totalOf(T.mode); T.startedAt = 0; save(); } render(); drawDial(); }
  const full = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  $('#fullBtn').onclick = full;
  $('#helpBtn').onclick = () => $('#help').showModal();
  $('#settingsBtn').onclick = () => {
    $('#sName').value = cfg.name; $('#sPlace').value = cfg.place; $('#sLat').value = cfg.lat; $('#sLon').value = cfg.lon;
    $('#sFocus').value = cfg.focus; $('#sShort').value = cfg.short; $('#sLong').value = cfg.long; $('#sAuto').checked = cfg.auto; $('#sSound').checked = cfg.sound;
    $('#settings').showModal();
  };
  $('#settings').addEventListener('close', () => {
    if ($('#settings').returnValue !== 'save') return;
    const num = (el, lo, hi, d) => { const v = Number($(el).value); return Number.isFinite(v) && v >= lo && v <= hi ? v : d; };
    cfg.name = $('#sName').value.trim() || cfg.name; cfg.place = $('#sPlace').value.trim() || cfg.place;
    cfg.lat = num('#sLat', -89, 89, cfg.lat); cfg.lon = num('#sLon', -180, 180, cfg.lon);
    cfg.focus = Math.round(num('#sFocus', 1, 240, cfg.focus)); cfg.short = Math.round(num('#sShort', 1, 60, cfg.short)); cfg.long = Math.round(num('#sLong', 1, 90, cfg.long));
    cfg.auto = $('#sAuto').checked; cfg.sound = $('#sSound').checked;
    store.set('cfg', cfg);
    if (!T.running) { T.left = totalOf(T.mode); save(); }
    render(); cards(); computeEvents(); computePasses(); showSky(); drawDial(); redrawSky();
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input') || document.querySelector('dialog[open]')) return;
    if (e.code === 'Space') { e.preventDefault(); T.running ? pause() : start(); }
    else if (e.key === 'r' || e.key === 'R') reset();
    else if (e.key === 's' || e.key === 'S') finish(true);
    else if (e.key === 'f' || e.key === 'F') full();
    else if (['1', '2', '3'].includes(e.key)) usePreset(Number(e.key) - 1);
  });
  // quiet mode: during focus, with the mouse left alone for 6 seconds, everything but the dial and the time fades
  let idle = 0;
  const wake = () => { idle = Date.now(); document.body.classList.remove('deep'); };
  ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, wake, { passive: true }));

  // ---------- the loops
  const redrawSky = () => window.Sky.draw($('#sky'), nowD(), place());
  function tickSecond() {
    if (T.running && leftNow() <= 0) { T.left = 0; T.running = false; finish(false); }
    document.body.classList.toggle('deep', T.running && T.mode === 'focus' && Date.now() - idle > 6000);
    render(); drawDial();
  }
  function frame(t) { window.Sky.animate($('#twinkle'), t); requestAnimationFrame(frame); }

  wake(); render(); cards(); computeEvents(); showSky(); cosmic(); redrawSky(); drawDial();
  loadISS();
  setInterval(() => { showSky(); skyAlerts(); }, 15000);
  setInterval(() => { computeEvents(); computePasses(); }, 3 * 36e5);
  setInterval(loadISS, 6 * 36e5);
  setInterval(tickSecond, 1000);
  setInterval(cards, 60000);
  setInterval(cosmic, 25000);
  setInterval(redrawSky, 30000);
  window.addEventListener('resize', () => { redrawSky(); drawDial(); });
  requestAnimationFrame(frame);
})();
