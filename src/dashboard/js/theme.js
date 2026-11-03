/* Design tokens for charts (mirror of the CSS variables in css/style.css).
 * Brand colours: Mocha Brown #6F4E37, Platinum Silver #E5E4E2, Pale Lavender #E6E0F0.
 * Additional tones are tints/shades derived from those three, plus semantic good/bad colours for performance status. */
(function () {
  const T = {
    mocha: "#6F4E37", mochaDark: "#523826", mochaLight: "#A98467",
    platinum: "#E5E4E2", lavender: "#E6E0F0", lavenderDeep: "#8B7AB5", lavenderMid: "#B9AAD6",
    ink: "#2A211B", muted: "#6E655E", grid: "#E5E4E2", surface: "#FFFFFF",
    pos: "#2E7D5B", neg: "#B23A48", warn: "#9A6B16",
    // categorical sequence for up to 8 categories (distinguishable, restrained)
    cat: ["#6F4E37", "#8B7AB5", "#C09A6B", "#5B7C8D", "#A0527C", "#7A9A7E", "#B97A3E", "#4E4A6B"],
    // sequential scale for heatmaps (platinum -> mocha)
    seq: [[0, "#F3F2F0"], [0.5, "#CDB9A6"], [1, "#6F4E37"]],
  };
  /** Base Plotly layout. `extra` is shallow-merged (xaxis/yaxis objects are merged one level deep). */
  T.layout = function (extra) {
    const base = {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: T.muted, size: 12 },
      margin: { l: 56, r: 16, t: 8, b: 40 },
      xaxis: { gridcolor: T.grid, zerolinecolor: T.grid, linecolor: T.grid, automargin: true, tickfont: { color: T.muted } },
      yaxis: { gridcolor: T.grid, zerolinecolor: T.grid, linecolor: T.grid, automargin: true, tickfont: { color: T.muted } },
      legend: { orientation: "h", y: 1.13, x: 0, font: { color: T.ink, size: 12 } },
      hoverlabel: { bgcolor: "#FFFFFF", bordercolor: T.platinum, font: { color: T.ink, size: 12 } },
      colorway: T.cat,
    };
    extra = extra || {};
    const out = Object.assign({}, base, extra);
    ["xaxis", "yaxis"].forEach((k) => { out[k] = Object.assign({}, base[k], extra[k] || {}); });
    if (extra.yaxis2) out.yaxis2 = Object.assign({ gridcolor: "rgba(0,0,0,0)", automargin: true, tickfont: { color: T.muted } }, extra.yaxis2);
    return out;
  };
  window.Theme = T;
})();
