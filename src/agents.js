import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { instructions, commands, contentDir } from "./content.js";

const home = os.homedir();
const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
const supportDir = process.platform === "win32" ? appData
  : process.platform === "darwin" ? path.join(home, "Library", "Application Support")
  : (process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"));
const vscodeUser = path.join(supportDir, "Code", "User");

const std = ({ command, args }) => ({ command, args });
const list = (args) => `[${args.map((a) => JSON.stringify(a)).join(", ")}]`;
const tomlBlock = (name, c) => `[mcp_servers.${name}]\ncommand = ${JSON.stringify(c.command)}\nargs = ${list(c.args)}\n`;
const hermesYaml = (name, c) => `mcp_servers:\n  ${name}:\n    command: ${JSON.stringify(c.command)}\n    args: ${list(c.args)}\n`;

/**
 * kind "json":  merge an entry into `file` under `key`.
 * kind "toml":  append a table to `file`.
 * kind "file":  an own file, written whole.
 * kind "print": no safe automatic edit; `snippet` is shown instead.
 */
export const AGENTS = {
  "claude-code": { label: "Claude Code", kind: "json", file: path.join(home, ".claude.json"), key: "mcpServers",
    entry: (c) => ({ type: "stdio", ...std(c) }), extras: true },
  "claude-desktop": { label: "Claude Desktop", kind: "json", file: path.join(supportDir, "Claude", "claude_desktop_config.json"), key: "mcpServers", entry: std },
  cursor: { label: "Cursor", kind: "json", file: path.join(home, ".cursor", "mcp.json"), key: "mcpServers", entry: std },
  vscode: { label: "VS Code / GitHub Copilot", kind: "json", file: path.join(vscodeUser, "mcp.json"), key: "servers", entry: (c) => ({ type: "stdio", ...std(c) }) },
  windsurf: { label: "Windsurf", kind: "json", file: path.join(home, ".codeium", "windsurf", "mcp_config.json"), key: "mcpServers", entry: std },
  cline: { label: "Cline", kind: "json", file: path.join(vscodeUser, "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"), key: "mcpServers", entry: std },
  "gemini-cli": { label: "Gemini CLI", kind: "json", file: path.join(home, ".gemini", "settings.json"), key: "mcpServers", entry: std },
  opencode: { label: "opencode", kind: "json", file: path.join(home, ".config", "opencode", "opencode.json"), key: "mcp",
    entry: (c) => ({ type: "local", command: [c.command, ...c.args], enabled: true }) },
  codex: { label: "OpenAI Codex CLI", kind: "toml", file: path.join(home, ".codex", "config.toml"), block: tomlBlock },
  continue: { label: "Continue", kind: "file", file: (name) => path.join(home, ".continue", "mcpServers", `${name}.yaml`),
    content: (name, c) => `name: ${name}\nversion: 0.0.1\nschema: v1\nmcpServers:\n  - name: ${name}\n    command: ${JSON.stringify(c.command)}\n    args: ${list(c.args)}\n` },
  hermes: { label: "Hermes Agent", kind: "print", file: path.join(home, ".hermes", "config.yaml"), snippet: hermesYaml,
    note: "Merge this under mcp_servers in ~/.hermes/config.yaml." },
  zed: { label: "Zed", kind: "print", file: path.join(process.platform === "win32" ? appData : path.join(home, ".config"), process.platform === "win32" ? "Zed" : "zed", "settings.json"),
    snippet: (n, c) => JSON.stringify({ context_servers: { [n]: { command: c.command, args: c.args } } }, null, 2),
    note: "Merge this into Zed's settings.json (it allows comments, so it is not edited automatically)." },
  generic: { label: "Any MCP client (stdio)", kind: "print", snippet: (n, c) => JSON.stringify({ mcpServers: { [n]: std(c) } }, null, 2),
    note: "Most MCP clients accept this shape." },
};

export function serverCommand({ npx = false } = {}) {
  if (npx) return { command: "npx", args: ["-y", "@apicartops/npmswitch", "mcp"] };
  return { command: "node", args: [path.resolve(contentDir, "..", "src", "cli.js"), "mcp"] };
}

const readText = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
const writeText = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const fileOf = (a, name) => (typeof a.file === "function" ? a.file(name) : a.file);

/** True when the agent's config folder exists, i.e. it is probably installed. */
export function detect(a) {
  const f = fileOf(a, "x");
  return !!f && fs.existsSync(path.dirname(f));
}

function readJson(f) {
  const t = readText(f);
  if (t === null || !t.trim()) return {};
  try { return JSON.parse(t); } catch { throw new Error(`${f} is not plain JSON (comments?), so it was not edited. Use: npmswitch config <agent>`); }
}

const tomlRe = (name) => new RegExp(`^\\[mcp_servers\\.${name}\\][\\s\\S]*?(?=^\\[|(?![\\s\\S]))`, "m");
const agentOf = (id) => {
  if (!AGENTS[id]) throw new Error(`Unknown agent "${id}". Run: npmswitch agents`);
  return AGENTS[id];
};

/** Register the server with one agent. Returns a human-readable result. */
export function install(id, name, cmd, { dryRun = false } = {}) {
  const a = agentOf(id);
  if (a.kind === "print") return `${a.label}: manual step. ${a.note}\n${a.snippet(name, cmd)}`;
  const f = fileOf(a, name);
  const out = [];
  const did = dryRun ? "would add" : "added";
  if (a.kind === "json") {
    const d = readJson(f);
    const entry = a.entry(cmd);
    if (JSON.stringify(d[a.key]?.[name]) === JSON.stringify(entry)) out.push(`${a.label}: already installed (${f})`);
    else {
      d[a.key] = { ...d[a.key], [name]: entry };
      if (!dryRun) writeText(f, JSON.stringify(d, null, 2) + "\n");
      out.push(`${a.label}: ${did} "${name}" in ${f}`);
    }
  } else if (a.kind === "toml") {
    const t = readText(f) ?? "";
    if (tomlRe(name).test(t)) out.push(`${a.label}: [mcp_servers.${name}] already in ${f} (left unchanged)`);
    else {
      if (!dryRun) writeText(f, `${t}${t && !t.endsWith("\n") ? "\n" : ""}${t ? "\n" : ""}${a.block(name, cmd)}`);
      out.push(`${a.label}: ${did} [mcp_servers.${name}] in ${f}`);
    }
  } else {
    if (!dryRun) writeText(f, a.content(name, cmd));
    out.push(`${a.label}: ${dryRun ? "would write" : "wrote"} ${f}`);
  }
  if (a.extras) out.push(installClaudeExtras({ dryRun }));
  return out.join("\n");
}

export function uninstall(id, name) {
  const a = agentOf(id);
  if (a.kind === "print") return `${a.label}: remove the "${name}" entry from ${a.file ?? "your client config"} by hand.`;
  const f = fileOf(a, name);
  if (a.kind === "json") {
    const d = readJson(f);
    if (!d[a.key]?.[name]) return `${a.label}: not installed`;
    delete d[a.key][name];
    writeText(f, JSON.stringify(d, null, 2) + "\n");
  } else if (a.kind === "toml") {
    const t = readText(f);
    if (t === null || !tomlRe(name).test(t)) return `${a.label}: not installed`;
    writeText(f, t.replace(tomlRe(name), "").replace(/\n{3,}/g, "\n\n"));
  } else {
    if (!fs.existsSync(f)) return `${a.label}: not installed`;
    fs.rmSync(f);
  }
  return `${a.label}: removed "${name}"${a.extras ? uninstallClaudeExtras() : ""}`;
}

// ---- Claude Code skill + slash commands (user scope) ----
const claudeDir = path.join(home, ".claude");

function installClaudeExtras({ dryRun }) {
  const cmds = commands();
  const files = [
    [path.join(claudeDir, "skills", "npmswitch", "SKILL.md"), path.join(contentDir, "skill", "SKILL.md")],
    ...cmds.map((c) => [path.join(claudeDir, "commands", `${c.name}.md`), path.join(contentDir, "commands", `${c.name}.md`)]),
  ];
  if (!dryRun) for (const [dest, src] of files) writeText(dest, fs.readFileSync(src, "utf8"));
  return `Claude Code: ${dryRun ? "would install" : "installed"} skill "npmswitch" and slash commands ${cmds.map((c) => "/" + c.name).join(", ")}`;
}

function uninstallClaudeExtras() {
  fs.rmSync(path.join(claudeDir, "skills", "npmswitch"), { recursive: true, force: true });
  for (const c of commands()) fs.rmSync(path.join(claudeDir, "commands", `${c.name}.md`), { force: true });
  return " and its skill and slash commands";
}

// ---- Project instruction files, for agents that read them ----
const START = "<!-- npmswitch:start -->";
const END = "<!-- npmswitch:end -->";
const TARGETS = {
  agents: { file: "AGENTS.md", who: "Codex, Cursor, Copilot, Windsurf, opencode, Zed, Hermes and others" },
  claude: { file: "CLAUDE.md", who: "Claude Code" },
  gemini: { file: "GEMINI.md", who: "Gemini CLI" },
  copilot: { file: path.join(".github", "copilot-instructions.md"), who: "GitHub Copilot" },
  cursor: { file: path.join(".cursor", "rules", "npmswitch.mdc"), who: "Cursor rules",
    wrap: (b) => `---\ndescription: Use the npmswitch MCP server for npm registry work\nalwaysApply: true\n---\n${b}` },
};
export const initTargets = Object.keys(TARGETS);

/** Add (or refresh) the instruction block in each target file under `dir`. Idempotent. */
export function init(dir, only, { dryRun = false } = {}) {
  const block = `${START}\n${instructions().trim()}\n${END}\n`;
  // Also matches the markers used before the rename.
  const blockRe = /<!-- npmswitch:start -->[\s\S]*?<!-- npmswitch:end -->\n?/;
  return only.map((id) => {
    const t = TARGETS[id];
    if (!t) throw new Error(`Unknown target "${id}". Choose from: ${initTargets.join(", ")}`);
    const f = path.join(dir, t.file);
    const cur = readText(f);
    const mode = cur === null ? "create" : blockRe.test(cur) ? "update" : "append";
    const next = mode === "create" ? (t.wrap ? t.wrap(block) : block)
      : mode === "update" ? cur.replace(blockRe, () => block)
      : `${cur}${cur.endsWith("\n") ? "" : "\n"}\n${block}`;
    if (!dryRun && next !== cur) writeText(f, next);
    const past = { create: "created", update: "updated", append: "appended to" }[mode];
    return `${dryRun ? "would " + mode : past} ${t.file} (${t.who})`;
  });
}

/** AGENTS.md always, plus any other instruction file the project already has. */
export function defaultTargets(dir) {
  return initTargets.filter((id) => id === "agents" || fs.existsSync(path.join(dir, TARGETS[id].file)));
}
