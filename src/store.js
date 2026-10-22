import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = process.env.NPMSWITCH_HOME ?? path.join(os.homedir(), ".npmswitch");
const file = path.join(dir, "accounts.json");

function read() {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { default: null, accounts: {} }; }
}

function write(data) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export const storePath = file;

const normScope = (s) => s.replace(/^@/, "").toLowerCase();

/** Public view: never includes tokens. */
export function listAccounts() {
  const d = read();
  return Object.entries(d.accounts).map(([name, a]) => ({
    name, login: a.login, scopes: a.scopes ?? [], default: d.default === name,
  }));
}

export function saveAccount(name, token, login, makeDefault, scopes = []) {
  const d = read();
  d.accounts[name] = { token, login, scopes: scopes.map(normScope) };
  if (makeDefault || !d.default) d.default = name;
  write(d);
}

export function removeAccount(name) {
  const d = read();
  if (!d.accounts[name]) throw new Error(`No account named "${name}".`);
  delete d.accounts[name];
  if (d.default === name) d.default = Object.keys(d.accounts)[0] ?? null;
  write(d);
}

export function setDefault(name) {
  const d = read();
  if (!d.accounts[name]) throw new Error(`No account named "${name}".`);
  d.default = name;
  write(d);
}

/** "@scope/name" -> "scope"; unscoped packages have no scope. */
export const scopeOf = (pkg) => (pkg?.startsWith("@") ? normScope(pkg.split("/")[0]) : undefined);

/**
 * Pick the account for a call.
 * 1. explicit `account` (name or npm username), else
 * 2. the account whose username or configured scopes match the package scope, else
 * 3. the default account.
 */
export function resolveAccount({ account, pkg } = {}) {
  const d = read();
  const names = Object.keys(d.accounts);
  if (!names.length) throw new Error("No accounts configured. Run: npmswitch add <name>");
  const byName = (n) => d.accounts[n] && { name: n, ...d.accounts[n] };
  if (account) {
    const hit = byName(account) ?? names.map(byName).find((a) => a.login.toLowerCase() === account.toLowerCase());
    if (!hit) throw new Error(`Unknown account "${account}". Known: ${names.join(", ")}`);
    return hit;
  }
  const scope = scopeOf(pkg);
  if (scope) {
    const hit = names.map(byName).find((a) => a.login.toLowerCase() === scope || (a.scopes ?? []).includes(scope));
    if (hit) return hit;
  }
  if (!d.default) throw new Error("No default account. Pass `account` or run: npmswitch default <name>");
  return byName(d.default);
}
