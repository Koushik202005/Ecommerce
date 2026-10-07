# White-label commerce storefront

A responsive, multi-tenant storefront and store administration app with a PostgreSQL data layer. Netlify serves the static storefront from `public/` and runs the `/api/*` endpoints as Netlify Functions. The default catalog and brand come from `server/seed-data.json`.

## Deploy from GitHub to Netlify

1. Push this project to a GitHub repository.
2. In Netlify, choose **Add new project → Import an existing project**, select the repository, and authorize the GitHub connection.
3. Use the build settings from `netlify.toml`: build command `npm run build`, publish directory `public`, functions directory `netlify/functions`. Node.js 22 is selected by `.nvmrc`.
4. In Netlify, open **Data & Storage → Database** and create a PostgreSQL database for the site. `@netlify/database` provides the function connection string through `NETLIFY_DB_URL`/`getConnectionString()`.
5. In the site’s environment variables, set:
   - `SESSION_SECRET` — a private random value of at least 32 characters.
   - `ADMIN_EMAIL` — the platform administrator’s sign-in email.
   - `ADMIN_PASSWORD` — a strong administrator password.
   - `DEFAULT_STORE_SLUG` — optional; defaults to `blockhaus`.
   - `PLATFORM_HOST` — optional; defaults to Netlify’s `URL` in deployment.
6. Trigger the first deploy. On the first function request, the app creates the PostgreSQL schema and seeds the sample store. Later pushes to the connected GitHub branch trigger Netlify builds and deploys automatically.

You can use another PostgreSQL provider instead of Netlify Database by setting `DATABASE_URL` in Netlify’s environment variables. Never commit database URLs or production secrets. Netlify environment variables needed by functions must be available to the Functions runtime.

## Local development

Requires Node.js 22.5+ and a PostgreSQL database. Copy `.env.example` to `.env`, set `DATABASE_URL` to your local database, and choose local admin credentials.

```powershell
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:8888](http://localhost:8888). `npm run db:migrate` applies the idempotent schema and creates the sample store/admin if they are missing. `npm run dev` runs the same static-plus-functions routing through Netlify CLI. `npm run dev:server` runs the standalone Node server at port 4173 when you want that local server instead.

## Tenant and administration behavior

The server resolves tenants from `/store/:slug`, registered custom hostnames, configured platform subdomains, and then the default store. Admin sessions use signed HttpOnly cookies. Store-scoped product, cart, checkout, order, customer, branding, settings, and analytics queries are resolved server-side; clients cannot choose a tenant with an arbitrary store ID. The platform admin can create and manage stores from **Admin → Stores**.

Uploaded brand images are stored in PostgreSQL, so they remain available across serverless invocations. The schema is in `server/schema.sql`; it is applied automatically on first use, or with `npm run db:migrate` when `DATABASE_URL` is configured.

## Routes

- `/` — storefront
- `/admin` — store dashboard
- `/admin/products`, `/admin/orders`, `/admin/customers`, `/admin/analytics`
- `/admin/settings/general`, `/admin/settings/branding`, `/admin/settings/domain`
- `/admin/settings/payments`, `/admin/settings/shipping`, `/admin/settings/taxes`
- `/admin/settings/email`, `/admin/settings/seo`, `/admin/settings/social`, `/admin/settings/policies`
- `/admin/stores` — platform-level store management
- `/api/*` and `/store/:slug/api/*` — storefront and admin APIs
- `/robots.txt` and `/sitemap.xml` — store-aware SEO endpoints

## Before accepting live payments

The sample checkout creates a pending preview order and does not charge a payment method. Payment provider settings are adapter placeholders; live card processing, payment webhooks, fulfillment, email delivery, and domain verification require their provider integrations and credentials before launch. Replace the sample product copy, policies, and `server/seed-data.json` with the store’s real catalog and business information.
