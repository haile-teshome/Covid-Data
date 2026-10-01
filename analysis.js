/* Analysis for the Pandemic Signal Detective.
   A direct port of the notebook's Python. No DOM here, so it can be unit
   tested against the Python results outside a browser. */

var SIGNALS = ["searches", "survey", "doctor", "cases", "hospital", "deaths"];
var MIN_DAYS = 20;

var WAVES = {
  "Winter 2020-21":          ["2020-10-01", "2021-02-28"],
  "Delta, summer 2021":      ["2021-06-15", "2021-10-31"],
  "Omicron, winter 2021-22": ["2021-11-15", "2022-03-15"],
  "Whole period":            ["2020-06-01", "2022-03-31"]
};

var STATE_NAMES = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
  CO:"Colorado", CT:"Connecticut", DE:"Delaware", DC:"District of Columbia",
  FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho", IL:"Illinois",
  IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Louisiana",
  ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan", MN:"Minnesota",
  MS:"Mississippi", MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada",
  NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico", NY:"New York",
  NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma",
  OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina",
  SD:"South Dakota", TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont",
  VA:"Virginia", WA:"Washington", WV:"West Virginia", WI:"Wisconsin",
  WY:"Wyoming"
};

/* ---------- loading ---------- */

function parseCSV(text) {
  var lines = text.split("\n");
  var head = lines[0].replace(/\r$/, "").split(",");
  var ix = {};
  for (var h = 0; h < head.length; h++) ix[head[h]] = h;
  var byState = {};
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i];
    if (!line) continue;
    var p = line.replace(/\r$/, "").split(",");
    var st = p[ix.state];
    if (!STATE_NAMES[st]) continue;           // drop territories
    var row = { date: p[ix.date] };
    for (var s = 0; s < SIGNALS.length; s++) {
      var raw = p[ix[SIGNALS[s]]];
      row[SIGNALS[s]] = (raw === "" || raw === undefined) ? null : +raw;
    }
    (byState[st] || (byState[st] = [])).push(row);
  }
  for (var k in byState) {
    byState[k].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  return byState;
}

function waveSlice(byState, state, wave) {
  var span = WAVES[wave], rows = byState[state] || [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].date >= span[0] && rows[i].date <= span[1]) out.push(rows[i]);
  }
  return out;                                  // already sorted, one row per day
}

function column(rows, key) {
  var a = new Array(rows.length);
  for (var i = 0; i < rows.length; i++) a[i] = rows[i][key];
  return a;
}

function countValid(arr) {
  var n = 0;
  for (var i = 0; i < arr.length; i++) if (arr[i] !== null) n++;
  return n;
}

function usable(rows, key) { return countValid(column(rows, key)) >= MIN_DAYS; }

/* ---------- the measures ---------- */

/* 0-100% of a signal's own range, so different units share one chart. */
function rescale(arr) {
  var lo = Infinity, hi = -Infinity, i, v;
  for (i = 0; i < arr.length; i++) {
    v = arr[i];
    if (v === null) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  var out = new Array(arr.length);
  if (!(hi > lo)) { for (i = 0; i < arr.length; i++) out[i] = null; return out; }
  for (i = 0; i < arr.length; i++) out[i] = arr[i] === null ? null : (arr[i] - lo) / (hi - lo) * 100;
  return out;
}

/* First day a signal climbs halfway to its peak, looking only before the peak.
   Returns an index into arr, or null. `needMinDays` mirrors the Python, where
   takeoff_date requires 20 days but surge_date does not. */
function halfwayUpIndex(arr, needMinDays) {
  var scaled = rescale(arr), pts = [], i;
  for (i = 0; i < scaled.length; i++) if (scaled[i] !== null) pts.push({ i: i, v: scaled[i] });
  if (needMinDays && pts.length < MIN_DAYS) return null;
  if (!pts.length) return null;
  var peak = 0;
  for (i = 1; i < pts.length; i++) if (pts[i].v > pts[peak].v) peak = i;   // strict: first max
  for (i = 0; i <= peak; i++) if (pts[i].v >= 50) return pts[i].i;
  return null;
}

function takeoffIndex(arr) { return halfwayUpIndex(arr, true); }
function surgeIndex(casesArr) { return halfwayUpIndex(casesArr, false); }

/* Pearson r over pairs where both are present; null if fewer than minPeriods. */
function corr(x, y, minPeriods) {
  var n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, a, b;
  for (var i = 0; i < x.length; i++) {
    a = x[i]; b = y[i];
    if (a === null || b === null) continue;
    n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
  }
  if (n < minPeriods) return null;
  var den = Math.sqrt(n * sxx - sx * sx) * Math.sqrt(n * syy - sy * sy);
  if (den === 0) return null;
  return (n * sxy - sx * sy) / den;
}

/* pandas arr.shift(-lag): value at i becomes arr[i + lag]. */
function shiftBack(arr, lag) {
  var out = new Array(arr.length);
  for (var i = 0; i < arr.length; i++) {
    var j = i + lag;
    out[i] = (j >= 0 && j < arr.length) ? arr[j] : null;
  }
  return out;
}

/* Days earlier (+) or later (-) a signal moves compared with cases. */
function bestLead(sig, cases, maxLag) {
  maxLag = maxLag || 21;
  var best = -Infinity, bestLag = null;
  for (var lag = -maxLag; lag <= maxLag; lag++) {
    var r = corr(sig, shiftBack(cases, lag), 30);
    if (r !== null && r > best) { best = r; bestLag = lag; }
  }
  return { lag: bestLag, r: best };
}

/* The alarm: rings once the combined signal holds above the threshold. */
function alarmFor(rows, chosen, threshold, confirmDays) {
  var ratios = [], used = [], i, j;
  for (i = 0; i < chosen.length; i++) {
    var key = chosen[i], x = column(rows, key);
    if (countValid(x) < MIN_DAYS) continue;
    var first = [];
    for (j = 0; j < x.length && first.length < 7; j++) if (x[j] !== null) first.push(x[j]);
    if (!first.length) continue;
    var base = 0;
    for (j = 0; j < first.length; j++) base += first[j];
    base /= first.length;
    if (!(base > 0)) continue;
    var r = new Array(x.length);
    for (j = 0; j < x.length; j++) r[j] = x[j] === null ? null : x[j] / base;
    ratios.push(r); used.push(key);
  }
  if (!ratios.length) return { combo: null, alarm: null, used: used };

  var combo = new Array(rows.length);
  for (i = 0; i < rows.length; i++) {
    var sum = 0, n = 0;
    for (j = 0; j < ratios.length; j++) if (ratios[j][i] !== null) { sum += ratios[j][i]; n++; }
    combo[i] = n ? sum / n : null;
  }
  var run = 0, alarm = null;
  for (i = 0; i < combo.length; i++) {
    if (combo[i] !== null && combo[i] >= threshold) {
      run++;
      if (run >= confirmDays && alarm === null) alarm = i;
    } else run = 0;
  }
  return { combo: combo, alarm: alarm, used: used };
}

/* Every state's lead time for one wave. */
function countryLeads(byState, wave, earlySignals) {
  var out = [];
  for (var st in STATE_NAMES) {
    var rows = waveSlice(byState, st, wave);
    if (!usable(rows, "cases")) continue;
    var cases = column(rows, "cases");
    for (var s = 0; s < earlySignals.length; s++) {
      var key = earlySignals[s];
      if (!usable(rows, key)) continue;
      var bl = bestLead(column(rows, key), cases);
      if (bl.lag !== null && bl.r > 0.5) {
        out.push({ state: st, key: key, lead: bl.lag, r: bl.r });
      }
    }
  }
  return out;
}

/* The same alarm scored on every state. */
function scoreAlarm(byState, wave, chosen, threshold, confirmDays) {
  var leads = [], silent = 0;
  for (var st in STATE_NAMES) {
    var rows = waveSlice(byState, st, wave);
    var sIdx = surgeIndex(column(rows, "cases"));
    if (sIdx === null) continue;
    var a = alarmFor(rows, chosen, threshold, confirmDays).alarm;
    if (a === null) silent++;
    else leads.push(sIdx - a);                 // days, since rows are one per day
  }
  var sorted = leads.slice().sort(function (p, q) { return p - q; });
  var median = null;
  if (sorted.length) {
    var m = sorted.length >> 1;
    median = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  }
  var early = 0, twitchy = 0;
  for (var i = 0; i < leads.length; i++) { if (leads[i] > 0) early++; if (leads[i] > 45) twitchy++; }
  return { early: early, total: leads.length + silent, median: median,
           silent: silent, twitchy: twitchy, n: leads.length };
}

function median(values) {
  var s = values.slice().sort(function (a, b) { return a - b; });
  if (!s.length) return null;
  var m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseCSV: parseCSV, waveSlice: waveSlice, column: column,
    rescale: rescale, takeoffIndex: takeoffIndex, surgeIndex: surgeIndex,
    bestLead: bestLead, alarmFor: alarmFor, countryLeads: countryLeads,
    scoreAlarm: scoreAlarm, usable: usable, median: median,
    SIGNALS: SIGNALS, WAVES: WAVES, STATE_NAMES: STATE_NAMES };
}
