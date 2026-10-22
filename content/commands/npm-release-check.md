---
description: Dry-run a publish and review it (usage /npm-release-check /path/to/package)
argument-hint: /absolute/path/to/package
---
Prepare a release of the package in $ARGUMENTS using the npmswitch MCP server. Read its package.json, call `npm_get_package` to confirm the version is not already published, then call `npm_publish` with `dry_run: true`. Show me the account, name, version, dist-tag and file list, and point out anything unexpected (secrets, tests, large files). Do not publish; ask me whether to run it for real.
