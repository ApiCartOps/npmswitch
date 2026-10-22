# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [semantic versioning](https://semver.org/).

## [0.1.0]

Initial release.

### Added
- Multi-account npm MCP server and CLI. Calls are routed to the account named in `account`, else the account whose username or `--scopes` match the package scope, else the default account.
- Read tools: `npm_list_accounts`, `npm_whoami`, `npm_search`, `npm_get_package`, `npm_downloads`, `npm_list_packages`.
- Write tools: `npm_deprecate`, `npm_set_dist_tag`, `npm_remove_dist_tag` and `npm_publish`. Publishing is a dry run unless `dry_run: false` is passed, and the token reaches npm through a temporary config file that is deleted afterwards.
- `install`, `uninstall`, `config` and `agents` commands for Claude Code, Claude Desktop, Cursor, VS Code / GitHub Copilot, Windsurf, Cline, Gemini CLI, opencode, Codex CLI and Continue, with snippets for Hermes, Zed and any other MCP client.
- `init` command that writes a marked instruction block into `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` and a Cursor rule.
- MCP server instructions, four prompts (`npm_accounts`, `npm_package_health`, `npm_release_check`, `npm_deprecate`) and an `npmswitch://accounts` resource.
- Claude Code skill and `/npm-*` slash commands, installed by `install claude-code`.
