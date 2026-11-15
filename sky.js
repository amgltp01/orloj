'use strict';
// The background: the real sky above you, as if you lay on your back with your head to the north (north up, east
// left). Zenith at the centre of the screen, the horizon a wide circle round it. The Milky Way, the bright stars and the
// constellations, the planets, the Moon and (by day) the Sun, all where they really are. Redrawn every half minute;
// a light layer on top twinkles the brightest stars and now and then sends a shooting star across.
(function (root) {
  const A = root.Astro, ST = root.Stars, D = A.D;

  // a small seeded random, so the faint stars and the Milky Way keep their places between redraws
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const FAINT = [], MILKY = [];
  for (let i = 0; i < 1600; i++) FAINT.push({ ra: rnd() * 360, dec: A.asin(rnd() * 2 - 1), mag: 4 + rnd() * 2.6, tint: rnd() });
  for (let i = 0; i < 9000; i++) {
    const l = rnd() * 360, near = Math.cos(A.norm180(l) * D / 2);   // brighter and wider toward the galactic centre
    const b = gauss() * (3 + 5 * Math.max(0, near));
    MILKY.push({ ...A.galToEq(l, b), w: 0.25 + 0.75 * Math.max(0, near) * Math.exp(-Math.abs(b) / 9) });
  }

  const PLANET_COLOR = { Mercury: '#d8cbb0', Venus: '#fff6dc', Mars: '#ff8a5c', Jupiter: '#f3dfb6', Saturn: '#e8d39a' };
  let bright = [];   // screen positions of the bright stars, for the twinkle layer
  let proj = null;   // the last projection, so the light layer can place the space station

  function draw(canvas, now, place) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = w / 2, cy = h / 2, Rh = Math.max(w, h) * 0.6;
    const toScreen = (alt, az) => { const r = Rh * Math.tan((90 - alt) / 2 * D); return [cx - r * Math.sin(az * D), cy - r * Math.cos(az * D)]; };
    proj = toScreen;
    const hz = (ra, dec) => A.eqToHorizon(ra, dec, now, place.lat, place.lon);
    const sun = A.sun(now), sunH = hz(sun.ra, sun.dec);
    // the sky colour follows the Sun: deep night, twilight blues, a muted day
    // by day only a hint of blue: the cosmos stays on show behind the clock
    const day = 0.32 * Math.max(0, Math.min(1, (sunH.alt + 12) / 18));
    const top = mix([3, 4, 12], [22, 52, 104], day), bot = mix([10, 12, 34], [64, 104, 160], day);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rh);
    g.addColorStop(0, `rgb(${top})`); g.addColorStop(1, `rgb(${bot})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const starAlpha = 1 - day * 0.9;

    // the Milky Way: thousands of faint specks, blurred into a band
    const mw = document.createElement('canvas'); mw.width = Math.ceil(w / 2); mw.height = Math.ceil(h / 2);
    const m = mw.getContext('2d'); m.fillStyle = '#c9d6ff';
    for (const p of MILKY) {
      const q = hz(p.ra, p.dec); if (q.alt < -2) continue;
      const [x, y] = toScreen(q.alt, q.az);
      m.globalAlpha = 0.05 * p.w; m.fillRect(x / 2, y / 2, 2.2, 2.2);
    }
    ctx.save(); ctx.globalAlpha = starAlpha; ctx.filter = 'blur(7px)'; ctx.drawImage(mw, 0, 0, w, h); ctx.filter = 'none'; ctx.restore();

    // faint stars
    for (const s of FAINT) {
      const q = hz(s.ra, s.dec); if (q.alt < 0) continue;
      const [x, y] = toScreen(q.alt, q.az); if (x < -5 || y < -5 || x > w + 5 || y > h + 5) continue;
      ctx.globalAlpha = starAlpha * (0.9 - (s.mag - 4) * 0.3);
      ctx.fillStyle = s.tint < 0.15 ? '#ffd9b0' : s.tint > 0.85 ? '#bcd2ff' : '#ffffff';
      ctx.fillRect(x, y, s.mag < 5 ? 1.4 : 1, s.mag < 5 ? 1.4 : 1);
    }
    ctx.globalAlpha = 1;

    // constellation lines and names
    const pos = {};
    for (const [k, s] of Object.entries(ST.S)) { const q = hz(s[0] * 15, s[1]); pos[k] = { q, xy: toScreen(q.alt, q.az), s }; }
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(232,198,106,${0.22 * starAlpha})`;
    for (const [name, lines] of Object.entries(ST.LINES)) {
      let sx = 0, sy = 0, n = 0;
      for (const [a, b] of lines) {
        const p1 = pos[a], p2 = pos[b]; if (!p1 || !p2 || (p1.q.alt < 0 && p2.q.alt < 0)) continue;
        ctx.beginPath(); ctx.moveTo(...p1.xy); ctx.lineTo(...p2.xy); ctx.stroke();
        sx += p1.xy[0] + p2.xy[0]; sy += p1.xy[1] + p2.xy[1]; n += 2;
      }
      if (n) { ctx.font = '500 12px Cambria, Georgia, serif'; ctx.fillStyle = `rgba(232,198,106,${0.35 * starAlpha})`; ctx.textAlign = 'center'; ctx.fillText(name.toUpperCase().split('').join(' '), sx / n, sy / n + 18); }
    }
    // bright stars, with names for the brightest
    bright = [];
    for (const [k, p] of Object.entries(pos)) {
      if (p.q.alt < 0) continue;
      const [x, y] = p.xy, mag = p.s[2];
      const r = Math.max(0.8, 3.4 - 0.75 * mag);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      glow.addColorStop(0, `rgba(255,255,255,${0.9 * starAlpha})`); glow.addColorStop(0.25, `rgba(200,220,255,${0.35 * starAlpha})`); glow.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, Math.PI * 2); ctx.fill();
      if (mag < 1.6) {
        ctx.font = 'italic 12px Cambria, Georgia, serif'; ctx.fillStyle = `rgba(220,230,255,${0.45 * starAlpha})`; ctx.textAlign = 'left';
        ctx.fillText(ST.label(k), x + r * 2 + 4, y - 4);
      }
      if (mag < 2.2) bright.push({ x, y, r, ph: Math.random() * 6.28 });
    }

    // planets
    for (const name of A.PLANETS) {
      const pl = A.planet(name, now), q = hz(pl.ra, pl.dec); if (q.alt < 0) continue;
      const [x, y] = toScreen(q.alt, q.az);
      const r = name === 'Venus' ? 4.2 : name === 'Jupiter' ? 3.8 : 3;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4.5);
      glow.addColorStop(0, PLANET_COLOR[name]); glow.addColorStop(0.3, PLANET_COLOR[name] + '66'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.font = '600 13px Cambria, Georgia, serif'; ctx.fillStyle = 'rgba(255,236,190,.75)'; ctx.textAlign = 'left'; ctx.fillText(name, x + 10, y + 4);
    }
    // the Moon and the Sun
    const mo = A.moon(now), mq = hz(mo.ra, mo.dec);
    if (mq.alt > -1) {
      const [x, y] = toScreen(mq.alt, mq.az);
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 90); halo.addColorStop(0, 'rgba(230,236,255,.22)'); halo.addColorStop(1, 'rgba(230,236,255,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 90, 0, Math.PI * 2); ctx.fill();
      root.Orloj.drawMoon(ctx, x, y, 16, A.moonPhase(now));
    }
    if (sunH.alt > -1) {
      const [x, y] = toScreen(sunH.alt, sunH.az);
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 160); halo.addColorStop(0, 'rgba(255,240,200,.9)'); halo.addColorStop(0.12, 'rgba(255,220,150,.45)'); halo.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 160, 0, Math.PI * 2); ctx.fill();
    }

    // below the horizon: the dark ground, a glow along the horizon and the four directions
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(cx, cy, Rh, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(2,2,4,.92)'; ctx.fill('evenodd');
    const hg = ctx.createRadialGradient(cx, cy, Rh * 0.9, cx, cy, Rh * 1.02);
    hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.85, `rgba(${mix([40, 50, 90], [255, 170, 100], Math.max(0, Math.min(1, (sunH.alt + 18) / 18)))},.35)`); hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, Rh * 1.02, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.font = '600 13px Cambria, Georgia, serif'; ctx.fillStyle = 'rgba(232,198,106,.55)'; ctx.textAlign = 'center';
    for (const [lbl, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
      const [x, y] = toScreen(2, az); if (x > 10 && y > 10 && x < w - 10 && y < h - 10) ctx.fillText(lbl, x, y);
    }
  }

  // the light layer: twinkling and shooting stars
  let meteor = null, nextMeteor = performance.now() + 15000;
  function animate(canvas, t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    for (const b of bright) {
      const s = 0.5 + 0.5 * Math.sin(t / 700 + b.ph * 7) * Math.sin(t / 1900 + b.ph);
      if (s < 0.55) continue;
      ctx.strokeStyle = `rgba(255,255,255,${(s - 0.55) * 0.9})`; ctx.lineWidth = 0.8;
      const L = b.r * 4 * s;
      ctx.beginPath(); ctx.moveTo(b.x - L, b.y); ctx.lineTo(b.x + L, b.y); ctx.moveTo(b.x, b.y - L); ctx.lineTo(b.x, b.y + L); ctx.stroke();
    }
    if (!meteor && t > nextMeteor) {
      const a = (200 + Math.random() * 50) * D;
      meteor = { x: w * (0.3 + Math.random() * 0.7), y: h * Math.random() * 0.4, vx: Math.cos(a) * 0.9, vy: -Math.sin(a) * 0.9, t0: t, life: 900 + Math.random() * 500 };
      nextMeteor = t + 20000 + Math.random() * 40000;
    }
    // the space station, live: a steady light gliding across (dim red when it is in the Earth's shadow), with its trail
    if (proj && root.SkyLive) {
      const st = root.SkyLive();
      if (st && st.now && st.now.alt > -1) {
        const [x, y] = proj(st.now.alt, st.now.az);
        if (st.trail && st.trail.length) {
          ctx.beginPath(); st.trail.forEach((q, k) => { const [tx, ty] = proj(q.alt, q.az); if (k) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty); }); ctx.lineTo(x, y);
          ctx.strokeStyle = st.now.lit ? 'rgba(160,230,255,.35)' : 'rgba(255,120,100,.2)'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        const pulse = 0.85 + 0.15 * Math.sin(t / 300);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, st.now.lit ? `rgba(255,255,255,${pulse})` : 'rgba(255,120,100,.6)'); g.addColorStop(0.3, st.now.lit ? 'rgba(150,225,255,.5)' : 'rgba(255,90,70,.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.font = '600 13px Cambria, Georgia, serif'; ctx.fillStyle = st.now.lit ? 'rgba(170,235,255,.95)' : 'rgba(255,150,130,.7)'; ctx.textAlign = 'left';
        ctx.fillText('ISS' + (st.now.lit ? '' : ' (in shadow)'), x + 12, y - 8);
      }
    }
    if (meteor) {
      const k = (t - meteor.t0) / meteor.life;
      if (k > 1) meteor = null;
      else {
        const x = meteor.x + meteor.vx * (t - meteor.t0), y = meteor.y + meteor.vy * (t - meteor.t0);
        const g = ctx.createLinearGradient(x, y, x - meteor.vx * 160, y - meteor.vy * 160);
        g.addColorStop(0, `rgba(255,255,255,${1 - k})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - meteor.vx * 160, y - meteor.vy * 160); ctx.stroke();
      }
    }
  }

  function mix(a, b, k) { return a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(','); }
  root.Sky = { draw, animate };
})(typeof window !== 'undefined' ? window : globalThis);
