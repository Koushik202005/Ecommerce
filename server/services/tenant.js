function cleanHost(value) {
  return String(value || '').split(',')[0].trim().toLowerCase().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\.$/, '');
}

function createTenantResolver(db, { platformHost = 'localhost', trustProxy = false, defaultSlug = 'store' } = {}) {
  const configuredPlatformHost = cleanHost(platformHost);

  return async function resolveTenant(req) {
    const forwarded = trustProxy ? req.headers['x-forwarded-host'] : '';
    const host = cleanHost(forwarded || req.headers.host);
    const pathSlug = req.url.match(/^\/store\/([a-z0-9-]+)(?:\/|$)/i)?.[1]?.toLowerCase();
    let store = null;

    if (pathSlug) store = await db.prepare('SELECT * FROM stores WHERE slug = ? AND status = ?').get(pathSlug, 'active');
    if (!store && host) {
      const custom = await db.prepare('SELECT s.* FROM store_domains d JOIN stores s ON s.id=d.store_id WHERE lower(d.domain)=? AND s.status=? LIMIT 1').get(host, 'active');
      if (custom) store = custom;
    }
    if (!store && configuredPlatformHost && host.endsWith(`.${configuredPlatformHost}`)) {
      const subdomain = host.slice(0, -(configuredPlatformHost.length + 1)).split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'platform') {
        store = await db.prepare('SELECT * FROM stores WHERE slug = ? AND status = ?').get(subdomain, 'active');
      }
    }
    if (!store && (host === configuredPlatformHost || host === 'localhost' || host === '127.0.0.1')) {
      store = await db.prepare('SELECT * FROM stores WHERE slug = ? AND status = ?').get(defaultSlug, 'active');
    }
    return store || null;
  };
}

module.exports = { createTenantResolver, cleanHost };
