// Zero-dependency static site builder.
// Reads src/pages/*.html, wraps each in src/partials/layout.html, fills {{tokens}}
// from site.config.json, and writes clean URLs to dist/ (e.g. dist/about/index.html).
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const partials = {
  layout: read('partials/layout.html'),
  header: read('partials/header.html'),
  footer: read('partials/footer.html'),
  cta: read('partials/cta.html'),
  packages: read('partials/packages.html'),
  testForm: read('partials/test-form.html'),
};

// {{name}}, {{price.softener}}, {{year}} ...
function fill(str, vars) {
  return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    const val = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
    return val == null ? m : String(val);
  });
}

// Page front matter lives in a leading HTML comment: <!-- title: ... \n description: ... -->
function parsePage(raw) {
  const meta = {};
  const m = raw.match(/^<!--([\s\S]*?)-->\s*/);
  if (m) {
    m[1].split('\n').forEach((line) => {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    raw = raw.slice(m[0].length);
  }
  return { meta, body: raw };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));

const vars = { ...config, year: new Date().getFullYear() };
const pagesDir = path.join(SRC, 'pages');
const urls = [];

for (const file of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.html'))) {
  const slug = file.replace(/\.html$/, '');
  const url = slug === 'index' ? '/' : `/${slug}/`;
  const { meta, body } = parsePage(fs.readFileSync(path.join(pagesDir, file), 'utf8'));

  let content = body
    .replace('<!-- @cta -->', partials.cta)
    .replace('<!-- @packages -->', partials.packages)
    .replace('<!-- @test-form -->', partials.testForm);

  // Mark the current nav link
  const header = partials.header.replace(
    new RegExp(`href="${url.replace(/\//g, '\\/')}"`, 'g'),
    `href="${url}" aria-current="page"`
  );

  let html = partials.layout
    .replace('{{> header}}', header)
    .replace('{{> footer}}', partials.footer)
    .replace('{{> content}}', content);

  html = fill(html, {
    ...vars,
    pageTitle: fill(meta.title || config.name, vars),
    pageDescription: fill(meta.description || config.tagline, vars),
    canonical: config.domain.replace(/\/$/, '') + url,
  });

  const outDir = slug === 'index' ? DIST : path.join(DIST, slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  urls.push(url);
}

// sitemap + robots
const base = config.domain.replace(/\/$/, '');
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${base}${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`
);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);

console.log(`Built ${urls.length} pages → dist/`);
