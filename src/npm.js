import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import semver from "semver";
import { resolveAccount, listAccounts } from "./store.js";

const REGISTRY = (process.env.NPM_REGISTRY_URL ?? "https://registry.npmjs.org").replace(/\/$/, "");
const DOWNLOADS = (process.env.NPM_DOWNLOADS_URL ?? "https://api.npmjs.org").replace(/\/$/, "");

const enc = (pkg) => pkg.replace("/", "%2F");

async function http(url, { token, method = "GET", body, otp, accept } = {}) {
  const r = await fetch(url, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(otp && { "npm-otp": otp }),
      Accept: accept ?? "application/json",
      "User-Agent": "npmswitch",
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).catch((e) => {
    const why = e.cause?.code ?? e.cause?.message ?? e.name;
    throw new Error(`Could not reach ${new URL(url).origin} (${why}). Check your network, VPN or proxy, then retry.`);
  });
  const text = await r.text();
  if (!r.ok) {
    const hint = r.headers.get("npm-notice") ?? "";
    const otpHint = r.status === 401 && /otp/i.test(`${text} ${r.headers.get("www-authenticate")}`) ? " This account needs a one-time code: pass `otp`." : "";
    throw new Error(`npm ${r.status}${token ? "" : " (anonymous)"}: ${text.slice(0, 400)}${hint ? ` ${hint}` : ""}${otpHint}`);
  }
  return text ? JSON.parse(text) : null;
}

const reg = (acct, p, opts = {}) => http(`${REGISTRY}${p}`, { token: acct?.token, ...opts });

/** Public reads work without an account; use one when it exists (private packages, rate limits). */
function optionalAccount({ account, pkg }) {
  if (!account && listAccounts().length === 0) return undefined;
  return resolveAccount({ account, pkg });
}

/** Validate a token and return its username. Used by `add`. */
export async function whoamiToken(token) {
  const u = await reg({ token }, "/-/whoami");
  return u.username;
}

export async function whoami({ account }) {
  const a = resolveAccount({ account });
  return { account: a.name, username: await whoamiToken(a.token), scopes: a.scopes };
}

export async function search({ account, query, limit = 20 }) {
  const a = optionalAccount({ account });
  const r = await reg(a, `/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`);
  return {
    account: a?.name ?? null, total: r.total,
    packages: r.objects.map((o) => ({ name: o.package.name, version: o.package.version, description: o.package.description, date: o.package.date, publisher: o.package.publisher?.username })),
  };
}

export async function getPackage({ account, name }) {
  const a = optionalAccount({ account, pkg: name });
  const d = await reg(a, `/${enc(name)}`);
  const latest = d["dist-tags"]?.latest;
  const v = d.versions?.[latest] ?? {};
  const time = d.time ?? {};
  const versions = Object.keys(d.versions ?? {}).slice(-15).map((n) => ({ version: n, published: time[n], deprecated: d.versions[n].deprecated }));
  return {
    account: a?.name ?? null, name: d.name, description: d.description, dist_tags: d["dist-tags"], license: v.license ?? d.license,
    maintainers: (d.maintainers ?? []).map((m) => m.name), repository: d.repository?.url, homepage: d.homepage,
    created: time.created, modified: time.modified, version_count: Object.keys(d.versions ?? {}).length,
    recent_versions: versions, dependencies: v.dependencies ?? {}, deprecated_latest: v.deprecated,
  };
}

export async function downloads({ name, period = "last-week" }) {
  const r = await http(`${DOWNLOADS}/downloads/point/${period}/${enc(name)}`);
  return { name: r.package, period, start: r.start, end: r.end, downloads: r.downloads };
}

export async function listPackages({ account, limit = 100 }) {
  const a = resolveAccount({ account });
  const user = await whoamiToken(a.token);
  const r = await reg(a, `/-/v1/search?text=${encodeURIComponent(`maintainer:${user}`)}&size=${limit}`);
  return { account: a.name, username: user, packages: r.objects.map((o) => ({ name: o.package.name, version: o.package.version })) };
}

export async function deprecate({ account, name, message, versions = "*", otp }) {
  const a = resolveAccount({ account, pkg: name });
  if (!semver.validRange(versions)) throw new Error(`"${versions}" is not a valid semver range (use "*" for all versions).`);
  const doc = await reg(a, `/${enc(name)}?write=true`);
  const hit = Object.keys(doc.versions ?? {}).filter((v) => semver.satisfies(v, versions, { includePrerelease: true }));
  if (!hit.length) throw new Error(`No versions of ${name} match "${versions}".`);
  for (const v of hit) {
    if (message) doc.versions[v].deprecated = message; else delete doc.versions[v].deprecated;
  }
  await reg(a, `/${enc(name)}`, { method: "PUT", body: doc, otp });
  return { account: a.name, name, action: message ? "deprecated" : "un-deprecated", versions: hit };
}

export async function setDistTag({ account, name, version, tag, otp }) {
  const a = resolveAccount({ account, pkg: name });
  await reg(a, `/-/package/${enc(name)}/dist-tags/${encodeURIComponent(tag)}`, { method: "PUT", body: version, otp });
  return { account: a.name, name, tag, version };
}

export async function removeDistTag({ account, name, tag, otp }) {
  if (tag === "latest") throw new Error('Refusing to remove the "latest" tag. Point it at another version with npm_set_dist_tag.');
  const a = resolveAccount({ account, pkg: name });
  await reg(a, `/-/package/${enc(name)}/dist-tags/${encodeURIComponent(tag)}`, { method: "DELETE", otp });
  return { account: a.name, name, removed_tag: tag };
}

const run = (cmd, args, { cwd, env }) => new Promise((resolve) => {
  const win = process.platform === "win32";
  const c = spawn(cmd, args, { cwd, env, shell: win, windowsHide: true });
  let out = "";
  c.stdout.on("data", (d) => (out += d));
  c.stderr.on("data", (d) => (out += d));
  c.on("error", (e) => resolve({ code: -1, out: String(e.message) }));
  c.on("close", (code) => resolve({ code, out }));
});

/**
 * Publish the package in `dir` with the right account. Dry run by default.
 * The token goes in a private temp npmrc (mode 600, deleted afterwards), never on the command line.
 */
export async function publish({ account, dir, tag, access, otp, dry_run = true, ignore_scripts = false }) {
  const pj = path.join(path.resolve(dir), "package.json");
  let meta;
  try { meta = JSON.parse(fs.readFileSync(pj, "utf8")); } catch { throw new Error(`No readable package.json in ${dir}`); }
  if (meta.private) throw new Error(`${meta.name} is marked "private": true and cannot be published.`);
  if (!meta.name || !meta.version) throw new Error("package.json needs a name and version.");
  if (tag && !/^[\w.-]+$/.test(tag)) throw new Error("tag may only contain letters, digits, dots, dashes and underscores.");
  if (otp && !/^\d{6,8}$/.test(otp)) throw new Error("otp must be the 6-8 digit code.");
  const a = resolveAccount({ account, pkg: meta.name });
  const url = new URL(REGISTRY);
  const rc = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "npmswitch-")), ".npmrc");
  fs.writeFileSync(rc, `registry=${REGISTRY}/\n//${url.host}${url.pathname.replace(/\/$/, "")}/:_authToken=${a.token}\n`, { mode: 0o600 });
  try {
    const args = ["publish", "--no-color"];
    if (dry_run) args.push("--dry-run");
    if (tag) args.push("--tag", tag);
    if (access) args.push("--access", access);
    if (otp) args.push("--otp", otp);
    if (ignore_scripts) args.push("--ignore-scripts");
    const { code, out } = await run("npm", args, { cwd: path.resolve(dir), env: { ...process.env, NPM_CONFIG_USERCONFIG: rc } });
    const clean = out.split(a.token).join("[token]").slice(-3000);
    if (code !== 0) throw new Error(`npm publish failed (exit ${code}) for ${meta.name}@${meta.version} with account "${a.name}":\n${clean}`);
    return { account: a.name, package: meta.name, version: meta.version, dry_run, published: !dry_run, output: clean };
  } finally {
    fs.rmSync(path.dirname(rc), { recursive: true, force: true });
  }
}
