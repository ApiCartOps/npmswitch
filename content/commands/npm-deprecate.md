---
description: Deprecate versions of a package (usage /npm-deprecate name versions message)
argument-hint: name versions message
---
Deprecate npm versions as described by $ARGUMENTS using the npmswitch MCP server. First call `npm_get_package` and show me which versions the range matches. Show me the account, package, versions and exact message, and only after I confirm call `npm_deprecate`.
