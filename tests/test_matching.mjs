import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'test-output');
await fs.mkdir(output, {recursive: true});
const app = pathToFileURL(path.join(root, 'Folio-Windows.html')).href;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.FOLIO_BROWSER_PATH ? {executablePath: process.env.FOLIO_BROWSER_PATH} : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const results = [], downloads = [], errors = [], requests = [];
function check(name, condition) {
  results.push({name, pass: !!condition});
  console.log((condition ? 'PASS ' : 'FAIL ') + name);
  assert.ok(condition, name);
}
async function context() {
  const c = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true, timezoneId: 'America/Edmonton'});
  await c.route(/^https?:\/\//, r => {requests.push(r.request().url()); return r.abort();});
  const page = await c.newPage();
  page.on('pageerror', e => errors.push(e.message));
  return {c, page};
}
async function editLine(page, text, replacement) {
  const index = await page.evaluate(async text => {
    const segments = await PDFToolkit.TOOL.edit.ed.segments(0);
    return segments.findIndex(s => s.text === text);
  }, text);
  assert.ok(index >= 0, 'Original text segment found: ' + text);
  await page.locator(`.ed-hitbox[data-seg="${index}"]`).click();
  await page.waitForSelector('.ed-textarea');
  check(text + ': opens the existing text', await page.locator('.ed-textarea').inputValue() === text);
  if (replacement !== null) await page.locator('.ed-textarea').fill(replacement);
  await page.keyboard.press('Escape');
}
async function save(page, tag) {
  const waiting = page.waitForEvent('download');
  await page.click('#primary');
  const download = await waiting;
  const target = path.join(output, tag + '.pdf');
  await download.saveAs(target);
  assert.equal(await download.failure(), null);
  downloads.push({tag, path: target});
  await page.waitForSelector('#busy', {state: 'hidden'});
}
try {
  {
    const {c, page} = await context();
    await page.clock.install({time: new Date('2026-10-18T15:00:00Z')});
    await page.goto(app + '?pc=TEST-PC&user=WindowsUser');
    check('Greeting detects the PC name supplied by the launcher', await page.locator('#home-greeting').innerText() === 'Good morning, TEST-PC.');
    await page.clock.setSystemTime(new Date('2026-10-18T20:00:00Z'));
    await page.clock.runFor(30001);
    check('Greeting changes to afternoon without a reload', await page.locator('#home-greeting').innerText() === 'Good afternoon, TEST-PC.');
    await page.clock.setSystemTime(new Date('2026-10-19T01:00:00Z'));
    await page.clock.runFor(30001);
    check('Greeting changes to evening using local time', await page.locator('#home-greeting').innerText() === 'Good evening, TEST-PC.');
    await page.getByRole('button', {name: 'Personalize', exact: true}).click();
    await page.getByLabel('Display name', {exact: true}).fill('Asha');
    await page.getByRole('button', {name: 'Save name', exact: true}).click();
    check('A custom display name can override the PC name', await page.locator('#home-greeting').innerText() === 'Good evening, Asha.');
    await page.reload();
    check('The custom name survives a reload', (await page.locator('#home-greeting').innerText()).endsWith(', Asha.'));
    await page.getByRole('button', {name: 'Personalize', exact: true}).click();
    await page.getByLabel('Display name', {exact: true}).fill('');
    await page.getByRole('button', {name: 'Save name', exact: true}).click();
    check('Clearing the override restores the detected PC name', (await page.locator('#home-greeting').innerText()).endsWith(', TEST-PC.'));
    await page.goto(app);
    check('Direct HTML opening remembers the last detected PC name', (await page.locator('#home-greeting').innerText()).endsWith(', TEST-PC.'));
    await page.screenshot({path: path.join(output, 'greeting.png')});
    await c.close();
  }
  {
    const {c, page} = await context();
    await page.goto(app);
    check('Opening HTML directly does not hardcode a person', /^(Good morning|Good afternoon|Good evening)\.$/.test(await page.locator('#home-greeting').innerText()));
    await c.close();
  }
  for (const [file, original, replacement, expectedFont, size] of [
    ['standard.pdf', 'Original text style', 'Updated text style', 'helvetica', 11.3],
    ['embedded.pdf', 'Original embedded style', 'Original embedded styles', 'carlito', 18.25],
    ['cid.pdf', 'Original CID text style', 'Original CID text styles', 'carlito', 16.75],
  ]) {
    const {c, page} = await context();
    await page.goto(app + '#/edit');
    await page.setInputFiles('#file-input', path.join(output, 'fixtures', file));
    await page.waitForSelector('.ed-page.loaded');
    await page.locator('.tbtn[data-mode="edittext"]').click();
    await page.waitForSelector('.ed-hitbox');
    await editLine(page, original, null);
    check(file + ': clicking without editing preserves the page', await page.evaluate(() => PDFToolkit.TOOL.edit.state.objs.length === 0));
    await editLine(page, original, replacement);
    const data = await page.evaluate(() => {
      const st = PDFToolkit.TOOL.edit.state, o = st.objs.find(o => o.type === 'text');
      return {font: o.font, size: o.size, color: o.color, horizontalScale: o.horizontalScale, tracking: o.tracking, originalFont: !!o.sourceFontKey, history: st.history.length};
    });
    check(file + ': font family is retained', data.font === expectedFont);
    check(file + ': fractional font size is retained', Math.abs(data.size - size) < .001);
    check(file + ': original PDF font is available for reuse', data.originalFont);
    if (file !== 'standard.pdf') check(file + ': browser preview uses the embedded original font', (await page.locator('.ed-text').evaluate(el => getComputedStyle(el).fontFamily)).includes('FolioSource_'));
    check(file + ': one text edit creates one undo step', data.history === 1);
    if (file === 'standard.pdf') {
      check('Original horizontal text scaling is preserved', Math.abs(data.horizontalScale - .85) < .001);
      check('Original character spacing is preserved', Math.abs(data.tracking * size - 1.2) < .1);
      const segments = await page.evaluate(async () => (await PDFToolkit.TOOL.edit.ed.segments(0)).map(s => ({text: s.text, bold: s.font.bold})));
      check('Adjacent regular and bold text remain separate', segments.some(s => s.text === 'Regular' && !s.bold) && segments.some(s => s.text === 'Bold' && s.bold));
    }
    await page.screenshot({path: path.join(output, file + '-edited.png')});
    await save(page, file.replace('.pdf', '-edited'));
    await page.keyboard.press('Control+z');
    check(file + ': undo restores the untouched original', await page.evaluate(() => PDFToolkit.TOOL.edit.state.objs.length === 0));
    await page.keyboard.press('Control+y');
    check(file + ': redo restores the replacement', await page.evaluate(value => PDFToolkit.TOOL.edit.state.objs.some(o => o.text === value), replacement));
    await c.close();
  }
  check('No application JavaScript errors', errors.length === 0);
  check('No HTTP or HTTPS requests', requests.length === 0);
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, 'matching-results.json'), JSON.stringify({results, errors, requests, downloads}, null, 2));
}
console.log(`${results.length} browser checks passed.`);
