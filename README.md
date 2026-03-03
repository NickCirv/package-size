# package-size

> Check your npm package size before publishing. See what's included, gzip size, and what to add to `.npmignore`. Zero dependencies.

## Install

```bash
npx package-size
```

Or install globally:

```bash
npm install -g package-size
```

## Quick Start

Run from any npm package directory:

```bash
pkgsize
```

```
  package-size v1.0.0 · my-awesome-package
  ────────────────────────────────────────────────────────────

  Included files (sorted by size)

  ✓ index.js                          12.4 KB  ████████░░░░░░░
  ✓ README.md                          3.1 KB  ██░░░░░░░░░░░░░
  ✓ LICENSE                            1.1 KB  █░░░░░░░░░░░░░░
  ✓ package.json                       0.8 KB  ░░░░░░░░░░░░░░░

  ────────────────────────────────────────────────────────────

  Files included:     4
  Uncompressed:       17.4 KB
  Gzip estimate:      5.9 KB
  npm size limit:     50 MB

  12 files excluded. Use --verbose to see them.
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--sort <size\|name>` | Sort included files by size or name | `size` |
| `--format <table\|json>` | Output format | `table` |
| `--limit <size>` | Fail exit code if package exceeds size (e.g. `100KB`, `2MB`) | — |
| `--compare` | Compare with the published version on npm registry | — |
| `--verbose` / `-v` | Show excluded files and the rule that matched them | — |
| `--help` / `-h` | Show help | — |

## Examples

```bash
# Basic check
pkgsize

# See what's being excluded and why
pkgsize --verbose

# Sort files by name instead of size
pkgsize --sort name

# Fail in CI if package exceeds 500KB
pkgsize --limit 500KB

# Compare local vs. published npm size
pkgsize --compare

# Output JSON (pipe-friendly)
pkgsize --format json

# Combine flags
pkgsize --limit 1MB --verbose --compare
```

## CI Integration

Add to your GitHub Actions workflow to catch size regressions:

```yaml
- name: Check package size
  run: npx package-size --limit 500KB
```

Returns exit code `1` if the limit is exceeded — fails the CI step automatically.

## What Gets Excluded

`package-size` respects the same rules as `npm publish`:

**Always excluded (npm defaults):**
- `.git/`, `node_modules/`, `package-lock.json`, `.npmrc`
- `test/`, `tests/`, `__tests__/`, `*.test.js`, `*.spec.js`
- `coverage/`, `.nyc_output/`, `.github/`, `.circleci/`
- `.DS_Store`, `*.log`, and other noise files

**Respects your config:**
- `.npmignore` — explicit ignore rules
- `package.json` `files` field — explicit include whitelist

## Smart Suggestions

If you accidentally include test files, docs, or build artifacts, `package-size` will tell you:

```
  ⚡ Suggested .npmignore additions:

  + test/       (test directory detected: test/utils.test.js)
  + docs/       (docs directory detected: docs/api.md)
  + *.map       (source map detected: dist/index.js.map)

  Add these to .npmignore to reduce your package size.
```

## JSON Output

Machine-readable output for scripting:

```bash
pkgsize --format json | jq '.summary'
```

```json
{
  "fileCount": 4,
  "uncompressedSize": 17821,
  "gzipSize": 6043,
  "uncompressedFormatted": "17.4 KB",
  "gzipFormatted": "5.9 KB",
  "npmLimit": 52428800,
  "exceedsLimit": false
}
```

## Why?

Publishing a bloated npm package is a tax on every developer who installs it. Common mistakes:

- Forgetting to add `test/` to `.npmignore`
- Including `coverage/` reports or `.map` files
- Shipping docs, examples, or benchmark directories
- Leaving `node_modules` out of gitignore but not npmignore

`package-size` catches these before they hit the registry. Run it before every publish.

## Comparison with Alternatives

| Tool | Zero deps | Offline | Shows excluded | CI mode | Suggestions |
|------|-----------|---------|----------------|---------|-------------|
| **package-size** | Yes | Yes | Yes (`--verbose`) | Yes (`--limit`) | Yes |
| bundlephobia | No (web) | No | No | No | No |
| npm pack (manual) | — | Yes | No | No | No |

---

Built with Node.js · Zero dependencies · MIT License · [GitHub](https://github.com/NickCirv/package-size)
