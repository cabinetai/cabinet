/**
 * Next.js' `req.formData()` (undici) fails with "Failed to parse body as
 * FormData" when the multipart filename contains non-ASCII characters
 * (vercel/next.js#76893) — e.g. "Vidéo.mp4". To stay compatible, the file is
 * appended under an ASCII-safe placeholder name and the real filename travels
 * percent-encoded in the `x-cabinet-filename` header, which the upload route
 * decodes back.
 */
export function buildSafeFileForm(file: File): {
  form: FormData;
  headers: Record<string, string>;
} {
  const form = new FormData();
  const dotIdx = file.name.lastIndexOf(".");
  const rawExt = dotIdx > 0 ? file.name.slice(dotIdx) : "";
  // Keep only ASCII in the placeholder extension so the multipart part stays parseable.
  const asciiExt = rawExt.replace(/[^\x21-\x7e]/g, "").replace(/[\\/:"*?<>|]/g, "");
  form.append("file", file, `upload${asciiExt}`);
  return {
    form,
    headers: { "x-cabinet-filename": encodeURIComponent(file.name) },
  };
}
