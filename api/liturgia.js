const cheerio = require("cheerio");

const KINDS = [
  "Pierwsze czytanie",
  "Psalm responsoryjny",
  "Drugie czytanie",
  "Werset przed Ewangelią",
  "Ewangelia"
];

function clean(s = "") {
  return String(s)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function normalizeKind(raw = "") {
  const s = clean(raw)
    .toLowerCase()
    .replace(/[：:]+$/g, "");

  if (s.startsWith("pierwsze czytanie")) return "Pierwsze czytanie";
  if (s.startsWith("psalm responsoryjny")) return "Psalm responsoryjny";
  if (s.startsWith("drugie czytanie")) return "Drugie czytanie";
  if (s.includes("werset przed ewangelią") || s.includes("aklamacja")) {
    return "Werset przed Ewangelią";
  }
  if (s === "ewangelia" || s.startsWith("ewangelia ")) return "Ewangelia";
  return null;
}

function uniqueAdjacent(lines) {
  return lines.filter((line, i) => i === 0 || line !== lines[i - 1]);
}

/**
 * Opoka zmieniała układ DOM i nie wszystkie sekcje są rodzeństwem nagłówka.
 * Zamiast polegać na .next(), oznaczamy nagłówki markerami i czytamy dokument
 * w kolejności wizualnej. Dzięki temu działają także sekcje zagnieżdżone.
 */
function extractSectionsFromDocument($) {
  const root = $("body").clone();

  root.find("script,style,noscript,form,nav,footer,svg").remove();

  // Preserve useful visual line breaks before flattening DOM to text.
  root.find("br").replaceWith("\n");
  root.find("p,li,blockquote").each((_, el) => {
    root.find(el).append("\n");
  });

  // Every heading becomes a boundary. Liturgical headings receive a named marker.
  root.find("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const node = root.find(el);
    const kind = normalizeKind(node.text());

    if (kind) {
      node.replaceWith(`\n§§LIT_TARGET:${kind}§§\n`);
    } else {
      node.replaceWith("\n§§LIT_BOUNDARY§§\n");
    }
  });

  let text = root.text()
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n");

  const marker = /§§LIT_TARGET:([^§]+)§§/g;
  const matches = [...text.matchAll(marker)];
  const sections = [];

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const kind = current[1];
    const start = current.index + current[0].length;

    // Section ends at the next target marker or any ordinary heading boundary.
    const rest = text.slice(start);
    const targetIx = rest.search(/§§LIT_TARGET:[^§]+§§/);
    const boundaryIx = rest.search(/§§LIT_BOUNDARY§§/);

    let endOffset = rest.length;
    if (targetIx >= 0) endOffset = Math.min(endOffset, targetIx);
    if (boundaryIx >= 0) endOffset = Math.min(endOffset, boundaryIx);

    const chunk = rest.slice(0, endOffset);

    let lines = chunk
      .split(/\n+/)
      .map(clean)
      .filter(Boolean)
      .filter(line => !/^§§LIT_/i.test(line));

    lines = uniqueAdjacent(lines);

    if (!lines.length) continue;

    const ref = lines.shift() || "";
    let lead = "";
    let response = "";

    if (
      kind === "Pierwsze czytanie" ||
      kind === "Drugie czytanie" ||
      kind === "Ewangelia"
    ) {
      if (
        lines[0] &&
        /^(Czytanie|Słowa Ewangelii|Początek Ewangelii)/i.test(lines[0])
      ) {
        lead = lines.shift();
      }
    }

    if (kind === "Psalm responsoryjny" && lines.length) {
      // Opoka często nie dodaje słowa "Refren". Jeżeli pierwsza linia
      // powtarza się w psalmie, traktujemy ją jako refren.
      const explicit = lines.findIndex(x =>
        /^(Refren|Ref\.|R\.|Respons)/i.test(x)
      );

      if (explicit >= 0) {
        response = lines.splice(explicit, 1)[0]
          .replace(/^(Refren|Ref\.|R\.)\s*:?\s*/i, "");
      } else {
        const first = lines[0];
        const repeats = lines.slice(1).filter(x => x === first).length;
        if (repeats >= 1) {
          response = first;
          lines = lines.filter(x => x !== first);
        }
      }
    }

    sections.push({
      kind,
      ref,
      lead,
      response,
      body: lines
    });
  }

  return sections;
}

function richness(section) {
  const bodyChars = (section.body || []).join(" ").length;
  return bodyChars +
    (section.lead ? section.lead.length : 0) +
    (section.response ? section.response.length : 0);
}

/**
 * Some Opoka pages may contain duplicate desktop/mobile copies.
 * Keep the richest copy rather than blindly keeping the first one.
 */
function dedupeRichest(sections) {
  const best = new Map();

  for (const section of sections) {
    const key = `${section.kind}|${section.ref}`;
    const previous = best.get(key);

    if (!previous || richness(section) > richness(previous)) {
      best.set(key, section);
    }
  }

  // Preserve canonical liturgical order.
  const order = new Map(KINDS.map((kind, i) => [kind, i]));

  return [...best.values()].sort((a, b) => {
    return (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99);
  });
}

module.exports = async function handler(req, res) {
  const date = String(req.query?.date || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Nieprawidłowa data. Użyj YYYY-MM-DD."
    });
  }

  const url = `https://opoka.org.pl/liturgia/${date}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        "user-agent": "SlowoNaDzis/1.2 (+https://wroclawwielbi.pl/)",
        "accept-language": "pl-PL,pl;q=0.9",
        "accept": "text/html,application/xhtml+xml"
      }
    });

    if (!upstream.ok) {
      return res.status(502).json({
        error: `Źródło zwróciło HTTP ${upstream.status}`,
        source: url
      });
    }

    const html = await upstream.text();
    const $ = cheerio.load(html);

    const extracted = extractSectionsFromDocument($);
    const readings = dedupeRichest(extracted)
      .filter(section => {
        // Reject summary-only fragments: actual readings need content.
        if (section.kind === "Psalm responsoryjny") {
          return section.body.length > 0 || !!section.response;
        }
        return section.body.length > 0;
      });

    // Best-effort liturgical title.
    let celebration = "";
    const pageText = clean($("body").text());

    const titleMatch = pageText.match(
      /(?:Rok liturgiczny:\s*[A-Z]\/[IVX]+\s*)(.*?)(?=Pierwsze czytanie:|Pierwsze czytanie)/i
    );
    if (titleMatch) celebration = clean(titleMatch[1]).slice(0, 180);

    // Extra sanity information is useful during deployment debugging,
    // but does not expose source HTML.
    const foundKinds = readings.map(r => r.kind);

    res.setHeader(
      "Cache-Control",
      "s-maxage=21600, stale-while-revalidate=86400"
    );

    return res.status(200).json({
      date,
      source: url,
      celebration,
      readings,
      meta: {
        foundKinds,
        complete:
          foundKinds.includes("Pierwsze czytanie") &&
          foundKinds.includes("Psalm responsoryjny") &&
          foundKinds.includes("Ewangelia")
      }
    });
  } catch (e) {
    return res.status(500).json({
      error: "Nie udało się pobrać lub przetworzyć liturgii.",
      detail: e.message,
      source: url
    });
  }
};
