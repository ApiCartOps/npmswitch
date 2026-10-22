import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const contentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");

export const instructions = () => fs.readFileSync(path.join(contentDir, "instructions.md"), "utf8");

/** Slash commands shipped in content/commands, as {name, description, body}. Also served as MCP prompts. */
export function commands() {
  const dir = path.join(contentDir, "commands");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    const description = /^description:\s*(.*)$/m.exec(m?.[1] ?? "")?.[1] ?? "";
    return { name: f.replace(/\.md$/, ""), description, body: (m?.[2] ?? raw).trim() };
  });
}
