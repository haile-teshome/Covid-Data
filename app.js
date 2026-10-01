/* UI and charts. The numbers all come from analysis.js. */
(function () {
"use strict";

var LABEL = { searches:"Searches", survey:"Survey", doctor:"Doctor visits",
              cases:"Cases", hospital:"Hospital", deaths:"Deaths" };
var EARLY = ["searches","survey","doctor","hospital","deaths"];
var ALARM_SIGS = ["searches","survey","doctor"];
var byState = null, dateIndex = {}, playTimer = null;

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
/* Cases is the thing being predicted, so it is drawn as a neutral reference line
   and the five signals take the validated categorical slots in fixed order. */
function colorOf(key) {
  var slot = { searches:"--s1", survey:"--s2", doctor:"--s3",
               hospital:"--s4", deaths:"--s5", cases:"--s-ref" }[key];
  return css(slot);
}
function theme() {
  return { font: { family: "ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif",
                   size: 13, color: css("--text-soft") },
           paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
           grid: css("--rule"), rule: css("--rule-strong"), text: css("--text") };
}
var CONFIG = { displayModeBar: false, responsive: true };

function el(id) { return document.getElementById(id); }
function fmtDate(iso) {
  var m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var p = iso.split("-");
  return m[+p[1] - 1] + " " + (+p[2]) + ", " + p[0];
}
function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
function note(target, text, kind) {
  el(target).innerHTML = '<div class="note' + (kind ? " " + kind : "") + '">' + text + "</div>";
}
function clearNote(target) { el(target).innerHTML = ""; }

/* ---------- control building ---------- */
function fillSelect(id, values, selected) {
  var s = el(id);
  s.innerHTML = "";
  values.forEach(function (v) {
    var o = document.createElement("option");
    o.value = v; o.textContent = v;
    if (v === selected) o.selected = true;
    s.appendChild(o);
  });
}
function fillChecks(id, keys, onChange) {
  var box = el(id);
  box.innerHTML = "";
  keys.forEach(function (k) {
    var lab = document.createElement("label");
    var cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = true; cb.value = k;
    cb.addEventListener("change", onChange);
    var sw = document.createElement("span");
    sw.className = "swatch"; sw.style.background = colorOf(k);
    lab.appendChild(cb); lab.appendChild(sw);
    lab.appendChild(document.createTextNode(LABEL[k]));
    box.appendChild(lab);
  });
}
function checkedKeys(id) {
  return Array.prototype.slice.call(el(id).querySelectorAll("input:checked"))
    .map(function (c) { return c.value; });
}

/* ---------- activity 1 ---------- */
function drawA1() {
  var state = el("a1-state").value, wave = el("a1-wave").value;
  var code = nameToCode[state];
  var chosen = checkedKeys("a1-sigs");
  var rows = waveSlice(byState, code, wave);
  var dates = rows.map(function (r) { return r.date; });
  var t = theme(), traces = [], ranked = [];

  var missing = chosen.filter(function (k) { return !usable(rows, k); });
  var shown = chosen.filter(function (k) { return usable(rows, k); });

  if (!chosen.length) {
    Plotly.purge("a1-chart");
    note("a1-note", "Tick at least one signal to draw the chart.", "warn");
    el("a1-table").innerHTML = ""; return;
  }
  if (!shown.length) {
    Plotly.purge("a1-chart");
    note("a1-note", "None of the signals you picked have data here. Try another state or wave.", "warn");
    el("a1-table").innerHTML = ""; return;
  }

  var caseIdx = usable(rows, "cases") ? takeoffIndex(column(rows, "cases")) : null;
  shown.forEach(function (k) {
    var scaled = rescale(column(rows, k));
    traces.push({ x: dates, y: scaled, name: LABEL[k], type: "scatter", mode: "lines",
      line: { color: colorOf(k), width: k === "cases" ? 3 : 2 },
      hovertemplate: LABEL[k] + ": %{y:.0f}% of peak<extra></extra>" });
    var ti = takeoffIndex(column(rows, k));
    if (ti !== null) {
      traces.push({ x: [dates[ti]], y: [scaled[ti]], type: "scatter", mode: "markers",
        showlegend: false, hoverinfo: "skip",
        marker: { symbol: "star", size: 13, color: colorOf(k),
                  line: { color: css("--surface"), width: 1.5 } } });
      ranked.push({ key: k, idx: ti, date: dates[ti],
                    ahead: caseIdx === null ? null : caseIdx - ti });
    }
  });

  Plotly.react("a1-chart", traces, {
    height: 420, margin: { l: 56, r: 18, t: 16, b: 44 },
    font: t.font, paper_bgcolor: t.paper_bgcolor, plot_bgcolor: t.plot_bgcolor,
    hovermode: "x unified",
    xaxis: { gridcolor: t.grid, linecolor: t.rule, zeroline: false },
    yaxis: { title: { text: "% of its own peak" }, gridcolor: t.grid,
             linecolor: t.rule, zeroline: false, rangemode: "tozero" },
    legend: { orientation: "h", y: -0.16, font: { size: 13 } }
  }, CONFIG);

  if (missing.length) {
    note("a1-note", "No data for <b>" + missing.map(function (k) { return LABEL[k]; }).join(", ") +
      "</b> in " + state + " during " + wave + ", so " +
      (missing.length === 1 ? "it is" : "they are") + " left out.", "warn");
  } else clearNote("a1-note");

  if (!ranked.length) { el("a1-table").innerHTML = ""; return; }
  ranked.sort(function (a, b) { return a.idx - b.idx; });
  var firstIdx = ranked[0].idx;
  var winners = ranked.filter(function (r) { return r.idx === firstIdx; })
                      .map(function (r) { return LABEL[r.key]; });
  var who = winners.length === 1 ? winners[0]
          : winners.slice(0, -1).join(", ") + " and " + winners[winners.length - 1];
  var verb = winners.length === 1 ? "took off first" : "took off first together";
  var lead = ranked[0].ahead;
  var sentence = (lead !== null && lead > 0)
    ? "<b>" + who + "</b> " + verb + " in " + state + ", <b>" + plural(lead, "day") +
      "</b> before cases did."
    : "<b>" + who + "</b> " + verb + " in " + state + ", on " + fmtDate(ranked[0].date) + ".";
  el("a1-note").insertAdjacentHTML("afterbegin", '<div class="note">' + sentence + "</div>");

  var body = ranked.map(function (r, i) {
    var vs = r.key === "cases" ? "this is the comparison"
           : r.ahead === null ? ""
           : r.ahead === 0 ? "same day"
           : r.ahead > 0 ? plural(r.ahead, "day") + " earlier"
           : plural(-r.ahead, "day") + " later";
    return "<tr><td class='num'>" + (i + 1) + "</td><td><span class='dot' style='background:" +
      colorOf(r.key) + "'></span>" + LABEL[r.key] + "</td><td class='num'>" +
      fmtDate(r.date) + "</td><td>" + vs + "</td></tr>";
  }).join("");
  el("a1-table").innerHTML =
    "<caption>Order of takeoff</caption><thead><tr><th></th><th>Signal</th>" +
    "<th>Takes off</th><th>Compared with cases</th></tr></thead><tbody>" + body + "</tbody>";
}

/* ---------- activity 2 ---------- */
function drawA2() {
  var wave = el("a2-wave").value;
  var rows = countryLeads(byState, wave, EARLY);
  var t = theme();
  if (!rows.length) {
    Plotly.purge("a2-chart");
    note("a2-note", "Nothing lined up closely enough with cases in this wave.", "warn");
    el("a2-table").innerHTML = ""; return;
  }
  var byKey = {}, meds = {};
  EARLY.forEach(function (k) { byKey[k] = []; });
  rows.forEach(function (r) { byKey[r.key].push(r); });
  EARLY.forEach(function (k) { meds[k] = byKey[k].length ? median(byKey[k].map(function (r) { return r.lead; })) : null; });
  var order = EARLY.filter(function (k) { return byKey[k].length; })
                   .sort(function (a, b) { return meds[a] - meds[b]; });

  var traces = [];
  order.forEach(function (k, row) {
    var pts = byKey[k];
    traces.push({
      x: pts.map(function (p) { return p.lead; }),
      y: pts.map(function (p, i) { return row + ((i * 2654435761 % 1000) / 1000 - 0.5) * 0.46; }),
      text: pts.map(function (p) { return STATE_NAMES[p.state]; }),
      type: "scatter", mode: "markers", name: LABEL[k], showlegend: false,
      marker: { color: colorOf(k), size: 9, opacity: 0.78,
                line: { color: css("--surface"), width: 1 } },
      hovertemplate: "%{text}: %{x:+.0f} days<extra></extra>" });
    traces.push({ x: [meds[k], meds[k]], y: [row - 0.36, row + 0.36], type: "scatter",
      mode: "lines", showlegend: false, hoverinfo: "skip",
      line: { color: css("--text"), width: 3 } });
  });
  Plotly.react("a2-chart", traces, {
    height: 330, margin: { l: 108, r: 18, t: 28, b: 48 },
    font: t.font, paper_bgcolor: t.paper_bgcolor, plot_bgcolor: t.plot_bgcolor,
    xaxis: { title: { text: "Days of warning before cases" }, range: [-23, 23], dtick: 7,
             gridcolor: t.grid, linecolor: t.rule, zeroline: true,
             zerolinecolor: t.rule, zerolinewidth: 2 },
    yaxis: { tickmode: "array", tickvals: order.map(function (_, i) { return i; }),
             ticktext: order.map(function (k) { return LABEL[k]; }),
             range: [-0.6, order.length - 0.4], gridcolor: "rgba(0,0,0,0)",
             linecolor: "rgba(0,0,0,0)", tickfont: { size: 13, color: css("--text") } },
    annotations: [
      { x: 23, y: 1.04, xref: "x", yref: "paper", text: "warns earlier", showarrow: false,
        xanchor: "right", font: { size: 12, color: css("--text-faint") } },
      { x: -23, y: 1.04, xref: "x", yref: "paper", text: "moves later", showarrow: false,
        xanchor: "left", font: { size: 12, color: css("--text-faint") } }]
  }, CONFIG);

  var best = order[order.length - 1], worst = order[0];
  note("a2-note", "Each dot is one state. <b>" + LABEL[best] + "</b> warned earliest, by a " +
    "median of <b>" + (meds[best] > 0 ? "+" : "") + meds[best].toFixed(0) + " days</b>. " +
    "<b>" + LABEL[worst] + "</b> came in at " + (meds[worst] > 0 ? "+" : "") +
    meds[worst].toFixed(0) + " days, so it moved after cases rather than before.");

  var body = order.slice().reverse().map(function (k) {
    var pts = byKey[k], early = pts.filter(function (p) { return p.lead > 0; }).length;
    return "<tr><td><span class='dot' style='background:" + colorOf(k) + "'></span>" +
      LABEL[k] + "</td><td class='num'>" + (meds[k] > 0 ? "+" : "") + meds[k].toFixed(0) +
      "</td><td class='num'>" + Math.round(early / pts.length * 100) + "%</td>" +
      "<td class='num'>" + pts.length + "</td></tr>";
  }).join("");
  el("a2-table").innerHTML =
    "<caption>Across every state</caption><thead><tr><th>Signal</th>" +
    "<th>Median days of warning</th><th>States it warned early</th>" +
    "<th>States measured</th></tr></thead><tbody>" + body + "</tbody>";
}

/* ---------- activity 3 ---------- */
var a3weeks = [];
function buildA3Weeks() {
  var key = pickKey(el("a3-sig").value), wave = el("a3-wave").value;
  var span = WAVES[wave], seen = {};
  a3weeks = [];
  var any = byState[Object.keys(byState)[0]];
  any.forEach(function (r) {
    if (r.date < span[0] || r.date > span[1]) return;
    var d = new Date(r.date + "T00:00:00Z");
    var monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    var iso = monday.toISOString().slice(0, 10);
    if (!seen[iso]) { seen[iso] = 1; a3weeks.push(iso); }
  });
  a3weeks.sort();
  var r = el("a3-week");
  r.min = 0; r.max = Math.max(0, a3weeks.length - 1);
  if (+r.value > +r.max) r.value = 0;
}
function weekMeans(key, weekStart, span) {
  var out = { codes: [], vals: [], names: [] };
  var end = new Date(weekStart + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  var endIso = end.toISOString().slice(0, 10);
  /* a part-week at either edge is clipped to the wave, never padded from outside it */
  var from = weekStart < span[0] ? span[0] : weekStart;
  var to   = endIso > span[1] ? span[1] : endIso;
  for (var st in STATE_NAMES) {
    var rows = byState[st] || [], sum = 0, n = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].date < from || rows[i].date > to) continue;
      if (rows[i][key] !== null) { sum += rows[i][key]; n++; }
    }
    if (n) { out.codes.push(st); out.vals.push(sum / n); out.names.push(STATE_NAMES[st]); }
  }
  return out;
}
function a3Range(key, wave) {
  var span = WAVES[wave], all = [];
  for (var st in STATE_NAMES) {
    var rows = byState[st] || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].date >= span[0] && rows[i].date <= span[1] && rows[i][key] !== null) {
        all.push(rows[i][key]);
      }
    }
  }
  if (!all.length) return null;
  all.sort(function (a, b) { return a - b; });
  return [all[0], all[Math.floor(all.length * 0.98)]];
}
function drawA3() {
  var key = pickKey(el("a3-sig").value), wave = el("a3-wave").value;
  var i = +el("a3-week").value, t = theme();
  if (!a3weeks.length) { Plotly.purge("a3-chart"); return; }
  var span = WAVES[wave];
  var week = a3weeks[Math.min(i, a3weeks.length - 1)];
  el("a3-weeklabel").textContent = fmtDate(week < span[0] ? span[0] : week);
  var rng = a3Range(key, wave);
  var d = weekMeans(key, week, span);
  if (!rng || !d.codes.length) {
    Plotly.purge("a3-chart");
    note("a3-note", "No " + LABEL[key] + " data during " + wave + ".", "warn"); return;
  }
  Plotly.react("a3-chart", [{
    type: "choropleth", locationmode: "USA-states", locations: d.codes, z: d.vals,
    text: d.names, zmin: rng[0], zmax: rng[1],
    colorscale: [[0,"#cde2fb"],[0.25,"#9ec5f4"],[0.5,"#5598e7"],[0.75,"#256abf"],[1,"#0d366b"]],
    marker: { line: { color: css("--surface"), width: 1 } },
    colorbar: { thickness: 11, len: 0.74, outlinewidth: 0, title: { text: "" } },
    hovertemplate: "%{text}: %{z:.1f}<extra></extra>" }], {
    height: 440, margin: { l: 0, r: 0, t: 10, b: 0 },
    font: t.font, paper_bgcolor: t.paper_bgcolor,
    geo: { scope: "usa", bgcolor: "rgba(0,0,0,0)", lakecolor: "rgba(0,0,0,0)",
           subunitcolor: css("--surface") }
  }, CONFIG);
  var shownStates = d.codes.length, totalStates = Object.keys(STATE_NAMES).length;
  if (shownStates < totalStates) {
    note("a3-note", LABEL[key] + " is only reported for " + shownStates + " of " +
      totalStates + " states this week. Blank means no data, not zero.", "warn");
  } else clearNote("a3-note");
}
function pickKey(label) {
  for (var k in LABEL) if (LABEL[k] === label) return k;
  return "survey";
}

/* ---------- activity 4 ---------- */
function drawA4() {
  var state = el("a4-state").value, code = nameToCode[state], wave = el("a4-wave").value;
  var chosen = checkedKeys("a4-sigs");
  var level = +el("a4-level").value, days = +el("a4-days").value;
  el("a4-levelval").textContent = level.toFixed(1) + "x";
  el("a4-daysval").textContent = plural(days, "day");
  var rows = waveSlice(byState, code, wave);
  var dates = rows.map(function (r) { return r.date; });
  var t = theme();

  if (!chosen.length) {
    Plotly.purge("a4-chart");
    note("a4-note", "Tick at least one signal for your alarm to watch.", "warn");
    el("a4-table").innerHTML = ""; return;
  }
  var res = alarmFor(rows, chosen, level, days);
  if (!res.combo) {
    Plotly.purge("a4-chart");
    note("a4-note", "Nothing you picked has data for " + state + " in this wave.", "warn");
    el("a4-table").innerHTML = ""; return;
  }
  var surge = surgeIndex(column(rows, "cases"));
  var shapes = [{ type: "line", xref: "x", yref: "y", x0: dates[0], x1: dates[dates.length-1],
                  y0: level, y1: level, line: { color: colorOf("doctor"), width: 1.5, dash: "dash" } }];
  var anns = [];
  function marker(idx, color, text, yref) {
    shapes.push({ type: "line", xref: "x", yref: "paper", x0: dates[idx], x1: dates[idx],
                  y0: 0, y1: 1, line: { color: color, width: 2 } });
    anns.push({ x: dates[idx], y: yref, xref: "x", yref: "paper", text: text,
                showarrow: false, font: { size: 12, color: color },
                bgcolor: css("--surface"), xanchor: "left" });
  }
  if (res.alarm !== null) marker(res.alarm, "#c0392b", " alarm", 1.0);
  if (surge !== null) marker(surge, css("--text"), " surge", 0.46);

  Plotly.react("a4-chart", [
    { x: dates, y: res.combo, name: "your combined signal", type: "scatter", mode: "lines",
      line: { color: colorOf("doctor"), width: 2.5 }, xaxis: "x", yaxis: "y",
      hovertemplate: "%{y:.2f} times its starting level<extra></extra>" },
    { x: dates, y: column(rows, "cases"), name: "cases", type: "scatter", mode: "lines",
      line: { color: colorOf("cases"), width: 2 }, xaxis: "x", yaxis: "y2",
      hovertemplate: "%{y:.1f} cases per 100k<extra></extra>" }
  ], {
    height: 470, margin: { l: 58, r: 18, t: 26, b: 44 }, showlegend: false,
    font: t.font, paper_bgcolor: t.paper_bgcolor, plot_bgcolor: t.plot_bgcolor,
    hovermode: "x unified", shapes: shapes, annotations: anns.concat([
      { x: 0, y: 1.0, xref: "paper", yref: "paper", text: "Your combined signal",
        showarrow: false, xanchor: "left", font: { size: 12.5, color: css("--text") } },
      { x: 0, y: 0.42, xref: "paper", yref: "paper", text: "Cases per 100k",
        showarrow: false, xanchor: "left", font: { size: 12.5, color: css("--text") } }]),
    xaxis: { gridcolor: t.grid, linecolor: t.rule, zeroline: false, anchor: "y2" },
    yaxis:  { domain: [0.56, 1], gridcolor: t.grid, linecolor: t.rule, zeroline: false },
    yaxis2: { domain: [0, 0.42], gridcolor: t.grid, linecolor: t.rule, zeroline: false }
  }, CONFIG);

  var missing = chosen.filter(function (k) { return !usable(rows, k); });
  var html = "";
  if (missing.length) {
    html += '<div class="note warn">No data for <b>' +
      missing.map(function (k) { return LABEL[k]; }).join(", ") + "</b> in " + state +
      " during " + wave + ", so it is left out of your alarm.</div>";
  }
  if (res.alarm === null) {
    html += '<div class="note warn">Your alarm never rang here. Lower the level, or ask for fewer days in a row.</div>';
  } else if (surge === null) {
    html += '<div class="note warn">There was no clear surge in this state this wave, so there is nothing to beat.</div>';
  } else {
    var diff = surge - res.alarm;
    if (diff > 0) html += '<div class="note good">Your alarm rang <b>' + plural(diff, "day") +
      " before</b> the surge in " + state + ".</div>";
    else if (diff < 0) html += '<div class="note warn">Your alarm rang <b>' + plural(-diff, "day") +
      " after</b> the surge had already started.</div>";
    else html += '<div class="note warn">Your alarm rang the same day the surge started.</div>';
  }
  el("a4-note").innerHTML = html;

  var sc = scoreAlarm(byState, wave, chosen, level, days);
  var verdict;
  if (!sc.n) verdict = "It never rang anywhere. Lower the level.";
  else if (sc.median < 0) verdict = "Too slow to be useful. On average it rings after the surge has started.";
  else if (sc.twitchy > 6) verdict = "Jumpy. It rings more than six weeks early in " +
    plural(sc.twitchy, "state") + ", which in real life means crying wolf.";
  else if (sc.median >= 10) verdict = "Solid. Early enough to act on, without going off constantly.";
  else verdict = "It works, but the warning is short. See if you can stretch it.";
  el("a4-table").innerHTML =
    "<caption>The same alarm, tested on every state</caption><tbody>" +
    "<tr><td>Rang before the surge</td><td class='num'>" + sc.early + " of " + sc.total + " states</td></tr>" +
    "<tr><td>Typical warning</td><td class='num'>" +
      (sc.n ? (sc.median > 0 ? "+" : "") + sc.median.toFixed(0) + " days" : "n/a") + "</td></tr>" +
    "<tr><td>Never rang</td><td class='num'>" + plural(sc.silent, "state") + "</td></tr>" +
    "<tr><td>Rang more than 6 weeks early</td><td class='num'>" + plural(sc.twitchy, "state") + "</td></tr>" +
    "</tbody>";
  el("a4-note").insertAdjacentHTML("beforeend", '<div class="note">' + verdict + "</div>");
}

/* ---------- quizzes ---------- */
var QUIZ = {
  star: { options: ["the day the signal peaked",
                    "the first day it climbed halfway to its peak",
                    "the day the wave ended"],
          answer: 1,
          why: "That is the takeoff, the point where a signal is clearly on its way up.",
          hint: "Look at where the stars sit on each line. Are they at the top, or partway up?" },
  deathsLast: { options: ["deaths reflect infections from weeks earlier",
                          "death records are more accurate than the others",
                          "fewer people died than caught COVID"],
          answer: 0,
          why: "People who die were infected weeks before, so deaths report on a wave that has already happened.",
          hint: "Think about how long it takes between catching COVID and dying of it." },
  mostWarning: { options: ["Searches", "Survey", "Doctor visits", "Hospital"],
          answer: 2,
          why: "Doctor visits had the longest median lead in every wave, 5 to 12 days ahead of cases.",
          hint: "Read the chart from top to bottom. Which signal sits furthest to the right?" },
  negLead: { options: ["it moves about two weeks after cases",
                       "it warns us 15 days early",
                       "the data is missing"],
          answer: 0,
          why: "A negative warning time means the signal follows cases instead of warning about them.",
          hint: "The zero line is the moment cases move. What does sitting to the left of it mean?" },
  raiseLevel: { options: ["it rings later, and in some states not at all",
                          "it rings earlier in every state",
                          "nothing changes"],
          answer: 0,
          why: "A stricter alarm waits for a bigger jump, so it fires late or misses the wave entirely. Being sure and being early pull against each other.",
          hint: "Try it. Drag the level to 3.0 and watch the 'never rang' row in the table." },
  claimsDelay: { options: ["insurance claims take days or weeks to reach anyone who could act",
                           "doctors are bad at spotting COVID",
                           "there is not enough data"],
          answer: 0,
          why: "A signal is only as early as the moment it reaches you. The dates here are when people visited, not when the paperwork landed.",
          hint: "This data is filed by the date of the visit. When does the insurance claim actually get processed?" }
};
function buildQuizzes() {
  Array.prototype.forEach.call(document.querySelectorAll(".q"), function (q) {
    var spec = QUIZ[q.dataset.q], opts = q.querySelector(".opts");
    var verdict = q.querySelector(".verdict");
    spec.options.forEach(function (text, i) {
      var lab = document.createElement("label");
      var r = document.createElement("input");
      r.type = "radio"; r.name = q.dataset.q; r.value = i;
      r.addEventListener("change", function () {
        var right = i === spec.answer;
        verdict.className = "verdict " + (right ? "right" : "wrong");
        verdict.innerHTML = right ? "<b>Correct.</b> " + spec.why
                                  : "<b>Not quite.</b> " + spec.hint;
        verdict.hidden = false;
      });
      lab.appendChild(r);
      lab.appendChild(document.createTextNode(text));
      opts.appendChild(lab);
    });
  });
}

/* ---------- wiring ---------- */
var nameToCode = {};
function redrawAll() { drawA1(); drawA2(); drawA3(); drawA4(); }

function start(text) {
  byState = parseCSV(text);
  for (var c in STATE_NAMES) nameToCode[STATE_NAMES[c]] = c;
  var stateNames = Object.keys(nameToCode).sort();
  var waves = Object.keys(WAVES);
  var waves3 = waves.slice(0, 3);

  fillSelect("a1-state", stateNames, "California");
  fillSelect("a1-wave", waves, "Winter 2020-21");
  fillChecks("a1-sigs", SIGNALS, drawA1);
  el("a1-state").addEventListener("change", drawA1);
  el("a1-wave").addEventListener("change", drawA1);

  fillSelect("a2-wave", waves, "Winter 2020-21");
  el("a2-wave").addEventListener("change", drawA2);

  fillSelect("a3-sig", SIGNALS.map(function (k) { return LABEL[k]; }), "Survey");
  fillSelect("a3-wave", waves3, "Delta, summer 2021");
  el("a3-sig").addEventListener("change", function () { buildA3Weeks(); drawA3(); });
  el("a3-wave").addEventListener("change", function () { buildA3Weeks(); drawA3(); });
  el("a3-week").addEventListener("input", drawA3);
  el("a3-play").addEventListener("click", togglePlay);

  fillSelect("a4-state", stateNames, "Texas");
  fillSelect("a4-wave", waves3, "Delta, summer 2021");
  fillChecks("a4-sigs", ALARM_SIGS, drawA4);
  ["a4-state","a4-wave"].forEach(function (id) { el(id).addEventListener("change", drawA4); });
  ["a4-level","a4-days"].forEach(function (id) { el(id).addEventListener("input", drawA4); });

  buildQuizzes();
  buildA3Weeks();
  el("loading").hidden = true;
  el("main").hidden = false;
  redrawAll();

  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onThemeChange = function () { redrawAll(); };
    if (mq.addEventListener) mq.addEventListener("change", onThemeChange);
    else if (mq.addListener) mq.addListener(onThemeChange);
  }
}
function togglePlay() {
  var btn = el("a3-play");
  if (playTimer) { clearInterval(playTimer); playTimer = null; btn.textContent = "Play"; return; }
  btn.textContent = "Pause";
  playTimer = setInterval(function () {
    var r = el("a3-week");
    r.value = (+r.value >= +r.max) ? 0 : +r.value + 1;
    drawA3();
  }, 420);
}

fetch("covid_signals_by_state.csv")
  .then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  })
  .then(start)
  .catch(function (e) {
    el("loading").innerHTML = "Could not load the data file (" + e.message +
      "). If you are opening this page straight from your own computer, the browser blocks " +
      "the file read. Use the hosted version instead.";
  });
})();
