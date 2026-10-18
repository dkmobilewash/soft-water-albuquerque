// Zero-dependency static site builder.
// Reads src/pages/**/*.html, wraps each in src/partials/layout.html, fills {{tokens}}
// from site.config.json, and writes clean URLs to dist/ (e.g. dist/about/index.html).
const fs = require('fs');
const crypto = require('crypto');
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
// Files that must live at the site root (favicon.ico, site.webmanifest)
copyDir(path.join(ROOT, 'static'), DIST);

const vars = { ...config, year: new Date().getFullYear() };
const pagesDir = path.join(SRC, 'pages');
const urls = [];

// Sitemap <lastmod>: a page's date changes only when its built HTML changes.
// Hashes are stored in src/data/lastmod.json; commit that file after building.
const LASTMOD_FILE = path.join(SRC, 'data/lastmod.json');
const lastmod = fs.existsSync(LASTMOD_FILE) ? JSON.parse(fs.readFileSync(LASTMOD_FILE, 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);

// Services × service areas. Pages at src/pages/{area}/index.html and src/pages/{area}/{service}.html
// get breadcrumbs, schema and cross-links generated from this file.
const loc = JSON.parse(read('data/locations.json'));
const areaBySlug = Object.fromEntries(loc.areas.map((a) => [a.slug, a]));
const serviceBySlug = Object.fromEntries(loc.services.map((s) => [s.slug, s]));
const base = config.domain.replace(/\/$/, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const short = (a) => a.short || a.name;
const ldScript = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

// Recursively list .html files under src/pages, as paths relative to it.
function listPages(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listPages(path.join(dir, e.name), path.posix.join(rel, e.name))
      : e.name.endsWith('.html') ? [path.posix.join(rel, e.name)] : []
  );
}

// "rio-rancho/water-softeners.html" → { area, service }; "rio-rancho/index.html" → { area }
function locationOf(rel) {
  const parts = rel.replace(/\.html$/, '').split('/');
  if (parts.length !== 2 || !areaBySlug[parts[0]]) return null;
  if (parts[1] === 'index') return { area: areaBySlug[parts[0]] };
  if (serviceBySlug[parts[1]]) return { area: areaBySlug[parts[0]], service: serviceBySlug[parts[1]] };
  return null;
}

function breadcrumbItems(lc) {
  const items = [{ name: 'Home', url: '/' }, { name: 'Service Areas', url: '/service-areas/' }, { name: lc.area.name, url: `/${lc.area.slug}/` }];
  if (lc.service) items.push({ name: lc.service.name, url: `/${lc.area.slug}/${lc.service.slug}/` });
  return items;
}

function breadcrumbsHtml(lc) {
  const items = breadcrumbItems(lc);
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><div class="container"><ol>${items
    .map((it, i) => (i === items.length - 1 ? `<li aria-current="page">${esc(it.name)}</li>` : `<li><a href="${it.url}">${esc(it.name)}</a></li>`))
    .join('')}</ol></div></nav>`;
}

const businessId = base + '/#business';
const provider = { '@id': businessId };

// LocalBusiness schema on every page, built from site.config.json; optional fields are left out when empty
// Selling prices only: skip crossed-out "Regular" prices and the monthly financing figure
const prices = Object.entries(config.price || {})
  .filter(([k]) => !/regular|financing/i.test(k))
  .map(([, p]) => Number(String(p).replace(/[^0-9.]/g, '')))
  .filter((n) => n > 0);
const business = {
  '@context': 'https://schema.org', '@type': 'HomeAndConstructionBusiness', '@id': businessId,
  name: config.name, url: base + '/', telephone: config.phone, email: config.email,
  logo: base + '/assets/img/icon-512.png', image: base + '/assets/img/og-image.png',
  address: { '@type': 'PostalAddress', streetAddress: config.address, addressLocality: config.city, addressRegion: config.state, postalCode: config.zip, addressCountry: 'US' },
  ...(config.geo && { geo: { '@type': 'GeoCoordinates', ...config.geo } }),
  areaServed: loc.areas.map((a) => ({ '@type': 'Place', name: `${a.name}, NM` })),
  ...(config.openingHoursSchema && config.openingHoursSchema.length && { openingHours: config.openingHoursSchema }),
  ...(prices.length && { priceRange: `$${Math.min(...prices).toLocaleString('en-US')}–$${Math.max(...prices).toLocaleString('en-US')}` }),
  ...(config.sameAs && config.sameAs.length && { sameAs: config.sameAs }),
};

function relatedHtml(lc, serviceOnly) {
  const col = (title, links) =>
    `<div><h3>${esc(title)}</h3><ul>${links.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul></div>`;
  let cols;
  if (serviceOnly) {
    cols = [col(`${serviceOnly.name} by area`, loc.areas.map((a) => [`/${a.slug}/${serviceOnly.slug}/`, `${serviceOnly.name} in ${short(a)}`]))];
  } else if (lc.service) {
    cols = [
      col(`More for ${short(lc.area)}`, [[`/${lc.area.slug}/`, `Water treatment in ${short(lc.area)}`],
        ...loc.services.filter((s) => s !== lc.service).map((s) => [`/${lc.area.slug}/${s.slug}/`, `${s.name} in ${short(lc.area)}`])]),
      col(`${lc.service.name} in nearby areas`, loc.areas.filter((a) => a !== lc.area).map((a) => [`/${a.slug}/${lc.service.slug}/`, short(a)])),
    ];
  } else {
    cols = [
      col(`Our services in ${short(lc.area)}`, loc.services.map((s) => [`/${lc.area.slug}/${s.slug}/`, `${s.name} in ${short(lc.area)}`])),
      col('Other areas we serve', loc.areas.filter((a) => a !== lc.area).map((a) => [`/${a.slug}/`, a.name])),
    ];
  }
  return `<section class="related"><div class="container related__grid">${cols.join('')}</div></section>`;
}

// FAQPage schema from <details><summary>Q</summary>…A…</details> blocks
function faqSchema(html) {
  const text = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const qa = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({
    '@type': 'Question', name: text(m[1]), acceptedAnswer: { '@type': 'Answer', text: text(m[2]) },
  }));
  return qa.length >= 2 ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa } : null;
}

const counts = { areas: 0, combos: 0 };

for (const rel of listPages(pagesDir)) {
  const slug = rel.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  const is404 = slug === '404';
  const url = slug === '' ? '/' : `/${slug}/`;
  const { meta, body } = parsePage(fs.readFileSync(path.join(pagesDir, rel), 'utf8'));
  const lc = locationOf(rel);
  const mainService = serviceBySlug[slug];
  if (lc) counts[lc.service ? 'combos' : 'areas']++;

  let content = body
    .replace('<!-- @cta -->', partials.cta)
    .replace('<!-- @packages -->', partials.packages)
    .replace('<!-- @test-form -->', partials.testForm)
    .replace('<!-- @breadcrumbs -->', lc ? breadcrumbsHtml(lc) : '')
    .replace('<!-- @related -->', lc ? relatedHtml(lc) : mainService ? relatedHtml(null, mainService) : '');

  // Page-level structured data, built after token filling so values are final
  const schemas = [business];
  if (url === '/') schemas.push({ '@context': 'https://schema.org', '@type': 'WebSite', '@id': base + '/#website', name: config.name, url: base + '/', publisher: { '@id': businessId } });
  if (lc) {
    schemas.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems(lc).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: base + it.url })),
    });
  }
  if (lc && lc.service) {
    schemas.push({
      '@context': 'https://schema.org', '@type': 'Service', serviceType: lc.service.schemaName,
      name: `${lc.service.name} in ${lc.area.name}, NM`, url: base + url, provider,
      areaServed: { '@type': 'Place', name: `${lc.area.name}, NM` },
    });
  } else if (mainService) {
    schemas.push({
      '@context': 'https://schema.org', '@type': 'Service', serviceType: mainService.schemaName,
      name: mainService.schemaName, url: base + url, provider,
      areaServed: loc.areas.map((a) => ({ '@type': 'Place', name: `${a.name}, NM` })),
    });
  }

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
    canonical: base + url,
  });

  const faq = faqSchema(html);
  if (faq) schemas.push(faq);
  html = html.replace('{{> schema}}', schemas.map(ldScript).join('\n  '));
  const noindex = is404 || /noindex/i.test(meta.robots || '');
  html = html.replace('{{> robots}}', noindex ? '<meta name="robots" content="noindex, follow">\n  ' : '');

  if (is404) {
    // Vercel serves dist/404.html for unknown URLs; it has no canonical address of its own
    html = html.replace(/\s*<link rel="canonical"[^>]*>/, '').replace(/\s*<meta property="og:url"[^>]*>/, '');
    fs.writeFileSync(path.join(DIST, '404.html'), html);
    continue;
  }
  const outDir = path.join(DIST, slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  if (noindex) continue;

  const hash = crypto.createHash('sha1').update(html).digest('hex');
  if (!lastmod[url] || lastmod[url].hash !== hash) lastmod[url] = { hash, date: today };
  urls.push(url);
}

// sitemap + robots
for (const u of Object.keys(lastmod)) if (!urls.includes(u)) delete lastmod[u];
fs.writeFileSync(LASTMOD_FILE, JSON.stringify(Object.fromEntries(Object.entries(lastmod).sort()), null, 2) + '\n');
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${base}${u}</loc><lastmod>${lastmod[u].date}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`
);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);

const expected = { areas: loc.areas.length, combos: loc.areas.length * loc.services.length };
console.log(`Built ${urls.length} pages → dist/ (area pages ${counts.areas}/${expected.areas}, service+area pages ${counts.combos}/${expected.combos})`);
