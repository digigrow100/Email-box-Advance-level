export function renderTemplate(input: string, data: Record<string, string | undefined>) {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => data[key] ?? "");
}
