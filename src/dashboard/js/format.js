/* Shared formatting utilities. One place for number / currency / percent / date formats. */
window.Pages = window.Pages || {}; // page registry (pages self-register; app.js renders them)
(function () {
  const NA = "—";
  const ok = (v) => v !== null && v !== undefined && isFinite(v);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const Fmt = {
    NA,
    /** Compact currency: R$ 1.52M / R$ 87.4K / R$ 640 */
    brl(v, d) {
      if (!ok(v)) return NA;
      const a = Math.abs(v), s = v < 0 ? "−" : "";
      if (a >= 1e6) return s + "R$ " + (a / 1e6).toFixed(2) + "M";
      if (a >= 1e4) return s + "R$ " + (a / 1e3).toFixed(1) + "K";
      return s + "R$ " + a.toLocaleString("en-US", { maximumFractionDigits: d === undefined ? 0 : d });
    },
    /** Full currency: R$ 1,234,567 */
    brlFull(v) { return ok(v) ? (v < 0 ? "−" : "") + "R$ " + Math.round(Math.abs(v)).toLocaleString("en-US") : NA; },
    num(v) { return ok(v) ? Math.round(v).toLocaleString("en-US") : NA; },
    dec(v, d = 2) { return ok(v) ? v.toFixed(d) : NA; },
    pct(v, d = 1) { return ok(v) ? (v * 100).toFixed(d) + "%" : NA; },
    /** Signed percentage change: +12.3% */
    spct(v, d = 1) { return ok(v) ? (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(d) + "%" : NA; },
    pp(v) { return ok(v) ? (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(1) + " pp" : NA; },
    x(v) { return ok(v) ? v.toFixed(2) + "x" : NA; },
    /** "Aug 20, 2018" from a Date */
    date(d) { return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear(); },
    /** "Aug 20" */
    dateShort(d) { return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate(); },
    month(d) { return MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); },
    monthName(i) { return MONTHS[i]; },
    esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
    csvCell(v) {
      if (v === null || v === undefined) return "";

const s = String(v);

// Prevent spreadsheet formula injection
const safe = typeof v === "string" &&
    /^[\s\u0000-\u001F]*[=+\-@]/.test(s)
        ? "'" + s
        : s;

// Escape CSV special characters
return /[",\r\n]/.test(safe)
    ? '"' + safe.replace(/"/g, '""') + '"'
    : safe;
    },
  };
  window.Fmt = Fmt;
})();
