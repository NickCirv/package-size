# Source review — package-size

## Revision and method

Inspected public commit: [`866add0e84dd2cb85590a6553201fb45ae801805`](https://github.com/NickCirv/package-size/commit/866add0e84dd2cb85590a6553201fb45ae801805). Source tree: `75bc47db9c23d7fa2c7c1df853d04e72eb52426e`. Capture scope: all eligible text files; 6 of 6 eligible files.

This review read captured implementation and documentation. It did not install dependencies, execute project commands, call project APIs, check package publication or establish live CI status. Examples are source-derived, not captured execution transcripts.

## Claim ledger

| Claim | Evidence | Status |
| --- | --- | --- |
| Registry requests, tar inspection, history and JSON output | [index.js](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/index.js) | Verified in inspected source; execution unverified |

## Findings and verification gaps

Package archive size is not browser bundle size and excludes the installed transitive dependency tree. The custom tar reader is not a complete archive auditing tool. Measurements depend on fetched registry versions and may change over time. Requests and archive processing were not exercised during this review.

The captured smoke test only asks Node to syntax-check the entrypoint. It does not exercise behavior, integrations or failure paths. Neither that test nor installation was run in this review.

| Dimension | Result |
| --- | --- |
| Purpose and documented commands | Partially verified: static source inspection |
| Clean installation and examples | Unverified |
| Test suite and live CI | Unverified |
| Performance and security guarantees | Unverified |
| Publication | Local documentation only |

## Documentation inventory

- [README.md](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/README.md) — Rewritten; historic section anchors retained where practical.
- [LICENSE](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/LICENSE) — protected document preserved unchanged.

## Captured source inventory

- [LICENSE](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/LICENSE) — Git blob `481c289c06c96c07330f8c7dedd847c5c07ca384`.
- [README.md](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/README.md) — Git blob `d298f33e68dbce29580ac10ed0ec679570bc6c5e`.
- [package.json](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/package.json) — Git blob `7adb93dfb88a5a2214b422412bf1da6fc94bcb0b`.
- [.github/workflows/ci.yml](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/.github/workflows/ci.yml) — Git blob `44515034a394670de44454a7a1bd2c7ef0c9836e`.
- [index.js](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/index.js) — Git blob `5e89144f1fe08626e65f7316319b593352fb69fc`.
- [test/smoke.test.js](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/test/smoke.test.js) — Git blob `ebbccaaf2583b4850575f835313e4b0afd21bff7`.

## Scope boundary

Capture excludes lockfiles, binary artwork, generated output, vendored dependencies and files above the acquisition size limit. The tree records their existence; no verification claim is made for omitted content. Protected documents and historical records are not replaced.

## Reference coverage

Added [command reference](REFERENCE.md) from the argument parser, command handlers and source-defined help at the pinned revision. README examples remain unexecuted.
