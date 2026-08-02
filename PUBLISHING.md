# Publishing

The same `.vsix` publishes to both the VS Code Marketplace and Open VSX. Build it once, publish it
twice.

```bash
npm ci
npm run typecheck
npx @vscode/vsce package          # -> livetennisapi-scores-<version>.vsix
```

## The two-command publish flow

```bash
# 1. VS Code Marketplace (publisher: livetennisapi)
npx @vscode/vsce publish --packagePath livetennisapi-scores-0.1.0.vsix

# 2. Open VSX (namespace: livetennisapi)
npx ovsx publish livetennisapi-scores-0.1.0.vsix -p "$OVSX_PAT"
```

Publishing the *same artifact* to both registries is the point — do not rebuild between the two, or
the two stores can drift.

## One-time setup

### VS Code Marketplace

1. Create an Azure DevOps organisation and a Personal Access Token with **Marketplace → Manage**,
   scoped to **all accessible organisations**.
2. Create the publisher `livetennisapi` at <https://marketplace.visualstudio.com/manage>.
3. `npx @vscode/vsce login livetennisapi` — or set `VSCE_PAT` in the environment.

### Open VSX

1. Sign in at <https://open-vsx.org> with GitHub and generate an access token.
2. Claim the namespace once:
   ```bash
   npx ovsx create-namespace livetennisapi -p "$OVSX_PAT"
   ```
3. Export `OVSX_PAT` for subsequent publishes.

## Credentials

Both tokens are **secrets**. Pass them via environment variables or a CI secret store. Never put a
PAT — or a Live Tennis API key — in a file in this repository. `vsce` refuses to package some
obvious cases, but the real guarantee is that nothing sensitive is ever written here in the first
place.

## Marketplace review

Review is **automated only**: a malware scan, a secret scan, and sandboxed dynamic detection. There
is no human content review. The practical consequence is the secret scan — an API key literal
committed to the repo or bundled into the `.vsix` will fail the scan or, worse, ship a live
credential. The extension therefore stores keys exclusively in VS Code SecretStorage, and
`.vscodeignore` keeps sources, tests and tooling out of the package.

Verify what you are about to ship before publishing:

```bash
npx @vscode/vsce ls                       # files that will be included
unzip -l livetennisapi-scores-0.1.0.vsix  # what actually got in
```

## The README currently has no screenshot — on purpose

There is deliberately no `media/screenshot.png`: the previous file was a generated placeholder,
not a real capture, and shipping a mock-up as if it were a screenshot is worse than shipping
none. The README describes the status bar and match picker in text until a real capture exists.

When adding one, remember `vsce` rewrites **relative** image paths in the README to raw URLs
under the `repository` field before uploading — shipping the image inside the `.vsix` does *not*
make it render on the Marketplace listing; the store fetches
`https://github.com/livetennisapi/livetennisapi-vscode/raw/HEAD/media/screenshot.png`. So the
repo (with the image) must be public at that URL, or the README must use an absolute HTTPS image
URL.

## Release checklist

- [ ] Bump `version` in `package.json`.
- [ ] Move the `CHANGELOG.md` Unreleased entries under the new version heading.
- [ ] `npm run typecheck` is clean.
- [ ] If a README screenshot has been added: it is a **real capture** (never a mock-up) and is
      reachable at the `repository` raw URL.
- [ ] `npx @vscode/vsce package` succeeds; inspect the file list.
- [ ] Confirm no key literal is present: `unzip -p *.vsix extension/dist/extension.js | grep -c twjp_` returns `0`.
- [ ] Publish to the Marketplace, then Open VSX, from the same `.vsix`.
- [ ] Tag the release.
