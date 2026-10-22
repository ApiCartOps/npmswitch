// Smoke test against a fake npm registry. Uses temp config and home dirs; touches no real accounts.
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const users = { tok_personal: "alice", tok_org: "acme-bot" };
const calls = [];
const puts = [];
const doc = () => ({
  name: "@acme/tool", description: "d", _rev: "1-x", "dist-tags": { latest: "1.1.0" },
  maintainers: [{ name: "acme-bot" }], time: { created: "2024-01-01", modified: "2025-01-01", "1.0.0": "2024-01-01", "1.1.0": "2025-01-01" },
  versions: { "1.0.0": { name: "@acme/tool", version: "1.0.0" }, "1.1.0": { name: "@acme/tool", version: "1.1.0", license: "MIT", dependencies: { x: "^1" } } },
});
const server = http.createServer((req, res) => {
  const tok = (req.headers.authorization ?? "").replace("Bearer ", "");
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls.push({ method: req.method, url: req.url, tok, otp: req.headers["npm-otp"] });
    res.setHeader("content-type", "application/json");
    const json = (o, code = 200) => { res.writeHead(code); res.end(JSON.stringify(o)); };
    if (req.url.startsWith("/downloads/")) return json({ package: "left-pad", start: "a", end: "b", downloads: 42 });
    if (req.url === "/-/whoami") return users[tok] ? json({ username: users[tok] }) : json({ error: "bad token" }, 401);
    if (req.url.startsWith("/-/v1/search")) return json({ total: 1, objects: [{ package: { name: "left-pad", version: "1.3.0", description: "pad", publisher: { username: "x" } } }] });
    if (req.method === "GET" && req.url.startsWith("/@acme%2Ftool")) return json(doc());
    if (req.method === "PUT" && req.url === "/@acme%2Ftool") { puts.push(JSON.parse(body)); return json({ ok: true }); }
    if (req.url.startsWith("/-/package/")) { puts.push({ url: req.url, method: req.method, body }); return json({ ok: true }); }
    if (req.method === "PUT") { puts.push({ publish: req.url, auth: req.headers.authorization }); return json({ ok: true }); }
    json({ error: "not found" }, 404);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const home = fs.mkdtempSync(path.join(os.tmpdir(), "nsw-"));
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "nsw-home-"));
const env = {
  ...process.env, HOME: fakeHome, USERPROFILE: fakeHome, APPDATA: path.join(fakeHome, "AppData"), XDG_CONFIG_HOME: path.join(fakeHome, ".config"),
  NPMSWITCH_HOME: home, NPM_REGISTRY_URL: base, NPM_DOWNLOADS_URL: base, T1: "tok_personal", T2: "tok_org",
};
// Async spawn: the fake registry lives in this process, so a blocking spawnSync would deadlock.
const cli = (...a) => new Promise((resolve) => {
  const c = spawn("node", ["src/cli.js", ...a], { env });
  let stdout = ""; c.stdout.on("data", (d) => (stdout += d));
  c.on("close", (status) => resolve({ stdout, status }));
});

assert.match((await cli("add", "personal", "--token-env=T1")).stdout, /alice/);
assert.match((await cli("add", "org", "--token-env=T2", "--scopes=@acme,@tools")).stdout, /acme-bot.*acme tools/);
assert.equal((await cli("add", "bad", "--token-env=NOPE")).status, 1);
const listOut = (await cli("list", "--json")).stdout;
assert.deepEqual(JSON.parse(listOut).map((a) => [a.name, a.login, a.default, a.scopes]), [["personal", "alice", true, []], ["org", "acme-bot", false, ["acme", "tools"]]]);
assert.ok(!listOut.includes("tok_"), "list must not leak tokens");
const pretty = (await cli("list")).stdout;
assert.match(pretty, /\* personal\s+alice\s+\(default\)/); assert.match(pretty, /org\s+acme-bot\s+@acme @tools/); assert.ok(!pretty.includes("tok_"));
console.log("cli add/list ok");

// MCP over stdio
const p = spawn("node", ["src/cli.js", "mcp"], { env });
let buf = ""; const pending = new Map();
p.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) { const m = JSON.parse(l); pending.get(m.id)?.(m); } } });
const rpc = (id, method, params) => new Promise((r) => { pending.set(id, r); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const init = (await rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } })).result;
assert.match(init.instructions, /npm_publish/);
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const tools = (await rpc(2, "tools/list", {})).result.tools.map((t) => t.name);
assert.equal(tools.length, 10, tools.join());
const raw = async (id, name, args) => (await rpc(id, "tools/call", { name, arguments: args })).result;
const call = async (id, name, args) => JSON.parse((await raw(id, name, args)).content[0].text);

// scope routes to the account that owns it (by configured scope), unscoped goes to default
let r = await call(3, "npm_get_package", { name: "@acme/tool" });
assert.equal(r.account, "org"); assert.equal(calls.at(-1).tok, "tok_org");
assert.equal(r.dist_tags.latest, "1.1.0"); assert.equal(r.license, "MIT"); assert.deepEqual(r.maintainers, ["acme-bot"]);
r = await call(4, "npm_search", { query: "left-pad" });
assert.equal(r.account, "personal"); assert.equal(r.packages[0].name, "left-pad");
r = await call(5, "npm_downloads", { name: "left-pad" });
assert.equal(r.downloads, 42);
r = await call(6, "npm_whoami", { account: "acme-bot" }); // explicit, by username
assert.equal(r.account, "org"); assert.equal(r.username, "acme-bot");
assert.equal((await raw(7, "npm_whoami", { account: "ghost" })).isError, true);

// deprecate: semver range, otp header, leaves other versions alone
r = await call(8, "npm_deprecate", { name: "@acme/tool", message: "use v2", versions: "<1.1.0", otp: "123456" });
assert.deepEqual(r.versions, ["1.0.0"]);
assert.equal(puts.at(-1).versions["1.0.0"].deprecated, "use v2"); assert.equal(puts.at(-1).versions["1.1.0"].deprecated, undefined);
assert.equal(calls.at(-1).otp, "123456"); assert.equal(calls.at(-1).tok, "tok_org");
assert.equal((await raw(9, "npm_deprecate", { name: "@acme/tool", message: "x", versions: "9.x" })).isError, true); // no match
// dist-tags
await call(10, "npm_set_dist_tag", { name: "@acme/tool", tag: "next", version: "1.1.0" });
assert.equal(puts.at(-1).method, "PUT"); assert.equal(puts.at(-1).url, "/-/package/@acme%2Ftool/dist-tags/next"); assert.equal(puts.at(-1).body, '"1.1.0"');
const rm = await raw(11, "npm_remove_dist_tag", { name: "@acme/tool", tag: "latest" });
assert.equal(rm.isError, true); assert.match(rm.content[0].text, /latest/);
// accounts tool and resource never leak tokens
assert.ok(!(await raw(12, "npm_list_accounts", {})).content[0].text.includes("tok_"));
const prompts = (await rpc(13, "prompts/list", {})).result.prompts.map((x) => x.name);
assert.deepEqual(prompts.sort(), ["npm_accounts", "npm_deprecate", "npm_package_health", "npm_release_check"]);
console.log("mcp tools ok:", tools.join(", "));

// publish: dry run by default, real run only when asked; token never in output
const pkg = fs.mkdtempSync(path.join(os.tmpdir(), "nsw-pkg-"));
fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@acme/newpkg", version: "0.0.1" }));
fs.writeFileSync(path.join(pkg, "index.js"), "module.exports = 1;\n");
const before = puts.length;
r = await call(14, "npm_publish", { dir: pkg });
assert.equal(r.dry_run, true); assert.equal(r.published, false); assert.equal(r.account, "org");
assert.equal(puts.length, before, "dry run must not hit the registry");
assert.ok(!JSON.stringify(r).includes("tok_"));
r = await call(15, "npm_publish", { dir: pkg, dry_run: false });
assert.equal(r.published, true);
assert.match(puts.at(-1).publish, /newpkg/); assert.equal(puts.at(-1).auth, "Bearer tok_org");
assert.ok(!JSON.stringify(r).includes("tok_"));
assert.ok(!fs.readdirSync(os.tmpdir()).some((d) => d.startsWith("npmswitch-")), "temp npmrc must be cleaned up");
fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "p", version: "1.0.0", private: true }));
assert.match((await raw(16, "npm_publish", { dir: pkg, dry_run: false })).content[0].text, /private/);
const badTag = await raw(17, "npm_publish", { dir: pkg, tag: "x; rm -rf /" });
assert.equal(badTag.isError, true);
console.log("publish ok");

p.kill(); server.close();

// agent installers (into the fake home)
const cfgOf = (...seg) => path.join(fakeHome, ...seg);
const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
fs.mkdirSync(cfgOf(".cursor"), { recursive: true });
fs.writeFileSync(cfgOf(".cursor", "mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
assert.match((await cli("install", "cursor", "--dry-run")).stdout, /would add/);
assert.ok(!("npmswitch" in rd(cfgOf(".cursor", "mcp.json")).mcpServers), "dry run must not write");
await cli("install", "cursor");
const c = rd(cfgOf(".cursor", "mcp.json")).mcpServers;
assert.equal(c.other.command, "x"); assert.equal(c.npmswitch.command, "node"); assert.equal(c.npmswitch.args.at(-1), "mcp");
assert.match((await cli("install", "cursor")).stdout, /already installed/);
await cli("install", "vscode");
const appSupport = process.platform === "win32" ? cfgOf("AppData") : process.platform === "darwin" ? cfgOf("Library", "Application Support") : cfgOf(".config");
assert.equal(rd(path.join(appSupport, "Code", "User", "mcp.json")).servers.npmswitch.type, "stdio");
await cli("install", "opencode");
assert.equal(rd(cfgOf(".config", "opencode", "opencode.json")).mcp.npmswitch.type, "local");
await cli("install", "codex");
assert.match(fs.readFileSync(cfgOf(".codex", "config.toml"), "utf8"), /\[mcp_servers\.npmswitch\]/);
await cli("install", "claude-code");
assert.ok(fs.existsSync(cfgOf(".claude", "skills", "npmswitch", "SKILL.md")));
assert.ok(fs.existsSync(cfgOf(".claude", "commands", "npm-release-check.md")));
assert.equal(rd(cfgOf(".claude.json")).mcpServers.npmswitch.type, "stdio");
assert.match((await cli("install", "hermes")).stdout, /mcp_servers:/);
fs.mkdirSync(cfgOf(".gemini"), { recursive: true });
const BAD_JSON = "{ // comment\n}";
fs.writeFileSync(cfgOf(".gemini", "settings.json"), BAD_JSON);
assert.equal((await cli("install", "gemini-cli")).status, 1);
assert.equal(fs.readFileSync(cfgOf(".gemini", "settings.json"), "utf8"), BAD_JSON);
await cli("uninstall", "cursor"); assert.deepEqual(Object.keys(rd(cfgOf(".cursor", "mcp.json")).mcpServers), ["other"]);
await cli("uninstall", "codex"); assert.ok(!/npmswitch/.test(fs.readFileSync(cfgOf(".codex", "config.toml"), "utf8")));
await cli("uninstall", "claude-code"); assert.ok(!fs.existsSync(cfgOf(".claude", "skills", "npmswitch")));
assert.equal(Object.keys(rd(cfgOf(".claude.json")).mcpServers).length, 0);
console.log("agent install/uninstall ok");

// project instruction files: idempotent, preserves existing text
const proj = fs.mkdtempSync(path.join(os.tmpdir(), "nsw-proj-"));
fs.writeFileSync(path.join(proj, "CLAUDE.md"), "# Mine\n");
await cli("init", `--dir=${proj}`); await cli("init", `--dir=${proj}`);
const claudeMd = fs.readFileSync(path.join(proj, "CLAUDE.md"), "utf8");
assert.ok(claudeMd.startsWith("# Mine") && claudeMd.split("npmswitch:start").length === 2);
assert.ok(fs.existsSync(path.join(proj, "AGENTS.md")) && !fs.existsSync(path.join(proj, "GEMINI.md")));
await cli("init", `--dir=${proj}`, "--all");
assert.match(fs.readFileSync(path.join(proj, ".cursor", "rules", "npmswitch.mdc"), "utf8"), /^---\ndescription/);
console.log("init ok");

for (const d of [home, proj, pkg, fakeHome]) fs.rmSync(d, { recursive: true, force: true });
console.log("ALL OK");
