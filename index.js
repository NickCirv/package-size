#!/usr/bin/env node
// package-size — Check npm package install size before adding it
// Zero external dependencies | Node 18+ | ES Modules

import https from 'https';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { Writable, Readable } from 'stream';

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY;
const c = (color, str) => NO_COLOR ? str : `${C[color]}${str}${C.reset}`;
const bold = (str) => NO_COLOR ? str : `${C.bold}${str}${C.reset}`;

// ─── Size Formatting ─────────────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function sizeColor(bytes) {
  if (bytes > 10 * 1024 * 1024) return 'red';
  if (bytes > 2 * 1024 * 1024)  return 'yellow';
  return 'green';
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGet(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

function httpsGetStream(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGetStream(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── Registry API ─────────────────────────────────────────────────────────────
async function fetchPackageMeta(name) {
  const encoded = name.startsWith('@')
    ? name.replace('/', '%2F')
    : name;
  const data = await httpsGet(`https://registry.npmjs.org/${encoded}`);
  return JSON.parse(data.toString('utf8'));
}

// ─── TAR Parser — parse a .tar stream to get file list + sizes ───────────────
// Implements the POSIX ustar/GNU tar header format (512-byte blocks)
function parseTarEntries(buf) {
  const entries = [];
  let offset = 0;

  while (offset + 512 <= buf.length) {
    const header = buf.slice(offset, offset + 512);

    // Check for end-of-archive (two 512-byte zero blocks)
    const isZero = header.every(b => b === 0);
    if (isZero) break;

    const name    = header.slice(0, 100).toString('utf8').replace(/\0/g, '').trim();
    const sizeOct = header.slice(124, 136).toString('utf8').replace(/\0/g, '').trim();
    const typeFlag = header.slice(156, 157).toString('utf8');

    if (!name) { offset += 512; continue; }

    const size = parseInt(sizeOct, 8) || 0;

    // typeFlag '0' or '' = regular file, '5' = directory
    if (typeFlag !== '5' && typeFlag !== '2') {
      entries.push({ name, size });
    }

    // Advance past header + data blocks (each block is 512 bytes)
    const dataBlocks = Math.ceil(size / 512);
    offset += 512 + dataBlocks * 512;
  }

  return entries;
}

// ─── Analyze a single version tarball ────────────────────────────────────────
async function analyzeTarball(tarballUrl) {
  const stream = await httpsGetStream(tarballUrl);

  // Collect compressed size as we stream, then decompress
  let compressedSize = 0;
  const chunks = [];

  await new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    stream.on('data', (chunk) => { compressedSize += chunk.length; });
    stream.pipe(gunzip);
    gunzip.on('data', (chunk) => chunks.push(chunk));
    gunzip.on('end', resolve);
    gunzip.on('error', reject);
    stream.on('error', reject);
  });

  const tarBuffer = Buffer.concat(chunks);
  const unpackedSize = tarBuffer.length;
  const entries = parseTarEntries(tarBuffer);

  // Sort by size descending
  const sorted = [...entries].sort((a, b) => b.size - a.size);
  const top10  = sorted.slice(0, 10);
  const totalFiles = entries.length;

  return { compressedSize, unpackedSize, top10, totalFiles, entries };
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function createSpinner(text) {
  if (!process.stdout.isTTY) {
    process.stderr.write(`${text}...\n`);
    return { stop: () => {} };
  }
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const iv = setInterval(() => {
    process.stderr.write(`\r${c('cyan', frames[i++ % frames.length])} ${text}   `);
  }, 80);
  return {
    stop: (msg = '') => {
      clearInterval(iv);
      if (msg) process.stderr.write(`\r${msg}\n`);
      else      process.stderr.write('\r\x1b[K');
    }
  };
}

// ─── Display: single package result ──────────────────────────────────────────
function displayResult(pkg, result, meta) {
  const { compressedSize, unpackedSize, top10, totalFiles } = result;
  const sc = sizeColor(unpackedSize);

  console.log('');
  console.log(bold(`  ${c('cyan', pkg.name)}  ${c('gray', 'v' + pkg.version)}`));
  if (meta.description) console.log(`  ${c('dim', meta.description.slice(0, 80))}`);
  console.log('');

  // Size bar
  const barMax = 30;
  const pct = Math.min(unpackedSize / (5 * 1024 * 1024), 1); // cap at 5MB
  const bar = '█'.repeat(Math.round(pct * barMax)).padEnd(barMax, '░');
  console.log(`  ${c('bold', 'Compressed (tgz)')}   ${c(sc, fmtBytes(compressedSize).padStart(10))}`);
  console.log(`  ${c('bold', 'Unpacked size  ')}   ${c(sc, fmtBytes(unpackedSize).padStart(10))}  ${c(sc, bar)}`);
  console.log(`  ${c('bold', 'Files          ')}   ${String(totalFiles).padStart(10)}`);
  console.log('');

  // Flags
  const flags = [];
  if (unpackedSize > 5 * 1024 * 1024)  flags.push(c('red',    '  ⚠ Large package (>5MB unpacked) — consider alternatives'));
  if (unpackedSize > 50 * 1024 * 1024) flags.push(c('red',    '  ⛔ Very large package (>50MB) — evaluate carefully'));
  if (totalFiles > 1000)                flags.push(c('yellow', '  ⚠ Many files (>1000) — may slow installs'));
  if (flags.length) { flags.forEach(f => console.log(f)); console.log(''); }

  // Top 10 files
  if (top10.length > 0) {
    console.log(`  ${bold('Top files by size:')}`);
    top10.forEach((f, idx) => {
      const fname = f.name.replace(/^package\//, '');
      const fc = sizeColor(f.size);
      console.log(`  ${c('gray', String(idx + 1).padStart(2) + '.')} ${fname.padEnd(55)} ${c(fc, fmtBytes(f.size).padStart(8))}`);
    });
  }
  console.log('');
}

// ─── Display: comparison table ────────────────────────────────────────────────
function displayComparison(results) {
  const sorted = [...results].sort((a, b) => a.unpackedSize - b.unpackedSize);
  const maxUnpacked = Math.max(...results.map(r => r.unpackedSize));

  console.log('');
  console.log(bold('  Package Comparison'));
  console.log('  ' + '─'.repeat(70));

  const hdr = `  ${'Package'.padEnd(28)} ${'Compressed'.padStart(12)} ${'Unpacked'.padStart(12)} ${'Files'.padStart(7)}`;
  console.log(c('dim', hdr));
  console.log('  ' + '─'.repeat(70));

  sorted.forEach((r, i) => {
    const sc = sizeColor(r.unpackedSize);
    const medal = i === 0 ? c('green', '✓') : (i === sorted.length - 1 ? c('red', '✗') : ' ');
    const barLen = Math.round((r.unpackedSize / maxUnpacked) * 20);
    const bar = c(sc, '█'.repeat(barLen));
    console.log(
      `  ${medal} ${r.name.padEnd(26)} ` +
      `${c(sc, fmtBytes(r.compressedSize).padStart(12))} ` +
      `${c(sc, fmtBytes(r.unpackedSize).padStart(12))} ` +
      `${String(r.totalFiles).padStart(7)} ${bar}`
    );
  });

  console.log('  ' + '─'.repeat(70));
  console.log(`  ${c('green', '✓')} = smallest  ${c('red', '✗')} = largest`);
  console.log('');
}

// ─── Display: version history ─────────────────────────────────────────────────
async function displayHistory(packageName, versions) {
  console.log('');
  console.log(bold(`  Size history — ${c('cyan', packageName)} (last ${versions.length} versions)`));
  console.log('  ' + '─'.repeat(60));

  const allSizes = [];
  for (const v of versions) {
    const spin = createSpinner(`Checking v${v.version}`);
    try {
      const r = await analyzeTarball(v.tarball);
      spin.stop();
      allSizes.push({ version: v.version, ...r });
    } catch {
      spin.stop();
      allSizes.push({ version: v.version, compressedSize: 0, unpackedSize: 0, totalFiles: 0 });
    }
  }

  const maxSize = Math.max(...allSizes.map(r => r.unpackedSize), 1);

  allSizes.forEach(r => {
    const sc = sizeColor(r.unpackedSize);
    const barLen = r.unpackedSize ? Math.round((r.unpackedSize / maxSize) * 25) : 0;
    const bar = c(sc, '█'.repeat(barLen) || '▏');
    console.log(
      `  v${r.version.padEnd(14)} ` +
      `${c(sc, fmtBytes(r.unpackedSize).padStart(10))}  ${bar}`
    );
  });
  console.log('');
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
${bold('package-size')} — Check npm package install size before adding it

${bold('USAGE')}
  package-size <package>              Single package analysis
  package-size <pkg1> <pkg2> ...      Compare multiple packages
  package-size <package> --history    Size over last 5 versions
  package-size <package> --json       JSON output
  pkgsize <package>                   Alias

${bold('OPTIONS')}
  --history    Show size trend across last 5 versions
  --json       Output machine-readable JSON
  --help, -h   Show this help

${bold('EXAMPLES')}
  package-size lodash
  package-size react vue angular
  package-size axios --history
  package-size moment --json

${bold('FLAGS')}
  ${c('green', '✓')} Smallest in comparison
  ${c('red',   '✗')} Largest in comparison
  ${c('red',   '⚠')} Package over 5MB unpacked
  ${c('red',   '⛔')} Package over 50MB unpacked
`);
}

// ─── JSON Output ──────────────────────────────────────────────────────────────
function toJSON(results) {
  return JSON.stringify(results.map(r => ({
    name:           r.name,
    version:        r.version,
    description:    r.description,
    compressedSize: r.compressedSize,
    unpackedSize:   r.unpackedSize,
    totalFiles:     r.totalFiles,
    top10Files:     r.top10,
    flags: {
      large:     r.unpackedSize > 5 * 1024 * 1024,
      veryLarge: r.unpackedSize > 50 * 1024 * 1024,
      manyFiles: r.totalFiles > 1000,
    }
  })), null, 2);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const jsonMode    = args.includes('--json');
  const historyMode = args.includes('--history');
  const packages    = args.filter(a => !a.startsWith('--'));

  if (packages.length === 0) {
    console.error(c('red', 'Error: Provide at least one package name.'));
    process.exit(1);
  }

  // ── History mode (single package) ──────────────────────────────────────────
  if (historyMode) {
    const pkg = packages[0];
    const spin = createSpinner(`Fetching metadata for ${pkg}`);
    let meta;
    try {
      meta = await fetchPackageMeta(pkg);
      spin.stop();
    } catch (err) {
      spin.stop(`${c('red', '✗')} Failed: ${err.message}`);
      process.exit(1);
    }

    const allVersions = Object.keys(meta.versions || {});
    const last5 = allVersions.slice(-5).reverse().map(v => ({
      version: v,
      tarball: meta.versions[v]?.dist?.tarball,
    })).filter(v => v.tarball);

    if (!jsonMode) {
      await displayHistory(pkg, last5);
    } else {
      const rows = [];
      for (const v of last5) {
        try {
          const r = await analyzeTarball(v.tarball);
          rows.push({ version: v.version, ...r });
        } catch {
          rows.push({ version: v.version, error: true });
        }
      }
      console.log(JSON.stringify(rows, null, 2));
    }
    return;
  }

  // ── Single or comparison mode ───────────────────────────────────────────────
  const results = [];

  for (const pkg of packages) {
    const spin = createSpinner(`Analyzing ${pkg}`);
    try {
      const meta = await fetchPackageMeta(pkg);
      const latest = meta['dist-tags']?.latest;
      if (!latest) throw new Error('No latest tag found');

      const vMeta   = meta.versions?.[latest];
      if (!vMeta)   throw new Error(`Version ${latest} not found`);

      const tarball = vMeta.dist?.tarball;
      if (!tarball) throw new Error('No tarball URL');

      const analysis = await analyzeTarball(tarball);
      spin.stop(`${c('green', '✓')} ${pkg}@${latest} analyzed`);

      results.push({
        name:        pkg,
        version:     latest,
        description: meta.description || '',
        tarball,
        ...analysis,
      });
    } catch (err) {
      spin.stop(`${c('red', '✗')} ${pkg}: ${err.message}`);
    }
  }

  if (results.length === 0) {
    console.error(c('red', 'No packages could be analyzed.'));
    process.exit(1);
  }

  if (jsonMode) {
    console.log(toJSON(results));
    return;
  }

  if (results.length === 1) {
    const r = results[0];
    const meta = { description: r.description };
    displayResult({ name: r.name, version: r.version }, r, meta);
  } else {
    displayComparison(results);

    // Also show individual breakdowns
    console.log(bold('  Individual Breakdowns'));
    for (const r of results) {
      displayResult({ name: r.name, version: r.version }, r, { description: r.description });
    }
  }
}

main().catch(err => {
  console.error(c('red', `Fatal: ${err.message}`));
  process.exit(1);
});
