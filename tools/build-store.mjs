// Prépare la version Chrome Web Store de l'extension : node tools/build-store.mjs
// - vérifie le manifeste et les icônes
// - copie extension/ (sans le README) dans dist/ecoquant-<version>/
// - crée dist/ecoquant-<version>.zip (à envoyer sur le Chrome Web Store)
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'extension');
const fail = msg => { console.error(`\n✗ ${msg}\n`); process.exit(1); };

let manifest;
try { manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8')); } catch (e) { fail(`manifest.json illisible : ${e.message}`); }
for (const size of [16, 48, 128]) {
  if (!existsSync(join(src, 'icons', `icon${size}.png`))) fail(`icône manquante : extension/icons/icon${size}.png`);
}

const name = `ecoquant-${manifest.version}`;
const out = join(root, 'dist', name);
const zip = join(root, 'dist', `${name}.zip`);
rmSync(out, { recursive: true, force: true });
rmSync(zip, { force: true });
cpSync(src, out, { recursive: true, filter: p => !p.endsWith('README.md') });

// Zip : tar.exe de Windows 10+ (bsdtar, sait faire du zip), sinon la commande zip (macOS / Linux)
const attempts = [];
if (process.platform === 'win32') {
  attempts.push([join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', zip, '.']]);
}
attempts.push(['zip', ['-r', '-q', zip, '.']]);
const isZip = () => existsSync(zip) && readFileSync(zip).subarray(0, 2).toString() === 'PK';
for (const [cmd, args] of attempts) {
  try { execFileSync(cmd, args, { cwd: out, stdio: 'ignore' }); } catch { /* on essaie la suivante */ }
  if (isZip()) break;
  rmSync(zip, { force: true });
}
if (isZip()) console.log(`\n✓ Prêt : ${zip}`);
else console.log(`\n✓ Dossier prêt : ${out}\n  (zip automatique impossible : compresse ce dossier à la main, manifest.json doit être à la racine du zip)`);
console.log(`  Version ${manifest.version} · permissions : ${manifest.permissions.join(', ')}`);
