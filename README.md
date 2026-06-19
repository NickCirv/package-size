<div align="center">

# package-size

**Know an npm package's install footprint before it lands in your project**

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen?labelColor=0B0A09)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?labelColor=0B0A09)](package.json)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-blue?labelColor=0B0A09)](package.json)

</div>

## Install

```bash
npx github:NickCirv/package-size lodash
```

No global install needed. Works entirely via the npm registry API — downloads and inspects the tarball without touching your `node_modules`.

## Usage

```bash
# Analyze a single package
npx github:NickCirv/package-size lodash

# Compare multiple packages side by side
npx github:NickCirv/package-size react vue angular

# Track size growth across the last 5 versions
npx github:NickCirv/package-size axios --history

# Machine-readable JSON output
npx github:NickCirv/package-size moment --json | jq '.[] | {name, unpackedSize}'
```

| Flag | Description |
|------|-------------|
| `--history` | Show unpacked size trend across the last 5 versions |
| `--json` | Output machine-readable JSON (pipe-friendly) |
| `--help` | Show usage |

`pkgsize` is a shorter alias for the binary when installed globally.

## What it does

Fetches the package tarball from the npm registry, streams it through a gunzip + TAR header parser, and reports compressed size, unpacked size, file count, and top-10 largest files — all without writing anything to disk. Warns automatically when a package exceeds 5 MB unpacked, 50 MB unpacked, or 1 000 files. Supports side-by-side comparison of multiple packages and a `--history` mode that checks the last 5 published versions.

---
<sub>Zero dependencies · Node >=18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
