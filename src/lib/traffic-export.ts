/**
 * Export helpers for the Traffic Intelligence Command Center.
 * Dependency-free: CSV, JSON and an Excel-compatible .xls (HTML table) export.
 */

type Row = Record<string, unknown>;

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(rows: Row[], filename: string) {
  if (!rows.length) { triggerDownload("", `${filename}.csv`, "text/csv"); return; }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  triggerDownload(lines.join("\n"), `${filename}.csv`, "text/csv;charset=utf-8");
}

export function exportJson(data: unknown, filename: string) {
  triggerDownload(JSON.stringify(data, null, 2), `${filename}.json`, "application/json");
}

export function exportExcel(rows: Row[], filename: string) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const thead = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
  const tbody = rows.map((r) => `<tr>${headers.map((h) => `<td>${esc(r[h])}</td>`).join("")}</tr>`).join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">${thead}${tbody}</table></body></html>`;
  triggerDownload(html, `${filename}.xls`, "application/vnd.ms-excel");
}

export type ExportFormat = "csv" | "excel" | "json";

export function exportRows(format: ExportFormat, rows: Row[], filename: string) {
  if (format === "csv") exportCsv(rows, filename);
  else if (format === "excel") exportExcel(rows, filename);
  else exportJson(rows, filename);
}
