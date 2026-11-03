/* Reusable UI components: KPI card, cards, sortable/paginated/exportable table, modal, date-range picker.
 * No business calculations here. Components receive already-computed values. */
(function () {
  const { Fmt, Theme: T } = window;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = Fmt.esc;
  const UI = {};

  /* ---------------- layout helpers ---------------- */
  UI.card = (cls, title, sub, body, extra) =>
    `<section class="card ${cls}"><div class="card-h"><div><h3>${title}</h3>${sub ? `<p class="q">${sub}</p>` : ""}</div>${extra || ""}</div>${body}</section>`;
  UI.chartDiv = (id, c) => `<div class="chart ${c || ""}" id="${id}" role="img" aria-label="Chart"></div>`;
  UI.note = (html, cls) => `<div class="note ${cls || ""}">${html}</div>`;
  UI.empty = (title, msg) => `<div class="empty"><div class="empty-i" aria-hidden="true">∅</div><b>${title}</b><span>${msg || ""}</span></div>`;
  UI.head = (title, sub) => `<div class="head"><div><h1>${title}</h1><p class="sub">${sub}</p></div></div>`;

  /* ---------------- KPI card ---------------- */
  UI.spark = function (vals, color) {
    if (!vals || vals.length < 2) return "";
    const v = vals.map((x) => (x === null || !isFinite(x) ? 0 : x));
    const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
    const pts = v.map((y, i) => `${((i / (v.length - 1)) * 100).toFixed(1)},${(34 - ((y - mn) / r) * 30).toFixed(1)}`).join(" ");
    return `<svg class="sp" viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/></svg>`;
  };
  /** o: {label, value, cur, prev, goodUp=true, delta:'pct'|'pp', spark, hero, plain, naMsg, title} */
  UI.kpi = function (o) {
    const unavailable = o.value === null || o.value === undefined || o.value === Fmt.NA;
    if (unavailable)
      return `<div class="kpi na"><div class="l">${o.label}</div><div class="v">n/a</div><div class="d muted">${o.naMsg || "Not enough data in this selection"}</div></div>`;
    let d = "";
    if (o.prev !== null && o.prev !== undefined && o.cur !== null && isFinite(o.cur) && isFinite(o.prev)) {
      let ch, txt;
      if (o.delta === "pp") { ch = o.cur - o.prev; txt = (ch >= 0 ? "▲ " : "▼ ") + Math.abs(ch * 100).toFixed(1) + " pp"; }
      else if (o.prev === 0) ch = null;
      else { ch = o.cur / o.prev - 1; txt = (ch >= 0 ? "▲ " : "▼ ") + Math.abs(ch * 100).toFixed(1) + "%"; }
      if (ch !== null) {
        const flat = Math.abs(ch) < 0.0005;
        const good = (ch >= 0) === (o.goodUp !== false);
        d = `<span class="${flat ? "muted" : good ? "pos" : "neg"}">${txt}</span><span class="muted"> vs prior period</span>`;
      }
    } else if (!o.plain) d = `<span class="muted">No prior period available</span>`;
    return `<div class="kpi ${o.hero ? "hero" : ""}" ${o.title ? `title="${esc(o.title)}"` : ""}><div class="l">${o.label}</div><div class="v">${o.value}</div><div class="d">${d}</div>${UI.spark(o.spark, o.hero ? T.mocha : T.lavenderDeep)}</div>`;
  };

  /* ---------------- plot wrapper ---------------- */
  UI.plot = function (id, data, layout, onClick) {
    const el = document.getElementById(id);
    if (!el) return;
    Plotly.newPlot(el, data, T.layout(layout), { displayModeBar: false, responsive: true });
    if (onClick) el.on("plotly_click", onClick);
  };
  UI.emptyIf = function (cond, id, msg) {
    if (!cond) return false;
    const el = document.getElementById(id);
    if (el) el.outerHTML = UI.empty("No data to display", msg || "No records match the current filters.");
    return true;
  };

  /* ---------------- modal ---------------- */
  let lastFocus = null;
  UI.modal = function (title, html, onOpen) {
    UI.closeModal();
    lastFocus = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "modal-bg"; wrap.id = "modal";
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${title}</h2><button class="icon-btn" id="modal-x" aria-label="Close">✕</button></div><div class="modal-b">${html}</div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) UI.closeModal(); });
    $("#modal-x").onclick = UI.closeModal;
    $("#modal-x").focus();
    if (onOpen) onOpen(wrap);
  };
  UI.closeModal = function () {
    const m = document.getElementById("modal");
    if (m) { m.remove(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  };

  /* ---------------- table ---------------- */
  const tstate = {};
  /** Mounts a sortable, searchable, paginated, exportable table into element `host`.
   * cfg: {id, cols:[{k,label,fmt(v,row),raw(v,row),cls(row),align}], rows, sortKey, sortDir, pageSize, search, exportName, onRow(row), rowKey, hint, searchKeys}
   * Interaction state (sort/search/page) survives page re-renders, keyed by cfg.id. */
  UI.table = function (host, cfg) {
    if (typeof host === "string") host = document.getElementById(host);
    if (!host) return;
    const st = tstate[cfg.id] || (tstate[cfg.id] = { key: cfg.sortKey || cfg.cols[0].k, dir: cfg.sortDir || -1, q: "", page: 0 });
    if (!cfg.cols.some((c) => c.k === st.key)) st.key = cfg.sortKey || cfg.cols[0].k;
    const pageSize = cfg.pageSize || 15;
    function view() {
      const q = st.q.trim().toLowerCase();
      const keys = cfg.searchKeys || cfg.cols.filter((c) => typeof (cfg.rows[0] || {})[c.k] === "string").map((c) => c.k);
      let data = q ? cfg.rows.filter((r) => keys.some((k) => String(r[k] === null || r[k] === undefined ? "" : r[k]).toLowerCase().includes(q))) : cfg.rows.slice();
      data.sort((a, b) => {
        const x = a[st.key], y = b[st.key];
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return typeof x === "string" ? st.dir * x.localeCompare(y) : st.dir * (x - y);
      });
      return data;
    }
    function draw() {
      const data = view();
      const pages = Math.max(1, Math.ceil(data.length / pageSize));
      if (st.page >= pages) st.page = pages - 1;
      const slice = data.slice(st.page * pageSize, st.page * pageSize + pageSize);
      const th = cfg.cols.map((c) => {
        const on = st.key === c.k;
        return `<th scope="col" data-k="${c.k}" tabindex="0" aria-sort="${on ? (st.dir < 0 ? "descending" : "ascending") : "none"}" class="${c.align === "left" || c === cfg.cols[0] ? "l" : ""}">${c.label}<span class="sort">${on ? (st.dir < 0 ? "▾" : "▴") : ""}</span></th>`;
      }).join("");
      const body = slice.map((r, i) => `<tr ${cfg.onRow ? `tabindex="0" class="clickable" data-i="${i}"` : ""}>${cfg.cols.map((c) => `<td class="${c.align === "left" || c === cfg.cols[0] ? "l " : ""}${c.cls ? c.cls(r) : ""}">${c.fmt ? c.fmt(r[c.k], r) : r[c.k] === null || r[c.k] === undefined ? Fmt.NA : esc(r[c.k])}</td>`).join("")}</tr>`).join("");
      host.innerHTML = `
        <div class="t-bar">
          ${cfg.search === false ? "<span></span>" : `<label class="t-search"><span class="sr">Search table</span><input type="search" placeholder="Search…" value="${esc(st.q)}" aria-label="Search table"></label>`}
          <div class="t-actions"><span class="muted t-count">${data.length.toLocaleString()} row${data.length === 1 ? "" : "s"}</span>
          ${cfg.exportName ? `<button class="btn sm" data-export>Export CSV</button>` : ""}</div>
        </div>
        <div class="tw"><table><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${cfg.cols.length}" class="t-empty">${data.length === 0 && st.q ? "No rows match your search." : "No records for the current selection."}</td></tr>`}</tbody></table></div>
        <div class="t-foot"><span class="muted">${cfg.hint || (cfg.onRow ? "Select a row to inspect it." : "")}</span>
        ${pages > 1 ? `<div class="pager"><button class="btn sm" data-p="prev" ${st.page === 0 ? "disabled" : ""}>‹ Prev</button><span class="muted">Page ${st.page + 1} of ${pages}</span><button class="btn sm" data-p="next" ${st.page >= pages - 1 ? "disabled" : ""}>Next ›</button></div>` : ""}</div>`;
      const inp = host.querySelector("input[type=search]");
      if (inp) inp.oninput = () => { st.q = inp.value; st.page = 0; const p = inp.selectionStart; draw(); const n = host.querySelector("input[type=search]"); n.focus(); n.setSelectionRange(p, p); };
      host.querySelectorAll("th").forEach((h) => {
        const act = () => { if (st.key === h.dataset.k) st.dir *= -1; else { st.key = h.dataset.k; st.dir = -1; } st.page = 0; draw(); host.querySelector(`th[data-k="${h.dataset.k}"]`).focus(); };
        h.onclick = act; h.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } };
      });
      host.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { st.page += b.dataset.p === "next" ? 1 : -1; draw(); }));
      const ex = host.querySelector("[data-export]");
      if (ex) ex.onclick = () => UI.exportCsv(cfg.exportName, cfg.cols, view());
      if (cfg.onRow) host.querySelectorAll("tbody tr.clickable").forEach((tr) => {
        const open = () => cfg.onRow(slice[+tr.dataset.i]);
        tr.onclick = open; tr.onkeydown = (e) => { if (e.key === "Enter") open(); };
      });
    }
    draw();
  };
  UI.exportCsv = function (name, cols, rows) {
    const head = cols.map((c) => Fmt.csvCell(c.label)).join(",");
    const lines = rows.map((r) => cols.map((c) => Fmt.csvCell(c.raw ? c.raw(r[c.k], r) : r[c.k])).join(","));
    const blob = new Blob(["﻿" + [head, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* ---------------- date range picker ---------------- */
  /** Date picker. Presets are relative to the latest date in the data ("today" = last date available),
   * so every preset contains data. Typing and calendar clicks update in place (inputs are never re-created while editing). */
  UI.DatePicker = function (host, o) {
    // o: {min, max, getRange():{start,end}, onApply(start,end), onReset(), presets:[{id,label,range()}]}
    const DAY = 86400000, EPOCH = Date.UTC(2017, 0, 1);
    const toDate = (d) => new Date(EPOCH + d * DAY);
    const iso = (d) => toDate(d).toISOString().slice(0, 10);
    const parse = (s) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
      const t = Date.parse(s + "T00:00:00Z");
      if (isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return NaN; // rejects 2018-13-40, 2018-02-30
      return Math.round((t - EPOCH) / DAY);
    };
    let open = false, draft = null, viewMonth = null, picking = false;

    const activePreset = () => { const r = o.getRange(); const p = o.presets.find((p) => { const x = p.range(); return x[0] === r.start && x[1] === r.end; }); return p ? p.id : "custom"; };
    function label() {
      const r = o.getRange(), p = o.presets.find((p) => p.id === activePreset());
      const a = Fmt.date(toDate(r.start)), b = Fmt.date(toDate(r.end));
      return { name: p ? p.label : "Custom range", text: r.start === r.end ? a : a + " – " + b };
    }
    function validate(a, b) {
      if (isNaN(a) || isNaN(b)) return "Enter dates as YYYY-MM-DD.";
      if (a > b) return "Start date must be on or before the end date.";
      if (a < o.min || b > o.max) return `Dates must be between ${iso(o.min)} and ${iso(o.max)}.`;
      return "";
    }
    const bounds = () => { const e = draft.end === null ? draft.start : draft.end; return [Math.min(draft.start, e), Math.max(draft.start, e)]; };
    function calInner() {
      const m = viewMonth, [lo, hi] = bounds();
      const first = Date.UTC(m.y, m.m, 1), dow = (new Date(first).getUTCDay() + 6) % 7, days = new Date(Date.UTC(m.y, m.m + 1, 0)).getUTCDate();
      const prevOk = Date.UTC(m.y, m.m, 1) > EPOCH + o.min * DAY, nextOk = Date.UTC(m.y, m.m + 1, 1) <= EPOCH + o.max * DAY;
      let cells = ""; for (let i = 0; i < dow; i++) cells += "<span></span>";
      for (let d = 1; d <= days; d++) {
        const n = Math.round((Date.UTC(m.y, m.m, d) - EPOCH) / DAY), dis = n < o.min || n > o.max, sel = n === lo || n === hi, inr = n > lo && n < hi;
        cells += `<button type="button" class="day ${sel ? "sel" : ""} ${inr ? "inr" : ""}" data-n="${n}" ${dis ? 'disabled aria-disabled="true"' : ""} aria-label="${Fmt.date(toDate(n))}" aria-pressed="${sel}">${d}</button>`;
      }
      return `<div class="dp-cal-h"><button type="button" class="icon-btn sm" data-nav="-1" aria-label="Previous month" ${prevOk ? "" : "disabled"}>‹</button><b>${Fmt.monthName(m.m)} ${m.y}</b><button type="button" class="icon-btn sm" data-nav="1" aria-label="Next month" ${nextOk ? "" : "disabled"}>›</button></div>
        <div class="dp-dow">${["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((x) => `<span>${x}</span>`).join("")}</div><div class="dp-grid">${cells}</div>`;
    }
    function setMsg(err) {
      const el = host.querySelector(".dp-msg"); if (!el) return;
      el.textContent = err || (picking ? "Select the end date" : `Data available ${Fmt.date(toDate(o.min))} – ${Fmt.date(toDate(o.max))}`);
      el.classList.toggle("err", !!err);
    }
    function syncInputs() { const [lo, hi] = bounds(); const f = host.querySelector("#dp-from"), t = host.querySelector("#dp-to"); if (f) { f.value = iso(lo); t.value = iso(hi); f.classList.remove("bad"); t.classList.remove("bad"); } }
    function bindCal() {
      const cal = host.querySelector(".dp-cal");
      cal.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => { const d = new Date(Date.UTC(viewMonth.y, viewMonth.m + +b.dataset.nav, 1)); viewMonth = { y: d.getUTCFullYear(), m: d.getUTCMonth() }; refreshCal(); }));
      cal.querySelectorAll(".day").forEach((b) => (b.onclick = () => {
        const n = +b.dataset.n;
        if (!picking) { draft = { start: n, end: null }; picking = true; } else { draft = { start: Math.min(draft.start, n), end: Math.max(draft.start, n) }; picking = false; }
        syncInputs(); setMsg(""); refreshCal(); const nb = host.querySelector(`.day[data-n="${n}"]`); if (nb) nb.focus();
      }));
    }
    function refreshCal() { host.querySelector(".dp-cal").innerHTML = calInner(); bindCal(); }
    function popHtml() {
      const cur = activePreset(), [lo, hi] = bounds();
      return `<div class="dp-pop" role="dialog" aria-label="Choose date range">
        <div class="dp-presets" role="listbox" aria-label="Date presets">
          ${o.presets.map((p) => `<button type="button" role="option" class="dp-p ${cur === p.id ? "on" : ""}" data-preset="${p.id}" aria-selected="${cur === p.id}">${p.label}</button>`).join("")}
          <button type="button" role="option" class="dp-p ${cur === "custom" ? "on" : ""}" data-preset="custom" aria-selected="${cur === "custom"}">Custom Date Range</button>
        </div>
        <div class="dp-main">
          <div class="dp-inputs">
            <label>From<input type="text" id="dp-from" value="${iso(lo)}" inputmode="numeric" placeholder="YYYY-MM-DD" aria-label="Start date"></label>
            <span class="muted" aria-hidden="true">→</span>
            <label>To<input type="text" id="dp-to" value="${iso(hi)}" inputmode="numeric" placeholder="YYYY-MM-DD" aria-label="End date"></label>
          </div>
          <div class="dp-cal">${calInner()}</div>
          <div class="dp-msg" role="status" aria-live="polite"></div>
          <div class="dp-foot"><button type="button" class="btn ghost sm" id="dp-reset">Reset</button><span style="flex:1"></span><button type="button" class="btn sm" id="dp-cancel">Cancel</button><button type="button" class="btn primary sm" id="dp-apply">Apply</button></div>
        </div></div>`;
    }
    function draw() {
      const L = label();
      host.innerHTML = `<button type="button" class="dp-btn" aria-haspopup="dialog" aria-expanded="${open}" id="dp-open">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
          <span class="dp-l"><span class="dp-n">${L.name}</span><span class="dp-t">${L.text}</span></span><span class="chev" aria-hidden="true">▾</span></button>${open ? popHtml() : ""}`;
      host.querySelector("#dp-open").onclick = toggle;
      if (!open) return;
      setMsg("");
      host.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => {
        if (b.dataset.preset === "custom") { host.querySelector("#dp-from").focus(); return; }
        const [s, e] = o.presets.find((p) => p.id === b.dataset.preset).range(); open = false; o.onApply(s, e);
      }));
      bindCal();
      const fromI = host.querySelector("#dp-from"), toI = host.querySelector("#dp-to");
      const typed = () => { // validate while typing; update the calendar in place (inputs are not re-created)
        const a = parse(fromI.value.trim()), b = parse(toI.value.trim()), err = validate(a, b);
        fromI.classList.toggle("bad", !!err); toI.classList.toggle("bad", !!err); setMsg(err);
        if (!err) { draft = { start: a, end: b }; picking = false; const d = toDate(a); viewMonth = { y: d.getUTCFullYear(), m: d.getUTCMonth() }; refreshCal(); setMsg(""); }
      };
      fromI.onchange = typed; toI.onchange = typed;
      [fromI, toI].forEach((i) => (i.onkeydown = (e) => { if (e.key === "Enter") host.querySelector("#dp-apply").click(); }));
      host.querySelector("#dp-apply").onclick = () => {
        const a = parse(fromI.value.trim()), b = parse(toI.value.trim()); let err = validate(a, b);
        if (!err && picking) err = "Select an end date, or click the same day again for a single day.";
        if (err) { fromI.classList.add("bad"); toI.classList.add("bad"); setMsg(err); return; }
        open = false; o.onApply(a, b);
      };
      host.querySelector("#dp-cancel").onclick = () => { open = false; draw(); host.querySelector("#dp-open").focus(); };
      host.querySelector("#dp-reset").onclick = () => { open = false; o.onReset(); };
    }
    function toggle() {
      open = !open;
      if (open) { const r = o.getRange(); draft = { start: r.start, end: r.end }; picking = false; const d = toDate(r.end); viewMonth = { y: d.getUTCFullYear(), m: d.getUTCMonth() }; }
      draw();
    }
    document.addEventListener("mousedown", (e) => { if (open && !host.contains(e.target)) { open = false; draw(); } });
    document.addEventListener("keydown", (e) => { if (open && e.key === "Escape") { open = false; draw(); host.querySelector("#dp-open").focus(); } });
    draw();
    return { refresh: () => { if (!open) draw(); else { open = false; draw(); } } };
  };

  window.UI = UI;
})();
