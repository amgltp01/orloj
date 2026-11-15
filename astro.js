'use strict';
// Astronomy for the clock: where the Sun, the Moon, the planets and the stars are, for a time and a place.
// Low-precision formulas (Meeus; JPL "Approximate Positions of the Planets"): good to a fraction of a degree,
// which is far finer than a clock face can show. Angles in degrees unless the name says otherwise.
(function (root) {
  const D = Math.PI / 180;
  const sin = x => Math.sin(x * D), cos = x => Math.cos(x * D), tan = x => Math.tan(x * D);
  const asin = x => Math.asin(x) / D, acos = x => Math.acos(Math.max(-1, Math.min(1, x))) / D, atan2 = (y, x) => Math.atan2(y, x) / D;
  const norm = a => ((a % 360) + 360) % 360;
  const norm180 = a => { a = norm(a); return a > 180 ? a - 360 : a; };

  const julian = date => date.getTime() / 864e5 + 2440587.5;
  const days2000 = date => julian(date) - 2451545.0;
  const obliquity = d => 23.439291 - 0.0000003563 * d;

  // sidereal time at Greenwich and at a longitude (east positive), in degrees
  const gmst = date => norm(280.46061837 + 360.98564736629 * days2000(date));
  const lst = (date, lon) => norm(gmst(date) + lon);

  function eclToEq(lambda, beta, d) {
    const e = obliquity(d);
    const ra = norm(atan2(sin(lambda) * cos(e) - tan(beta) * sin(e), cos(lambda)));
    const dec = asin(sin(beta) * cos(e) + cos(beta) * sin(e) * sin(lambda));
    return { ra, dec };
  }
  function eqToHorizon(ra, dec, date, lat, lon) {
    const H = norm180(lst(date, lon) - ra);
    const alt = asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H));
    // azimuth from north, through east
    const az = norm(atan2(-cos(dec) * sin(H), sin(dec) * cos(lat) - cos(dec) * cos(H) * sin(lat)));
    return { alt, az, H };
  }

  function sun(date) {
    const d = days2000(date);
    const g = norm(357.529 + 0.98560028 * d);
    const q = norm(280.459 + 0.98564736 * d);
    const lambda = norm(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
    const dist = 1.00014 - 0.01671 * cos(g) - 0.00014 * cos(2 * g);
    return { lambda, beta: 0, dist, ...eclToEq(lambda, 0, d) };
  }

  function moon(date) {
    const d = days2000(date);
    const L = norm(218.316 + 13.176396 * d), M = norm(134.963 + 13.064993 * d), F = norm(93.272 + 13.229350 * d);
    const Ms = norm(357.529 + 0.98560028 * d), Dm = norm(297.850 + 12.190749 * d);
    // main periodic terms: evection, variation, annual equation
    // the main periodic terms (Meeus, chapter 47): good to about a tenth of a degree, enough to predict eclipses
    const lambda = norm(L + 6.289 * sin(M) + 1.274 * sin(2 * Dm - M) + 0.658 * sin(2 * Dm) + 0.214 * sin(2 * M) - 0.186 * sin(Ms) - 0.114 * sin(2 * F)
      - 0.059 * sin(2 * Dm - 2 * M) - 0.057 * sin(2 * Dm - Ms - M) + 0.053 * sin(2 * Dm + M) + 0.046 * sin(2 * Dm - Ms) + 0.041 * sin(M - Ms)
      - 0.035 * sin(Dm) - 0.031 * sin(M + Ms) - 0.015 * sin(2 * F - 2 * Dm) + 0.011 * sin(M - 4 * Dm));
    const beta = 5.128 * sin(F) + 0.281 * sin(M + F) + 0.278 * sin(M - F) + 0.173 * sin(2 * Dm - F) + 0.055 * sin(2 * Dm - M + F)
      + 0.046 * sin(2 * Dm - M - F) + 0.033 * sin(2 * Dm + F) + 0.017 * sin(2 * M + F);
    const distKm = 385001 - 20905 * cos(M) - 3699 * cos(2 * Dm - M) - 2956 * cos(2 * Dm) - 570 * cos(2 * M) + 246 * cos(2 * M - 2 * Dm)
      - 205 * cos(Ms - 2 * Dm) - 171 * cos(M + 2 * Dm) - 152 * cos(M + Ms - 2 * Dm);
    return { lambda, beta, distKm, ...eclToEq(lambda, beta, d) };
  }
  // the Moon's phase: elongation from the Sun, lit fraction, waxing or waning, and its name
  function moonPhase(date) {
    const s = sun(date), m = moon(date);
    const elong = norm(m.lambda - s.lambda);
    const lit = (1 - cos(elong)) / 2;
    const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    const name = names[Math.floor(((elong + 22.5) % 360) / 45)];
    return { elong, lit, waxing: elong < 180, name, age: elong / 360 * 29.530589 };
  }
  // the next time the Moon reaches a given elongation (180 = full, 0/360 = new)
  function nextPhase(date, target) {
    let t = date.getTime();
    const el = ms => norm(moon(new Date(ms)).lambda - sun(new Date(ms)).lambda);
    const ahead = ms => norm(target - el(ms));
    let gap = ahead(t);
    // the Moon gains about 12.19 degrees a day on the Sun
    t += (gap / 12.19) * 864e5;
    for (let i = 0; i < 6; i++) { const g = norm180(target - el(t)); t += (g / 12.19) * 864e5; }
    return new Date(t);
  }

  // planets: heliocentric orbits (J2000 elements and their rates per century), seen from the Earth
  const ORBITS = {
    Mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    Venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
    Earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    Mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    Jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  };
  function helio(name, d) {
    const T = d / 36525, o = ORBITS[name];
    const a = o[0] + o[6] * T, e = o[1] + o[7] * T, I = o[2] + o[8] * T, L = o[3] + o[9] * T, w = o[4] + o[10] * T, N = o[5] + o[11] * T;
    const M = norm(L - w), om = w - N;
    let E = M + (e / D) * sin(M) * (1 + e * cos(M));
    for (let i = 0; i < 6; i++) E = E - (E - (e / D) * sin(E) - M) / (1 - e * cos(E));
    const xv = a * (cos(E) - e), yv = a * Math.sqrt(1 - e * e) * sin(E);
    const x = (cos(om) * cos(N) - sin(om) * sin(N) * cos(I)) * xv + (-sin(om) * cos(N) - cos(om) * sin(N) * cos(I)) * yv;
    const y = (cos(om) * sin(N) + sin(om) * cos(N) * cos(I)) * xv + (-sin(om) * sin(N) + cos(om) * cos(N) * cos(I)) * yv;
    const z = sin(om) * sin(I) * xv + cos(om) * sin(I) * yv;
    return { x, y, z };
  }
  function planet(name, date) {
    const d = days2000(date), p = helio(name, d), E = helio('Earth', d);
    const x = p.x - E.x, y = p.y - E.y, z = p.z - E.z;
    const lambda = norm(atan2(y, x)), beta = atan2(z, Math.hypot(x, y)), dist = Math.hypot(x, y, z);
    return { name, lambda, beta, dist, ...eclToEq(lambda, beta, d) };
  }
  const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

  // sunrise and sunset (the Sun's top edge on the horizon, with refraction: -0.833 degrees) on the local day of `date`
  function sunTimes(date, lat, lon) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const alt = ms => { const s = sun(new Date(ms)); return eqToHorizon(s.ra, s.dec, new Date(ms), lat, lon).alt + 0.833; };
    const out = { rise: null, set: null, noon: null };
    let prev = alt(start.getTime()), best = -99;
    for (let m = 5; m <= 1440; m += 5) {
      const t = start.getTime() + m * 6e4, a = alt(t);
      if (a > best) { best = a; out.noon = new Date(t); }
      if (prev < 0 && a >= 0) out.rise = new Date(t - 5 * 6e4 * (a / (a - prev)));
      if (prev >= 0 && a < 0) out.set = new Date(t - 5 * 6e4 * (a / (a - prev)));
      prev = a;
    }
    return out;
  }

  // galactic coordinates to equatorial (for the Milky Way band)
  function galToEq(l, b) {
    const raNGP = 192.85948, decNGP = 27.12825, lNCP = 122.93192;
    const dec = asin(sin(b) * sin(decNGP) + cos(b) * cos(decNGP) * cos(lNCP - l));
    const ra = norm(raNGP + atan2(cos(b) * sin(lNCP - l), sin(b) * cos(decNGP) - cos(b) * sin(decNGP) * cos(lNCP - l)));
    return { ra, dec };
  }

  root.Astro = { D, sin, cos, tan, asin, acos, atan2, norm, norm180, julian, days2000, obliquity, gmst, lst, eclToEq, eqToHorizon, sun, moon, moonPhase, nextPhase, planet, PLANETS, sunTimes, galToEq };
})(typeof window !== 'undefined' ? window : globalThis);
