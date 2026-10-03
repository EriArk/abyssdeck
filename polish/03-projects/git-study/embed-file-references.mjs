// Embed unmodified reference screenshots of the EXISTING Files module.
// No second file-manager implementation or access to a real working copy.
import { readFile, writeFile } from 'node:fs/promises';
const html = new URL('./git-study.html', import.meta.url);
const marker = '<!-- EXISTING_FILES_REFERENCE -->';
const themes = {green:'crt-green',millennium:'hitech-2000s',organizer:'organizer',classic:'classic-dark'};
const images = {};
for (const [key, name] of Object.entries(themes)) {
  const source = new URL(`../../05-files/commands-2026-10-03/${name}-desktop.png`, import.meta.url);
  images[key] = 'data:image/png;base64,' + (await readFile(source)).toString('base64');
}
const source = (await readFile(html, 'utf8')).split(marker)[0].trimEnd();
const result = source + '\n' + marker + '\n<script>document.getElementById("cw-git-study").fileReferences=' + JSON.stringify(images) + ';</script>\n';
if (Buffer.byteLength(result) >= 1_000_000) throw Error('Inline fragment must stay below 1 MB');
await writeFile(html, result);
console.log(`Embedded four existing Files screenshots; ${Buffer.byteLength(result)} bytes.`);
