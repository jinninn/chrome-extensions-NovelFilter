import { readFile, readdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const files = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, ...manifest.content_scripts.flatMap(s => [...s.js, ...s.css])];
for (const file of files) await access(file);
for (const dir of ['src', 'scripts', 'tests']) for (const file of await readdir(dir)) {
  if (/\.(m?js)$/.test(file)) execFileSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
}
for (const html of ['popup.html', 'options.html']) {
  const text = await readFile(html, 'utf8');
  for (const match of text.matchAll(/(?:src|href)="([^"]+)"/g)) await access(match[1]);
  if (/<script(?![^>]*src=)/.test(text) || /\son\w+=/.test(text)) throw new Error(`${html}: inline script is not allowed`);
}
console.log('Manifest assets, HTML references, CSP and JavaScript syntax: OK');
