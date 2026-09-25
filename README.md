# Soft Water Albuquerque — website

Static marketing site for an Albuquerque, NM water softener installation business.
Its structure is modeled on honestwaterco.com: product pages, 3-tier packages with sale pricing,
free on-site water test, service areas, reviews, FAQ, financing, and free-install + lifetime-warranty messaging throughout.

## Pages
| URL | Source |
|---|---|
| `/` | `src/pages/index.html` — hero + lead form, trust strip, hard-water signs, packages, comparison, how it works, ABQ water, reviews, service areas, FAQ |
| `/water-softeners/` | Softener product page + specs |
| `/whole-home-filtration/` | Carbon / whole-home filtration |
| `/drinking-water/` | Reverse osmosis + alkaline |
| `/packages/` | 3 packages + comparison table |
| `/free-water-test/` | Water test booking form |
| `/service-areas/` | Bernalillo, Sandoval, Valencia/Torrance counties |
| `/reviews/`, `/about/`, `/faq/`, `/financing/`, `/contact/`, `/thank-you/` | |

## Editing
- **Business info & prices:** `site.config.json`. It's all placeholder until you fill it in.
- **Shared header, footer, packages, form, CTA:** `src/partials/`
- **Page content:** `src/pages/*.html`. The comment at the top sets the page `<title>` and meta description.
- **Styles:** `assets/css/styles.css`. Colors are CSS variables at the top.

Search for `PLACEHOLDER` to find content that still needs real info: reviews, owner story, financing partner.

## Build & preview
```bash
npm run build     # outputs dist/
npm start         # build + serve at http://localhost:3000
```
No dependencies.

## Deploying on Vercel
1. Import this repo in Vercel. `vercel.json` already sets the build command (`node build.js`) and output folder (`dist`).
2. Form submissions go to the serverless function `api/lead.js`, which emails each lead through [Resend](https://resend.com) (free tier: 3,000 emails/month).
   In **Project → Settings → Environment Variables**, add:

   | Variable | Example |
   |---|---|
   | `RESEND_API_KEY` | `re_xxxxxxxx` (from Resend → API Keys) |
   | `LEAD_TO_EMAIL` | `you@yourbusiness.com` (comma-separate for several) |
   | `LEAD_FROM_EMAIL` | `Website <leads@yourdomain.com>` (the domain must be verified in Resend) |

3. Redeploy after adding the variables. Until they're set, the form shows a "please call us" error instead of silently losing leads.
