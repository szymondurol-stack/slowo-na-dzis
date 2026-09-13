const cheerio = require("cheerio");

const KINDS = [
  "Pierwsze czytanie",
  "Psalm responsoryjny",
  "Drugie czytanie",
  "Werset przed Ewangelią",
  "Ewangelia"
];

function clean(s = "") {
  return s.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").trim();
}

function textWithBreaks($, node) {
  const clone = $(node).clone();
  clone.find("br").replaceWith("\n");
  return clean(clone.text());
}

function normalizeKind(raw) {
  const s = clean(raw).toLowerCase();
  if (s.startsWith("pierwsze czytanie")) return "Pierwsze czytanie";
  if (s.startsWith("psalm responsoryjny")) return "Psalm responsoryjny";
  if (s.startsWith("drugie czytanie")) return "Drugie czytanie";
  if (s.includes("werset przed ewangelią") || s.includes("aklamacja")) return "Werset przed Ewangelią";
  if (s === "ewangelia" || s.startsWith("ewangelia ")) return "Ewangelia";
  return null;
}

function parseSection($, heading, kind) {
  const chunks = [];
  let el = $(heading).next();
  while (el.length && !/^H[1-3]$/.test(el[0].tagName?.toUpperCase() || "")) {
    if (!el.is("script,style,form,nav")) {
      const t = textWithBreaks($, el);
      if (t) chunks.push(t);
    }
    el = el.next();
  }

  // Deduplicate adjacent identical chunks created by nested wrappers.
  const uniq = chunks.filter((x, i) => i === 0 || x !== chunks[i - 1]);
  const ref = uniq.shift() || "";

  let lead = "";
  if (kind === "Pierwsze czytanie" || kind === "Drugie czytanie" || kind === "Ewangelia") {
    if (uniq[0] && /^(Czytanie|Słowa Ewangelii)/i.test(uniq[0])) lead = uniq.shift();
  }

  let response = "";
  if (kind === "Psalm responsoryjny" && uniq[0]) {
    const ix = uniq.findIndex(x => /^(Refren|R\.|Ref\.|Respons)/i.test(x));
    if (ix >= 0) response = uniq.splice(ix, 1)[0];
  }

  return { kind, ref, lead, response, body: uniq };
}

module.exports = async function handler(req, res) {
  const date = String(req.query?.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Nieprawidłowa data. Użyj YYYY-MM-DD." });
  }

  const url = `https://opoka.org.pl/liturgia/${date}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        "user-agent": "SlowoNaDzis/1.0 (+https://wroclawwielbi.pl/)",
        "accept-language": "pl-PL,pl;q=0.9"
      }
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Źródło zwróciło HTTP ${upstream.status}`, source: url });
    }

    const html = await upstream.text();
    const $ = cheerio.load(html);

    // Remove page furniture that can pollute sibling text extraction.
    $("script,style,noscript,form").remove();

    const readings = [];
    $("h2,h3").each((_, h) => {
      const kind = normalizeKind($(h).text());
      if (!kind || !KINDS.includes(kind)) return;
      const parsed = parseSection($, h, kind);
      if (parsed.ref || parsed.body.length) readings.push(parsed);
    });

    // Avoid duplicate sections if the source page contains mobile/desktop copies.
    const seen = new Set();
    const deduped = readings.filter(r => {
      const key = `${r.kind}|${r.ref}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Best-effort extraction of the day's liturgical title.
    let celebration = "";
    const pageText = clean($("body").text());
    const marker = pageText.match(/Rok liturgiczny:\s*[A-Z]\/[IVX]+\s+(.{0,120})/i);
    if (marker) celebration = clean(marker[1]).split("Pierwsze czytanie")[0].trim();

    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({
      date,
      source: url,
      celebration,
      readings: deduped
    });
  } catch (e) {
    return res.status(500).json({
      error: "Nie udało się pobrać lub przetworzyć liturgii.",
      detail: e.message,
      source: url
    });
  }
};
