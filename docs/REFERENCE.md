# Command reference

Use `node index.js` from the pinned source checkout described in the [README](../README.md). The entries below describe the inspected implementation.

| Command or argument | Behavior |
| --- | --- |
| `PACKAGE` | Look up one package and report registry-derived size information. |
| `PACKAGE_A PACKAGE_B` | Compare the named packages. |
| `--history` | Report a trend across up to five package versions. |
| `--json` | Print structured output instead of the terminal presentation. |

For prerequisites, file writes, external services and known limitations, see [Behavior and limits](../README.md#behavior-and-limits).

Implementation: [index.js](https://github.com/NickCirv/package-size/blob/866add0e84dd2cb85590a6553201fb45ae801805/index.js); [review evidence](RESEARCH.md).
