import "server-only";
import PostalMime from "postal-mime";

type AttachmentMeta = {
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  contentId: string | null;
};

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parseRawEmail(source: Buffer | string) {
  const parsed = await PostalMime.parse(source, { maxNestingDepth: 50 });
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const text = (parsed.text?.trim() || stripHtml(html) || "").slice(0, 250_000);
  const attachments: AttachmentMeta[] = (parsed.attachments ?? []).slice(0, 100).map((attachment: any) => ({
    filename: typeof attachment.filename === "string" ? attachment.filename.slice(0, 255) : null,
    mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType.slice(0, 255) : null,
    size: typeof attachment.content?.byteLength === "number" ? attachment.content.byteLength : null,
    contentId: typeof attachment.contentId === "string" ? attachment.contentId.slice(0, 500) : null,
  }));
  return { text, attachments };
}
