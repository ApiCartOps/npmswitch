# Releasing

Releases are automated. Pushing a version tag runs `.github/workflows/release.yml`, which tests, publishes to npm and creates the GitHub release.

## First release (manual, once)

npm only lets you configure a trusted publisher for a package that already exists, so the very first version is published by hand:

1. Sign in with `npm login` and make sure your account has 2FA enabled.
2. Run `npm publish` from the repository root in an interactive terminal. With a passkey, npm opens a browser page for you to approve. If your network re-signs HTTPS traffic, set `NODE_OPTIONS=--use-system-ca` first.
3. Tag and push so the GitHub release is created. The workflow skips publishing because the version already exists:

   ```bash
   git tag -a v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   ```

## One-time setup: npm trusted publishing

After the package exists, switch publishing to trusted publishing (OIDC). No npm token is stored in GitHub and 2FA never has to be bypassed.

1. Open <https://www.npmjs.com/package/@apicartops/npmswitch/access>.
2. Under **Trusted Publisher**, choose **GitHub Actions** and enter:
   - Organization or user: `ApiCartOps`
   - Repository: `npmswitch`
   - Workflow filename: `release.yml`
   - Environment: leave empty
3. Save. Optionally set **Publishing access** to "Require two-factor authentication and disallow tokens".

If you rename the repository, update the trusted publisher entry to match.

## Cutting a release

1. Add a section for the new version to `CHANGELOG.md` (`## [0.2.0]`) and commit it. Its text becomes the release notes; without a section, GitHub generates notes from merged changes.
2. Bump the version, commit and tag in one step:

   ```bash
   npm version minor        # or patch / major; creates the commit and the v0.2.0 tag
   git push --follow-tags
   ```

3. Watch the **Release** run under the repository's Actions tab. When it finishes, the new version is on npm (with a provenance badge) and a GitHub release exists for the tag.

## What the pipeline checks

- **CI** (`ci.yml`) runs the tests on Linux and Windows with Node 20, 22 and 24 for every push to `main` and every pull request, and checks that the npm package contains only `src`, `content`, `README.md`, `LICENSE` and `package.json`.
- **Release** (`release.yml`) re-runs the tests, fails if the tag does not equal `v<package.json version>`, skips the publish step if that version is already on npm (so a re-run is safe), and creates the GitHub release only after the publish step succeeds.

## If something goes wrong

- Publish fails with an authentication error: the trusted publisher entry is missing or does not match the repo and workflow filename exactly.
- A version was published by mistake: npm never lets a version number be reused. Publish a fixed patch release and, if needed, run `npm deprecate @apicartops/npmswitch@<bad version> "reason"` (or use the `npm_deprecate` tool).
- Release notes are wrong: edit the release on GitHub; the workflow will not overwrite an existing release.
