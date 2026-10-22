# npmswitch launch copy

**Tagline:** One MCP server, every npm account.

**One-liner (npm / registries):** npmswitch is an MCP server and CLI that keeps several npm accounts (personal, org, scoped) and routes each call to the right token. Look up packages, deprecate, tag and publish from Claude, Cursor, Copilot, Codex, Gemini CLI, Windsurf, Hermes and any MCP client.

**Short pitch:** Working across a personal npm account and a company scope usually means logging in and out. npmswitch stores named accounts locally and picks one per call: an explicit `account`, else the account that owns the package scope (`@acme/pkg`), else your default. Publishing is dry-run by default and needs an explicit confirmation to go live. Tokens live in a mode-600 file, reach npm through a temporary config that is deleted afterwards, and are never printed or returned by a tool.

**Post draft:**
> npmswitch: one MCP server for all your npm accounts. It routes each call by package scope, and `npmswitch install cursor|claude-code|codex|...` sets it up in 13 agents. Publish is dry-run first, then explicit confirmation. MIT, Node 20+.

**Keywords:** mcp, npm, multi-account, registry, claude, cursor, copilot, codex, gemini, windsurf, hermes

**Name use:** Not affiliated with or endorsed by npm, Inc. or GitHub. Do not use the npm logo in any asset.
