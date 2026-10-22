## npm with multiple accounts (npmswitch MCP)

This project has the `npmswitch` MCP server. It holds several named npm accounts and picks a token per call. Prefer its `npm_*` tools over the `npm` CLI when the work may involve more than one account or you need a non-interactive, account-aware publish.

- Account routing: an explicit `account` argument (name or npm username), else the account whose username or configured scopes match the package scope (`@acme/pkg` uses the account that owns `@acme`), else the default account.
- Start with `npm_list_accounts` if you are unsure which accounts exist. Tokens are never exposed.
- Read tools (`npm_whoami`, `npm_search`, `npm_get_package`, `npm_downloads`, `npm_list_packages`) are safe to call freely.
- Write tools (`npm_deprecate`, `npm_set_dist_tag`, `npm_remove_dist_tag`, `npm_publish`) change a public registry. Before calling one, tell the user the account, package, versions and exact text, and wait for a yes.
- `npm_publish` is irreversible: a published version number can never be reused. Always run it with `dry_run: true` first, show the user the account, name, version and file list, and only publish (`dry_run: false`) after an explicit yes.
