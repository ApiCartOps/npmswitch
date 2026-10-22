#!/usr/bin/env node
import readline from "node:readline";
import { parseArgs } from "node:util";
import { listAccounts, saveAccount, removeAccount, setDefault, storePath } from "./store.js";
import { whoamiToken } from "./npm.js";
import { AGENTS, detect, install, uninstall, serverCommand, init, defaultTargets, initTargets } from "./agents.js";

const HELP = `npmswitch: one MCP server, every npm account

  add <name> [--token-env=VAR] [--default]   Add an account. The token is read from the
      [--scopes=@acme,@tools]                env var VAR, or typed at a hidden prompt.
                                             --scopes lists the scopes this account owns, so
                                             calls on @acme/* use it automatically.
  list [--json]                              Show accounts (never prints tokens)
  default <name>                             Set the default account
  remove <name>                              Remove an account
  mcp                                        Run as an MCP server over stdio

Connect it to your AI agent:
  agents                                     List supported agents and whether they look installed
  install <agent|all> [--name=N] [--npx]     Register this server with an agent's MCP config
                                             [--dry-run] shows what would change
  uninstall <agent>                          Remove it again
  config <agent>                             Print the config snippet for an agent
  init [--dir=.] [--only=a,b] [--all]        Write usage instructions into a project
                                             (AGENTS.md, CLAUDE.md, GEMINI.md, copilot, cursor)

Agents: ${Object.keys(AGENTS).join(", ")}

Use one npm access token per account. For publishing, use a granular token with
write access to the packages, or an automation token (it skips 2FA prompts).
Tokens are stored in ${storePath} (file mode 600).`;

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer.trim()); });
  });
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "token-env": { type: "string" }, scopes: { type: "string" }, default: { type: "boolean" }, name: { type: "string", default: "npmswitch" },
    npx: { type: "boolean" }, "dry-run": { type: "boolean" }, dir: { type: "string", default: "." },
    only: { type: "string" }, all: { type: "boolean" }, json: { type: "boolean" },
  },
});
const [cmd, name] = positionals;

try {
  switch (cmd) {
    case "add": {
      if (!name) throw new Error("Usage: add <name> [--token-env=VAR]");
      const token = values["token-env"] ? process.env[values["token-env"]] : await promptHidden(`npm token for "${name}": `);
      if (!token) throw new Error("No token provided.");
      const login = await whoamiToken(token);
      const scopes = values.scopes ? values.scopes.split(",").map((x) => x.trim()).filter(Boolean) : [];
      saveAccount(name, token, login, values.default, scopes);
      console.log(`Saved "${name}" (npm user ${login}${scopes.length ? `, scopes ${scopes.map((s) => s.replace(/^@/, "")).join(" ")}` : ""}).`);
      break;
    }
    case "list": {
      const accts = listAccounts();
      if (values.json) { console.log(JSON.stringify(accts, null, 2)); break; }
      if (!accts.length) { console.log("No accounts yet. Add one with: npmswitch add <name>"); break; }
      const w = Math.max(4, ...accts.map((a) => a.name.length));
      console.log(`  ${"NAME".padEnd(w)}  LOGIN${" ".repeat(Math.max(0, Math.max(5, ...accts.map((a) => a.login.length)) - 5))}  SCOPES`);
      for (const a of accts) console.log(`${a.default ? "*" : " "} ${a.name.padEnd(w)}  ${a.login.padEnd(Math.max(5, ...accts.map((x) => x.login.length)))}  ${a.scopes.map((x) => "@" + x).join(" ")}${a.default ? "  (default)" : ""}`.trimEnd());
      break;
    }
    case "default": setDefault(name); console.log(`Default is now "${name}".`); break;
    case "remove": removeAccount(name); console.log(`Removed "${name}".`); break;
    case "agents":
      for (const [id, a] of Object.entries(AGENTS)) console.log(`${id.padEnd(15)} ${a.label.padEnd(26)} ${a.kind === "print" ? "manual snippet" : detect(a) ? "detected" : "not detected"}`);
      break;
    case "install": {
      if (!name) throw new Error(`Usage: install <agent|all>. Agents: ${Object.keys(AGENTS).join(", ")}`);
      const cmd = serverCommand({ npx: values.npx });
      const ids = name === "all" ? Object.keys(AGENTS).filter((id) => AGENTS[id].kind !== "print" && detect(AGENTS[id])) : [name];
      if (!ids.length) console.log("No supported agents detected. Try: install <agent>, or: config generic");
      for (const id of ids) {
        try { console.log(install(id, values.name, cmd, { dryRun: values["dry-run"] })); }
        catch (e) { if (ids.length === 1) throw e; console.log(`${id}: skipped (${e.message})`); }
      }
      if (!values["dry-run"] && ids.length) console.log("Restart the agent, then add an account if you have not: npmswitch add <name>");
      break;
    }
    case "uninstall": if (!name) throw new Error("Usage: uninstall <agent>"); console.log(uninstall(name, values.name)); break;
    case "config": {
      if (!name) throw new Error(`Usage: config <agent>. Agents: ${Object.keys(AGENTS).join(", ")}`);
      const a = AGENTS[name]; if (!a) throw new Error(`Unknown agent "${name}".`);
      const cmd = serverCommand({ npx: values.npx });
      console.log(a.kind === "print" ? a.snippet(values.name, cmd)
        : a.kind === "toml" ? a.block(values.name, cmd)
        : a.kind === "file" ? a.content(values.name, cmd)
        : JSON.stringify({ [a.key]: { [values.name]: a.entry(cmd) } }, null, 2));
      break;
    }
    case "init": {
      const dir = values.dir;
      const only = values.all ? initTargets : values.only ? values.only.split(",") : defaultTargets(dir);
      for (const line of init(dir, only, { dryRun: values["dry-run"] })) console.log(line);
      break;
    }
    case "mcp": await (await import("./mcp.js")).serve(); break;
    default: console.log(HELP);
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
