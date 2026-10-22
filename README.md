<p align="center"><img src="https://raw.githubusercontent.com/ApiCartOps/npmswitch/main/assets/logo.svg" width="96" alt="npmswitch logo"></p>

<h1 align="center">npmswitch</h1>

<p align="center"><b>One MCP server, every npm account.</b><br>Routes each call to the right token, for any AI agent.</p>

<p align="center"><img alt="license" src="https://img.shields.io/badge/license-MIT-f59e0b"> <img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-f59e0b"> <img alt="MCP" src="https://img.shields.io/badge/MCP-stdio-f59e0b"></p>

An MCP server and CLI for the npm registry that manages **multiple accounts** (personal, org, scoped) and routes each call to the right token. It speaks plain MCP over stdio, so it works with any MCP-capable agent: Claude Code and Desktop, Cursor, GitHub Copilot (VS Code), Windsurf, Cline, Gemini CLI, Codex CLI, opencode, Continue, Hermes Agent, Zed and others.

Sibling of [Octoswitch](https://github.com/ApiCartOps/github-multi-mcp), the same idea for GitHub accounts. Not affiliated with or endorsed by npm, Inc. or GitHub.

## Why

The npm CLI keeps one login at a time. This keeps several named accounts and picks one per call:

1. an explicit `account` argument (name or npm username), else
2. the account whose username or `--scopes` match the package scope (`@acme/tool` uses the account that owns `@acme`), else
3. the default account.

## Setup

```bash
git clone https://github.com/ApiCartOps/npmswitch.git
cd npmswitch
npm install
npm link                      # puts the `npmswitch` command on your PATH

npmswitch add personal --default
npmswitch add work --scopes=@acme,@tools
npmswitch list
```

```text
  NAME      LOGIN  SCOPES
* personal  alice
  work      bob    @acme @tools
```

Without `npm link`, run `node src/cli.js` in place of `npmswitch`. From npm, `npm install -g @apicartops/npmswitch` installs the same `npmswitch` command (the package is scoped because npm rejects `npmswitch` as too similar to an existing package).

`add` asks for the token at a hidden prompt (or reads it from an env var with `--token-env=VAR`), checks it against the registry and stores the username. Tokens are never passed on the command line, never printed, and never returned by any tool. They are stored in `~/.npmswitch/accounts.json` (file mode 600).

**Tokens.** Create one per account at npmjs.com under Access Tokens. A read-only token is enough for lookups. For deprecate, dist-tags and publish, use a granular token with read and write on the packages, or an automation token. Accounts that require a one-time code work too: pass it as `otp`.

## Connect it to your agent

```bash
npmswitch agents                 # what is supported, and what looks installed
npmswitch install cursor         # or: claude-code, vscode, codex, gemini-cli, ... or: all
npmswitch install cursor --dry-run
npmswitch config hermes          # print the snippet instead of editing anything
```

`install` merges one entry into the agent's user-level MCP config and leaves everything else in the file alone. It refuses to touch a file it cannot parse (for example JSON with comments) and prints the snippet instead. `uninstall <agent>` removes it. Restart the agent afterwards.

| Agent | Id | What `install` does |
|---|---|---|
| Claude Code | `claude-code` | `mcpServers` in `~/.claude.json`, plus the skill and slash commands below |
| Claude Desktop | `claude-desktop` | `mcpServers` in `claude_desktop_config.json` |
| Cursor | `cursor` | `mcpServers` in `~/.cursor/mcp.json` |
| VS Code / GitHub Copilot | `vscode` | `servers` in the user `mcp.json` |
| Windsurf | `windsurf` | `~/.codeium/windsurf/mcp_config.json` |
| Cline | `cline` | `cline_mcp_settings.json` |
| Gemini CLI | `gemini-cli` | `mcpServers` in `~/.gemini/settings.json` |
| opencode | `opencode` | `mcp` in `~/.config/opencode/opencode.json` |
| Codex CLI | `codex` | `[mcp_servers.npmswitch]` in `~/.codex/config.toml` |
| Continue | `continue` | `~/.continue/mcpServers/npmswitch.yaml` |
| Hermes Agent | `hermes` | prints a YAML snippet for `~/.hermes/config.yaml` |
| Zed | `zed` | prints a snippet for `settings.json` |
| anything else | `generic` | prints the standard `mcpServers` JSON |

Config locations differ between versions of these tools, so check the printed path if an agent does not pick it up. Use `--npx` to register `npx -y @apicartops/npmswitch mcp` instead of a path to this checkout (once published), and `--name=NAME` to use a different server name.

### Project instructions

```bash
npmswitch init              # AGENTS.md, plus any of CLAUDE.md / GEMINI.md / copilot / cursor rule that already exist
npmswitch init --all        # write all five
```

This adds a short, marked block telling the agent to use the `npm_*` tools and to confirm before any write. Re-running updates the block in place.

## What it exposes

**Tools** (all agents):

| Read | Write (change a public registry; agents are told to confirm first) |
|---|---|
| `npm_list_accounts`, `npm_whoami`, `npm_search`, `npm_get_package`, `npm_downloads`, `npm_list_packages` | `npm_deprecate`, `npm_set_dist_tag`, `npm_remove_dist_tag`, `npm_publish` |

**Publishing is safe by default.** `npm_publish` is a dry run unless `dry_run: false` is passed, and its description tells agents to show you the account, name, version and file list and to wait for a yes before publishing for real. A published version can never be reused. The token reaches `npm` through a temporary config file (mode 600) that is deleted afterwards, never on the command line, and is scrubbed from the output. Packages marked `"private": true` are refused. The package's own lifecycle scripts run, as with `npm publish`; set `ignore_scripts` to skip them.

**Server instructions**: the same guidance is sent in the MCP `initialize` response, so clients that surface it need no extra setup.

**Prompts** (commands, for clients that support MCP prompts): `npm_accounts`, `npm_package_health`, `npm_release_check`, `npm_deprecate`. They take one optional argument such as a package name or a directory.

**Resource**: `npmswitch://accounts` (names, usernames and scopes only).

**Claude Code extras** (installed by `install claude-code`): the `npmswitch` skill in `~/.claude/skills/` and the slash commands `/npm-accounts`, `/npm-package-health`, `/npm-release-check` and `/npm-deprecate` in `~/.claude/commands/`. The sources live in [`content/`](content), including a standard `SKILL.md` you can copy into any agent that supports Agent Skills.

## CLI reference

| Command | Description |
|---|---|
| `add <name> [--token-env=VAR] [--scopes=@a,@b] [--default]` | Add or replace an account |
| `list [--json]` | Show accounts (no tokens) |
| `default <name>` | Set the default account |
| `remove <name>` | Remove an account |
| `agents` | List supported agents |
| `install <agent\|all> [--name=N] [--npx] [--dry-run]` | Register the server with an agent |
| `uninstall <agent>` | Remove it |
| `config <agent>` | Print the snippet |
| `init [--dir=.] [--only=a,b] [--all]` | Write project instruction files |
| `mcp` | Run as an MCP server over stdio |

## Test

```bash
npm test
```

Runs against a fake registry with temporary config and home folders, including a real `npm publish` to the fake registry; no real accounts or agent configs are touched.

## License

MIT
