// Renders the social sharing image and PNG/ICO icons from the SVG logo.
// Run after changing the logo, business name or tagline:
//   node scripts/make-images.js   (with the playwright package installed)
// (needs Playwright and a Chromium; not part of the normal build)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const IMG = path.join(ROOT, 'assets/img');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const logo = fs.readFileSync(path.join(IMG, 'logo.svg'), 'utf8');
const font = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'assets/fonts', f)).toString('base64')}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const ogHtml = `<!DOCTYPE html><html><head><style>
@font-face { font-family: Inter; font-weight: 100 900; src: url(${font('inter-var.woff2')}); }
@font-face { font-family: Outfit; font-weight: 100 900; src: url(${font('outfit-var.woff2')}); }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; font-family: Inter; color: #fff;
  background: linear-gradient(135deg, #0a2e4a 0%, #0f4a6e 55%, #12a4a0 140%); position: relative; }
.wrap { position: absolute; inset: 0; padding: 72px 80px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 22px; }
.brand svg { width: 84px; height: 84px; }
.brand span { font-family: Outfit; font-weight: 800; font-size: 46px; letter-spacing: -0.01em; }
h1 { font-family: Outfit; font-weight: 800; font-size: 74px; line-height: 1.04; margin-top: 54px; max-width: 900px; letter-spacing: -0.02em; }
h1 em { font-style: normal; color: #5fe0d8; }
.areas { margin-top: 26px; font-size: 28px; color: #cfe3ef; }
.chips { margin-top: auto; display: flex; gap: 14px; position: relative; z-index: 2; }
.chips span { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.28); border-radius: 999px; padding: 12px 24px; font-size: 24px; font-weight: 600; }
.chips span:first-child { background: #e39b5b; border-color: #e39b5b; color: #0a2e4a; }
svg.mtn { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 190px; }
</style></head><body>
<svg class="mtn" viewBox="0 0 1200 190" preserveAspectRatio="none"><path fill="#ffffff" fill-opacity=".07" d="M0 190V110l90-30 110 34 150-90 70 40 120-74 100 52 80-28 170 96 120-40 190 70v50z"/></svg>
<div class="wrap">
  <div class="brand">${logo.replace('<svg ', '<svg aria-hidden="true" ')}<span>${esc(config.name)}</span></div>
  <h1>Soft, clean water for <em>Albuquerque</em> homes</h1>
  <p class="areas">Water softeners &middot; Whole-home filtration &middot; Reverse osmosis</p>
  <div class="chips"><span>Free water test</span><span>Free installation</span><span>Lifetime warranty</span></div>
</div></body></html>`;

const iconHtml = (size, pad) => `<!DOCTYPE html><html><head><style>
* { margin: 0; } body { width: ${size}px; height: ${size}px; background: #ffffff; display: grid; place-items: center; }
svg { width: ${size - pad * 2}px; height: ${size - pad * 2}px; }
</style></head><body>${logo}</body></html>`;

// Minimal ICO container holding one PNG image
function pngToIco(png, size) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); entry.writeUInt8(0, 3); entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

(async () => {
  const exe = ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const shot = async (html, w, h, opts = {}) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.screenshot({ type: 'png', ...opts });
    await page.close();
    return buf;
  };
  fs.writeFileSync(path.join(IMG, 'og-image.png'), await shot(ogHtml, 1200, 630));
  fs.writeFileSync(path.join(IMG, 'apple-touch-icon.png'), await shot(iconHtml(180, 22), 180, 180));
  fs.writeFileSync(path.join(IMG, 'icon-192.png'), await shot(iconHtml(192, 20), 192, 192));
  fs.writeFileSync(path.join(IMG, 'icon-512.png'), await shot(iconHtml(512, 56), 512, 512));
  const ico48 = await shot(iconHtml(48, 3).replace('background: #ffffff', 'background: transparent'), 48, 48, { omitBackground: true });
  fs.writeFileSync(path.join(ROOT, 'static', 'favicon.ico'), pngToIco(ico48, 48));
  await browser.close();
  console.log('Wrote og-image.png, apple-touch-icon.png, icon-192.png, icon-512.png, favicon.ico');
})();
