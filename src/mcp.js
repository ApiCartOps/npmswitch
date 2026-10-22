import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listAccounts } from "./store.js";
import * as n from "./npm.js";
import { commands, instructions } from "./content.js";

const wrap = (fn) => async (args) => {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn(args), null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: String(e.message ?? e) }] };
  }
};

const account = z.string().optional().describe(
  "Account name or npm username. If omitted, the account whose username or scopes match the package scope is used, else the default account.",
);
const name = z.string().describe('Package name, e.g. "left-pad" or "@scope/pkg"');
const otp = z.string().optional().describe("One-time code, only if the account has 2FA for writes and no automation token");
const tag = z.string().describe('Dist-tag, e.g. "latest", "next", "beta"');

export async function serve() {
  const server = new McpServer({ name: "npmswitch", title: "npmswitch", version: "0.1.0" }, { instructions: instructions() });

  server.tool("npm_list_accounts", "List configured npm accounts (names, usernames and scopes only, never tokens) and which is the default.", {}, wrap(async () => listAccounts()));
  server.tool("npm_whoami", "Show the npm user behind an account (checks the token still works).", { account }, wrap(n.whoami));
  server.tool("npm_search", "Search the npm registry.",
    { account, query: z.string().describe('Search text; supports qualifiers like "maintainer:name" or "scope:acme"'), limit: z.number().int().min(1).max(100).default(20) }, wrap(n.search));
  server.tool("npm_get_package", "Package details: dist-tags, license, maintainers, recent versions and dependencies of the latest.", { account, name }, wrap(n.getPackage));
  server.tool("npm_downloads", "Download count for a package.",
    { name, period: z.enum(["last-day", "last-week", "last-month", "last-year"]).default("last-week") }, wrap(n.downloads));
  server.tool("npm_list_packages", "List packages an account maintains.", { account, limit: z.number().int().min(1).max(250).default(100) }, wrap(n.listPackages));

  server.tool("npm_deprecate",
    "Deprecate (or, with an empty message, un-deprecate) versions of a package. Visible to every user. Confirm account, package, versions and message with the user first.",
    { account, name, message: z.string().describe('Deprecation message; "" removes the deprecation'), versions: z.string().default("*").describe('Semver range, "*" for all'), otp }, wrap(n.deprecate));
  server.tool("npm_set_dist_tag", "Point a dist-tag at a version. Moving \"latest\" changes what users install. Confirm with the user first.",
    { account, name, tag, version: z.string(), otp }, wrap(n.setDistTag));
  server.tool("npm_remove_dist_tag", "Remove a dist-tag (never \"latest\"). Confirm with the user first.", { account, name, tag, otp }, wrap(n.removeDistTag));
  server.tool("npm_publish",
    "Publish the package in a local directory with the right account. IRREVERSIBLE when dry_run is false: a published version can never be reused. Always run with dry_run true first, show the user the account, name, version and files, and only then repeat with dry_run false after an explicit yes. Runs the package's own lifecycle scripts unless ignore_scripts is set.",
    { account, dir: z.string().describe("Absolute path of the package directory"), dry_run: z.boolean().default(true), tag: tag.optional(), access: z.enum(["public", "restricted"]).optional(), otp, ignore_scripts: z.boolean().default(false) },
    wrap(n.publish));

  // Prompts: the same workflows as the shipped slash commands, for any MCP client that supports prompts.
  for (const c of commands()) {
    server.prompt(c.name.replace(/-/g, "_"), c.description, { arguments: z.string().optional().describe("e.g. a package name, or a directory") },
      ({ arguments: a }) => ({ messages: [{ role: "user", content: { type: "text", text: c.body.replaceAll("$ARGUMENTS", a ?? "(ask me)") } }] }));
  }

  server.resource("accounts", "npmswitch://accounts", { description: "Configured accounts (no tokens)", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(listAccounts(), null, 2) }] }));

  await server.connect(new StdioServerTransport());
}
