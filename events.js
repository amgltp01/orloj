'use strict';
// Sky events, worked out ahead of time from the same astronomy as the dial (no internet):
// eclipses (and whether you can see them from your place), meteor showers, the Moon passing planets, planets meeting,
// planets at their best, equinoxes and solstices, and supermoons. Times are good to about a quarter of an hour.
(function (root) {
  const A = root.Astro, D = A.D;
  const DAY = 864e5, HOUR = 36e5;
  const sep = (ra1, de1, ra2, de2) => A.acos(A.sin(de1) * A.sin(de2) + A.cos(de1) * A.cos(de2) * A.cos(ra1 - ra2));
  const RE = 6378.14;

  // the Moon as seen from your place (not from the Earth's centre): up to a degree different, which decides eclipses
  function topoMoon(date, lat, lon) {
    const m = A.moon(date), lst = A.lst(date, lon);
    const x = m.distKm * A.cos(m.dec) * A.cos(m.ra) - RE * A.cos(lat) * A.cos(lst);
    const y = m.distKm * A.cos(m.dec) * A.sin(m.ra) - RE * A.cos(lat) * A.sin(lst);
    const z = m.distKm * A.sin(m.dec) - RE * A.sin(lat);
    const r = Math.hypot(x, y, z);
    return { ra: A.norm(A.atan2(y, x)), dec: A.asin(z / r), dist: r };
  }

  // ---------- solar eclipses: around each new moon, how much of the Sun the Moon covers from here
  function solarEclipse(newMoon, lat, lon) {
    const m0 = A.moon(newMoon);
    if (Math.abs(m0.beta) > 1.6) return null;          // too far from the node: no eclipse anywhere
    let best = null;
    for (let t = newMoon.getTime() - 4 * HOUR; t <= newMoon.getTime() + 4 * HOUR; t += 2 * 6e4) {
      const d = new Date(t), s = A.sun(d), m = topoMoon(d, lat, lon);
      const sunUp = A.eqToHorizon(s.ra, s.dec, d, lat, lon).alt;
      if (sunUp < -0.5) continue;
      const rs = 0.2666 / s.dist, rm = A.asin(1737.4 / m.dist), dd = sep(s.ra, s.dec, m.ra, m.dec);
      const mag = (rs + rm - dd) / (2 * rs);
      if (mag > 0 && (!best || mag > best.mag)) best = { at: d, mag, total: rm > rs && dd < rm - rs, annular: rm < rs && dd < rs - rm, sunAlt: sunUp };
    }
    return best ? { kind: 'solar', ...best, here: true } : { kind: 'solar', at: newMoon, here: false };
  }
  // ---------- lunar eclipses: around each full moon, the Moon against the Earth's shadow
  function lunarEclipse(fullMoon, lat, lon) {
    const m0 = A.moon(fullMoon);
    if (Math.abs(m0.beta) > 1.7) return null;
    let best = null;
    for (let t = fullMoon.getTime() - 4 * HOUR; t <= fullMoon.getTime() + 4 * HOUR; t += 2 * 6e4) {
      const d = new Date(t), s = A.sun(d), m = A.moon(d);
      const shadowRa = A.norm(s.ra + 180), shadowDec = -s.dec;
      const pm = A.asin(RE / m.distKm), ps = 0.00244, ss = 0.2666 / s.dist, rm = 0.2725 * pm;
      const umbra = 1.02 * (pm + ps - ss), pen = 1.02 * (pm + ps + ss);
      const dd = sep(shadowRa, shadowDec, m.ra, m.dec);
      const kind = dd + rm < umbra ? 'total' : dd - rm < umbra ? 'partial' : dd - rm < pen ? 'penumbral' : null;
      if (!kind) continue;
      const rank = { penumbral: 1, partial: 2, total: 3 }[kind];
      const moonAlt = A.eqToHorizon(m.ra, m.dec, d, lat, lon).alt;
      if (!best || rank > best.rank || (rank === best.rank && dd < best.dd)) best = { at: d, type: kind, rank, dd, mag: (umbra + rm - dd) / (2 * rm) };
      if (moonAlt > 0) best.seen = true;
    }
    return best ? { kind: 'lunar', ...best, here: !!best.seen } : null;
  }

  // ---------- the year's showers: peak date (month, day), best rate per hour under a dark sky, where they come from
  const SHOWERS = [
    ['Quadrantids', 1, 4, 110, 'Boötes, high in the north-east before dawn'], ['Lyrids', 4, 22, 18, 'Lyra, after midnight'],
    ['Eta Aquariids', 5, 6, 50, 'Aquarius, low in the east before dawn'], ['Perseids', 8, 12, 100, 'Perseus, north-east, best after midnight'],
    ['Draconids', 10, 8, 10, 'Draco, north, in the evening'], ['Orionids', 10, 21, 20, 'Orion, after midnight'],
    ['Leonids', 11, 17, 15, 'Leo, east, before dawn'], ['Geminids', 12, 14, 150, 'Gemini, high in the east all night'], ['Ursids', 12, 22, 10, 'Ursa Minor, north, before dawn'],
  ];

  function dirOf(az) { return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(az / 45) % 8]; }

  // everything from `from` for `days` days (eclipses: the next two years, they are rare)
  function upcoming(from, place, days = 75) {
    const lat = place.lat, lon = place.lon, out = [], until = from.getTime() + days * DAY;
    const push = e => { if (e.at >= from.getTime() - 12 * HOUR) out.push(e); };

    // Moon phases over two years: supermoons near the window, eclipses for the whole span
    let t = new Date(from.getTime() - 2 * DAY);
    for (let k = 0; k < 52; k++) {
      const full = A.nextPhase(t, 180), nw = A.nextPhase(t, 0);
      for (const [when, isFull] of [[full, true], [nw, false]]) {
        if (isFull && when.getTime() < until && A.moon(when).distKm < 361000) push({ at: when.getTime(), type: 'supermoon', icon: '🌕', title: 'Supermoon', detail: `The full Moon at its closest: ${Math.round(A.moon(when).distKm).toLocaleString()} km, a little bigger and brighter.` });
        const ec = isFull ? lunarEclipse(when, lat, lon) : solarEclipse(when, lat, lon);
        if (!ec) continue;
        if (ec.kind === 'lunar') push({ at: ec.at.getTime(), type: 'eclipse', icon: '🌘', big: ec.here && ec.type !== 'penumbral', title: `${ec.type[0].toUpperCase() + ec.type.slice(1)} lunar eclipse`, here: ec.here,
          detail: ec.here ? (ec.type === 'penumbral' ? 'A faint shading of the Moon, visible from here.' : `The Moon turns ${ec.type === 'total' ? 'red' : 'partly dark'}. Visible from ${place.name}.`) : `Not visible from ${place.name}: the Moon is below the horizon.` });
        else push({ at: ec.at.getTime(), type: 'eclipse', icon: '🌒', big: ec.here, here: ec.here, title: ec.here ? (ec.total ? 'Total solar eclipse' : ec.annular ? 'Annular solar eclipse' : 'Partial solar eclipse') : 'Solar eclipse (elsewhere)',
          detail: ec.here ? `From ${place.name} the Moon covers about ${Math.round(Math.min(1, ec.mag) * 100)}% of the Sun's width, ${Math.round(ec.sunAlt)}° up. Never look at it without eclipse glasses.` : `Not visible from ${place.name}.` });
      }
      t = new Date(Math.max(full.getTime(), nw.getTime()) + DAY);
    }

    // equinoxes and solstices
    const names = { 0: ['Spring equinox', 'Day and night about equal; spring begins.'], 90: ['Summer solstice', 'The longest day of the year.'], 180: ['Autumn equinox', 'Day and night about equal; autumn begins.'], 270: ['Winter solstice', 'The shortest day; from here the days grow longer.'] };
    for (const target of [0, 90, 180, 270]) {
      let tt = from.getTime();
      tt += (A.norm(target - A.sun(new Date(tt)).lambda) / 0.9856) * DAY;
      for (let i = 0; i < 4; i++) tt += (A.norm180(target - A.sun(new Date(tt)).lambda) / 0.9856) * DAY;
      if (tt < until) push({ at: tt, type: 'season', icon: target === 90 ? '☀️' : target === 270 ? '❄️' : '⚖️', title: names[target][0], detail: names[target][1] });
    }

    // meteor showers, with how much the Moon spoils them
    for (const [name, mo, dy, zhr, where] of SHOWERS) {
      for (const y of [from.getFullYear(), from.getFullYear() + 1]) {
        const at = new Date(y, mo - 1, dy, 2, 0).getTime();
        if (at < from.getTime() - DAY || at > until) continue;
        const lit = A.moonPhase(new Date(at)).lit;
        push({ at, type: 'meteors', icon: '☄️', big: zhr >= 50 && lit < 0.5, title: `${name} meteor shower`,
          detail: `Up to ${zhr} an hour under a dark sky. Look toward ${where}. ${lit < 0.25 ? 'Dark Moon: great conditions.' : lit < 0.6 ? `The Moon is ${Math.round(lit * 100)}% lit: fair conditions.` : `A bright Moon (${Math.round(lit * 100)}% lit) will hide the fainter ones.`}` });
      }
    }

    // close meetings: the Moon and a planet within 3°, two planets within 2°, checked every 2 hours
    const bodies = A.PLANETS;
    const pairMin = new Map();
    for (let tt = from.getTime(); tt < until; tt += 2 * HOUR) {
      const d = new Date(tt), mo = A.moon(d), s = A.sun(d), ps = bodies.map(n => A.planet(n, d));
      const check = (key, a, b, limit, title) => {
        const dd = sep(a.ra, a.dec, b.ra, b.dec), elong = sep(s.ra, s.dec, b.ra, b.dec);
        if (dd > limit || elong < 15) return;
        const cur = pairMin.get(key);
        if (!cur || dd < cur.dd) pairMin.set(key, { dd, at: tt, title, elong, ra: b.ra, dec: b.dec, sunRa: s.ra });
      };
      ps.forEach(p => check('moon-' + p.name + '-' + Math.floor(tt / (10 * DAY)), mo, p, 3, `The Moon meets ${p.name}`));
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) check(ps[i].name + '-' + ps[j].name + '-' + Math.floor(tt / (40 * DAY)), ps[i], ps[j], 2, `${ps[i].name} meets ${ps[j].name}`);
    }
    for (const c of pairMin.values()) {
      const evening = A.norm(c.ra - c.sunRa) < 180;
      push({ at: c.at, type: 'meeting', icon: '✨', big: c.dd < 1.5, title: c.title, detail: `${c.dd < 1 ? 'Less than a degree' : `About ${c.dd.toFixed(1)}°`} apart (a finger's width at arm's length is about 1°). Best ${evening ? 'in the evening, after sunset, toward the west' : 'before dawn, toward the east'}.` });
    }

    // planets at their best: Mars, Jupiter, Saturn opposite the Sun (up all night, closest and brightest)
    for (const n of ['Mars', 'Jupiter', 'Saturn']) {
      let prev = null, best = null;
      for (let tt = from.getTime(); tt < from.getTime() + 400 * DAY; tt += DAY) {
        const d = new Date(tt), p = A.planet(n, d), s = A.sun(d), e = A.norm(p.lambda - s.lambda);
        if (prev !== null && prev < 180 && e >= 180) best = tt;
        prev = e; if (best) break;
      }
      if (best && best < from.getTime() + 300 * DAY) push({ at: best, type: 'planet', icon: '🪐', big: best < until, title: `${n} at opposition`, detail: `${n} is opposite the Sun: up all night and at its brightest of the year.` });
    }

    out.sort((a, b) => a.at - b.at);
    return out;
  }

  root.SkyEvents = { upcoming, solarEclipse, lunarEclipse, topoMoon };
})(typeof window !== 'undefined' ? window : globalThis);
