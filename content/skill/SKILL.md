---
name: npmswitch
description: Work with the npm registry across several accounts (personal, org, scoped) through the npmswitch MCP server. Use when the user asks to look up, search, deprecate, tag or publish npm packages, or mentions more than one npm account.
---

# npm with multiple accounts

Use the `npmswitch` MCP server (`npm_*` tools). It stores several named npm accounts and routes each call:

1. the `account` argument (name or npm username), else
2. the account whose username or configured scopes match the package scope, else
3. the default account.

## Workflow

1. If the account is unclear, call `npm_list_accounts` (names, usernames and scopes only; tokens are never shown).
2. Read first: `npm_get_package`, `npm_search`, `npm_downloads`, `npm_list_packages`.
3. Every response names the `account` that was used. Mention it when reporting.
4. Before any write (`npm_deprecate`, `npm_set_dist_tag`, `npm_remove_dist_tag`, `npm_publish`), show the user the account, package, versions and exact text, and wait for confirmation.
5. Publishing: run `npm_publish` with `dry_run: true`, show the result, and publish with `dry_run: false` only after an explicit yes. Versions can never be reused. Check that the version is new with `npm_get_package` first.

## Errors

- `Unknown account`: run `npm_list_accounts` and ask the user which one.
- `npm 401/403`: the token may lack write access to that package or scope. Say which account was used; do not retry with another account without asking.
- `needs a one-time code`: ask the user for the 6-digit code and pass it as `otp`, or suggest an automation/granular token.
- `No accounts configured`: tell the user to run `npmswitch add <name>` in a terminal. Never ask them to paste a token into chat.
