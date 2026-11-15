'use strict';
// The International Space Station: where it is and when you can see it pass.
// Its orbit (public orbital elements published by CelesTrak, in their JSON form) is fetched at most twice a day and kept for when you are
// offline. Nothing about you is sent: the request asks only for the station's orbit, and the passes over your place are
// worked out here on your computer. The orbit is moved forward with the Earth's flattening (J2) and the TLE's decay
// term: with an orbit less than a day old, pass times are good to about a minute.
(function (root) {
  const A = root.Astro, D = A.D;
  const MU = 398600.4418, RE = 6378.137, J2 = 0.00108263;
  const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json';
  const KEY = 'orloj.iss';

  // CelesTrak's JSON (OMM) for the station: only the numbers needed, each checked
  function parse(text) {
    const data = JSON.parse(text), o = Array.isArray(data) ? data[0] : data;
    if (!o || Number(o.NORAD_CAT_ID) !== 25544) throw new Error('not the ISS');
    const epoch = Date.parse(String(o.EPOCH) + (/Z$/.test(o.EPOCH) ? '' : 'Z'));
    const el = { epoch, ndot2: Number(o.MEAN_MOTION_DOT), inc: Number(o.INCLINATION), raan: Number(o.RA_OF_ASC_NODE), ecc: Number(o.ECCENTRICITY),
      argp: Number(o.ARG_OF_PERICENTER), M: Number(o.MEAN_ANOMALY), n: Number(o.MEAN_MOTION) };
    for (const v of Object.values(el)) if (!Number.isFinite(v)) throw new Error('bad orbit numbers');
    if (el.n < 14 || el.n > 17 || el.ecc > 0.05 || el.inc < 50 || el.inc > 53) throw new Error('orbit out of range');
    return el;
  }

  // position in the Earth-centred, star-fixed frame (km) at a time
  function position(el, date) {
    const dd = (date.getTime() - el.epoch) / 864e5;                 // days since the orbit was measured
    const nRev = el.n + 2 * el.ndot2 * dd;                          // revolutions a day, slowly growing as it sinks
    const nRad = nRev * 2 * Math.PI / 86400;
    const a = Math.cbrt(MU / (nRad * nRad));
    const e = el.ecc, i = el.inc * D, p = a * (1 - e * e);
    const k = 1.5 * J2 * (RE / p) ** 2 * (el.n * 360);              // degrees a day
    const raan = (el.raan - k * Math.cos(i) * dd) * D;
    const argp = (el.argp + k * (2 - 2.5 * Math.sin(i) ** 2) * dd) * D;
    const M = ((el.M + 360 * (el.n * dd + el.ndot2 * dd * dd)) % 360) * D;
    let E = M; for (let it = 0; it < 8; it++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cO = Math.cos(raan), sO = Math.sin(raan), cw = Math.cos(argp), sw = Math.sin(argp), ci = Math.cos(i), si = Math.sin(i);
    return {
      x: (cO * cw - sO * sw * ci) * xv + (-cO * sw - sO * cw * ci) * yv,
      y: (sO * cw + cO * sw * ci) * xv + (-sO * sw + cO * cw * ci) * yv,
      z: (sw * si) * xv + (cw * si) * yv,
    };
  }

  // seen from your place: altitude, azimuth, distance; and whether the station is in sunlight
  function look(el, date, lat, lon) {
    const r = position(el, date), th = A.lst(date, lon) * D, la = lat * D;
    const ox = RE * Math.cos(la) * Math.cos(th), oy = RE * Math.cos(la) * Math.sin(th), oz = RE * Math.sin(la);
    const rx = r.x - ox, ry = r.y - oy, rz = r.z - oz;
    // to south-east-zenith
    const s = Math.sin(la) * Math.cos(th) * rx + Math.sin(la) * Math.sin(th) * ry - Math.cos(la) * rz;
    const e = -Math.sin(th) * rx + Math.cos(th) * ry;
    const z = Math.cos(la) * Math.cos(th) * rx + Math.cos(la) * Math.sin(th) * ry + Math.sin(la) * rz;
    const range = Math.hypot(rx, ry, rz);
    const alt = Math.asin(z / range) / D, az = A.norm(Math.atan2(e, -s) / D);
    // in the Earth's shadow? (a cylinder behind the Earth, away from the Sun)
    const sun = A.sun(date), sx = Math.cos(sun.dec * D) * Math.cos(sun.ra * D), sy = Math.cos(sun.dec * D) * Math.sin(sun.ra * D), sz = Math.sin(sun.dec * D);
    const along = r.x * sx + r.y * sy + r.z * sz;
    const perp = Math.sqrt(Math.max(0, r.x * r.x + r.y * r.y + r.z * r.z - along * along));
    const lit = along > 0 || perp > RE;
    const height = Math.hypot(r.x, r.y, r.z) - RE;
    return { alt, az, range, lit, height };
  }

  // the passes you can see in the next `days` days: station above 10°, in sunlight, and your sky dark enough
  function passes(el, from, lat, lon, days = 7) {
    const out = []; let cur = null;
    for (let t = from.getTime(); t < from.getTime() + days * 864e5; t += 20e3) {
      const d = new Date(t), q = look(el, d, lat, lon);
      const sun = A.sun(d), sunAlt = A.eqToHorizon(sun.ra, sun.dec, d, lat, lon).alt;
      const seen = q.alt > 10 && q.lit && sunAlt < -6;
      if (seen) {
        if (!cur) cur = { start: d, startAz: q.az, max: q.alt, maxAt: d, maxAz: q.az, range: q.range };
        if (q.alt > cur.max) { cur.max = q.alt; cur.maxAt = d; cur.maxAz = q.az; cur.range = q.range; }
        cur.end = d; cur.endAz = q.az;
      } else if (cur) { if (cur.end - cur.start >= 60e3) out.push(cur); cur = null; }
      // jump ahead when the station is far below the horizon
      if (!cur && q.alt < -30) t += 4 * 60e3;
    }
    if (cur) out.push(cur);
    return out;
  }

  // the orbit: from the browser's memory if it is fresh, otherwise fetched; stale copies are used only if under 4 days old
  async function orbit() {
    let kept = null;
    try { kept = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* nothing kept */ }
    if (kept && Date.now() - kept.fetched < 12 * 36e5) return kept.el;
    const failedAt = Number(localStorage.getItem(KEY + '.failed')) || 0;
    if (Date.now() - failedAt < 2 * 36e5) {  // CelesTrak asks clients not to hammer it after an error
      if (kept && Date.now() - kept.el.epoch < 4 * 864e5) return kept.el;
      throw new Error('waiting before retrying CelesTrak');
    }
    try {
      const r = await fetch(TLE_URL, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = (await r.text()).slice(0, 4000);
      const el = parse(text);
      try { localStorage.setItem(KEY, JSON.stringify({ el, fetched: Date.now() })); } catch { /* not kept */ }
      return el;
    } catch (e) {
      try { localStorage.setItem(KEY + '.failed', String(Date.now())); } catch { /* not kept */ }
      if (kept && Date.now() - kept.el.epoch < 4 * 864e5) return kept.el;
      throw e;
    }
  }

  root.ISS = { parse, position, look, passes, orbit, TLE_URL };
})(typeof window !== 'undefined' ? window : globalThis);
