'use strict';
// The astronomical dial, after the Prague Orloj (1410). It is a real astrolabe: the sky is projected stereographically
// from the south celestial pole onto the plane of the equator, so the north celestial pole is the centre, the Tropic of
// Capricorn is the edge of the plate and the Tropic of Cancer the small inner circle. South (noon) is at the top.
//  - The plate is fixed: blue day sky above the horizon, the dawn and dusk twilight (AURORA, CREPUSCULUM) below it,
//    black night under astronomical twilight, and the twelve unequal (Babylonian) hours as curved golden lines.
//  - The zodiac ring is the ecliptic: an off-centre circle that turns once a sidereal day.
//  - The Sun rides its golden hand, which points to the time on the Roman ring (I to XII, twice).
//  - The Moon rides its own hand and shows its phase. The star hand points to sidereal time.
//  - The outer ring of gothic numerals 1 to 24 is Old Bohemian time: hour 24 is sunset, and the ring turns through the year.
(function (root) {
  const A = root.Astro, D = A.D;
  const GOLD = '#e8c66a', GOLD_D = '#a8822e', GOLD_L = '#fff0b8';
  const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  const SIGNS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
  const EPS = 23.44;

  function drawDial(ctx, size, now, place, focus) {
    const R = size / 2, c = R;
    const lat = place.lat, lon = place.lon;
    const Rc = R * 0.665;                                   // Tropic of Capricorn: the edge of the plate
    const Req = Rc / Math.tan((90 + EPS) / 2 * D);          // the equator
    const Rcan = Req * Math.tan((90 - EPS) / 2 * D);        // Tropic of Cancer
    const rOf = dec => Req * Math.tan((90 - dec) / 2 * D);
    // a point of the sky by hour angle H (degrees, 0 = south/noon, growing westward) and declination
    const P = (H, dec) => { const r = rOf(dec); return [c + r * Math.sin(H * D), c - r * Math.cos(H * D)]; };
    const lstNow = A.lst(now, lon);
    const d = A.days2000(now);

    ctx.clearRect(0, 0, size, size);
    ctx.save();

    // ---------- the stone frame and its golden edges
    const fr = ctx.createRadialGradient(c, c, R * 0.86, c, c, R);
    fr.addColorStop(0, '#2b2420'); fr.addColorStop(0.5, '#3d332b'); fr.addColorStop(1, '#1a1512');
    disk(ctx, c, c, R * 0.995, fr);
    ring(ctx, c, c, R * 0.993, GOLD_D, R * 0.006);
    // the focus band: gold fills clockwise from the top as your session runs
    if (focus && focus.total > 0) {
      const p = Math.max(0, Math.min(1, focus.done / focus.total));
      ctx.beginPath(); ctx.arc(c, c, R * 0.965, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, false);
      ctx.strokeStyle = 'rgba(232,198,106,.13)'; ctx.lineWidth = R * 0.026; ctx.stroke();
      if (p > 0) {
        ctx.beginPath(); ctx.arc(c, c, R * 0.965, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p, false);
        const g = ctx.createLinearGradient(0, 0, size, size); g.addColorStop(0, focus.mode === 'focus' ? '#ffe39a' : '#9fe0ff'); g.addColorStop(1, focus.mode === 'focus' ? '#c48a26' : '#3f86c4');
        ctx.strokeStyle = g; ctx.lineWidth = R * 0.026; ctx.lineCap = 'round';
        ctx.shadowColor = focus.mode === 'focus' ? 'rgba(255,210,120,.8)' : 'rgba(120,200,255,.8)'; ctx.shadowBlur = R * 0.04; ctx.stroke(); ctx.shadowBlur = 0;
        // the comet at the head of the band
        const a = -Math.PI / 2 + Math.PI * 2 * p, hx = c + R * 0.965 * Math.cos(a), hy = c + R * 0.965 * Math.sin(a);
        const cg = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.05); cg.addColorStop(0, '#fffbe8'); cg.addColorStop(0.3, 'rgba(255,230,160,.8)'); cg.addColorStop(1, 'rgba(255,200,100,0)');
        disk(ctx, hx, hy, R * 0.05, cg);
      }
    }
    ring(ctx, c, c, R * 0.935, GOLD_D, R * 0.005);
    // little golden studs round the frame
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; disk(ctx, c + R * 0.92 * Math.cos(a), c + R * 0.92 * Math.sin(a), R * 0.004, 'rgba(232,198,106,.5)'); }

    // ---------- Old Bohemian time: gothic 1 to 24, hour 24 at sunset
    const sunNow = A.sun(now);
    const H0 = A.acos((A.sin(-0.833) - A.sin(lat) * A.sin(sunNow.dec)) / (A.cos(lat) * A.cos(sunNow.dec)));  // hour angle of sunset
    ring(ctx, c, c, R * 0.905, GOLD, R * 0.004);
    band(ctx, c, c, R * 0.905, R * 0.79, '#0f0d0c');
    ring(ctx, c, c, R * 0.79, GOLD, R * 0.004);
    for (let n = 1; n <= 24; n++) {
      const H = H0 + n * 15;
      textAt(ctx, String(n), c, c, R * 0.848, H, `600 ${R * 0.058}px Gabriola, Cambria, Georgia, serif`, n === 24 ? '#ffd27a' : GOLD, true);
    }
    for (let n = 0; n < 24; n++) tick(ctx, c, c, H0 + n * 15 + 7.5, R * 0.795, R * 0.81, 'rgba(232,198,106,.45)', R * 0.003);

    // ---------- the Roman ring, turned so that the Sun hand shows your clock time
    const sunEq = A.eqToHorizon(sunNow.ra, sunNow.dec, now, lat, lon);
    const clockH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const ringRot = sunEq.H - (clockH - 12) * 15;
    band(ctx, c, c, R * 0.785, R * 0.675, '#16130f');
    ring(ctx, c, c, R * 0.675, GOLD, R * 0.004);
    for (let h = 0; h < 24; h++) {
      const ang = h * 15 + ringRot;   // h = 0 is noon (XII at the top), h = 12 midnight (XII at the bottom)
      textAt(ctx, ROMAN[h % 12], c, c, R * 0.73, ang, `700 ${R * 0.05}px Cambria, Georgia, serif`, GOLD, true);
      for (let q = 1; q < 4; q++) tick(ctx, c, c, ang + q * 3.75, R * 0.765, R * 0.78, 'rgba(232,198,106,.35)', R * 0.0025);
    }

    // ---------- the plate: night, twilight, day
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, Rc, 0, Math.PI * 2); ctx.clip();
    disk(ctx, c, c, Rc, '#050607');
    const altPoly = h => {
      ctx.beginPath();
      for (let az = 0; az <= 360; az += 2) {
        const dec = A.asin(A.sin(lat) * A.sin(h) + A.cos(lat) * A.cos(h) * A.cos(az));
        const H = A.atan2(-A.sin(az) * A.cos(h), (A.sin(h) - A.sin(lat) * A.sin(dec)) / A.cos(lat));
        const [x, y] = P(H, Math.max(dec, -80));
        if (az === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    const fillAlt = (h, fill) => { altPoly(h); ctx.fillStyle = fill; ctx.fill(); };
    fillAlt(-18, '#2c1709'); fillAlt(-12, '#4a240d'); fillAlt(-6, '#7a3a12');
    const sky = ctx.createRadialGradient(c, c - Rc * 0.2, Rc * 0.05, c, c, Rc);
    sky.addColorStop(0, '#5d95e0'); sky.addColorStop(1, '#1c3f86');
    fillAlt(0, sky);
    // the horizon and the twilight lines
    altPoly(0); ctx.strokeStyle = GOLD; ctx.lineWidth = R * 0.005; ctx.stroke();
    altPoly(-18); ctx.strokeStyle = 'rgba(232,198,106,.5)'; ctx.lineWidth = R * 0.003; ctx.stroke();
    // the unequal hours: daylight split into twelve, on every day of the year
    ctx.strokeStyle = 'rgba(15,12,8,.85)'; ctx.lineWidth = R * 0.006;
    const hourLine = (k, stroke, width) => {
      ctx.beginPath();
      for (let dec = -EPS; dec <= EPS + 0.01; dec += 1) {
        const h0 = A.acos(-Math.tan(lat * D) * Math.tan(dec * D));
        const [x, y] = P(-h0 + k * (2 * h0 / 12), dec);
        if (dec === -EPS) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
    };
    for (let k = 1; k < 12; k++) { hourLine(k, 'rgba(0,0,0,.55)', R * 0.009); hourLine(k, GOLD, R * 0.0035); }
    for (let k = 1; k <= 12; k++) {
      const h0 = A.acos(-Math.tan(lat * D) * Math.tan(-EPS * D));
      const H = -h0 + (k - 0.5) * (2 * h0 / 12);
      textAt(ctx, String(k), c, c, Rc * 0.92, H, `700 ${R * 0.042}px Cambria, Georgia, serif`, GOLD_L, true, 'rgba(0,0,0,.6)');
    }
    // the tropics and the equator
    ring(ctx, c, c, Rcan, 'rgba(232,198,106,.55)', R * 0.003);
    ring(ctx, c, c, Req, 'rgba(232,198,106,.55)', R * 0.003);
    // the Latin words of the dial
    const word = (txt, az, h, color) => {
      const dec = A.asin(A.sin(lat) * A.sin(h) + A.cos(lat) * A.cos(h) * A.cos(az));
      const H = A.atan2(-A.sin(az) * A.cos(h), (A.sin(h) - A.sin(lat) * A.sin(dec)) / A.cos(lat));
      const [x, y] = P(H, dec);
      ctx.font = `600 ${R * 0.034}px Cambria, Georgia, serif`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, x, y);
    };
    word('ORTUS', 80, 3, GOLD_L); word('OCCASUS', 280, 3, GOLD_L);
    word('AURORA', 75, -12, '#f2b46a'); word('CREPUSCULUM', 285, -12, '#f2b46a');
    word('NOX', 180, -45, 'rgba(232,198,106,.6)');
    ctx.restore();
    ring(ctx, c, c, Rc, GOLD, R * 0.006);

    // ---------- the zodiac ring (the ecliptic), turning with the stars
    const ecl = lam => { const q = A.eclToEq(lam, 0, d); return P(lstNow - q.ra, q.dec); };
    const pCan = ecl(90), pCap = ecl(270);
    const zc = [(pCan[0] + pCap[0]) / 2, (pCan[1] + pCap[1]) / 2], zr = Math.hypot(pCan[0] - pCap[0], pCan[1] - pCap[1]) / 2;
    const zw = R * 0.075;
    ctx.save();
    ctx.beginPath(); ctx.arc(zc[0], zc[1], zr, 0, Math.PI * 2); ctx.arc(zc[0], zc[1], zr - zw, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(18,14,10,.82)'; ctx.fill('evenodd');
    ring(ctx, zc[0], zc[1], zr, GOLD, R * 0.0045); ring(ctx, zc[0], zc[1], zr - zw, GOLD, R * 0.0035);
    const onBand = (lam, f) => { const p = ecl(lam); return [zc[0] + (p[0] - zc[0]) * f, zc[1] + (p[1] - zc[1]) * f]; };
    for (let lam = 0; lam < 360; lam += 5) {
      const big = lam % 30 === 0, f1 = 1, f2 = (zr - (big ? zw : zw * 0.25)) / zr;
      const a = onBand(lam, f1), b = onBand(lam, f2);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = big ? GOLD : 'rgba(232,198,106,.5)'; ctx.lineWidth = R * (big ? 0.003 : 0.002); ctx.stroke();
    }
    for (let k = 0; k < 12; k++) {
      const [x, y] = onBand(k * 30 + 15, (zr - zw * 0.52) / zr);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(y - zc[1], x - zc[0]) + Math.PI / 2);
      ctx.font = `${R * 0.048}px "Segoe UI Symbol", Cambria, serif`; ctx.fillStyle = GOLD_L; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(SIGNS[k] + '︎', 0, 0); ctx.restore();
    }
    ctx.restore();

    // ---------- the star hand: sidereal time (it points at the First Point of Aries)
    const aries = ecl(0);
    const starAng = Math.atan2(aries[1] - c, aries[0] - c);
    hand(ctx, c, c, starAng, R * 0.78, 'rgba(232,198,106,.85)', R * 0.004);
    star(ctx, c + R * 0.785 * Math.cos(starAng), c + R * 0.785 * Math.sin(starAng), R * 0.03, GOLD_L);

    // ---------- the Moon on its hand, showing its phase
    const mo = A.moon(now), ph = A.moonPhase(now);
    const mp = P(lstNow - mo.ra, mo.dec);
    const moonAng = Math.atan2(mp[1] - c, mp[0] - c);
    hand(ctx, c, c, moonAng, R * 0.66, 'rgba(200,210,225,.75)', R * 0.004);
    drawMoon(ctx, mp[0], mp[1], R * 0.042, ph);

    // ---------- the Sun on the golden hand, which points to the time
    const sp = P(sunEq.H, sunNow.dec);
    const sunAng = Math.atan2(sp[1] - c, sp[0] - c);
    goldenHand(ctx, c, c, sunAng, R * 0.775, R);
    drawSun(ctx, sp[0], sp[1], R * 0.05);

    // ---------- the Earth at the centre, with your place
    const eg = ctx.createRadialGradient(c - R * 0.012, c - R * 0.012, 0, c, c, R * 0.05);
    eg.addColorStop(0, '#3b7bb8'); eg.addColorStop(0.7, '#123a63'); eg.addColorStop(1, '#0a1c30');
    disk(ctx, c, c, R * 0.045, eg); ring(ctx, c, c, R * 0.045, GOLD, R * 0.004);
    disk(ctx, c, c, R * 0.012, GOLD);

    ctx.restore();
    return { sunTimeOK: true };
  }

  // ---------- drawing helpers
  function disk(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  function ring(ctx, x, y, r, stroke, w) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); }
  function band(ctx, x, y, r1, r2, fill) { ctx.beginPath(); ctx.arc(x, y, r1, 0, Math.PI * 2); ctx.arc(x, y, r2, 0, Math.PI * 2, true); ctx.fillStyle = fill; ctx.fill('evenodd'); }
  // text placed on a ring at hour angle H (0 = top, clockwise), turned to follow the ring
  function textAt(ctx, txt, cx, cy, r, H, font, color, rotate, shadow) {
    const x = cx + r * Math.sin(H * D), y = cy - r * Math.cos(H * D);
    ctx.save(); ctx.translate(x, y); if (rotate) ctx.rotate(H * D);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (shadow) { ctx.fillStyle = shadow; ctx.fillText(txt, 1, 1.5); }
    ctx.fillStyle = color; ctx.fillText(txt, 0, 0); ctx.restore();
  }
  function tick(ctx, cx, cy, H, r1, r2, color, w) {
    ctx.beginPath(); ctx.moveTo(cx + r1 * Math.sin(H * D), cy - r1 * Math.cos(H * D)); ctx.lineTo(cx + r2 * Math.sin(H * D), cy - r2 * Math.cos(H * D));
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  function hand(ctx, cx, cy, ang, len, color, w) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + len * Math.cos(ang), cy + len * Math.sin(ang));
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
  }
  function star(ctx, x, y, r, color) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath();
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, rr = k % 2 ? r * 0.35 : r; ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a)); }
    ctx.closePath(); ctx.fillStyle = color; ctx.shadowColor = 'rgba(255,240,180,.9)'; ctx.shadowBlur = r; ctx.fill(); ctx.restore();
  }
  // the golden hand of the Orloj: a gilded arm ending in a hand with a pointing finger
  function goldenHand(ctx, cx, cy, ang, len, R) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, -R * 0.02, 0, R * 0.02); g.addColorStop(0, '#fff2c0'); g.addColorStop(0.5, '#d9a93e'); g.addColorStop(1, '#8a6420');
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = R * 0.02; ctx.shadowOffsetY = R * 0.006;
    ctx.beginPath();
    ctx.moveTo(-R * 0.07, -R * 0.012); ctx.lineTo(len - R * 0.09, -R * 0.011); ctx.lineTo(len - R * 0.09, R * 0.011); ctx.lineTo(-R * 0.07, R * 0.012); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    // the cuff and the hand
    ctx.beginPath(); ctx.ellipse(len - R * 0.085, 0, R * 0.012, R * 0.026, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(len - R * 0.078, -R * 0.022);
    ctx.quadraticCurveTo(len - R * 0.04, -R * 0.028, len - R * 0.035, -R * 0.008);
    ctx.lineTo(len, -R * 0.006); ctx.quadraticCurveTo(len + R * 0.008, 0, len, R * 0.006);
    ctx.lineTo(len - R * 0.035, R * 0.008);
    ctx.quadraticCurveTo(len - R * 0.04, R * 0.026, len - R * 0.078, R * 0.022); ctx.closePath();
    ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#6e4e16'; ctx.lineWidth = R * 0.002; ctx.stroke();
    // a counterweight on the other side
    ctx.beginPath(); ctx.arc(-R * 0.075, 0, R * 0.018, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }
  function drawSun(ctx, x, y, r) {
    ctx.save(); ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2); glow.addColorStop(0, 'rgba(255,220,120,.55)'); glow.addColorStop(1, 'rgba(255,200,80,0)');
    disk(ctx, 0, 0, r * 2.2, glow);
    ctx.beginPath();
    for (let k = 0; k < 32; k++) { const a = k * Math.PI / 16, rr = k % 2 ? r * 0.78 : r * 1.25; ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a)); }
    ctx.closePath(); ctx.fillStyle = '#f2c14e'; ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r * 0.75); g.addColorStop(0, '#fff6cf'); g.addColorStop(1, '#e0a12a');
    disk(ctx, 0, 0, r * 0.72, g);
    ctx.restore();
  }
  // the Moon with its lit part: a disc in shadow, the lit half, and the terminator as a half-ellipse
  function drawMoon(ctx, x, y, r, ph) {
    ctx.save(); ctx.translate(x, y);
    disk(ctx, 0, 0, r * 1.18, 'rgba(0,0,0,.55)');
    disk(ctx, 0, 0, r, '#1b1d22');
    const k = Math.cos(ph.elong * D);   // 1 new, -1 full
    ctx.beginPath();
    // the lit limb: right side while waxing (as seen from the northern hemisphere), left while waning
    const s = ph.waxing ? 1 : -1;
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, s < 0);
    ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === (s > 0));
    const g = ctx.createRadialGradient(-r * 0.3 * s, -r * 0.3, 0, 0, 0, r); g.addColorStop(0, '#fbfaf3'); g.addColorStop(1, '#bcbcb4');
    ctx.fillStyle = g; ctx.fill();
    ring(ctx, 0, 0, r, 'rgba(232,198,106,.8)', r * 0.08);
    ctx.restore();
  }

  root.Orloj = { drawDial, drawMoon };
})(typeof window !== 'undefined' ? window : globalThis);
