// Minimal markdown renderer (headings, paragraphs, bold, links).
// Avoids adding a dep; safe because we escape HTML first.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderMarkdown(src: string): string {
  const escaped = escapeHtml(src);
  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    para.push(line);
  }
  flush();
  return out.join("\n");
}

function safeLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(\/|#|\?)/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (["http:", "https:", "mailto:", "tel:"].includes(u.protocol)) return trimmed;
    return "#";
  } catch {
    return "#";
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) =>
      `<a href="${escapeAttr(safeLinkUrl(url))}" class="text-accent underline" rel="noopener noreferrer">${label}</a>`,
    );
}
