const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { db, closeDatabase } = require('./db');
const { createTenantResolver } = require('./services/tenant');
const { publicBranding, safeColor } = require('./services/branding');
const { DomainVerifier } = require('./services/domain-verifier');
const { paymentProviderFor } = require('./services/payment-provider');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const SERVER_DIR = fs.existsSync(path.join(process.cwd(), 'server')) ? path.join(process.cwd(), 'server') : __dirname;
const seed = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'seed-data.json'), 'utf8'));
const PORT = Number(process.env.PORT || 4173);
const PLATFORM_HOST = process.env.PLATFORM_HOST || process.env.URL || 'localhost';
const DEFAULT_STORE_SLUG = process.env.DEFAULT_STORE_SLUG || seed.store.slug;
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || Boolean(process.env.NETLIFY);
const IS_PRODUCTION = Boolean(process.env.NETLIFY) || process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PRODUCTION ? '' : crypto.randomBytes(32).toString('hex'));
const COOKIE_SECURE = IS_PRODUCTION ? '; Secure' : '';
const SESSION_TTL = 60 * 60 * 8;
const COOKIE_SESSION = 'store_session';
const COOKIE_CART = 'store_cart';
const SETTINGS_SECTIONS = new Set(['homepage', 'general', 'domain', 'payments', 'shipping', 'taxes', 'email', 'seo', 'social', 'policies']);

if (IS_PRODUCTION && (!SESSION_SECRET || SESSION_SECRET.length < 32 || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_EMAIL)) {
  throw new Error('Deployment requires SESSION_SECRET (32+ characters), ADMIN_EMAIL, and ADMIN_PASSWORD environment variables.');
}
const resolveTenant = createTenantResolver(db, { platformHost: PLATFORM_HOST, trustProxy: TRUST_PROXY, defaultSlug: DEFAULT_STORE_SLUG });
const domainVerifier = new DomainVerifier();
let defaultStoreId;
let databaseReady;

const PERMISSIONS = [
  ['platform:stores:manage', 'Create and manage stores'],
  ['settings:manage', 'Manage store settings'],
  ['products:read', 'View products'], ['products:write', 'Manage products'],
  ['inventory:read', 'View inventory'], ['inventory:write', 'Manage inventory'],
  ['orders:read', 'View orders'], ['orders:write', 'Manage orders'],
  ['customers:read', 'View customers'], ['analytics:read', 'View analytics'],
  ['branding:manage', 'Manage store branding'], ['content:manage', 'Manage store content'],
];
const ROLE_GRANTS = {
  SUPER_ADMIN: PERMISSIONS.map(([key]) => key),
  STORE_ADMIN: PERMISSIONS.filter(([key]) => key !== 'platform:stores:manage').map(([key]) => key),
  STORE_MANAGER: ['products:read', 'products:write', 'inventory:read', 'inventory:write', 'orders:read', 'orders:write', 'customers:read', 'analytics:read'],
  STORE_STAFF: ['products:read', 'inventory:read', 'inventory:write', 'orders:read', 'orders:write'],
  CUSTOMER: [],
};

function uuid(prefix = '') { return `${prefix}${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`; }
function jsonParse(value, fallback = {}) { try { return JSON.parse(value || '{}'); } catch { return fallback; } }
function toMinor(value, currency) { return Math.round(Number(value || 0) * Math.pow(10, currencyDigits(currency))); }
function fromMinor(value, currency) { return Number(value || 0) / Math.pow(10, currencyDigits(currency)); }
function currencyDigits(currency) {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits; }
  catch { return 2; }
}
function safeText(value, max = 300) { return String(value ?? '').trim().slice(0, max); }
function slugify(value) { return safeText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48); }
function hashToken(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function makePasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || '').split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function ensureStoreRoles(storeId) {
  for (const roleName of Object.keys(ROLE_GRANTS)) {
    if (roleName === 'SUPER_ADMIN') continue;
    await db.prepare('INSERT OR IGNORE INTO roles(id, store_id, name) VALUES(?,?,?)').run(`role_${storeId}_${roleName.toLowerCase()}`, storeId, roleName);
  }
  await db.prepare('INSERT OR IGNORE INTO roles(id, store_id, name) VALUES(?,?,?)').run('role_global_super_admin', null, 'SUPER_ADMIN');
  for (const [key, description] of PERMISSIONS) await db.prepare('INSERT OR IGNORE INTO permissions(id,key,description) VALUES(?,?,?)').run(`permission_${key.replaceAll(':', '_')}`, key, description);
  const roles = await db.prepare('SELECT id,store_id,name FROM roles WHERE store_id=? OR (store_id IS NULL AND name=?)').all(storeId, 'SUPER_ADMIN');
  for (const role of roles) {
    const grants = ROLE_GRANTS[role.name] || [];
    for (const key of grants) {
      const permissionId = `permission_${key.replaceAll(':', '_')}`;
      await db.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_id) VALUES(?,?)').run(role.id, permissionId);
    }
  }
}

async function seedStore(seed, { demoStore = false } = {}) {
  return db.transaction(async () => {
  const current = await db.prepare('SELECT id FROM stores WHERE slug=?').get(seed.store.slug);
  const storeId = current?.id || seed.store.id || uuid('store_');
  await db.prepare(`INSERT OR IGNORE INTO stores(id,slug,name,description,status,currency,currency_symbol,country,timezone,language,contact_email,contact_phone,business_address)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(storeId, seed.store.slug, seed.store.name, seed.store.description, 'active', seed.store.currency, seed.store.currencySymbol, seed.store.country, seed.store.timezone, seed.store.language, seed.store.contactEmail, seed.store.contactPhone, seed.store.businessAddress);
  const brand = seed.branding || {};
  await db.prepare(`INSERT OR IGNORE INTO store_branding(store_id,logo,favicon,primary_color,secondary_color,accent_color,background_color,text_color,muted_color,border_color,font_family,heading_font,heading_style,body_style,border_radius,button_style,card_style)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(storeId, brand.logo || '', brand.favicon || '', brand.primaryColor || '#536579', brand.secondaryColor || '#25282c', brand.accentColor || '#d8dfd0', brand.backgroundColor || '#f7f6f2', brand.textColor || '#171717', brand.mutedColor || '#75736f', brand.borderColor || '#e1dfd9', brand.fontFamily || 'DM Sans', brand.headingFont || 'Barlow Condensed', brand.headingStyle || 'condensed', brand.bodyStyle || 'modern', Number(brand.borderRadius ?? 4), brand.buttonStyle || 'square', brand.cardStyle || 'editorial');
  for (const domain of seed.domains || []) {
    await db.prepare('INSERT OR IGNORE INTO store_domains(id,store_id,domain,is_primary,verification_status,ssl_status) VALUES(?,?,?,?,?,?)').run(uuid('domain_'), storeId, domain.domain, domain.primary ? 1 : 0, domain.verified ? 'verified' : 'not_configured', domain.verified ? 'active' : 'not_configured');
  }
  for (const category of seed.categories || []) {
    await db.prepare('INSERT OR IGNORE INTO categories(id,store_id,name,slug,description,image_url,sort_order) VALUES(?,?,?,?,?,?,?)').run(category.id, storeId, category.name, category.slug, category.description || '', category.imageUrl || '', category.sortOrder || 0);
  }
  for (const product of seed.products || []) await insertProduct(storeId, seed.store.currency, product);
  for (const banner of seed.banners || []) {
    await db.prepare('INSERT OR IGNORE INTO banners(id,store_id,kind,eyebrow,title,body,image_url,link_url,sort_order) VALUES(?,?,?,?,?,?,?,?,?)').run(banner.id, storeId, banner.kind, banner.eyebrow || '', banner.title, banner.body || '', banner.imageUrl || '', banner.linkUrl || '', banner.sortOrder || 0);
  }
  await db.prepare('INSERT OR IGNORE INTO store_payment_configs(store_id,provider,is_test,public_settings_json) VALUES(?,?,?,?)').run(storeId, seed.settings?.payments?.provider || 'mock', 1, JSON.stringify({ displayName: seed.settings?.payments?.displayName || 'Preview checkout' }));
  await ensureStoreRoles(storeId);
  for (const [section, settings] of Object.entries(seed.settings || {})) {
    await db.prepare('INSERT OR IGNORE INTO store_settings(id,store_id,section,settings_json) VALUES(?,?,?,?)').run(uuid('setting_'), storeId, section, JSON.stringify(settings));
  }
  if (demoStore) await seedDemoUser();
  const seeded = await db.prepare('SELECT id FROM stores WHERE slug=?').get(seed.store.slug);
  if (!seeded) throw new Error(`Unable to initialize the default store "${seed.store.slug}".`);
  return seeded.id;
  });
}

async function insertProduct(storeId, currency, product) {
  const existing = await db.prepare('SELECT id FROM products WHERE store_id=? AND sku=?').get(storeId, product.sku);
  const productId = existing?.id || product.id || uuid('product_');
  if (!existing) {
    const minor = toMinor(product.price, currency);
    const compareMinor = product.compareAt == null ? null : toMinor(product.compareAt, currency);
    await db.prepare(`INSERT INTO products(id,store_id,category_id,name,slug,sku,description,price_minor,compare_at_minor,currency,image_url,secondary_image_url,badge,featured,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(productId, storeId, product.categoryId || null, product.name, product.slug, product.sku, product.description || '', minor, compareMinor, currency, product.imageUrl || '', product.secondaryImageUrl || '', product.badge || '', product.featured ? 1 : 0, 'active');
  }
  if (!await db.prepare('SELECT 1 FROM product_images WHERE store_id=? AND product_id=? LIMIT 1').get(storeId, productId)) await db.prepare('INSERT INTO product_images(id,store_id,product_id,image_url,alt_text,sort_order) VALUES(?,?,?,?,?,?)').run(uuid('image_'), storeId, productId, product.imageUrl || '', product.name, 0);
  const sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ['One size'];
  for (const size of sizes) {
    const sku = `${product.sku}-${String(size).replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`;
    await db.prepare('INSERT OR IGNORE INTO product_variants(id,store_id,product_id,sku,name,options_json) VALUES(?,?,?,?,?,?)').run(uuid('variant_'), storeId, productId, sku, size, JSON.stringify({ size }));
    const variant = await db.prepare('SELECT id FROM product_variants WHERE store_id=? AND sku=?').get(storeId, sku);
    await db.prepare('INSERT OR IGNORE INTO inventory(id,store_id,variant_id,quantity) VALUES(?,?,?,?)').run(uuid('inventory_'), storeId, variant.id, 18);
  }
  return productId;
}

async function seedDemoUser() {
  const email = (process.env.ADMIN_EMAIL || 'platform@localhost').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'preview-only';
  await db.prepare(`INSERT INTO users(id,store_id,email,display_name,password_hash,role)
    VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,active=1`)
    .run('user_platform_admin', null, email, 'Platform admin', makePasswordHash(password), 'SUPER_ADMIN');
}

function ensureDatabase() {
  if (!databaseReady) {
    databaseReady = db.transaction(async () => {
      // Serialize cold starts so function instances don't race during setup.
      await db.prepare("SELECT pg_advisory_xact_lock(hashtext('white-label-store-schema'))").get();
      await db.exec(fs.readFileSync(path.join(SERVER_DIR, 'schema.sql'), 'utf8'));
      defaultStoreId = await seedStore(seed, { demoStore: true });
    }).catch(error => { databaseReady = null; throw error; });
  }
  return databaseReady;
}

function apiStore(store) {
  return {
    id: store.id, slug: store.slug, name: store.name, description: store.description,
    currency: store.currency, country: store.country, timezone: store.timezone, language: store.language,
    contactEmail: store.contact_email, contactPhone: store.contact_phone,
    businessAddress: store.business_address, status: store.status,
  };
}
async function settingsFor(storeId) {
  const rows = await db.prepare('SELECT section,settings_json FROM store_settings WHERE store_id=?').all(storeId);
  return Object.fromEntries(rows.map(row => [row.section, jsonParse(row.settings_json)]));
}
async function variantsFor(storeId, productId) {
  const rows = await db.prepare(`SELECT v.id,v.sku,v.name,v.options_json,COALESCE(i.quantity,0)-COALESCE(i.reserved,0) AS available
    FROM product_variants v LEFT JOIN inventory i ON i.store_id=v.store_id AND i.variant_id=v.id
    WHERE v.store_id=? AND v.product_id=? AND v.active=1 ORDER BY v.name`).all(storeId, productId);
  return rows.map(v => ({ ...v, options: jsonParse(v.options_json) }));
}
async function productForApi(row) {
  const storeName = (await db.prepare('SELECT name FROM stores WHERE id=?').get(row.store_id))?.name || '';
  return {
    id: row.id, categoryId: row.category_id, name: row.name, slug: row.slug,
    sku: row.sku, description: row.description, priceMinor: row.price_minor, compareAtMinor: row.compare_at_minor,
    currency: row.currency, imageUrl: row.image_url, secondaryImageUrl: row.secondary_image_url,
    badge: row.badge, featured: Boolean(row.featured), status: row.status,
    seoTitle: row.seo_title || `${row.name} — ${storeName}`,
    seoDescription: row.seo_description || row.description || `${row.name} from ${storeName}.`,
    variants: await variantsFor(row.store_id, row.id),
  };
}
async function listProducts(storeId, { includeDrafts = false } = {}) {
  const rows = includeDrafts
    ? await db.prepare('SELECT * FROM products WHERE store_id=? ORDER BY created_at DESC').all(storeId)
    : await db.prepare('SELECT * FROM products WHERE store_id=? AND status=? ORDER BY featured DESC, created_at DESC').all(storeId, 'active');
  return Promise.all(rows.map(productForApi));
}
async function getStoreBranding(storeId) { return publicBranding(await db.prepare('SELECT * FROM store_branding WHERE store_id=?').get(storeId)); }
function mapBanner(row) { return { id: row.id, kind: row.kind, eyebrow: row.eyebrow, title: row.title, body: row.body, imageUrl: row.image_url, linkUrl: row.link_url }; }
async function getPublicSettings(storeId) {
  const settings = await settingsFor(storeId);
  const payments = settings.payments || {};
  // Credentials are never returned to the storefront or admin JSON response.
  settings.payments = { provider: payments.provider || 'mock', testMode: payments.testMode !== false, displayName: payments.displayName || 'Secure checkout', configured: Boolean(payments.configured) };
  return settings;
}

function sendJSON(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', ...headers });
  res.end(body);
}
function sendText(res, status, content, mime) {
  res.writeHead(status, { 'content-type': mime, 'content-length': Buffer.byteLength(content), 'cache-control': 'public, max-age=300' });
  res.end(content);
}
function xmlEscape(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[ch])); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let content = '';
    req.on('data', chunk => { content += chunk; if (content.length > 4_000_000) { reject(Object.assign(new Error('Request too large.'), { statusCode: 413 })); req.destroy(); } });
    req.on('end', () => {
      if (!content) return resolve({});
      try { resolve(JSON.parse(content)); } catch { reject(Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('='); return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}
function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}
async function readSession(req) {
  if (!SESSION_SECRET) return null;
  const token = cookies(req)[COOKIE_SESSION];
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest();
  let provided;
  try { provided = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now() / 1000) return null;
    const user = await db.prepare('SELECT id,store_id,email,display_name,role,active FROM users WHERE id=? AND active=1').get(payload.sub);
    return user || null;
  } catch { return null; }
}
function sessionCookie(user) {
  const token = signSession({ sub: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_TTL });
  return `${COOKIE_SESSION}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}${COOKIE_SECURE}`;
}
function setCartCookie(token) { return `${COOKIE_CART}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${COOKIE_SECURE}`; }
function clearSessionCookie() { return `${COOKIE_SESSION}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${COOKIE_SECURE}`; }
function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let source;
  try { source = new URL(origin); } catch { throw Object.assign(new Error('Request origin is invalid.'), { statusCode: 403 }); }
  const host = String(req.headers.host || '').toLowerCase();
  if (source.host.toLowerCase() !== host) throw Object.assign(new Error('Cross-origin request rejected.'), { statusCode: 403 });
}
async function requireSession(req) {
  assertSameOrigin(req);
  const user = await readSession(req);
  if (!user) throw Object.assign(new Error('Sign in to continue.'), { statusCode: 401 });
  return user;
}
async function requirePermission(user, storeId, key) {
  if (!user || user.role === 'CUSTOMER') throw Object.assign(new Error('You do not have access to this area.'), { statusCode: 403 });
  if (user.role !== 'SUPER_ADMIN' && user.store_id !== storeId) throw Object.assign(new Error('Store access denied.'), { statusCode: 403 });
  const role = user.role === 'SUPER_ADMIN'
    ? await db.prepare('SELECT id FROM roles WHERE store_id IS NULL AND name=?').get(user.role)
    : await db.prepare('SELECT id FROM roles WHERE store_id=? AND name=?').get(storeId, user.role);
  if (!role) throw Object.assign(new Error('This role is not configured for the store.'), { statusCode: 403 });
  const permission = await db.prepare('SELECT 1 AS granted FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=? AND p.key=?').get(role.id, key);
  if (!permission) throw Object.assign(new Error('This role cannot perform that action.'), { statusCode: 403 });
}
async function requirePlatformAdmin(user) {
  if (user.role !== 'SUPER_ADMIN') throw Object.assign(new Error('Platform administrator access is required.'), { statusCode: 403 });
  await requirePermission(user, defaultStoreId, 'platform:stores:manage');
}
async function adminStore(req, user) {
  if (user.role === 'SUPER_ADMIN' && req.headers['x-platform-store']) {
    const selector = safeText(req.headers['x-platform-store'], 120);
    const store = await db.prepare('SELECT * FROM stores WHERE id=? OR slug=? LIMIT 1').get(selector, selector);
    if (!store) throw Object.assign(new Error('Store not found.'), { statusCode: 404 });
    return store;
  }
  const resolved = await resolveTenant(req);
  if (!resolved) throw Object.assign(new Error('No store matches this domain.'), { statusCode: 404 });
  if (user.role !== 'SUPER_ADMIN' && user.store_id !== resolved.id) throw Object.assign(new Error('Store access denied.'), { statusCode: 403 });
  return resolved;
}
async function recordActivity(storeId, userId, action, resourceType, resourceId = '', details = {}) {
  await db.prepare('INSERT INTO admin_activity_logs(id,store_id,actor_user_id,action,resource_type,resource_id,details_json) VALUES(?,?,?,?,?,?,?)').run(uuid('activity_'), storeId, userId, action, resourceType, resourceId, JSON.stringify(details));
}
async function getCart(storeId, req, res) {
  let token = cookies(req)[COOKIE_CART];
  if (!token || !/^[a-f0-9]{48,80}$/i.test(token)) token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  let cart = await db.prepare('SELECT * FROM carts WHERE store_id=? AND token_hash=?').get(storeId, tokenHash);
  if (!cart) {
    const store = await db.prepare('SELECT currency FROM stores WHERE id=?').get(storeId);
    cart = { id: uuid('cart_'), store_id: storeId, currency: store.currency };
    await db.prepare('INSERT INTO carts(id,store_id,token_hash,currency) VALUES(?,?,?,?)').run(cart.id, storeId, tokenHash, store.currency);
  }
  res.setHeader('set-cookie', setCartCookie(token));
  return cart;
}
async function cartSummary(storeId, cartId) {
  const store = await db.prepare('SELECT currency FROM stores WHERE id=?').get(storeId);
  const settings = await settingsFor(storeId);
  const tax = settings.taxes || {};
  const shipping = settings.shipping || {};
  const items = await db.prepare(`SELECT ci.id AS cart_item_id,ci.quantity,p.*,v.name AS variant_name,v.sku AS variant_sku,
      COALESCE(v.price_minor,p.price_minor) AS unit_price_minor,COALESCE(i.quantity,0)-COALESCE(i.reserved,0) AS available
    FROM cart_items ci JOIN products p ON p.store_id=ci.store_id AND p.id=ci.product_id
    JOIN product_variants v ON v.store_id=ci.store_id AND v.id=ci.variant_id
    LEFT JOIN inventory i ON i.store_id=v.store_id AND i.variant_id=v.id
    WHERE ci.store_id=? AND ci.cart_id=? ORDER BY ci.created_at`).all(storeId, cartId);
  const subtotalMinor = items.reduce((sum, item) => sum + item.unit_price_minor * item.quantity, 0);
  const rate = Number(tax.percentage || 0);
  const taxMinor = tax.enabled ? Math.round(subtotalMinor * (tax.pricesIncludeTax ? rate / (100 + rate) : rate / 100)) : 0;
  const freeThreshold = toMinor(shipping.freeShippingThreshold || 0, store.currency);
  const shippingMinor = !subtotalMinor || (freeThreshold > 0 && subtotalMinor >= freeThreshold) ? 0 : toMinor(shipping.flatRate || 0, store.currency);
  return {
    currency: store.currency, subtotalMinor, taxMinor, shippingMinor,
    totalMinor: subtotalMinor + (tax.pricesIncludeTax ? 0 : taxMinor) + shippingMinor,
    items: items.map(item => ({ id: item.cart_item_id, productId: item.id, variantId: item.variant_id, name: item.name, slug: item.slug, imageUrl: item.image_url, variantName: item.variant_name, sku: item.variant_sku, quantity: item.quantity, available: item.available, unitPriceMinor: item.unit_price_minor, lineTotalMinor: item.unit_price_minor * item.quantity })),
    shippingMessage: shipping.freeShippingThreshold ? `Free shipping over ${shipping.freeShippingThreshold}` : '',
  };
}

function parsePath(req) { return new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
async function createStoreWithDefaults(userId, body) {
  const name = safeText(body.name, 80);
  const slug = slugify(body.slug || name);
  if (!name || !slug) throw Object.assign(new Error('Enter a store name and a valid slug.'), { statusCode: 400 });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw Object.assign(new Error('Store slug must use lowercase letters, numbers, and hyphens.'), { statusCode: 400 });
  if (await db.prepare('SELECT 1 FROM stores WHERE slug=?').get(slug)) throw Object.assign(new Error('That store slug is already in use.'), { statusCode: 409 });
  const id = uuid('store_');
  const currency = safeText(body.currency, 3).toUpperCase();
  const country = safeText(body.country, 2).toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) throw Object.assign(new Error('Choose a country using its two-letter ISO code.'), { statusCode: 400 });
  try { new Intl.NumberFormat('en', { style: 'currency', currency }); } catch { throw Object.assign(new Error('Enter a supported ISO currency code.'), { statusCode: 400 }); }
  if (!currency) throw Object.assign(new Error('Choose a currency for this store.'), { statusCode: 400 });
  const platformDomain = String(PLATFORM_HOST).replace(/^\w+:\/\//, '').split('/')[0];
  return db.transaction(async () => {
    await db.prepare(`INSERT INTO stores(id,slug,name,description,status,currency,currency_symbol,country,timezone,language,contact_email,contact_phone,business_address)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, slug, name, safeText(body.description || '', 300), 'active', currency, new Intl.NumberFormat('en', { style: 'currency', currency }).formatToParts(0).find(part => part.type === 'currency')?.value || currency, country, safeText(body.timezone || 'UTC', 64), safeText(body.language || 'en', 8), '', '', '');
    await db.prepare(`INSERT INTO store_branding(store_id,primary_color,secondary_color,accent_color,background_color,text_color,font_family,heading_font,border_radius,button_style,card_style)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, '#536579', '#25282c', '#d8dfd0', '#f7f6f2', '#171717', 'DM Sans', 'Barlow Condensed', 4, 'square', 'editorial');
    const general = { storeName: name, slug, description: safeText(body.description || '', 300), currency, currencySymbol: new Intl.NumberFormat('en', { style: 'currency', currency }).formatToParts(0).find(part => part.type === 'currency')?.value || currency, country, timezone: safeText(body.timezone || 'UTC', 64), language: safeText(body.language || 'en', 8), contactEmail: '', contactPhone: '', businessAddress: '' };
    const defaults = {
      homepage: { announcement: '', heroEyebrow: 'NEW SEASON', heroTitle: name, heroBody: safeText(body.description || '', 300), heroImageUrl: '', heroLinkText: 'Shop the collection', collectionEyebrow: 'THE LATEST COLLECTION', collectionTitle: 'NEW\nCOLLECTION', collectionBody: '', collectionImageUrl: '' },
      general, domain: { primaryDomain: `${slug}.${platformDomain}`, customDomain: '', subdomain: slug, verificationStatus: 'not_configured', sslStatus: 'not_configured' },
      payments: { provider: 'mock', testMode: true, displayName: 'Preview checkout', configured: false },
      shipping: { freeShippingThreshold: 100, flatRate: 8, deliveryEstimate: '3–5 business days', localPickup: false, zones: [] },
      taxes: { taxName: 'Sales tax', percentage: 0, pricesIncludeTax: false, enabled: false },
      email: { senderName: name, senderEmail: '', replyTo: '', provider: 'not_configured' },
      seo: { metaTitle: name, metaDescription: safeText(body.description || '', 300), openGraphImage: '', robots: 'index,follow', sitemapEnabled: true, canonicalDomain: '' },
      social: { instagram: '', tiktok: '', facebook: '', x: '' },
      policies: { about: '', privacy: '', terms: '', refund: '', shipping: '' },
    };
    for (const [section, settings] of Object.entries(defaults)) await db.prepare('INSERT INTO store_settings(id,store_id,section,settings_json) VALUES(?,?,?,?)').run(uuid('setting_'), id, section, JSON.stringify(settings));
    await db.prepare('INSERT INTO store_domains(id,store_id,domain,is_primary,verification_status,ssl_status) VALUES(?,?,?,?,?,?)').run(uuid('domain_'), id, `${slug}.${platformDomain}`, 1, 'not_configured', 'not_configured');
    await db.prepare('INSERT INTO store_payment_configs(store_id,provider,is_test,public_settings_json) VALUES(?,?,?,?)').run(id, 'mock', 1, JSON.stringify({ displayName: 'Preview checkout' }));
    await ensureStoreRoles(id);
    await recordActivity(null, userId, 'store.created', 'store', id, { slug });
    return db.prepare('SELECT * FROM stores WHERE id=?').get(id);
  });
}

async function updateStoreSettings(storeId, section, incoming, userId) {
  if (!SETTINGS_SECTIONS.has(section)) throw Object.assign(new Error('Unknown settings section.'), { statusCode: 404 });
  const current = (await settingsFor(storeId))[section] || {};
  const clean = { ...current };
  const allowedFields = {
    homepage: ['announcement','heroEyebrow','heroTitle','heroBody','heroImageUrl','heroLinkText','collectionEyebrow','collectionTitle','collectionBody','collectionImageUrl'],
    general: ['storeName','description','currency','country','timezone','language','contactEmail','contactPhone','businessAddress'],
    domain: ['customDomain'],
    payments: ['provider','testMode','displayName'],
    shipping: ['freeShippingThreshold','flatRate','deliveryEstimate','localPickup'],
    taxes: ['taxName','percentage','pricesIncludeTax','enabled'],
    email: ['senderName','senderEmail','replyTo','provider'],
    seo: ['metaTitle','metaDescription','openGraphImage','robots','sitemapEnabled','canonicalDomain'],
    social: ['instagram','tiktok','facebook','x'],
    policies: ['about','privacy','terms','refund','shipping'],
  }[section];
  for (const key of allowedFields) if (Object.hasOwn(incoming, key)) clean[key] = incoming[key];
  if (section === 'general') {
    clean.storeName = safeText(clean.storeName, 80);
    if (!clean.storeName) throw Object.assign(new Error('Store name is required.'), { statusCode: 400 });
    clean.description = safeText(clean.description, 300);
    clean.country = safeText(clean.country, 2).toUpperCase();
    clean.language = safeText(clean.language, 8);
    clean.currency = safeText(clean.currency, 3).toUpperCase();
    try { new Intl.NumberFormat('en', { style: 'currency', currency: clean.currency }); } catch { throw Object.assign(new Error('Enter a supported ISO currency code.'), { statusCode: 400 }); }
    clean.contactEmail = safeText(clean.contactEmail, 180);
    clean.contactPhone = safeText(clean.contactPhone, 48);
    clean.businessAddress = safeText(clean.businessAddress, 300);
    const symbol = new Intl.NumberFormat('en', { style: 'currency', currency: clean.currency }).formatToParts(0).find(part => part.type === 'currency')?.value || clean.currency;
    const existing = await db.prepare('SELECT currency FROM stores WHERE id=?').get(storeId);
    await db.prepare('UPDATE stores SET name=?,description=?,currency=?,currency_symbol=?,country=?,timezone=?,language=?,contact_email=?,contact_phone=?,business_address=? WHERE id=?').run(clean.storeName, clean.description, clean.currency, symbol, clean.country, safeText(clean.timezone, 64), clean.language, clean.contactEmail, clean.contactPhone, clean.businessAddress, storeId);
    if (existing.currency !== clean.currency) await db.prepare('UPDATE products SET currency=? WHERE store_id=?').run(clean.currency, storeId);
    clean.currencySymbol = symbol;
  }
  if (section === 'homepage') {
    for (const key of ['announcement','heroEyebrow','heroTitle','heroBody','heroLinkText','collectionEyebrow','collectionTitle','collectionBody']) clean[key] = safeText(clean[key], key.includes('Title') || key === 'heroBody' || key === 'collectionBody' ? 600 : 180);
    for (const key of ['heroImageUrl','collectionImageUrl']) {
      const value = String(clean[key] || '').trim();
      if (value && !/^(https:\/\/|\/(?:store\/[a-z0-9-]+\/)?api\/assets\/)/i.test(value)) throw Object.assign(new Error('Use an HTTPS image URL or an uploaded store image.'), { statusCode: 400 });
      clean[key] = safeText(value, 1000);
    }
  }
  if (section === 'domain') {
    const customDomain = String(clean.customDomain || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (customDomain && !/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(customDomain)) throw Object.assign(new Error('Enter a valid custom domain.'), { statusCode: 400 });
    if (customDomain) {
      const occupied = await db.prepare('SELECT store_id FROM store_domains WHERE lower(domain)=? AND store_id<>?').get(customDomain, storeId);
      if (occupied) throw Object.assign(new Error('That domain is connected to another store.'), { statusCode: 409 });
      await db.prepare(`INSERT INTO store_domains(id,store_id,domain,is_primary,verification_status,ssl_status) VALUES(?,?,?,?,?,?)
        ON CONFLICT(store_id,domain) DO UPDATE SET is_primary=0`).run(uuid('domain_'), storeId, customDomain, 0, 'pending', 'pending');
      clean.customDomain = customDomain;
      clean.verificationStatus = 'pending';
      clean.sslStatus = 'pending';
    } else if (current.customDomain) {
      await db.prepare('DELETE FROM store_domains WHERE store_id=? AND lower(domain)=? AND is_primary=0').run(storeId, String(current.customDomain).toLowerCase());
      clean.customDomain = '';
      clean.verificationStatus = 'not_configured';
      clean.sslStatus = 'not_configured';
    }
  }
  if (section === 'payments') {
    if (!['mock','stripe','razorpay'].includes(clean.provider)) throw Object.assign(new Error('Choose a supported provider.'), { statusCode: 400 });
    clean.testMode = Boolean(clean.testMode);
    clean.displayName = safeText(clean.displayName || 'Secure checkout', 80);
    clean.configured = clean.provider === 'mock';
    await db.prepare('UPDATE store_payment_configs SET provider=?,is_test=?,public_settings_json=? WHERE store_id=?').run(clean.provider, clean.testMode ? 1 : 0, JSON.stringify({ displayName: clean.displayName }), storeId);
  }
  if (section === 'shipping') {
    clean.flatRate = Math.max(0, Number(clean.flatRate) || 0);
    clean.freeShippingThreshold = Math.max(0, Number(clean.freeShippingThreshold) || 0);
    clean.deliveryEstimate = safeText(clean.deliveryEstimate, 80);
    clean.localPickup = Boolean(clean.localPickup);
  }
  if (section === 'taxes') {
    clean.taxName = safeText(clean.taxName || 'Tax', 60);
    clean.percentage = Math.max(0, Math.min(100, Number(clean.percentage) || 0));
    clean.enabled = Boolean(clean.enabled);
    clean.pricesIncludeTax = Boolean(clean.pricesIncludeTax);
  }
  if (section === 'seo') {
    clean.metaTitle = safeText(clean.metaTitle, 120); clean.metaDescription = safeText(clean.metaDescription, 320);
    clean.robots = ['index,follow','noindex,nofollow','index,nofollow','noindex,follow'].includes(clean.robots) ? clean.robots : 'index,follow';
    clean.sitemapEnabled = Boolean(clean.sitemapEnabled);
    const image = String(clean.openGraphImage || '').trim();
    if (image && !/^(https:\/\/|\/(?:store\/[a-z0-9-]+\/)?api\/assets\/)/i.test(image)) throw Object.assign(new Error('Use an HTTPS image URL or an uploaded store image.'), { statusCode: 400 });
    clean.openGraphImage = safeText(image, 1000);
    const canonical = String(clean.canonicalDomain || '').trim();
    if (canonical) {
      try {
        const parsed = new URL(canonical.includes('://') ? canonical : `https://${canonical}`);
        if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid');
        clean.canonicalDomain = parsed.origin;
      } catch { throw Object.assign(new Error('Enter a valid canonical domain.'), { statusCode: 400 }); }
    }
  }
  if (section === 'email') { clean.senderName = safeText(clean.senderName, 80); clean.senderEmail = safeText(clean.senderEmail, 180); clean.replyTo = safeText(clean.replyTo, 180); }
  if (section === 'social') for (const key of ['instagram','tiktok','facebook','x']) clean[key] = safeText(clean[key], 250);
  if (section === 'policies') for (const key of ['about','privacy','terms','refund','shipping']) clean[key] = safeText(clean[key], 6000);
  await db.prepare(`INSERT INTO store_settings(id,store_id,section,settings_json,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(store_id,section) DO UPDATE SET settings_json=excluded.settings_json,updated_at=CURRENT_TIMESTAMP`).run(uuid('setting_'), storeId, section, JSON.stringify(clean));
  await recordActivity(storeId, userId, 'settings.updated', section, section);
  return clean;
}

async function updateBranding(storeId, incoming, userId) {
  const currentRow = await db.prepare('SELECT * FROM store_branding WHERE store_id=?').get(storeId);
  const current = publicBranding(currentRow);
  const clean = { ...current };
  for (const key of ['logo','favicon','headingStyle','bodyStyle','buttonStyle','cardStyle']) if (Object.hasOwn(incoming, key)) clean[key] = safeText(incoming[key], 250);
  if (Object.hasOwn(incoming, 'fontFamily')) clean.fontFamily = ['DM Sans','Arial','Georgia','system-ui'].includes(incoming.fontFamily) ? incoming.fontFamily : 'DM Sans';
  if (Object.hasOwn(incoming, 'headingFont')) clean.headingFont = ['Barlow Condensed','DM Sans','Georgia','Arial'].includes(incoming.headingFont) ? incoming.headingFont : 'Barlow Condensed';
  const colorFallbacks = { primaryColor: '#536579', secondaryColor: '#25282c', accentColor: '#d8dfd0', backgroundColor: '#f7f6f2', textColor: '#171717', mutedColor: '#75736f', borderColor: '#e1dfd9' };
  for (const [key, fallback] of Object.entries(colorFallbacks)) if (Object.hasOwn(incoming, key)) clean[key] = safeColor(incoming[key], fallback);
  clean.borderRadius = Math.max(0, Math.min(28, Number(incoming.borderRadius ?? clean.borderRadius) || 0));
  const store = await db.prepare('SELECT name,description FROM stores WHERE id=?').get(storeId);
  const name = Object.hasOwn(incoming, 'storeName') ? safeText(incoming.storeName, 80) : store.name;
  const description = Object.hasOwn(incoming, 'description') ? safeText(incoming.description, 300) : store.description;
  if (!name) throw Object.assign(new Error('Store name is required.'), { statusCode: 400 });
  await db.prepare(`UPDATE store_branding SET logo=?,favicon=?,primary_color=?,secondary_color=?,accent_color=?,background_color=?,text_color=?,muted_color=?,border_color=?,font_family=?,heading_font=?,heading_style=?,body_style=?,border_radius=?,button_style=?,card_style=?,updated_at=CURRENT_TIMESTAMP WHERE store_id=?`).run(
    clean.logo, clean.favicon, clean.primaryColor, clean.secondaryColor, clean.accentColor, clean.backgroundColor, clean.textColor, clean.mutedColor, clean.borderColor, clean.fontFamily, clean.headingFont, clean.headingStyle, clean.bodyStyle, clean.borderRadius, clean.buttonStyle, clean.cardStyle, storeId,
  );
  await db.prepare('UPDATE stores SET name=?,description=? WHERE id=?').run(name, description, storeId);
  const settings = (await settingsFor(storeId)).general || {};
  settings.storeName = name; settings.description = description;
  await db.prepare(`INSERT INTO store_settings(id,store_id,section,settings_json) VALUES(?,?,?,?)
    ON CONFLICT(store_id,section) DO UPDATE SET settings_json=excluded.settings_json,updated_at=CURRENT_TIMESTAMP`).run(uuid('setting_'), storeId, 'general', JSON.stringify(settings));
  await recordActivity(storeId, userId, 'branding.updated', 'branding', storeId);
  return { ...clean, storeName: name, description };
}

async function saveStoreImage(storeId, userId, input) {
  const mime = safeText(input.mimeType, 40).toLowerCase();
  const allowed = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
  if (!allowed[mime]) throw Object.assign(new Error('Use a PNG, JPEG, or WebP image.'), { statusCode: 400 });
  const encoded = String(input.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!encoded || encoded.length > 3_000_000) throw Object.assign(new Error('Choose an image smaller than 2 MB.'), { statusCode: 413 });
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length > 2 * 1024 * 1024) throw Object.assign(new Error('Choose an image smaller than 2 MB.'), { statusCode: 413 });
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if ((mime === 'image/png' && !isPng) || (mime === 'image/jpeg' && !isJpeg) || (mime === 'image/webp' && !isWebp)) throw Object.assign(new Error('The image file does not match its format.'), { statusCode: 400 });
  const assetId = uuid('asset_');
  await db.prepare('INSERT INTO store_assets(id,store_id,content_type,content) VALUES(?,?,?,?)').run(assetId, storeId, mime, buffer);
  await recordActivity(storeId, userId, 'branding.asset_uploaded', 'asset', assetId, { mimeType: mime, bytes: buffer.length });
  const store = await db.prepare('SELECT slug FROM stores WHERE id=?').get(storeId);
  return `/store/${encodeURIComponent(store.slug)}/api/assets/${encodeURIComponent(assetId)}`;
}

async function orderSummary(storeId) {
  const orders = await db.prepare('SELECT * FROM orders WHERE store_id=? ORDER BY created_at DESC LIMIT 8').all(storeId);
  return orders.map(order => ({ id: order.id, orderNumber: order.order_number, customerName: order.customer_name, email: order.customer_email, status: order.status, currency: order.currency, totalMinor: order.total_minor, createdAt: order.created_at }));
}
async function dashboardData(store) {
  const storeId = store.id;
  const [revenue, orders, products, customers, pendingOrders, branding, recentOrders, catalog] = await Promise.all([
    db.prepare("SELECT COALESCE(SUM(total_minor),0)::int AS amount FROM orders WHERE store_id=? AND status NOT IN ('cancelled','refunded')").get(storeId),
    db.prepare('SELECT COUNT(*)::int AS count FROM orders WHERE store_id=?').get(storeId),
    db.prepare("SELECT COUNT(*)::int AS count FROM products WHERE store_id=? AND status='active'").get(storeId),
    db.prepare('SELECT COUNT(*)::int AS count FROM customers WHERE store_id=?').get(storeId),
    db.prepare("SELECT COUNT(*)::int AS count FROM orders WHERE store_id=? AND status IN ('pending','pending_payment')").get(storeId),
    getStoreBranding(storeId), orderSummary(storeId), listProducts(storeId, { includeDrafts: true }),
  ]);
  const stats = { revenueMinor: Number(revenue.amount), orderCount: Number(orders.count), productCount: Number(products.count), customerCount: Number(customers.count), pendingOrders: Number(pendingOrders.count) };
  return { store: apiStore(store), branding, stats, orders: recentOrders, products: catalog.slice(0, 6) };
}

async function handleStorefront(req, res, tenant) {
  if (!tenant) return sendJSON(res, 404, { error: 'Store not found for this domain.' });
  const storeId = tenant.id;
  const categoryRows = await db.prepare('SELECT id,name,slug,description,image_url AS "imageUrl",seo_title AS "seoTitle",seo_description AS "seoDescription" FROM categories WHERE store_id=? ORDER BY sort_order,name').all(storeId);
  const categories = categoryRows.map(category => ({ ...category, seoTitle: category.seoTitle || `${category.name} — ${tenant.name}`, seoDescription: category.seoDescription || category.description || `Shop ${category.name} from ${tenant.name}.` }));
  const banners = (await db.prepare('SELECT * FROM banners WHERE store_id=? AND active=1 ORDER BY sort_order').all(storeId)).map(mapBanner);
  const [products, store, settings, branding] = await Promise.all([listProducts(storeId), Promise.resolve(apiStore(tenant)), getPublicSettings(storeId), getStoreBranding(storeId)]);
  const seo = settings.seo || {};
  return sendJSON(res, 200, {
    store, branding, settings, categories, banners, products,
    seo: { title: seo.metaTitle || store.name, description: seo.metaDescription || store.description, robots: seo.robots || 'index,follow', canonicalDomain: seo.canonicalDomain || '' },
    trust: { shipping: 'Free delivery over your store threshold', payment: settings.payments.displayName, returns: '14 day returns', support: store.contactEmail },
  });
}

async function serveStoreSeo(req, res, tenant, pathname) {
  if (!tenant) return sendJSON(res, 404, { error: 'Store not found for this domain.' });
  const settings = await settingsFor(tenant.id);
  const seo = settings.seo || {};
  const domain = settings.domain || {};
  const forwardedProto = (TRUST_PROXY || IS_PRODUCTION) && req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0] : (IS_PRODUCTION ? 'https' : 'http');
  const requestOrigin = `${forwardedProto}://${String(req.headers.host || 'localhost').split(',')[0]}`;
  const configured = seo.canonicalDomain || domain.customDomain || domain.primaryDomain;
  let origin = requestOrigin;
  if (configured) {
    try { origin = new URL(configured.includes('://') ? configured : `https://${configured}`).origin; } catch {}
  }
  const storePath = pathname.match(/^\/store\/[a-z0-9-]+/i)?.[0] || '';
  if (pathname.endsWith('/robots.txt')) {
    const hidden = String(seo.robots || 'index,follow').startsWith('noindex');
    const sitemap = seo.sitemapEnabled === false ? '' : `\nSitemap: ${origin}${storePath}/sitemap.xml`;
    return sendText(res, 200, `User-agent: *\n${hidden ? 'Disallow: /' : 'Allow: /'}${sitemap}\n`, 'text/plain; charset=utf-8');
  }
  if (pathname.endsWith('/sitemap.xml')) {
    if (seo.sitemapEnabled === false || String(seo.robots || '').startsWith('noindex')) return sendText(res, 404, 'Sitemap is disabled for this store.\n', 'text/plain; charset=utf-8');
    const products = await db.prepare('SELECT slug FROM products WHERE store_id=? AND status=? ORDER BY created_at DESC').all(tenant.id, 'active');
    const categories = await db.prepare('SELECT slug FROM categories WHERE store_id=? ORDER BY sort_order').all(tenant.id);
    const routes = [storePath || '/', ...categories.map(item => `${storePath}/collections/${encodeURIComponent(item.slug)}`), ...products.map(item => `${storePath}/products/${encodeURIComponent(item.slug)}`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route => `<url><loc>${xmlEscape(`${origin}${route}`)}</loc></url>`).join('')}</urlset>`;
    return sendText(res, 200, xml, 'application/xml; charset=utf-8');
  }
}

async function routeApi(req, res) {
  const url = parsePath(req);
  const pathname = url.pathname.replace(/^\/store\/[a-z0-9-]+(?=\/api\/)/i, '');
  const method = req.method || 'GET';
  const tenant = await resolveTenant(req);
  const route = `${method} ${pathname}`;

  if (route === 'GET /api/storefront') return await handleStorefront(req, res, tenant);
  if (route === 'GET /api/auth/session' || route === 'GET /api/admin/session') {
    const user = await readSession(req);
    return sendJSON(res, 200, { user: user ? { id: user.id, email: user.email, name: user.display_name, role: user.role, storeId: user.store_id } : null, demoMode: !IS_PRODUCTION });
  }
  if (route === 'POST /api/admin/session/demo') {
    if (IS_PRODUCTION) return sendJSON(res, 404, { error: 'Not found.' });
    assertSameOrigin(req);
    const user = await db.prepare('SELECT id,store_id,email,display_name,role,active FROM users WHERE role=? AND store_id IS NULL AND active=1 LIMIT 1').get('SUPER_ADMIN');
    if (!user) return sendJSON(res, 503, { error: 'Preview administrator is unavailable.' });
    return sendJSON(res, 200, { user: { id: user.id, email: user.email, name: user.display_name, role: user.role, storeId: user.store_id } }, { 'set-cookie': sessionCookie(user) });
  }
  if (route === 'POST /api/admin/session') {
    assertSameOrigin(req);
    const body = await readBody(req);
    const user = await db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(safeText(body.email, 180).toLowerCase());
    if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) return sendJSON(res, 401, { error: 'Email or password is incorrect.' });
    return sendJSON(res, 200, { user: { id: user.id, email: user.email, name: user.display_name, role: user.role, storeId: user.store_id } }, { 'set-cookie': sessionCookie(user) });
  }
  if (route === 'POST /api/admin/logout') {
    assertSameOrigin(req);
    return sendJSON(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie() });
  }

  const assetMatch = pathname.match(/^\/api\/assets\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && assetMatch) {
    if (!tenant) return sendJSON(res, 404, { error: 'Store not found for this domain.' });
    const asset = await db.prepare('SELECT content_type,content FROM store_assets WHERE store_id=? AND id=?').get(tenant.id, assetMatch[1]);
    if (!asset) return sendJSON(res, 404, { error: 'Asset not found.' });
    const content = Buffer.from(asset.content);
    res.writeHead(200, { 'content-type': asset.content_type, 'content-length': content.length, 'cache-control': 'public, max-age=31536000, immutable' });
    res.end(content);
    return;
  }

  if (pathname.startsWith('/api/cart')) {
    if (!tenant) return sendJSON(res, 404, { error: 'Store not found for this domain.' });
    const cart = await getCart(tenant.id, req, res);
    if (route === 'GET /api/cart') return sendJSON(res, 200, await cartSummary(tenant.id, cart.id));
    if (route === 'POST /api/cart/items') {
      assertSameOrigin(req);
      const body = await readBody(req);
      const quantity = Math.max(1, Math.min(20, Math.floor(Number(body.quantity) || 1)));
      const product = await db.prepare('SELECT id,name,status FROM products WHERE store_id=? AND id=?').get(tenant.id, safeText(body.productId, 80));
      const variant = await db.prepare('SELECT id FROM product_variants WHERE store_id=? AND product_id=? AND id=? AND active=1').get(tenant.id, product?.id, safeText(body.variantId, 80));
      if (!product || product.status !== 'active' || !variant) return sendJSON(res, 404, { error: 'That product option is not available in this store.' });
      const inventory = await db.prepare('SELECT quantity,reserved FROM inventory WHERE store_id=? AND variant_id=?').get(tenant.id, variant.id);
      const available = Math.max(0, Number(inventory?.quantity || 0) - Number(inventory?.reserved || 0));
      const existing = await db.prepare('SELECT id,quantity FROM cart_items WHERE store_id=? AND cart_id=? AND variant_id=?').get(tenant.id, cart.id, variant.id);
      if ((existing?.quantity || 0) + quantity > available) return sendJSON(res, 409, { error: `Only ${available} are available.` });
      if (existing) await db.prepare('UPDATE cart_items SET quantity=quantity+?,created_at=CURRENT_TIMESTAMP WHERE store_id=? AND id=?').run(quantity, tenant.id, existing.id);
      else await db.prepare('INSERT INTO cart_items(id,store_id,cart_id,product_id,variant_id,quantity) VALUES(?,?,?,?,?,?)').run(uuid('item_'), tenant.id, cart.id, product.id, variant.id, quantity);
      return sendJSON(res, 200, await cartSummary(tenant.id, cart.id));
    }
    const itemMatch = pathname.match(/^\/api\/cart\/items\/([^/]+)$/);
    if (method === 'DELETE' && itemMatch) {
      assertSameOrigin(req);
      await db.prepare('DELETE FROM cart_items WHERE store_id=? AND cart_id=? AND id=?').run(tenant.id, cart.id, itemMatch[1]);
      return sendJSON(res, 200, await cartSummary(tenant.id, cart.id));
    }
  }

  if (route === 'POST /api/checkout') {
    assertSameOrigin(req);
    if (!tenant) return sendJSON(res, 404, { error: 'Store not found for this domain.' });
    const body = await readBody(req);
    const name = safeText(body.name, 120);
    const email = safeText(body.email, 180).toLowerCase();
    const address = safeText(body.address, 400);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !address) return sendJSON(res, 400, { error: 'Enter your name, a valid email, and a delivery address.' });
    const cart = await getCart(tenant.id, req, res);
    const summary = await cartSummary(tenant.id, cart.id);
    if (!summary.items.length) return sendJSON(res, 400, { error: 'Your bag is empty.' });
    if (summary.items.some(item => item.quantity > item.available)) return sendJSON(res, 409, { error: 'An item in your bag is no longer available.' });
    const checkoutConfig = await db.prepare('SELECT provider FROM store_payment_configs WHERE store_id=?').get(tenant.id);
    if (checkoutConfig && checkoutConfig.provider !== 'mock') return sendJSON(res, 503, { error: 'This store’s payment provider needs server credentials before checkout can be completed.' });
    const orderId = uuid('order_');
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const order = { id: orderId, orderNumber, totalMinor: summary.totalMinor };
    await db.transaction(async () => {
      const customerId = uuid('customer_');
      await db.prepare('INSERT OR IGNORE INTO customers(id,store_id,email,first_name) VALUES(?,?,?,?)').run(customerId, tenant.id, email, name.split(' ')[0]);
      const actualCustomerId = (await db.prepare('SELECT id FROM customers WHERE store_id=? AND email=?').get(tenant.id, email))?.id;
      await db.prepare(`INSERT INTO orders(id,store_id,customer_id,order_number,status,currency,subtotal_minor,tax_minor,shipping_minor,total_minor,customer_name,customer_email,shipping_address_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(orderId, tenant.id, actualCustomerId, orderNumber, 'pending_payment', summary.currency, summary.subtotalMinor, summary.taxMinor, summary.shippingMinor, summary.totalMinor, name, email, JSON.stringify({ address }));
      for (const item of summary.items) {
        await db.prepare('INSERT INTO order_items(id,store_id,order_id,product_id,variant_id,product_name,sku,quantity,unit_price_minor,line_total_minor) VALUES(?,?,?,?,?,?,?,?,?,?)').run(uuid('orderitem_'), tenant.id, orderId, item.productId, item.variantId, item.name, item.sku, item.quantity, item.unitPriceMinor, item.lineTotalMinor);
        const stock = await db.prepare('UPDATE inventory SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND variant_id=? AND quantity-reserved>=?').run(item.quantity, tenant.id, item.variantId, item.quantity);
        if (stock.changes !== 1) throw Object.assign(new Error('An item became unavailable while checking out.'), { statusCode: 409 });
      }
      const payment = await paymentProviderFor(checkoutConfig?.provider || 'mock').createCheckoutSession({ orderId, amountMinor: summary.totalMinor, currency: summary.currency });
      await db.prepare('INSERT INTO payments(id,store_id,order_id,provider,provider_reference,amount_minor,currency,status) VALUES(?,?,?,?,?,?,?,?)').run(uuid('payment_'), tenant.id, orderId, payment.provider, payment.reference, payment.amountMinor, payment.currency, payment.status);
      await db.prepare('DELETE FROM cart_items WHERE store_id=? AND cart_id=?').run(tenant.id, cart.id);
    });
    return sendJSON(res, 201, { order: { orderNumber: order.orderNumber, totalMinor: order.totalMinor, currency: summary.currency, status: 'pending_payment' }, message: 'Your preview order is ready. No payment was collected.' });
  }

  if (pathname.startsWith('/api/admin/')) {
    const user = await requireSession(req);
    if (pathname === '/api/admin/stores' && method === 'GET') {
      await requirePlatformAdmin(user);
      return sendJSON(res, 200, { stores: await db.prepare('SELECT id,slug,name,status,currency,country,created_at AS "createdAt" FROM stores ORDER BY created_at').all() });
    }
    if (pathname === '/api/admin/stores' && method === 'POST') {
      await requirePlatformAdmin(user);
      const body = await readBody(req);
      const store = await createStoreWithDefaults(user.id, body);
      return sendJSON(res, 201, { store: apiStore(store) });
    }
    const store = await adminStore(req, user);
    const storeId = store.id;
    if (route === 'GET /api/admin/overview') {
      await requirePermission(user, storeId, 'analytics:read');
      return sendJSON(res, 200, await dashboardData(store));
    }
    if (route === 'GET /api/admin/branding') {
      await requirePermission(user, storeId, 'branding:manage');
      return sendJSON(res, 200, { branding: { ...(await getStoreBranding(storeId)), storeName: store.name, description: store.description } });
    }
    if (route === 'PUT /api/admin/branding') {
      await requireSession(req); await requirePermission(user, storeId, 'branding:manage');
      const body = await readBody(req);
      return sendJSON(res, 200, { branding: await updateBranding(storeId, body, user.id) });
    }
    if (route === 'POST /api/admin/assets') {
      assertSameOrigin(req); await requirePermission(user, storeId, 'branding:manage');
      const body = await readBody(req);
      return sendJSON(res, 201, { url: await saveStoreImage(storeId, user.id, body) });
    }
    const settingMatch = pathname.match(/^\/api\/admin\/settings\/([a-z-]+)$/);
    if (settingMatch && method === 'GET') {
      await requirePermission(user, storeId, 'settings:manage');
      const section = settingMatch[1];
      if (!SETTINGS_SECTIONS.has(section)) return sendJSON(res, 404, { error: 'Settings section not found.' });
      return sendJSON(res, 200, { section, settings: (await settingsFor(storeId))[section] || {} });
    }
    if (settingMatch && method === 'PUT') {
      assertSameOrigin(req); await requirePermission(user, storeId, 'settings:manage');
      const section = settingMatch[1];
      const body = await readBody(req);
      const settings = await updateStoreSettings(storeId, section, body, user.id);
      return sendJSON(res, 200, { section, settings });
    }
    if (pathname === '/api/admin/domain/verify' && method === 'POST') {
      assertSameOrigin(req); await requirePermission(user, storeId, 'settings:manage');
      const domain = (await settingsFor(storeId)).domain?.customDomain;
      if (!domain) return sendJSON(res, 400, { error: 'Add a custom domain before requesting verification.' });
      const result = await domainVerifier.beginVerification({ domain });
      return sendJSON(res, 200, result);
    }
    if (pathname === '/api/admin/products' && method === 'GET') {
      await requirePermission(user, storeId, 'products:read');
      const [products, categories] = await Promise.all([listProducts(storeId, { includeDrafts: true }), db.prepare('SELECT id,name FROM categories WHERE store_id=? ORDER BY sort_order').all(storeId)]);
      return sendJSON(res, 200, { products, categories });
    }
    if (pathname === '/api/admin/products' && method === 'POST') {
      assertSameOrigin(req); await requirePermission(user, storeId, 'products:write');
      const body = await readBody(req);
      const name = safeText(body.name, 120); const sku = safeText(body.sku, 80).toUpperCase();
      if (!name || !sku) return sendJSON(res, 400, { error: 'Product name and SKU are required.' });
      const slug = slugify(body.slug || name);
      if (!slug) return sendJSON(res, 400, { error: 'Enter a valid product slug.' });
      if (await db.prepare('SELECT 1 FROM products WHERE store_id=? AND (slug=? OR sku=?)').get(storeId, slug, sku)) return sendJSON(res, 409, { error: 'That slug or SKU is already used in this store.' });
      if (body.categoryId && !await db.prepare('SELECT 1 FROM categories WHERE store_id=? AND id=?').get(storeId, safeText(body.categoryId, 80))) return sendJSON(res, 400, { error: 'Choose a category from this store.' });
      const storeCurrency = (await db.prepare('SELECT currency FROM stores WHERE id=?').get(storeId)).currency;
      const product = { id: uuid('product_'), categoryId: body.categoryId || null, name, slug, sku, description: safeText(body.description, 1200), price: Number(body.price), compareAt: body.compareAt ? Number(body.compareAt) : null, imageUrl: safeText(body.imageUrl, 1000), secondaryImageUrl: '', featured: false, sizes: ['One size'] };
      if (!Number.isFinite(product.price) || product.price < 0) return sendJSON(res, 400, { error: 'Enter a valid price.' });
      await db.transaction(async () => { await insertProduct(storeId, storeCurrency, product); await recordActivity(storeId, user.id, 'product.created', 'product', product.id); });
      return sendJSON(res, 201, { product: await productForApi(await db.prepare('SELECT * FROM products WHERE store_id=? AND id=?').get(storeId, product.id)) });
    }
    const productMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (productMatch && method === 'PATCH') {
      assertSameOrigin(req); await requirePermission(user, storeId, 'products:write');
      const body = await readBody(req);
      const product = await db.prepare('SELECT * FROM products WHERE store_id=? AND id=?').get(storeId, productMatch[1]);
      if (!product) return sendJSON(res, 404, { error: 'Product not found in this store.' });
      const status = ['active','draft','archived'].includes(body.status) ? body.status : product.status;
      await db.prepare('UPDATE products SET status=? WHERE store_id=? AND id=?').run(status, storeId, product.id);
      await recordActivity(storeId, user.id, 'product.status_updated', 'product', product.id, { status });
      return sendJSON(res, 200, { product: await productForApi(await db.prepare('SELECT * FROM products WHERE store_id=? AND id=?').get(storeId, product.id)) });
    }
    if (pathname === '/api/admin/orders' && method === 'GET') {
      await requirePermission(user, storeId, 'orders:read');
      const orderRows = await db.prepare('SELECT * FROM orders WHERE store_id=? ORDER BY created_at DESC LIMIT 100').all(storeId);
      const orders = await Promise.all(orderRows.map(async order => ({ ...order, items: await db.prepare('SELECT product_name AS name,sku,quantity,unit_price_minor AS "unitPriceMinor" FROM order_items WHERE store_id=? AND order_id=?').all(storeId, order.id) })));
      return sendJSON(res, 200, { orders });
    }
    if (pathname === '/api/admin/customers' && method === 'GET') {
      await requirePermission(user, storeId, 'customers:read');
      return sendJSON(res, 200, { customers: await db.prepare(`SELECT c.id,c.email,c.first_name AS "firstName",c.last_name AS "lastName",c.phone,c.created_at AS "createdAt",
        (SELECT COUNT(*)::int FROM orders o WHERE o.store_id=c.store_id AND o.customer_id=c.id) AS orders,
        (SELECT COALESCE(SUM(total_minor),0)::int FROM orders o WHERE o.store_id=c.store_id AND o.customer_id=c.id) AS "spentMinor"
        FROM customers c WHERE c.store_id=? ORDER BY c.created_at DESC`).all(storeId) });
    }
    if (pathname === '/api/admin/analytics' && method === 'GET') {
      await requirePermission(user, storeId, 'analytics:read');
      const byDay = await db.prepare(`SELECT TO_CHAR(created_at,'YYYY-MM-DD') AS day,COUNT(*)::int AS orders,COALESCE(SUM(total_minor),0)::int AS "revenueMinor"
        FROM orders WHERE store_id=? AND created_at>=NOW()-INTERVAL '30 days' GROUP BY TO_CHAR(created_at,'YYYY-MM-DD') ORDER BY day`).all(storeId);
      const topProducts = await db.prepare(`SELECT oi.product_name AS name,SUM(oi.quantity)::int AS units, SUM(oi.line_total_minor)::int AS "revenueMinor"
        FROM order_items oi WHERE oi.store_id=? GROUP BY oi.product_name ORDER BY units DESC LIMIT 5`).all(storeId);
      return sendJSON(res, 200, { byDay, topProducts });
    }
    if (pathname === '/api/admin/activity' && method === 'GET') {
      await requirePermission(user, storeId, 'analytics:read');
      const activityRows = await db.prepare('SELECT action,resource_type AS "resourceType",resource_id AS "resourceId",details_json AS details,created_at AS "createdAt" FROM admin_activity_logs WHERE store_id=? ORDER BY created_at DESC LIMIT 30').all(storeId);
      return sendJSON(res, 200, { activity: activityRows.map(row => ({ ...row, details: jsonParse(row.details) })) });
    }
    return sendJSON(res, 404, { error: 'API endpoint not found.' });
  }
  return sendJSON(res, 404, { error: 'API endpoint not found.' });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
function serveStatic(req, res) {
  const url = parsePath(req);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/store/')) pathname = '/index.html';
  const requested = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!requested.startsWith(`${PUBLIC_DIR}${path.sep}`) && requested !== path.join(PUBLIC_DIR, 'index.html')) return sendJSON(res, 403, { error: 'Forbidden.' });
  let file = requested;
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch {}
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(PUBLIC_DIR, 'index.html');
  const content = fs.readFileSync(file);
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-length': content.length, 'cache-control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=1800' });
  res.end(content);
}

async function handleNodeRequest(req, res) {
  try {
    await ensureDatabase();
    if ((req.url || '').startsWith('/api/') || /^\/store\/[a-z0-9-]+\/api\//i.test(req.url || '')) await routeApi(req, res);
    else if (req.method === 'GET' && /(?:^|\/)(?:robots\.txt|sitemap\.xml)$/.test(parsePath(req).pathname)) await serveStoreSeo(req, res, await resolveTenant(req), parsePath(req).pathname);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res);
    else sendJSON(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const status = Number(error.statusCode || 500);
    if (status >= 500) console.error(error);
    if (!res.headersSent) sendJSON(res, status, { error: status >= 500 ? 'Something went wrong. Please try again.' : error.message });
    else res.end();
  }
}

function captureResponse() {
  let resolveEnd;
  const ended = new Promise(resolve => { resolveEnd = resolve; });
  const headers = {};
  const chunks = [];
  const response = {
    statusCode: 200,
    headersSent: false,
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    writeHead(status, nextHeaders = {}) {
      this.statusCode = status;
      for (const [name, value] of Object.entries(nextHeaders)) headers[name.toLowerCase()] = value;
      this.headersSent = true;
      return this;
    },
    write(chunk) { if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))); return true; },
    end(chunk) {
      if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      resolveEnd({ statusCode: this.statusCode, headers: { ...headers }, body: Buffer.concat(chunks) });
    },
  };
  return { response, ended };
}

async function handleNetlifyRequest(request) {
  const url = new URL(request.url);
  const body = ['GET','HEAD'].includes(request.method) ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  const req = Readable.from(body.length ? [body] : []);
  req.method = request.method;
  req.url = `${url.pathname}${url.search}`;
  req.headers = Object.fromEntries(request.headers.entries());
  req.headers.host ||= url.host;
  const { response, ended } = captureResponse();
  await handleNodeRequest(req, response);
  const result = await ended;
  return new Response(result.body, { status: result.statusCode, headers: result.headers });
}

const server = http.createServer(handleNodeRequest);
async function startLocalServer() {
  await ensureDatabase();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Storefront running at http://localhost:${PORT}`);
    console.log(`Tenant seed: ${DEFAULT_STORE_SLUG} · platform host: ${PLATFORM_HOST}`);
    if (!IS_PRODUCTION) console.log('Local preview admin: use “Open preview admin” in the storefront.');
    if (process.env.ADMIN_PASSWORD) console.log(`Admin email: ${process.env.ADMIN_EMAIL || 'platform@localhost'}`);
  });
}

async function shutdown() {
  try { await closeDatabase(); } catch {}
  if (server.listening) server.close(() => process.exit(0));
  else process.exit(0);
}

if (require.main === module) {
  startLocalServer().catch(error => { console.error(error); process.exitCode = 1; });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { ensureDatabase, handleNetlifyRequest, startLocalServer, closeDatabase };
