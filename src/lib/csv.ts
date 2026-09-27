export function serializeCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>) {
  return "\uFEFF" + rows.map((row) => row.map((value) => {
    const text = value == null ? "" : String(value);
    // Protect user-supplied text cells from spreadsheet formula interpretation.
    // Numeric cells keep their underlying values, including negative growth.
    const safe = typeof value === "string" && /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>) {
  const url = URL.createObjectURL(new Blob([serializeCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Let the browser begin the download before releasing its backing blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
