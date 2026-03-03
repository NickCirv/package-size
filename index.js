#!/usr/bin/env node
// package-size — Check npm package size before publishing. Zero dependencies.
// Usage: pkgsize [options]

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative, resolve, basename, extname } from 'path';
import { gzipSync } from 'zlib';
import { spawnSync } from 'child_process';
import { get } from 'https';

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  magenta: '\x1b[35m',
};

const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY;
const col = (color, str) => (NO_COLOR ? str : `${color}${str}${c.reset}`);

// ─── Default npm ignores (always excluded) ───────────────────────────────────
const DEFAULT_IGNORES = [
  '.git',
  '.svn',
  '.hg',
  '.npmrc',
  'node_modules',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  'npm-debug.log*',
  'test',
  'tests',
  '__tests__',
  '*.test.js',
  '*.test.ts',
  '*.test.mjs',
  '*.spec.js',
  '*.spec.ts',
  '*.spec.mjs',
  'coverage',
  '.nyc_output',
  '.github',
  '.circleci',
  '.travis.yml',
  '.gitlab-ci.yml',
  '.editorconfig',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintignore',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.json',
  '.prettierignore',
  'jest.config.js',
  'jest.config.ts',
  'jest.config.json',
  '.babelrc',
  '.babelrc.js',
  '.husky',
  '.commitlintrc',
];

// Patterns that suggest build artifacts or docs accidentally included
const SUGGESTION_PATTERNS = [
  { pattern: /^tests?\//i, label: 'test directory', suggestion: 'test/' },
  { pattern: /^__tests__\//i, label: 'test directory', suggestion: '__tests__/' },
  { pattern: /\.(test|spec)\.[jt]s$/i, label: 'test file', suggestion: '*.test.js' },
  { pattern: /^coverage\//i, label: 'coverage directory', suggestion: 'coverage/' },
  { pattern: /^docs?\//i, label: 'docs directory', suggestion: 'docs/' },
  { pattern: /^\.github\//i, label: 'GitHub config', suggestion: '.github/' },
  { pattern: /^examples?\//i, label: 'examples directory', suggestion: 'examples/' },
  { pattern: /^benchmarks?\//i, label: 'benchmark directory', suggestion: 'benchmarks/' },
  { pattern: /\.map$/i, label: 'source map', suggestion: '*.map' },
  { pattern: /^\.circleci\//i, label: 'CI config', suggestion: '.circleci/' },
  { pattern: /^\.husky\//i, label: 'Git hooks', suggestion: '.husky/' },
  { pattern: /tsconfig.*\.json$/i, label: 'TypeScript config', suggestion: 'tsconfig*.json' },
];

// ─── Argument Parsing ─────────────────────────────────────────────────────────
function parseArgs(args) {
  const opts = {
    sort: 'size',
    format: 'table',
    limit: null,
    compare: false,
    verbose: false,
    help: false,
    cwd: process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      opts.verbose = true;
    } else if (arg === '--compare') {
      opts.compare = true;
    } else if (arg === '--sort') {
      opts.sort = args[++i] || 'size';
    } else if (arg.startsWith('--sort=')) {
      opts.sort = arg.slice(7);
    } else if (arg === '--format') {
      opts.format = args[++i] || 'table';
    } else if (arg.startsWith('--format=')) {
      opts.format = arg.slice(9);
    } else if (arg === '--limit') {
      opts.limit = args[++i];
    } else if (arg.startsWith('--limit=')) {
      opts.limit = arg.slice(8);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
${col(c.bold + c.cyan, 'package-size')} — Check your npm package size before publishing

${col(c.bold, 'USAGE')}
  pkgsize [options]
  package-size [options]

${col(c.bold, 'OPTIONS')}
  --sort <size|name>     Sort files by size (default) or name
  --format <table|json>  Output format (default: table)
  --limit <size>         Fail if package exceeds size (e.g. 100KB, 2MB)
  --compare              Compare with published version on npm registry
  --verbose              Show excluded files with ignore reason
  -v, --verbose          Same as --verbose
  -h, --help             Show this help

${col(c.bold, 'EXAMPLES')}
  pkgsize
  pkgsize --sort name
  pkgsize --verbose
  pkgsize --compare
  pkgsize --limit 500KB
  pkgsize --format json
  pkgsize --limit 1MB --format json

${col(c.bold, 'SIZE UNITS')}
  B, KB, MB  (case-insensitive, e.g. 500KB, 1.5MB, 100000)
`);
}

// ─── Size Formatting ──────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function parseSize(str) {
  if (!str) return null;
  const match = String(str).trim().match(/^([\d.]+)\s*(B|KB|MB)?$/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  if (unit === 'MB') return Math.round(val * 1024 * 1024);
  if (unit === 'KB') return Math.round(val * 1024);
  return Math.round(val);
}

// ─── Ignore Pattern Matching ──────────────────────────────────────────────────
function globMatch(pattern, filePath) {
  // Convert glob pattern to regex
  // Handle leading ** or * wildcards
  if (pattern.startsWith('*.')) {
    // Match any file with this extension
    const ext = pattern.slice(1); // e.g. '.log'
    return filePath.endsWith(ext) || basename(filePath).endsWith(ext);
  }

  if (pattern.includes('*')) {
    // Simple glob: convert * to .*
    const regexStr = '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*') + '$';
    try {
      return new RegExp(regexStr, 'i').test(filePath) ||
             new RegExp(regexStr, 'i').test(basename(filePath));
    } catch {
      return false;
    }
  }

  // Exact match or directory prefix match
  const normalized = filePath.replace(/\\/g, '/');
  const pat = pattern.replace(/\\/g, '/').replace(/\/$/, '');
  return normalized === pat ||
    normalized.startsWith(pat + '/') ||
    basename(normalized) === pat;
}

function parseIgnoreFile(filePath) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf8').split('\n');
  return lines
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

function isIgnored(relPath, ignorePatterns, source = 'default') {
  for (const pattern of ignorePatterns) {
    if (globMatch(pattern, relPath)) {
      return { ignored: true, rule: pattern, source };
    }
  }
  return { ignored: false };
}

// ─── File Collection ──────────────────────────────────────────────────────────
function collectFiles(dir, rootDir, npmignorePatterns, filesWhitelist) {
  const included = [];
  const excluded = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');

      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      // Check default ignores first
      const defaultCheck = isIgnored(relPath, DEFAULT_IGNORES, 'default npm ignore');
      if (defaultCheck.ignored) {
        excluded.push({ path: relPath, size: 0, rule: defaultCheck.rule, source: defaultCheck.source });
        continue;
      }

      // If package.json has a `files` whitelist, use it
      if (filesWhitelist && filesWhitelist.length > 0) {
        // Always include package.json, README, LICENSE at root
        const isAlwaysIncluded = (
          relPath === 'package.json' ||
          /^readme(\.md|\.txt|\.rst)?$/i.test(relPath) ||
          /^license(\.md|\.txt)?$/i.test(relPath) ||
          /^licence(\.md|\.txt)?$/i.test(relPath) ||
          /^changes(\.md|\.txt)?$/i.test(relPath) ||
          /^changelog(\.md|\.txt)?$/i.test(relPath)
        );

        if (!isAlwaysIncluded) {
          let whitelisted = false;
          for (const pattern of filesWhitelist) {
            if (globMatch(pattern, relPath)) {
              whitelisted = true;
              break;
            }
          }
          if (!whitelisted) {
            if (!stat.isDirectory()) {
              excluded.push({ path: relPath, size: stat.size, rule: 'not in package.json files', source: 'files whitelist' });
            }
            continue;
          }
        }
      }

      // Check .npmignore
      const npmCheck = isIgnored(relPath, npmignorePatterns, '.npmignore');
      if (npmCheck.ignored) {
        if (!stat.isDirectory()) {
          excluded.push({ path: relPath, size: stat.size, rule: npmCheck.rule, source: npmCheck.source });
        }
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        let content;
        try {
          content = readFileSync(fullPath);
        } catch {
          content = Buffer.alloc(0);
        }
        included.push({ path: relPath, size: stat.size, content });
      }
    }
  }

  walk(dir);
  return { included, excluded };
}

// ─── npm Registry Fetch ───────────────────────────────────────────────────────
function fetchNpmPackageInfo(name) {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
    const req = get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 404) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Failed to parse npm registry response'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

// ─── Size Bar Visual ──────────────────────────────────────────────────────────
function sizeBar(size, maxSize, width = 20) {
  const filled = Math.round((size / maxSize) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return bar;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const cwd = opts.cwd;
  const pkgPath = join(cwd, 'package.json');

  if (!existsSync(pkgPath)) {
    console.error(col(c.red, `Error: No package.json found in ${cwd}`));
    console.error(col(c.dim, 'Run pkgsize from your npm package directory.'));
    process.exit(1);
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    console.error(col(c.red, 'Error: Failed to parse package.json'));
    process.exit(1);
  }

  const npmignorePath = join(cwd, '.npmignore');
  const npmignorePatterns = parseIgnoreFile(npmignorePath);
  const filesWhitelist = pkg.files || null;

  // Collect files
  const { included, excluded } = collectFiles(cwd, cwd, npmignorePatterns, filesWhitelist);

  // Sort included files
  if (opts.sort === 'name') {
    included.sort((a, b) => a.path.localeCompare(b.path));
  } else {
    included.sort((a, b) => b.size - a.size);
  }

  // Compute sizes
  const totalUncompressed = included.reduce((sum, f) => sum + f.size, 0);
  const allContent = Buffer.concat(included.map(f => f.content));
  let gzipSize = 0;
  try {
    gzipSize = gzipSync(allContent).length;
  } catch {
    gzipSize = Math.round(totalUncompressed * 0.3); // rough fallback estimate
  }

  const NPM_LIMIT = 50 * 1024 * 1024; // 50MB
  const maxFileSize = included.length > 0 ? Math.max(...included.map(f => f.size)) : 1;

  // ─── JSON output ─────────────────────────────────────────────────────────
  if (opts.format === 'json') {
    const output = {
      name: pkg.name,
      version: pkg.version,
      files: included.map(f => ({ path: f.path, size: f.size })),
      excluded: excluded.map(f => ({ path: f.path, size: f.size, rule: f.rule, source: f.source })),
      summary: {
        fileCount: included.length,
        uncompressedSize: totalUncompressed,
        gzipSize,
        uncompressedFormatted: formatBytes(totalUncompressed),
        gzipFormatted: formatBytes(gzipSize),
        npmLimit: NPM_LIMIT,
        exceedsLimit: totalUncompressed > NPM_LIMIT,
      },
    };
    console.log(JSON.stringify(output, null, 2));
    // Apply --limit check even in JSON mode
    if (opts.limit) {
      const limitBytes = parseSize(opts.limit);
      if (limitBytes && totalUncompressed > limitBytes) process.exit(1);
    }
    return;
  }

  // ─── Table output ─────────────────────────────────────────────────────────
  console.log('');
  console.log(col(c.bold + c.cyan, `  package-size`) + col(c.dim, ` v${pkg.version || '?'} · ${pkg.name || 'unknown'}`));
  console.log(col(c.dim, '  ─'.repeat(30)));
  console.log('');

  // File list header
  console.log(col(c.bold, '  Included files') + col(c.dim, ` (sorted by ${opts.sort})`));
  console.log('');

  const pathWidth = Math.min(60, Math.max(30, ...included.map(f => f.path.length)) + 2);

  for (const file of included) {
    const sizeStr = formatBytes(file.size).padStart(10);
    const bar = sizeBar(file.size, maxFileSize, 15);
    const pathStr = file.path.padEnd(pathWidth);
    console.log(
      col(c.green, '  ✓ ') +
      col(c.white, pathStr) +
      col(c.dim, sizeStr) +
      '  ' +
      col(c.blue, bar)
    );
  }

  if (included.length === 0) {
    console.log(col(c.yellow, '  No files would be included. Check your package.json or .npmignore.'));
  }

  // Verbose: excluded files
  if (opts.verbose && excluded.length > 0) {
    console.log('');
    console.log(col(c.bold, '  Excluded files'));
    console.log('');
    for (const file of excluded) {
      const sizeStr = file.size > 0 ? formatBytes(file.size).padStart(10) : '         —';
      const pathStr = file.path.padEnd(pathWidth);
      console.log(
        col(c.red, '  ✗ ') +
        col(c.dim, pathStr) +
        col(c.dim, sizeStr) +
        col(c.dim, `  [${file.source}: ${file.rule}]`)
      );
    }
  }

  // Summary
  console.log('');
  console.log(col(c.dim, '  ─'.repeat(30)));
  console.log('');

  const exceedsLimit = totalUncompressed > NPM_LIMIT;
  const sizeColor = exceedsLimit ? c.red : totalUncompressed > NPM_LIMIT * 0.8 ? c.yellow : c.green;

  console.log(`  ${col(c.bold, 'Files included:')}    ${col(c.cyan, String(included.length))}`);
  console.log(`  ${col(c.bold, 'Uncompressed:')}      ${col(sizeColor, formatBytes(totalUncompressed))}`);
  console.log(`  ${col(c.bold, 'Gzip estimate:')}     ${col(c.green, formatBytes(gzipSize))}`);
  console.log(`  ${col(c.bold, 'npm size limit:')}    ${col(c.dim, '50 MB')}${exceedsLimit ? ' ' + col(c.red + c.bold, '⚠ EXCEEDS LIMIT') : ''}`);

  if (exceedsLimit) {
    console.log('');
    console.log(col(c.red + c.bold, '  ⚠ Package exceeds the 50MB npm publish limit!'));
    console.log(col(c.yellow, '  Add large files to .npmignore or use the `files` field in package.json.'));
  }

  // .npmignore suggestions
  const suggestions = [];
  for (const file of included) {
    for (const { pattern, label, suggestion } of SUGGESTION_PATTERNS) {
      if (pattern.test(file.path)) {
        if (!suggestions.find(s => s.suggestion === suggestion)) {
          suggestions.push({ label, suggestion, path: file.path });
        }
      }
    }
  }

  if (suggestions.length > 0) {
    console.log('');
    console.log(col(c.yellow + c.bold, '  ⚡ Suggested .npmignore additions:'));
    console.log('');
    for (const { label, suggestion, path } of suggestions) {
      console.log(col(c.yellow, `  + ${suggestion}`) + col(c.dim, `  (${label} detected: ${path})`));
    }
    console.log('');
    console.log(col(c.dim, '  Add these to .npmignore to reduce your package size.'));
  }

  // --limit check
  if (opts.limit) {
    const limitBytes = parseSize(opts.limit);
    if (!limitBytes) {
      console.error(col(c.red, `  Invalid --limit value: ${opts.limit}. Use format like 500KB or 1MB.`));
      process.exit(2);
    }
    console.log('');
    const limitColor = totalUncompressed > limitBytes ? c.red : c.green;
    const limitStatus = totalUncompressed > limitBytes ? '✗ FAIL' : '✓ PASS';
    console.log(
      `  ${col(c.bold, 'Size limit:')}        ` +
      col(limitColor + c.bold, `${limitStatus}`) +
      col(c.dim, ` (limit: ${formatBytes(limitBytes)}, actual: ${formatBytes(totalUncompressed)})`)
    );
    if (totalUncompressed > limitBytes) {
      console.log('');
      console.log(col(c.red, `  Package size ${formatBytes(totalUncompressed)} exceeds limit ${formatBytes(limitBytes)}.`));
      console.log('');
      process.exit(1);
    }
  }

  // --compare with npm registry
  if (opts.compare) {
    if (!pkg.name) {
      console.log('');
      console.log(col(c.yellow, '  --compare requires a name field in package.json.'));
    } else {
      console.log('');
      process.stdout.write(col(c.dim, `  Fetching published info for ${pkg.name}...`));
      try {
        const info = await fetchNpmPackageInfo(pkg.name);
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
        if (!info) {
          console.log(col(c.dim, `  ${pkg.name} is not yet published on npm.`));
        } else {
          const publishedSize = info.dist?.unpackedSize || 0;
          const publishedVersion = info.version || '?';
          const diff = totalUncompressed - publishedSize;
          const diffStr = diff >= 0 ? `+${formatBytes(diff)}` : `-${formatBytes(Math.abs(diff))}`;
          const diffColor = diff > 0 ? c.yellow : c.green;

          console.log(col(c.bold, '  Comparison with npm registry:'));
          console.log('');
          console.log(`  ${col(c.dim, 'Published version:')}   ${col(c.cyan, publishedVersion)}`);
          console.log(`  ${col(c.dim, 'Published size:')}      ${col(c.cyan, formatBytes(publishedSize))}`);
          console.log(`  ${col(c.dim, 'Local size:')}          ${col(c.cyan, formatBytes(totalUncompressed))}`);
          console.log(`  ${col(c.dim, 'Difference:')}          ${col(diffColor, diffStr)}`);
        }
      } catch (err) {
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
        console.log(col(c.yellow, `  Could not fetch npm registry info: ${err.message}`));
      }
    }
  }

  if (!opts.verbose && excluded.length > 0) {
    console.log('');
    console.log(col(c.dim, `  ${excluded.length} file(s) excluded. Use --verbose to see them.`));
  }

  console.log('');
}

main().catch(err => {
  console.error(col(c.red, `Error: ${err.message}`));
  process.exit(1);
});
