// Parses raw, free-form admin-entered product descriptions into clean,
// structured sections so the storefront can render them professionally
// (overview paragraphs, bullet feature lists, spec tables, package lists).
//
// The parser is intentionally forgiving: existing products that were typed as
// one big blob still render nicely, while admins who use the "Overview:",
// "Features:", "Specifications:" helper headings get rich structured output.

export type SpecItem = { label: string; value: string };

export type DescriptionSection =
  | { kind: "overview"; title: string; paragraphs: string[] }
  | { kind: "features"; title: string; items: string[] }
  | { kind: "package"; title: string; items: string[] }
  | { kind: "specs"; title: string; specs: SpecItem[] }
  | { kind: "info"; title: string; paragraphs: string[] };

export type ParsedDescription = {
  sections: DescriptionSection[];
  /** True when the raw text contained no recognisable structure. */
  plain: boolean;
};

type SectionKind = DescriptionSection["kind"];

// Maps a normalised heading to a section kind + canonical title.
const HEADING_MAP: { match: RegExp; kind: SectionKind; title: string }[] = [
  { match: /^(product\s+)?overview$/i, kind: "overview", title: "Product Overview" },
  { match: /^(description|about|summary)$/i, kind: "overview", title: "Product Overview" },
  { match: /^(key\s+)?features?$/i, kind: "features", title: "Key Features" },
  { match: /^highlights?$/i, kind: "features", title: "Key Features" },
  { match: /^(what'?s\s+included|package\s+(includes?|contents?)|in\s+the\s+box|box\s+contents?)$/i, kind: "package", title: "Package Includes" },
  { match: /^(specifications?|specs?|technical\s+details?|tech\s+specs?)$/i, kind: "specs", title: "Specifications" },
  { match: /^(additional\s+information|more\s+info(rmation)?|notes?|extra)$/i, kind: "info", title: "Additional Information" },
];

const BULLET_RE = /^\s*([-*•·▪◦‣]|\d+[.)])\s+/;

function stripBullet(line: string): string {
  return line.replace(BULLET_RE, "").trim();
}

function detectHeading(line: string): { kind: SectionKind; title: string } | null {
  // Allow trailing colon and surrounding markdown emphasis / hashes.
  const cleaned = line
    .replace(/^#{1,6}\s*/, "")
    .replace(/[*_]/g, "")
    .replace(/:\s*$/, "")
    .trim();
  if (!cleaned || cleaned.length > 40) return null;
  for (const h of HEADING_MAP) {
    if (h.match.test(cleaned)) return { kind: h.kind, title: h.title };
  }
  return null;
}

function looksLikeSpec(line: string): SpecItem | null {
  const m = stripBullet(line).match(/^([A-Za-z][A-Za-z0-9 /()&.+-]{1,30}?)\s*[:|–-]\s+(.+)$/);
  if (!m) return null;
  const label = m[1].trim();
  const value = m[2].trim();
  if (!label || !value) return null;
  return { label, value };
}

function buildSection(kind: SectionKind, title: string, lines: string[]): DescriptionSection | null {
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return null;

  if (kind === "specs") {
    const specs: SpecItem[] = [];
    for (const l of nonEmpty) {
      const spec = looksLikeSpec(l);
      if (spec) specs.push(spec);
    }
    if (specs.length === 0) return null;
    return { kind, title, specs };
  }

  if (kind === "features" || kind === "package") {
    const items = nonEmpty.map(stripBullet).filter(Boolean);
    if (items.length === 0) return null;
    return { kind, title, items };
  }

  // overview / info → paragraphs split on blank lines
  const paragraphs: string[] = [];
  let buf: string[] = [];
  for (const l of lines) {
    if (l.trim() === "") {
      if (buf.length) {
        paragraphs.push(buf.join(" ").trim());
        buf = [];
      }
    } else {
      buf.push(l.trim());
    }
  }
  if (buf.length) paragraphs.push(buf.join(" ").trim());
  const clean = paragraphs.filter(Boolean);
  if (clean.length === 0) return null;
  return { kind, title, paragraphs: clean };
}

export function parseDescription(raw: string | null | undefined): ParsedDescription {
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return { sections: [], plain: true };

  const lines = text.split("\n");

  // Group lines into (heading -> lines) blocks. Content before the first
  // heading becomes the overview.
  type Block = { kind: SectionKind; title: string; lines: string[] };
  const blocks: Block[] = [];
  let current: Block = { kind: "overview", title: "Product Overview", lines: [] };
  let sawHeading = false;

  for (const line of lines) {
    const heading = detectHeading(line);
    if (heading) {
      sawHeading = true;
      if (current.lines.some((l) => l.trim())) blocks.push(current);
      current = { kind: heading.kind, title: heading.title, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((l) => l.trim())) blocks.push(current);

  // Heuristic: even without explicit headings, detect an inline spec run
  // (consecutive "Key: Value" lines) and split it into a spec section.
  const sections: DescriptionSection[] = [];
  for (const b of blocks) {
    if (b.kind === "overview" || b.kind === "info") {
      // Try to peel a trailing block of spec-like lines out of plain text.
      const peeled = peelSpecRun(b.lines);
      if (peeled) {
        const head = buildSection(b.kind, b.title, peeled.head);
        if (head) sections.push(head);
        const specs = buildSection("specs", "Specifications", peeled.specs);
        if (specs) sections.push(specs);
        continue;
      }
    }
    const built = buildSection(b.kind, b.title, b.lines);
    if (built) sections.push(built);
  }

  // Detect "plain": only one overview section that we didn't restructure.
  const plain = !sawHeading && sections.length <= 1 && sections.every((s) => s.kind === "overview");

  return { sections, plain };
}

// Pulls a contiguous trailing run of 3+ "Key: Value" lines out of an
// otherwise-prose block so unlabeled specs still get a table.
function peelSpecRun(lines: string[]): { head: string[]; specs: string[] } | null {
  const trimmed = lines.map((l) => l.trim());
  let start = trimmed.length;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i] === "") {
      if (start < trimmed.length) break;
      continue;
    }
    if (looksLikeSpec(trimmed[i])) {
      start = i;
    } else {
      break;
    }
  }
  const specLines = trimmed.slice(start).filter(Boolean);
  if (specLines.length < 3) return null;
  return { head: lines.slice(0, start), specs: specLines };
}

/** Plain-text helper string shown to admins as a formatting guide. */
export const DESCRIPTION_TEMPLATE = `Overview:
Write a short, compelling product summary here.

Key Features:
- First feature
- Second feature
- Third feature

Specifications:
Material: 
Weight: 
Dimensions: 
Color: 
Warranty: 

Package Includes:
- Item 1
- Item 2`;
