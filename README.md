# package-size

> Check the install size of npm packages **before** adding them — no install required.

Zero external dependencies. Pure Node.js. Works entirely via the npm registry API — downloads and inspects the tarball without ever touching your `node_modules`.

```
$ package-size lodash

  lodash  v4.17.23
  Lodash modular utilities.

  Compressed (tgz)     307.5 KB
  Unpacked size          2.2 MB  █████████████░░░░░░░░░░░░░░░░░
  Files                    1051

  ⚠ Many files (>1000) — may slow installs

  Top files by size:
   1. lodash.js                             532.5 KB
   2. core.js                               113.2 KB
   3. lodash.min.js                          71.6 KB
   ...
```

## Features

- **Compressed + unpacked size** — see both the tgz download size and the installed footprint
- **Top 10 largest files** — know exactly what's bloating the package
- **Side-by-side comparison** — evaluate multiple packages at once
- **Version size history** — track how a package has grown over its last 5 releases
- **JSON output** — pipe into jq or your own tooling
- **Automatic flags** — warns on packages over 5MB, 50MB, or 1000 files
- **Zero dependencies** — no npm install, no node_modules, no cold-start

## Install

```bash
npm install -g package-size
```

Or run without installing:

```bash
npx package-size lodash
```

## Usage

```bash
# Analyze a single package
package-size lodash
pkgsize lodash          # shorter alias

# Compare multiple packages side by side
package-size react vue angular

# Track size growth across the last 5 versions
package-size axios --history

# Machine-readable JSON output
package-size moment --json | jq '.[] | {name, unpackedSize}'

# Help
package-size --help
```

## Comparison Example

```
$ package-size react vue angular

  Package Comparison
  ──────────────────────────────────────────────────────────────────────
  Package                    Compressed       Unpacked   Files
  ──────────────────────────────────────────────────────────────────────
  ✓ react                       24.2 KB       188.0 KB      27 ██
    angular                    611.3 KB         2.0 MB      10 █████████████████
  ✗ vue                        629.4 KB         2.4 MB      37 ████████████████████
  ──────────────────────────────────────────────────────────────────────
  ✓ = smallest  ✗ = largest
```

## JSON Output

```bash
$ package-size lodash --json
[
  {
    "name": "lodash",
    "version": "4.17.23",
    "compressedSize": 314877,
    "unpackedSize": 2266624,
    "totalFiles": 1051,
    "top10Files": [ ... ],
    "flags": {
      "large": false,
      "veryLarge": false,
      "manyFiles": true
    }
  }
]
```

## Flags

| Flag | Condition |
|------|-----------|
| `⚠ Large package` | Unpacked size > 5MB |
| `⛔ Very large package` | Unpacked size > 50MB |
| `⚠ Many files` | File count > 1000 (slows installs) |

## Requirements

- Node.js 18+
- No external dependencies

## How It Works

1. Queries `https://registry.npmjs.org/{package}` for package metadata
2. Downloads the `.tgz` tarball via HTTPS
3. Pipes through `zlib.createGunzip()` to measure compressed vs uncompressed size
4. Parses the POSIX ustar TAR headers to enumerate files and their sizes
5. Reports everything — no disk writes, no `node_modules` touched

## License

MIT
