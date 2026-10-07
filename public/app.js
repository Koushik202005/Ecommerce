const app = document.querySelector('#app');
const state = {
  storefront: null, session: null, cart: null, overlay: null, search: '',
  selectedVariant: null, selectedStoreSlug: null, adminData: null, adminStores: [],
  toastTimer: null, renderVersion: 0,
};

const settingsMeta = {
  general: { title: 'General', description: 'The core details shoppers see across your store.' },
  homepage: { title: 'Homepage', description: 'Shape the announcement, hero and featured collection on your storefront.' },
  branding: { title: 'Branding', description: 'Set the look and feel customers recognize as yours.' },
  domain: { title: 'Domains', description: 'Connect a custom domain and check its configuration status.' },
  payments: { title: 'Payments', description: 'Choose a payment provider for this store.' },
  shipping: { title: 'Shipping', description: 'Set delivery rates, thresholds and pickup options.' },
  taxes: { title: 'Taxes', description: 'Configure tax rules for this store.' },
  email: { title: 'Email', description: 'Brand transactional messages with store details.' },
  seo: { title: 'SEO', description: 'Set the store’s metadata and search visibility.' },
  social: { title: 'Social', description: 'Add the social profiles shown in your storefront.' },
  policies: { title: 'Policies', description: 'Manage store-specific content and customer policies.' },
};

const iconPaths = {
  bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4 4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  home: '<path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-6h6v6"/>',
  box: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/>',
  receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M8 8h8M8 12h8"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>',
  chart: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 3.1-.2-.1a1.7 1.7 0 0 0-1.9.4l-.1.1h-3.6l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.3.1-3.1-1.8.1-.3A1.7 1.7 0 0 0 6.8 15l-.2-.1v-3.6l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.3 1.8-3.1.3.1a1.7 1.7 0 0 0 1.9-.4l.1-.1h3.6l.1.2a1.7 1.7 0 0 0 1.6 1l.3-.1 3.1 1.8-.1.3a1.7 1.7 0 0 0 .4 1.9l.1.1v3.6l-.2.1a1.7 1.7 0 0 0-1.2.5Z"/>',
  store: '<path d="M3 10h18l-1.5-6h-15L3 10Z"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
  spark: '<path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};

function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.spark}</svg>`;
}
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function safeHref(value = '') {
  const text = String(value || '').trim();
  return /^(https?:\/\/|#)/i.test(text) || (text.startsWith('/') && !text.startsWith('//')) ? text : '#';
}
function cssUrl(value = '') {
  const url = safeHref(value).replace(/\\/g, '\\\\').replace(/'/g, '\\27 ').replace(/[\r\n]/g, '');
  return `url('${url}')`;
}
function priceDigits(currency = state.storefront?.store?.currency || '') {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits; } catch { return 2; }
}
function money(minor, currency = state.storefront?.store?.currency || '') {
  const value = Number(minor || 0) / Math.pow(10, priceDigits(currency));
  if (!currency) return value.toFixed(2);
  try { return new Intl.NumberFormat(state.storefront?.store?.language || 'en-US', { style: 'currency', currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}
function storeApiPath(endpoint) {
  const match = location.pathname.match(/^\/store\/([a-z0-9-]+)/i);
  return `${match ? `/store/${match[1]}` : ''}${endpoint}`;
}
function adminHref(endpoint) {
  const match = location.pathname.match(/^\/store\/([a-z0-9-]+)(?:\/|$)/i);
  return `${match ? `/store/${match[1]}` : ''}${endpoint}`;
}
function storefrontHref(endpoint) {
  const match = location.pathname.match(/^\/store\/([a-z0-9-]+)(?:\/|$)/i);
  return `${match ? `/store/${match[1]}` : ''}${endpoint}`;
}
function normalizedStorefrontPath(pathname = location.pathname) {
  return pathname.replace(/^\/store\/[a-z0-9-]+(?=\/|$)/i, '') || '/';
}
function normalizedAdminPath(pathname = location.pathname) {
  return pathname.replace(/^\/store\/[a-z0-9-]+(?=\/admin(?:\/|$))/i, '').replace(/\/$/, '') || '/';
}
async function api(endpoint, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
  if (options.admin) {
    const selected = state.selectedStoreSlug || state.storefront?.store?.slug;
    if (state.session?.role === 'SUPER_ADMIN' && selected) headers['x-platform-store'] = selected;
  }
  const response = await fetch(storeApiPath(endpoint), { credentials: 'same-origin', ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
  const content = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(content.error || `Request failed (${response.status}).`);
  return content;
}
function setTheme(branding) {
  if (!branding) return;
  const root = document.documentElement;
  root.style.setProperty('--color-primary', branding.primaryColor || '#536579');
  root.style.setProperty('--color-secondary', branding.secondaryColor || '#151515');
  root.style.setProperty('--color-accent', branding.accentColor || '#d8dfd0');
  root.style.setProperty('--color-background', branding.backgroundColor || '#f7f6f2');
  root.style.setProperty('--color-foreground', branding.textColor || '#171717');
  root.style.setProperty('--color-muted', branding.mutedColor || '#75736d');
  root.style.setProperty('--color-border', branding.borderColor || '#e1dfd9');
  root.style.setProperty('--radius', `${branding.borderRadius ?? 4}px`);
  root.style.setProperty('--font-family', `'${String(branding.fontFamily || 'DM Sans').replace(/[^\w -]/g, '')}', sans-serif`);
  root.style.setProperty('--heading-font', `'${String(branding.headingFont || 'Barlow Condensed').replace(/[^\w -]/g, '')}', sans-serif`);
  root.dataset.buttonStyle = branding.buttonStyle || 'square';
  root.dataset.cardStyle = branding.cardStyle || 'editorial';
}
function setSeo() {
  if (!state.storefront) return;
  const { seo, branding } = state.storefront;
  document.title = seo?.title || state.storefront.store.name;
  let description = document.querySelector('meta[name="description"]');
  if (!description) { description = document.createElement('meta'); description.name = 'description'; document.head.append(description); }
  description.content = seo?.description || state.storefront.store.description || '';
  const setProperty = (property, content) => {
    let meta = document.querySelector(`meta[property="${property}"]`);
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('property', property); document.head.append(meta); }
    meta.content = content || '';
  };
  setProperty('og:title', seo?.title || state.storefront.store.name);
  setProperty('og:description', seo?.description || state.storefront.store.description || '');
  setProperty('og:image', seo?.image || '');
  setProperty('og:type', 'website');
  const canonicalBase = String(state.storefront.settings?.seo?.canonicalDomain || '').replace(/\/$/, '') || location.origin;
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
  canonical.href = `${canonicalBase}${location.pathname}`;
  if (seo?.robots) {
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
    robots.content = seo.robots;
  }
  if (branding?.favicon) {
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.append(favicon); }
    favicon.href = safeHref(branding.favicon);
  }
}
function setEntitySeo({ title, description, image, path }) {
  const store = state.storefront.store;
  document.title = title || store.name;
  const descriptionNode = document.querySelector('meta[name="description"]');
  if (descriptionNode) descriptionNode.content = description || store.description || '';
  const setProperty = (property, content) => {
    let meta = document.querySelector(`meta[property="${property}"]`);
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('property', property); document.head.append(meta); }
    meta.content = content || '';
  };
  setProperty('og:title', title || store.name); setProperty('og:description', description || store.description || '');
  setProperty('og:image', image || ''); setProperty('og:type', 'product');
  const seo = state.storefront.settings?.seo || {};
  const canonicalBase = String(seo.canonicalDomain || '').replace(/\/$/, '') || location.origin;
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
  canonical.href = `${canonicalBase}${path || location.pathname}`;
}
function toast(message, kind = 'success') {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = `toast toast-${kind}`;
  node.innerHTML = `${kind === 'success' ? icon('check', 17) : icon('spark', 17)}<span>${esc(message)}</span>`;
  document.body.append(node);
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.remove(), 3200);
}
function brandLogo(brand, store, className = '') {
  return brand?.logo
    ? `<span class="brand-lockup ${className}"><img src="${esc(safeHref(brand.logo))}" alt="${esc(store.name)}" /></span>`
    : `<span class="brand-wordmark ${className}">${esc(store?.name || 'STORE')}</span>`;
}
function productCard(product, index = 0) {
  const sale = product.compareAtMinor && product.compareAtMinor > product.priceMinor;
  return `<article class="product-card" style="--card-index:${index}">
    <button class="product-card-image" data-action="product-open" data-id="${esc(product.id)}" aria-label="View ${esc(product.name)}">
      <img src="${esc(safeHref(product.imageUrl))}" alt="${esc(product.name)}" loading="lazy" />
      ${product.badge ? `<span class="product-badge">${esc(product.badge)}</span>` : ''}
      <span class="quick-view">Quick view ${icon('arrowUpRight', 15)}</span>
    </button>
    <div class="product-card-info"><div><h3><button data-action="product-open" data-id="${esc(product.id)}">${esc(product.name)}</button></h3><p>${esc(product.variants?.length ? product.variants.map(v => v.name).join(' · ') : 'Easy fit')}</p></div>
      <div class="product-price"><strong>${money(product.priceMinor, product.currency)}</strong>${sale ? `<s>${money(product.compareAtMinor, product.currency)}</s>` : ''}</div></div>
    <button class="quick-add" data-action="quick-add" data-id="${esc(product.id)}">ADD TO BAG <span>+</span></button>
  </article>`;
}
function renderAnnouncement() {
  const message = state.storefront.settings?.homepage?.announcement || state.storefront.settings?.homepage?.heroEyebrow || state.storefront.banners?.find(item => item.kind === 'hero')?.eyebrow || 'A LITTLE SOMETHING EXTRA';
  return `<div class="announcement"><span class="announcement-dot"></span><span>${esc(message)}</span><span class="announcement-dot"></span></div>`;
}
function renderHeader() {
  const { store, branding, categories } = state.storefront;
  const nav = (categories || []).slice(0, 3).map((category, i) => `<a href="#${i === 0 ? 'new-arrivals' : 'collections'}">${esc(category.name)}</a>`).join('');
  return `<header class="site-header">
    <button class="mobile-menu icon-button" data-action="menu-open" aria-label="Open menu">${icon('menu')}</button>
    <nav class="header-nav header-nav-left"><a href="#new-arrivals">Shop</a><a href="#collections">Collections</a>${nav}</nav>
    <a href="/" class="brand-home" data-route="/">${brandLogo(branding, store)}</a>
    <nav class="header-nav header-nav-right"><a href="#story">Our story</a><a href="#footer">Contact</a></nav>
    <div class="header-actions"><button class="icon-button" data-action="search-open" aria-label="Search">${icon('search')}</button><button class="icon-button bag-button" data-action="cart-open" aria-label="Shopping bag">${icon('bag')}<span class="bag-count">${state.cart?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}</span></button><a class="admin-link" href="${adminHref('/admin')}" data-route="${adminHref('/admin')}">ACCOUNT</a></div>
  </header>`;
}
function renderHero() {
  const banner = state.storefront.banners?.find(item => item.kind === 'hero') || {};
  const home = state.storefront.settings?.homepage || {};
  const title = home.heroTitle || banner.title || 'NEW\nSEASON';
  const image = home.heroImageUrl || banner.imageUrl;
  return `<section class="hero" style="--hero-image:${esc(cssUrl(image))}">
    <div class="hero-shade"></div><div class="hero-copy"><p class="eyebrow light-eyebrow">${esc(home.heroEyebrow || banner.eyebrow || '')}</p>
      <h1>${esc(title).split('\n').map(line => `<span>${line}</span>`).join('')}</h1>
      <div class="hero-bottom"><p>${esc(home.heroBody || banner.body || state.storefront.store.description)}</p><a class="button button-light" href="${esc(safeHref(banner.linkUrl || '#new-arrivals'))}">${esc(home.heroLinkText || 'SHOP THE DROP').toUpperCase()} ${icon('arrowUpRight', 16)}</a></div>
    </div><div class="hero-index"><span>01</span><i></i><span>03</span></div><div class="hero-side-label">A NEW POINT OF VIEW</div>
    <a class="scroll-cue" href="#new-arrivals"><span>SCROLL TO EXPLORE</span><i></i></a>
  </section>`;
}
function renderTicker() {
  const text = state.storefront.store.description || 'Dress like you mean it';
  return `<div class="ticker" aria-label="Store message"><div class="ticker-track">${Array.from({ length: 6 }, () => `<span>${esc(text.toUpperCase())}</span>${icon('spark', 15)}`).join('')}</div></div>`;
}
function renderHome() {
  const products = state.storefront.products || [];
  const featured = products.filter(product => product.featured).slice(0, 4);
  const collection = state.storefront.banners?.find(item => item.kind === 'collection') || {};
  const home = state.storefront.settings?.homepage || {};
  const categories = state.storefront.categories || [];
  return `<main>
    ${renderHero()}${renderTicker()}
    <section class="section arrivals-section" id="new-arrivals"><div class="section-head"><div><p class="eyebrow">MADE FOR THE EVERYDAY</p><h2>NEW<br class="mobile-break" /> ARRIVALS<span class="heading-period">.</span></h2></div><a class="text-link" href="#featured">DISCOVER THE DROP ${icon('arrowUpRight', 17)}</a></div>
      <div class="product-grid">${featured.map((product, i) => productCard(product, i)).join('') || '<div class="empty-inline">New pieces are on the way.</div>'}</div>
    </section>
    <section class="manifesto" id="story"><div class="manifesto-mark">${icon('spark', 28)}</div><p class="eyebrow">THE WAY WE SEE IT</p><h2>DESIGNED FOR<br />THE <em>BOLD.</em></h2><p class="manifesto-body">${esc(state.storefront.store.description || 'Good clothes do more than fit. They help you feel like yourself, a little louder.')}</p><a class="text-link" href="#collections">A LITTLE ABOUT US ${icon('arrowUpRight', 16)}</a></section>
    <section class="collection-feature" id="collections"><div class="collection-image" style="background-image:${esc(cssUrl(home.collectionImageUrl || collection.imageUrl))}"><div class="collection-stamp"><span>THE</span><b>NEW<br />UNIFORM</b><span>EST. EVERY DAY</span></div></div>
      <div class="collection-copy"><p class="eyebrow">${esc(home.collectionEyebrow || collection.eyebrow || 'THE LATEST COLLECTION')}</p><h2>${esc(home.collectionTitle || collection.title || 'COLD\nWEATHER').split('\n').map(line => `<span>${line}</span>`).join('')}</h2><p>${esc(home.collectionBody || collection.body || 'Layers that do more. Shapes that feel like you.')}</p><a class="button button-dark" href="#featured">EXPLORE THE EDIT ${icon('arrowUpRight', 16)}</a><span class="collection-no">COLLECTION — 02</span></div>
    </section>
    <section class="section category-section"><div class="section-head"><div><p class="eyebrow">FIND YOUR NEXT GO-TO</p><h2>THE ROTATION<span class="heading-period">.</span></h2></div><span class="section-note">FEW GOOD THINGS. WORN OFTEN.</span></div><div class="category-grid">${categories.map((category, i) => `<a class="category-card category-card-${i + 1}" href="${storefrontHref(`/collections/${category.slug}`)}" data-route="${storefrontHref(`/collections/${category.slug}`)}"><img src="${esc(safeHref(category.imageUrl))}" alt="${esc(category.name)}" loading="lazy"/><span class="category-shade"></span><span class="category-name"><small>0${i + 1}</small><b>${esc(category.name)}</b></span>${icon('arrowUpRight', 20)}</a>`).join('')}</div></section>
    <section class="section best-section" id="featured"><div class="section-head"><div><p class="eyebrow">GOOD CHOICES, NO GUESSWORK</p><h2>THE BESTSELLERS<span class="heading-period">.</span></h2></div><span class="section-note">THE ONES THAT KEEP COMING BACK.</span></div><div class="product-grid">${products.slice(0, 4).map((product, i) => productCard(product, i)).join('')}</div></section>
    <section class="quote-section"><p class="eyebrow">GOOD WORDS, FROM GOOD PEOPLE</p><div class="quote-mark">“</div><blockquote>“THE FIT IS RIGHT, THE QUALITY IS THERE. I’VE BEEN LIVING IN THIS HOODIE.”</blockquote><p class="quote-author">JAMIE R. <span>— VERIFIED CUSTOMER</span></p><div class="quote-dots"><i></i><i class="active"></i><i></i></div></section>
    <section class="service-strip"><div><span class="service-icon">${icon('arrow', 18)}</span><span><b>FREE DELIVERY</b><small>ON ORDERS OVER ${esc(state.storefront.settings?.shipping?.freeShippingThreshold || '120')}</small></span></div><div><span class="service-icon">${icon('check', 18)}</span><span><b>SECURE CHECKOUT</b><small>YOUR DETAILS STAY PROTECTED</small></span></div><div><span class="service-icon">↺</span><span><b>14 DAY RETURNS</b><small>CHANGE YOUR MIND? NO SWEAT.</small></span></div><div><span class="service-icon">${icon('spark', 18)}</span><span><b>HERE TO HELP</b><small>${esc(state.storefront.store.contactEmail || 'WE’RE JUST A MESSAGE AWAY')}</small></span></div></section>
  </main>${renderFooter()}`;
}
function renderCollectionPage(category) {
  const products = state.storefront.products.filter(product => product.categoryId === category.id);
  const copy = category.description || `Pieces from ${state.storefront.store.name} for the everyday rotation.`;
  const publicPath = normalizedStorefrontPath();
  setEntitySeo({ title: category.seoTitle || `${category.name} — ${state.storefront.store.name}`, description: category.seoDescription || copy, image: category.imageUrl, path: publicPath });
  return `${renderAnnouncement()}${renderHeader()}<main class="collection-page"><section class="collection-page-hero" style="background-image:${esc(cssUrl(category.imageUrl))}"><div class="collection-page-shade"></div><div><p class="eyebrow light-eyebrow">THE STORE EDIT</p><h1>${esc(category.name)}</h1><p>${esc(copy)}</p></div></section><section class="section collection-products"><div class="section-head"><div><p class="eyebrow">A GOOD PLACE TO START</p><h2>${esc(category.name.toUpperCase())}<span class="heading-period">.</span></h2></div><a class="text-link" href="/" data-route="${storefrontHref('/')}">BACK TO THE STOREFRONT ${icon('arrowUpRight',16)}</a></div><div class="product-grid">${products.length ? products.map((product,i)=>productCard(product,i)).join('') : '<div class="empty-inline">A new edit is being put together. Check back soon.</div>'}</div></section></main>${renderFooter()}`;
}
function renderProductPage(product) {
  const variant = product.variants?.find(item => item.id === state.selectedVariant) || product.variants?.[0];
  const publicPath = normalizedStorefrontPath();
  setEntitySeo({ title: product.seoTitle || `${product.name} — ${state.storefront.store.name}`, description: product.seoDescription || product.description, image: product.imageUrl, path: publicPath });
  return `${renderAnnouncement()}${renderHeader()}<main class="product-page"><nav class="product-breadcrumb"><a href="${storefrontHref('/')}" data-route="${storefrontHref('/')}">HOME</a><span>/</span><a href="${storefrontHref('/collections/new-arrivals')}" data-route="${storefrontHref('/collections/new-arrivals')}">SHOP</a><span>/</span><b>${esc(product.name.toUpperCase())}</b></nav><section class="product-detail-layout"><div class="product-detail-image"><img src="${esc(safeHref(product.imageUrl))}" alt="${esc(product.name)}"/>${product.badge ? `<span class="product-badge">${esc(product.badge)}</span>` : ''}</div><div class="product-detail-copy"><p class="eyebrow">${esc(product.badge || 'MADE FOR THE ROTATION')}</p><h1>${esc(product.name)}</h1><div class="modal-price"><strong>${money(product.priceMinor,product.currency)}</strong>${product.compareAtMinor ? `<s>${money(product.compareAtMinor,product.currency)}</s>` : ''}</div><p class="modal-description">${esc(product.description)}</p><div class="size-label"><span>SELECT SIZE</span><a href="#size-guide">SIZE GUIDE</a></div><div class="size-options">${(product.variants||[]).map(item=>`<button class="size-option ${variant?.id===item.id?'selected':''} ${item.available<=0?'sold-out':''}" data-action="page-variant-select" data-id="${esc(item.id)}" ${item.available<=0?'disabled':''}>${esc(item.name)}</button>`).join('')}</div><button class="button button-dark full-button" data-action="page-add" data-id="${esc(product.id)}" ${variant?.available<=0?'disabled':''}>ADD TO BAG ${icon('arrowUpRight',16)}</button><p class="stock-note">${variant?.available<=4?`ONLY ${variant?.available||0} LEFT IN THIS SIZE`:'READY FOR YOUR NEXT ROTATION'}</p><div class="product-page-details"><p class="eyebrow">THE DETAILS</p><p>${esc(product.description)}</p><p>Designed to wear well, wash well and feel like yours from day one.</p></div><div class="product-page-promise"><span>${icon('check',16)} 14 DAY RETURNS</span><span>${icon('arrow',16)} DELIVERY FROM ${esc(state.storefront.settings?.shipping?.deliveryEstimate||'3–5 DAYS')}</span></div></div></section><section class="section related-section"><div class="section-head"><div><p class="eyebrow">KEEP THE ROTATION GOING</p><h2>YOU MIGHT LIKE<span class="heading-period">.</span></h2></div></div><div class="product-grid">${state.storefront.products.filter(item=>item.id!==product.id).slice(0,4).map((item,i)=>productCard(item,i)).join('')}</div></section></main>${renderFooter()}`;
}
function renderFooter() {
  const store = state.storefront.store;
  const brand = state.storefront.branding;
  const social = state.storefront.settings?.social || {};
  return `<footer class="site-footer" id="footer"><div class="footer-top"><div class="footer-brand">${brandLogo(brand, store)}<p>${esc(store.description)}</p><a href="mailto:${esc(store.contactEmail || '')}">${esc(store.contactEmail || 'Get in touch')}</a><div class="social-links">${Object.entries(social).filter(([, value]) => value).map(([name, value]) => `<a href="${esc(safeHref(value))}" target="_blank" rel="noreferrer">${esc(name.toUpperCase())}</a>`).join('')}</div></div>
    <div class="footer-column"><p class="eyebrow">GET TO KNOW US</p><a href="#story">Our story</a><a href="#collections">Collections</a><a href="#new-arrivals">New arrivals</a></div><div class="footer-column"><p class="eyebrow">THE DETAILS</p><a href="#footer">Shipping & returns</a><a href="#footer">Privacy</a><a href="#footer">Terms of service</a></div>
    <div class="footer-newsletter"><p class="eyebrow">A GOOD EMAIL, ONCE IN A WHILE</p><h3>DON’T MISS<br />THE NEXT DROP.</h3><p>New pieces, good stories, no noise.</p><form data-form="newsletter"><label class="visually-hidden" for="newsletterEmail">Email address</label><input id="newsletterEmail" name="email" type="email" placeholder="Your email address" required/><button type="submit" aria-label="Subscribe">${icon('arrowUpRight', 18)}</button></form><small>By subscribing, you agree to our store policies.</small></div>
  </div><div class="footer-bottom"><span>© ${new Date().getFullYear()} ${esc(store.name)}</span><span>MADE TO BE WORN, NOT SAVED FOR LATER.</span><a href="${adminHref('/admin')}" data-route="${adminHref('/admin')}">STORE ADMIN ${icon('arrowUpRight', 14)}</a></div></footer>`;
}
function renderOverlay() {
  if (!state.overlay) return '';
  if (state.overlay.type === 'cart') return renderCartDrawer();
  if (state.overlay.type === 'product') return renderProductModal();
  if (state.overlay.type === 'search') return renderSearchModal();
  if (state.overlay.type === 'menu') return renderMobileMenu();
  if (state.overlay.type === 'checkout') return renderCheckoutModal();
  return '';
}
function renderCartDrawer() {
  const cart = state.cart || { items: [], subtotalMinor: 0, taxMinor: 0, shippingMinor: 0, totalMinor: 0, currency: state.storefront.store.currency };
  return `<div class="overlay-shell" data-action="modal-close"><aside class="cart-drawer" data-stop-close><div class="drawer-head"><div><p class="eyebrow">JUST THE GOOD STUFF</p><h2>YOUR BAG <span>(${cart.items.length})</span></h2></div><button class="icon-button" data-action="modal-close" aria-label="Close">${icon('close')}</button></div>
    ${cart.items.length ? `<div class="cart-items">${cart.items.map(item => `<article class="cart-item"><img src="${esc(safeHref(item.imageUrl))}" alt="${esc(item.name)}"/><div><h3>${esc(item.name)}</h3><p>${esc(item.variantName)} · QTY ${item.quantity}</p><strong>${money(item.lineTotalMinor, cart.currency)}</strong></div><button class="remove-item" data-action="cart-remove" data-id="${esc(item.id)}" aria-label="Remove ${esc(item.name)}">${icon('close', 15)}</button></article>`).join('')}</div>
      <div class="cart-summary"><p><span>Subtotal</span><b>${money(cart.subtotalMinor, cart.currency)}</b></p><p><span>Shipping</span><b>${cart.shippingMinor ? money(cart.shippingMinor, cart.currency) : 'Complimentary'}</b></p>${cart.taxMinor ? `<p><span>Tax</span><b>${money(cart.taxMinor, cart.currency)}</b></p>` : ''}<p class="cart-total"><span>Total</span><b>${money(cart.totalMinor, cart.currency)}</b></p><button class="button button-dark full-button" data-action="checkout-open">CONTINUE TO CHECKOUT ${icon('arrowUpRight', 16)}</button><small>${esc(cart.shippingMessage || '')}</small></div>` : `<div class="cart-empty"><div class="empty-bag">${icon('bag', 32)}</div><h3>NOTHING IN HERE. YET.</h3><p>A good outfit starts with one good piece.</p><button class="button button-dark" data-action="modal-close">KEEP EXPLORING ${icon('arrowUpRight', 16)}</button></div>`}
  </aside></div>`;
}
function renderProductModal() {
  const product = state.storefront.products.find(item => item.id === state.overlay.id);
  if (!product) return '';
  const variant = product.variants?.find(item => item.id === state.selectedVariant) || product.variants?.[0];
  return `<div class="overlay-shell product-overlay" data-action="modal-close"><section class="product-modal" data-stop-close><button class="icon-button modal-close" data-action="modal-close" aria-label="Close">${icon('close')}</button><div class="product-modal-image"><img src="${esc(safeHref(product.imageUrl))}" alt="${esc(product.name)}"/></div><div class="product-modal-content"><p class="eyebrow">${esc(product.badge || 'MADE FOR THE ROTATION')}</p><h2>${esc(product.name)}</h2><div class="modal-price"><strong>${money(product.priceMinor, product.currency)}</strong>${product.compareAtMinor ? `<s>${money(product.compareAtMinor, product.currency)}</s>` : ''}</div><p class="modal-description">${esc(product.description)}</p><div class="size-label"><span>SELECT SIZE</span><a href="#size-guide">SIZE GUIDE</a></div><div class="size-options">${(product.variants || []).map(item => `<button class="size-option ${variant?.id === item.id ? 'selected' : ''} ${item.available <= 0 ? 'sold-out' : ''}" data-action="variant-select" data-id="${esc(item.id)}" ${item.available <= 0 ? 'disabled' : ''}>${esc(item.name)}</button>`).join('')}</div><button class="button button-dark full-button" data-action="modal-add" data-id="${esc(product.id)}" ${variant?.available <= 0 ? 'disabled' : ''}>ADD TO BAG · ${money(product.priceMinor, product.currency)} ${icon('arrowUpRight', 16)}</button><p class="stock-note">${variant?.available <= 4 ? `ONLY ${variant?.available || 0} LEFT IN THIS SIZE` : 'READY FOR YOUR NEXT ROTATION'}</p><div class="modal-detail"><span>DETAILS</span><p>${esc(product.description)}</p><a class="text-link" href="${storefrontHref(`/products/${product.slug}`)}" data-route="${storefrontHref(`/products/${product.slug}`)}">VIEW PRODUCT DETAILS ${icon('arrowUpRight', 14)}</a></div></div></section></div>`;
}
function renderSearchModal() {
  const query = state.search.trim().toLowerCase();
  const results = query ? state.storefront.products.filter(product => `${product.name} ${product.description}`.toLowerCase().includes(query)) : [];
  return `<div class="overlay-shell search-overlay" data-action="modal-close"><section class="search-panel" data-stop-close><div class="search-panel-top"><p class="eyebrow">FIND YOUR NEXT GO-TO</p><button class="icon-button" data-action="modal-close" aria-label="Close">${icon('close')}</button></div><label class="search-box">${icon('search', 24)}<input id="storeSearch" placeholder="Search products, categories…" value="${esc(state.search)}" autocomplete="off"/><kbd>ESC</kbd></label><div class="search-results">${query ? (results.length ? results.slice(0, 4).map(product => `<button class="search-result" data-action="product-open" data-id="${esc(product.id)}"><img src="${esc(safeHref(product.imageUrl))}" alt=""/><span><b>${esc(product.name)}</b><small>${esc(product.badge || 'READY TO WEAR')}</small></span><strong>${money(product.priceMinor, product.currency)}</strong></button>`).join('') : '<p class="empty-inline">No matches this time. Try a different search.</p>') : '<p class="search-hint">TRY “HOODIE”, “TEE” OR “JACKET”</p>'}</div></section></div>`;
}
function renderMobileMenu() {
  return `<div class="overlay-shell menu-overlay" data-action="modal-close"><aside class="mobile-menu-drawer" data-stop-close><div class="drawer-head">${brandLogo(state.storefront.branding, state.storefront.store)}<button class="icon-button" data-action="modal-close">${icon('close')}</button></div><nav>${(state.storefront.categories || []).map(category => `<a href="#new-arrivals" data-action="modal-close">${esc(category.name)} ${icon('arrowUpRight', 16)}</a>`).join('')}<a href="#story" data-action="modal-close">Our story ${icon('arrowUpRight', 16)}</a></nav><a class="text-link" href="${adminHref('/admin')}" data-route="${adminHref('/admin')}">STORE ADMIN ${icon('arrowUpRight', 16)}</a></aside></div>`;
}
function renderCheckoutModal() {
  const cart = state.cart;
  return `<div class="overlay-shell checkout-overlay" data-action="modal-close"><section class="checkout-modal" data-stop-close><div class="drawer-head"><div><p class="eyebrow">ALMOST YOURS</p><h2>DELIVERY DETAILS</h2></div><button class="icon-button" data-action="modal-close">${icon('close')}</button></div><form data-form="checkout" class="checkout-form"><label>Full name<input name="name" autocomplete="name" required/></label><label>Email address<input name="email" type="email" autocomplete="email" required/></label><label>Delivery address<textarea name="address" rows="3" autocomplete="street-address" required></textarea></label><div class="checkout-total"><span>Order total</span><b>${money(cart?.totalMinor, cart?.currency)}</b></div><button class="button button-dark full-button" type="submit">PLACE PREVIEW ORDER ${icon('arrowUpRight', 16)}</button><p class="checkout-note">Preview checkout only. No payment is collected.</p></form></section></div>`;
}
function renderStorefront() {
  setTheme(state.storefront.branding);
  setSeo();
  const publicPath = normalizedStorefrontPath();
  const productSlug = publicPath.match(/^\/products\/([^/]+)/)?.[1];
  const collectionSlug = publicPath.match(/^\/collections\/([^/]+)/)?.[1];
  const product = productSlug && state.storefront.products.find(item => item.slug === productSlug);
  const category = collectionSlug && state.storefront.categories.find(item => item.slug === collectionSlug);
  if (product) app.innerHTML = renderProductPage(product);
  else if (category) app.innerHTML = renderCollectionPage(category);
  else app.innerHTML = `${renderAnnouncement()}${renderHeader()}${renderHome()}${renderOverlay()}`;
  if (state.overlay?.type === 'product') {
    const viewed = state.storefront.products.find(item => item.id === state.overlay.id);
    if (viewed) setEntitySeo({ title: viewed.seoTitle || `${viewed.name} — ${state.storefront.store.name}`, description: viewed.seoDescription || viewed.description, image: viewed.imageUrl, path: `${location.pathname}#${viewed.slug}` });
  }
}

function adminNav(pathname) {
  const links = [
    ['Overview','/admin','home'], ['Products','/admin/products','box'], ['Orders','/admin/orders','receipt'],
    ['Customers','/admin/customers','users'], ['Analytics','/admin/analytics','chart'],
  ];
  const activeSettings = pathname.startsWith('/admin/settings');
  return `<div class="admin-nav-group"><p class="admin-nav-label">WORKSPACE</p>${links.map(([name, href, glyph]) => `<a class="admin-nav-link ${pathname === href ? 'active' : ''}" href="${adminHref(href)}" data-route="${adminHref(href)}">${icon(glyph, 18)}<span>${name}</span>${name === 'Orders' && state.adminData?.stats?.pendingOrders ? `<i class="nav-count">${state.adminData.stats.pendingOrders}</i>` : ''}</a>`).join('')}</div>
    ${state.session?.role === 'SUPER_ADMIN' ? `<div class="admin-nav-group"><p class="admin-nav-label">PLATFORM</p><a class="admin-nav-link ${pathname === '/admin/stores' ? 'active' : ''}" href="${adminHref('/admin/stores')}" data-route="${adminHref('/admin/stores')}">${icon('store', 18)}<span>Stores</span></a></div>` : ''}
    <div class="admin-nav-group"><p class="admin-nav-label">STORE</p><a class="admin-nav-link ${activeSettings ? 'active' : ''}" href="${adminHref('/admin/settings/general')}" data-route="${adminHref('/admin/settings/general')}">${icon('settings', 18)}<span>Settings</span></a></div>`;
}
function renderAdminShell(content, pathname) {
  const store = state.adminData?.store || state.storefront.store;
  const brand = state.adminData?.branding || state.storefront.branding;
  const selected = state.selectedStoreSlug || store.slug;
  const options = state.session?.role === 'SUPER_ADMIN' && state.adminStores.length
    ? `<select class="store-switcher" data-control="store-switch">${state.adminStores.map(item => `<option value="${esc(item.slug)}" ${item.slug === selected ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select>`
    : `<span class="store-switcher-static">${esc(store.name)}</span>`;
  app.innerHTML = `<div class="admin-app"><aside class="admin-sidebar"><a href="${adminHref('/admin')}" data-route="${adminHref('/admin')}" class="admin-logo">${brandLogo(brand, store)}<small>STORE CONTROL</small></a><div class="admin-store-card"><span class="store-avatar">${esc((store.name || 'S').slice(0,1))}</span><span><b>${esc(store.name)}</b><small>${esc(store.slug)} · ${esc(store.currency)}</small></span><i class="online-dot"></i></div>${adminNav(pathname)}<div class="sidebar-spacer"></div><a class="back-to-store" href="${store.slug === state.storefront.store.slug ? '/' : `/store/${esc(store.slug)}`}" data-route="${store.slug === state.storefront.store.slug ? '/' : `/store/${esc(store.slug)}`}">${icon('arrowUpRight', 16)}<span>View storefront</span></a><button class="profile-row" data-action="logout"><span class="profile-avatar">${esc((state.session?.name || state.session?.email || 'A').slice(0,1).toUpperCase())}</span><span><b>${esc(state.session?.name || state.session?.email || 'Store admin')}</b><small>${esc(state.session?.role || 'ADMIN').replaceAll('_',' ')}</small></span><span class="profile-more">···</span></button></aside>
  <div class="admin-main"><header class="admin-topbar"><div class="admin-topbar-title"><span class="admin-breadcrumb">PLATFORM <i>/</i></span>${options}<span class="admin-status-pill"><i></i> LIVE</span></div><div class="admin-topbar-actions"><span class="admin-date">${new Intl.DateTimeFormat(state.adminData?.store?.language || 'en', { month:'short', day:'numeric', year:'numeric' }).format(new Date())}</span><a href="${store.slug === state.storefront.store.slug ? '/' : `/store/${esc(store.slug)}`}" data-route="${store.slug === state.storefront.store.slug ? '/' : `/store/${esc(store.slug)}`}" class="view-store-link">VIEW STORE ${icon('arrowUpRight', 14)}</a></div></header><main class="admin-content">${content}</main><footer class="admin-footer"><span>STORE CONTROL CENTER</span><span>ALL DATA SCOPED TO <b>${esc(store.slug)}</b></span></footer></div></div>${renderOverlay()}`;
  setTheme(brand);
}
function adminPageHeader(eyebrow, title, subtitle, action = '') {
  return `<div class="admin-page-header"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${title}</h1><p class="admin-page-subtitle">${esc(subtitle)}</p></div>${action}</div>`;
}
function adminDashboard() {
  const data = state.adminData;
  const stats = data.stats;
  const currency = data.store.currency;
  const metrics = [
    ['TOTAL SALES', money(stats.revenueMinor, currency), 'Across completed and open orders', 'revenue'],
    ['ORDERS', String(stats.orderCount).padStart(2, '0'), `${stats.pendingOrders} need attention`, 'receipt'],
    ['ACTIVE PRODUCTS', String(stats.productCount).padStart(2, '0'), 'Available in this storefront', 'box'],
    ['CUSTOMERS', String(stats.customerCount).padStart(2, '0'), 'Store-owned customer profiles', 'users'],
  ];
  const orders = data.orders || [];
  const products = data.products || [];
  return `${adminPageHeader('STORE OVERVIEW', 'Good to see you.', 'Here’s how your store is doing today.', `<a class="button button-dark admin-action-button" href="/admin/products" data-route="/admin/products">${icon('plus',16)} ADD A PRODUCT</a>`)}
    <section class="metric-grid">${metrics.map(([label,value,note,glyph],i) => `<article class="metric-card" style="--metric-index:${i}"><div class="metric-top"><span>${esc(label)}</span><span class="metric-icon">${icon(glyph === 'revenue' ? 'chart' : glyph, 17)}</span></div><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('')}</section>
    <section class="admin-content-grid"><article class="admin-panel sales-panel"><div class="panel-heading"><div><p class="eyebrow">STORE PERFORMANCE</p><h2>SALES OVERVIEW</h2></div><span class="period-selector">LAST 30 DAYS <span>⌄</span></span></div><div class="sales-empty"><div class="sales-bars">${[38,58,44,68,50,82,60,92,45,73,56,86,63,78].map((height,i) => `<i style="--bar:${height}%;--bar-index:${i}"></i>`).join('')}</div><div class="sales-empty-note"><span class="chart-orb">${icon('chart',18)}</span><b>YOUR NEXT BIG MONTH STARTS HERE.</b><p>Sales activity will appear as soon as orders come in.</p></div><div class="chart-labels"><span>01 OCT</span><span>08 OCT</span><span>15 OCT</span><span>22 OCT</span><span>30 OCT</span></div></div></article>
      <article class="admin-panel launch-panel"><div class="panel-heading"><div><p class="eyebrow">SETUP CHECKLIST</p><h2>READY WHEN YOU ARE</h2></div><span class="check-progress">2 / 4</span></div><p class="launch-intro">A few quick steps to make this storefront yours.</p><div class="launch-steps"><a href="/admin/settings/branding" data-route="/admin/settings/branding"><span class="step-check done">${icon('check', 14)}</span><span><b>Make it yours</b><small>Brand identity and colors</small></span>${icon('arrowUpRight', 15)}</a><a href="/admin/products" data-route="/admin/products"><span class="step-check done">${icon('check', 14)}</span><span><b>Add your collection</b><small>${stats.productCount} pieces in the catalog</small></span>${icon('arrowUpRight', 15)}</a><a href="/admin/settings/domain" data-route="/admin/settings/domain"><span class="step-check">03</span><span><b>Connect a domain</b><small>Use a home of your own</small></span>${icon('arrowUpRight', 15)}</a><a href="/admin/settings/payments" data-route="/admin/settings/payments"><span class="step-check">04</span><span><b>Choose how you get paid</b><small>Set up a payment provider</small></span>${icon('arrowUpRight', 15)}</a></div></article>
    </section><section class="admin-panel recent-panel"><div class="panel-heading"><div><p class="eyebrow">THE LATEST</p><h2>RECENT ORDERS</h2></div><a href="/admin/orders" data-route="/admin/orders" class="panel-link">VIEW ALL ${icon('arrowUpRight', 14)}</a></div>${orders.length ? renderOrderTable(orders.slice(0,5), currency) : `<div class="table-empty"><span class="empty-order-icon">${icon('receipt',24)}</span><div><b>THE FIRST ORDER IS A GOOD ONE.</b><p>When it comes in, you’ll find all the details here.</p></div><a href="/admin/settings/payments" data-route="/admin/settings/payments">SET UP PAYMENTS ${icon('arrowUpRight',14)}</a></div>`}</section>
    <section class="admin-panel product-admin-panel"><div class="panel-heading"><div><p class="eyebrow">IN THE SPOTLIGHT</p><h2>YOUR PRODUCTS</h2></div><a href="/admin/products" data-route="/admin/products" class="panel-link">MANAGE PRODUCTS ${icon('arrowUpRight', 14)}</a></div>${renderProductsTable(products, currency)}</section>`;
}
function renderOrderTable(orders, currency) {
  return `<div class="table-wrap"><table class="admin-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>DATE</th><th>STATUS</th><th class="align-right">TOTAL</th></tr></thead><tbody>${orders.map(order => `<tr><td><b>#${esc(order.orderNumber)}</b></td><td>${esc(order.customerName)}</td><td>${esc(new Date(order.createdAt).toLocaleDateString())}</td><td><span class="status-pill status-${esc(order.status)}">${esc(order.status.replaceAll('_',' '))}</span></td><td class="align-right"><b>${money(order.totalMinor, order.currency || currency)}</b></td></tr>`).join('')}</tbody></table></div>`;
}
function renderProductsTable(products, currency) {
  return products.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>PRODUCT</th><th>SKU</th><th>INVENTORY</th><th>STATUS</th><th class="align-right">PRICE</th><th></th></tr></thead><tbody>${products.map(product => `<tr><td><div class="product-table-name"><img src="${esc(safeHref(product.imageUrl))}" alt=""/><span><b>${esc(product.name)}</b><small>${esc(product.badge || 'STORE CATALOG')}</small></span></div></td><td>${esc(product.sku)}</td><td>${product.variants?.reduce((sum,v) => sum + v.available,0) || 0} in stock</td><td><span class="status-pill status-${esc(product.status)}">${esc(product.status)}</span></td><td class="align-right"><b>${money(product.priceMinor, currency)}</b></td><td><button class="table-more" data-action="product-status" data-id="${esc(product.id)}" data-status="${product.status === 'active' ? 'draft' : 'active'}">···</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="table-empty"><span class="empty-order-icon">${icon('box',24)}</span><div><b>NO PRODUCTS YET.</b><p>Make a first listing to start building your collection.</p></div></div>`;
}
function productsPage(productsData) {
  const products = productsData.products || [];
  const currency = state.adminData.store.currency;
  return `${adminPageHeader('THE CATALOG', 'Products.', 'The pieces available in this store.', `<button class="button button-dark admin-action-button" data-action="product-create">${icon('plus',16)} ADD PRODUCT</button>`)}<div class="admin-toolbar"><div class="search-field">${icon('search',17)}<input data-control="product-filter" placeholder="Find a product…"/></div><span class="toolbar-count">${products.length} PRODUCTS</span><button class="filter-button" data-action="product-filter-status">ALL PRODUCTS <span>⌄</span></button></div><section class="admin-panel products-list-panel">${renderProductsTable(products, currency)}</section>`;
}
function ordersPage(data) {
  return `${adminPageHeader('THE ORDER BOOK', 'Orders.', 'Every order, kept tidy in one place.', `<span class="quiet-label">${data.orders.length} TOTAL</span>`)}<section class="admin-panel orders-list-panel">${data.orders.length ? renderOrderTable(data.orders, data.store.currency) : `<div class="large-empty"><span>${icon('receipt',28)}</span><p class="eyebrow">NO ORDERS JUST YET</p><h2>THE FIRST ORDER<br/>IS A GOOD ONE.</h2><p>Orders will show up here as soon as your customers place them.</p><a href="/" data-route="/">TAKE A LOOK AT THE STORE ${icon('arrowUpRight',15)}</a></div>`}</section>`;
}
function customersPage(data) {
  const customers = data.customers || [];
  return `${adminPageHeader('YOUR COMMUNITY', 'Customers.', 'People who make your store what it is.', `<span class="quiet-label">${customers.length} CUSTOMERS</span>`)}<section class="admin-panel">${customers.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>NAME</th><th>EMAIL</th><th>ORDERS</th><th>JOINED</th><th class="align-right">LIFETIME VALUE</th></tr></thead><tbody>${customers.map(c => `<tr><td><div class="customer-name"><span>${esc(`${c.firstName || ''} ${c.lastName || ''}`.trim().slice(0,1) || c.email.slice(0,1).toUpperCase())}</span><b>${esc(`${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Customer')}</b></div></td><td>${esc(c.email)}</td><td>${c.orders}</td><td>${new Date(c.createdAt).toLocaleDateString()}</td><td class="align-right"><b>${money(c.spentMinor, data.store.currency)}</b></td></tr>`).join('')}</tbody></table></div>` : `<div class="large-empty"><span>${icon('users',28)}</span><p class="eyebrow">YOUR COMMUNITY IS STARTING</p><h2>GOOD THINGS<br/>TRAVEL BY WORD.</h2><p>Customer profiles are created when an order is placed.</p></div>`}</section>`;
}
function analyticsPage(data) {
  const days = data.analytics?.byDay || [];
  const max = Math.max(1, ...days.map(day => day.revenueMinor));
  const products = data.analytics?.topProducts || [];
  return `${adminPageHeader('THE BIG PICTURE', 'Analytics.', 'A clear view of how this store is moving.', '<span class="quiet-label">LAST 30 DAYS</span>')}<section class="metric-grid compact-metrics"><article class="metric-card"><div class="metric-top"><span>ORDERS</span>${icon('receipt',17)}</div><strong>${data.overview.stats.orderCount}</strong><small>Across the store</small></article><article class="metric-card"><div class="metric-top"><span>GROSS SALES</span>${icon('chart',17)}</div><strong>${money(data.overview.stats.revenueMinor, data.overview.store.currency)}</strong><small>Before refunds and fees</small></article><article class="metric-card"><div class="metric-top"><span>RETURNING CUSTOMERS</span>${icon('users',17)}</div><strong>${data.customers.filter(c => c.orders > 1).length}</strong><small>More than one order</small></article><article class="metric-card"><div class="metric-top"><span>PRODUCTS</span>${icon('box',17)}</div><strong>${data.overview.stats.productCount}</strong><small>Currently published</small></article></section><section class="admin-content-grid"><article class="admin-panel analytics-chart"><div class="panel-heading"><div><p class="eyebrow">DAILY SALES</p><h2>LAST 30 DAYS</h2></div></div>${days.length ? `<div class="analytics-bars">${days.map(day => `<div title="${esc(day.day)} · ${money(day.revenueMinor, data.overview.store.currency)}"><i style="--height:${Math.max(6,day.revenueMinor/max*100)}%"></i><small>${esc(day.day.slice(5))}</small></div>`).join('')}</div>` : `<div class="chart-blank"><span>${icon('chart',25)}</span><b>YOUR SALES TRENDS WILL TAKE SHAPE HERE.</b><p>Once orders are flowing, this chart will tell the story.</p></div>`}</article><article class="admin-panel top-products"><div class="panel-heading"><div><p class="eyebrow">CUSTOMER FAVORITES</p><h2>TOP PRODUCTS</h2></div></div>${products.length ? products.map((p,i) => `<div class="top-product-row"><span>0${i+1}</span><b>${esc(p.name)}</b><small>${p.units} SOLD</small><strong>${money(p.revenueMinor, data.overview.store.currency)}</strong></div>`).join('') : '<div class="chart-blank short-blank"><b>THE FIRST FAVORITE IS STILL TO COME.</b><p>Popular products will appear here.</p></div>'}</article></section>`;
}
function storesPage() {
  return `${adminPageHeader('PLATFORM MANAGEMENT', 'Your stores.', 'Create and manage independent storefronts from one place.', '<span class="quiet-label platform-pill">SUPER ADMIN</span>')}
    <section class="store-create-layout"><article class="admin-panel store-create-panel"><div class="panel-heading"><div><p class="eyebrow">A NEW HOME FOR A NEW BRAND</p><h2>CREATE A STORE</h2></div>${icon('spark',20)}</div><form class="stack-form" data-form="store-create"><label>Store name<input name="name" placeholder="e.g. Field Notes Supply" required/></label><label>Store slug<div class="slug-input"><span>store/</span><input name="slug" placeholder="field-notes" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required/></div></label><div class="form-two-col"><label>Currency<select name="currency" required><option value="" disabled selected>Choose currency</option><option value="USD">USD · US Dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · Pound Sterling</option><option value="INR">INR · Indian Rupee</option><option value="CAD">CAD · Canadian Dollar</option><option value="AUD">AUD · Australian Dollar</option><option value="JPY">JPY · Japanese Yen</option></select></label><label>Country<input name="country" maxlength="2" placeholder="ISO code" required/></label></div><label>Short description<textarea name="description" rows="3" placeholder="A few words about this store"></textarea></label><button type="submit" class="button button-dark full-button">CREATE STORE ${icon('arrowUpRight',16)}</button><small class="form-footnote">The new store starts with independent branding, settings and catalog data.</small></form></article>
      <article class="admin-panel platform-stores-panel"><div class="panel-heading"><div><p class="eyebrow">THE STORES UNDER THIS ROOF</p><h2>ALL STORES</h2></div><span class="check-progress">${state.adminStores.length} LIVE</span></div><div class="store-list">${state.adminStores.map((store,i) => `<div class="platform-store-row"><span class="store-number">0${i+1}</span><div class="platform-store-icon">${esc(store.name.slice(0,1))}</div><div class="platform-store-info"><b>${esc(store.name)}</b><small>${esc(store.slug)} · ${esc(store.country)} · ${esc(store.currency)}</small></div><span class="status-pill status-${esc(store.status)}">${esc(store.status)}</span><button class="panel-link" data-action="store-manage" data-id="${esc(store.slug)}">MANAGE ${icon('arrowUpRight',14)}</button></div>`).join('')}</div></article></section>`;
}

function formField(label, name, value, type = 'text', hint = '', attributes = '') {
  const input = type === 'textarea'
    ? `<textarea name="${esc(name)}" rows="4" ${attributes}>${esc(value ?? '')}</textarea>`
    : `<input type="${type}" name="${esc(name)}" value="${esc(value ?? '')}" ${attributes}/>`;
  return `<label class="settings-field"><span>${esc(label)}</span>${input}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}
function selectField(label, name, value, options, hint = '') {
  return `<label class="settings-field"><span>${esc(label)}</span><select name="${esc(name)}">${options.map(([key,labelText]) => `<option value="${esc(key)}" ${String(value) === key ? 'selected' : ''}>${esc(labelText)}</option>`).join('')}</select>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}
function toggleField(label, name, checked, hint = '') {
  return `<label class="toggle-field"><span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span><input type="checkbox" name="${esc(name)}" ${checked ? 'checked' : ''}/><i></i></label>`;
}
function settingsLinks(active) {
  return `<nav class="settings-subnav">${Object.entries(settingsMeta).map(([key,meta]) => `<a href="/admin/settings/${key}" data-route="/admin/settings/${key}" class="${active === key ? 'active' : ''}">${esc(meta.title)}${active === key ? '<i></i>' : ''}</a>`).join('')}</nav>`;
}
function brandingPage(data) {
  const brand = data.branding;
  const preview = `<div class="brand-preview" id="brandPreview"><div class="preview-window"><div class="preview-header"><span class="preview-logo">${esc(brand.storeName || state.adminData.store.name)}</span><div><i></i><i></i><i></i></div></div><div class="preview-hero"><small>NEW SEASON · MADE FOR EVERY DAY</small><b>YOUR BRAND.<br/>YOUR WAY.</b><span>Everyday goods with a point of view.</span><button>SHOP THE EDIT <i>↗</i></button></div><div class="preview-products"><i></i><i></i><i></i></div></div><div class="preview-caption"><span><i></i> LIVE STOREFRONT PREVIEW</span><span>BRAND VARIABLES APPLY ACROSS THE STORE</span></div></div>`;
  const colors = [['Primary color','primaryColor'],['Secondary color','secondaryColor'],['Accent color','accentColor'],['Background color','backgroundColor'],['Text color','textColor']];
  return `${adminPageHeader('YOUR STOREFRONT', 'Make it yours.', 'A small shift in the details makes a world of difference.')}${settingsLinks('branding')}<form data-form="branding-save" class="branding-layout"><div class="branding-form-column"><section class="settings-card"><div class="settings-card-head"><span class="settings-step">01</span><div><h2>BRAND IDENTITY</h2><p>The name and assets customers will see.</p></div></div><div class="settings-fields two-fields">${formField('Store name','storeName',brand.storeName || state.adminData.store.name,'text','Shows in the header and your page title','data-brand-field="storeName" required')}${formField('Store description','description',brand.description || state.adminData.store.description,'text','One line that captures the store','data-brand-field="description"')}${formField('Logo URL','logo',brand.logo,'url','Paste an image URL, or upload a file below','data-brand-field="logo"')}${formField('Favicon URL','favicon',brand.favicon,'url','A small icon for browser tabs','data-brand-field="favicon"')}<label class="settings-field upload-field"><span>Upload logo image</span><input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp"/><small>PNG, JPEG or WebP · up to 2 MB</small></label></div></section>
    <section class="settings-card"><div class="settings-card-head"><span class="settings-step">02</span><div><h2>YOUR PALETTE</h2><p>One primary, one accent and a calm canvas.</p></div></div><div class="color-fields">${colors.map(([label,key]) => `<label class="color-setting"><span class="color-swatch" style="--swatch:${esc(brand[key])}"><input type="color" name="${key}" value="${esc(brand[key] || '#ffffff')}" data-brand-field="${key}" aria-label="${label}"/></span><span><b>${esc(label)}</b><small>${esc(brand[key] || '')}</small></span></label>`).join('')}</div></section>
    <section class="settings-card"><div class="settings-card-head"><span class="settings-step">03</span><div><h2>TYPE & DETAILS</h2><p>Set the voice, shape and feel of the interface.</p></div></div><div class="settings-fields two-fields">${selectField('Body font','fontFamily',brand.fontFamily,[['DM Sans','DM Sans'],['Arial','Arial'],['Georgia','Georgia'],['system-ui','System UI']])}${selectField('Heading font','headingFont',brand.headingFont,[['Barlow Condensed','Barlow Condensed'],['DM Sans','DM Sans'],['Georgia','Georgia'],['Arial','Arial']])}${selectField('Button shape','buttonStyle',brand.buttonStyle,[['square','Square'],['rounded','Rounded'],['pill','Pill']])}${selectField('Card style','cardStyle',brand.cardStyle,[['editorial','Editorial'],['soft','Soft corners'],['minimal','Minimal']])}<label class="settings-field range-field"><span>Border radius <b data-radius-value>${brand.borderRadius}px</b></span><input type="range" min="0" max="24" name="borderRadius" value="${brand.borderRadius}" data-brand-field="borderRadius"/></label></div></section><div class="save-row"><button class="button button-dark" type="submit">SAVE BRANDING ${icon('arrowUpRight',15)}</button><span data-save-state>Changes preview live before you save.</span></div></div><aside class="preview-column">${preview}<div class="preview-tip"><span>${icon('spark',18)}</span><div><b>ONE STORE, YOUR WHOLE LOOK.</b><p>Colors, type and button styles are shared design tokens. Change them once, see them everywhere.</p></div></div></aside></form>`;
}
const generalCurrencyOptions = [['USD','USD · US Dollar'],['EUR','EUR · Euro'],['GBP','GBP · Pound Sterling'],['INR','INR · Indian Rupee'],['CAD','CAD · Canadian Dollar'],['AUD','AUD · Australian Dollar'],['JPY','JPY · Japanese Yen'],['CHF','CHF · Swiss Franc']];
function settingFields(section, settings) {
  if (section === 'homepage') return `<div class="settings-fields">${formField('Announcement strip','announcement',settings.announcement,'text','A short line above the header')}${formField('Hero eyebrow','heroEyebrow',settings.heroEyebrow,'text')}${formField('Hero headline','heroTitle',settings.heroTitle,'textarea','Use a line break to control the headline stack')}${formField('Hero description','heroBody',settings.heroBody,'textarea')}${formField('Hero image URL','heroImageUrl',settings.heroImageUrl,'url','Use an HTTPS image URL or upload one in Branding')}${formField('Hero button label','heroLinkText',settings.heroLinkText,'text')}${formField('Featured collection eyebrow','collectionEyebrow',settings.collectionEyebrow,'text')}${formField('Featured collection headline','collectionTitle',settings.collectionTitle,'textarea')}${formField('Featured collection description','collectionBody',settings.collectionBody,'textarea')}${formField('Featured collection image URL','collectionImageUrl',settings.collectionImageUrl,'url')}</div>`;
  if (section === 'general') return `<div class="settings-fields two-fields">${formField('Store name','storeName',settings.storeName,'text','Displayed to shoppers','required')}${formField('Store description','description',settings.description,'text','A short line about your store')}${selectField('Currency','currency',settings.currency,generalCurrencyOptions,'Used for product prices, carts, orders and reports')}${formField('Country','country',settings.country,'text','ISO country code, for example US','maxlength="2"')}${formField('Language','language',settings.language,'text','Storefront language tag, such as en')}${formField('Timezone','timezone',settings.timezone,'text','Used for order times and reports')}${formField('Contact email','contactEmail',settings.contactEmail,'email')}${formField('Contact phone','contactPhone',settings.contactPhone,'tel')}${formField('Business address','businessAddress',settings.businessAddress,'text')}</div>`;
  if (section === 'domain') return `<div class="domain-current"><div><span class="domain-icon">${icon('globe',19)}</span><div><small>PLATFORM ADDRESS</small><b>${esc(settings.primaryDomain || `${state.adminData.store.slug}.platform.local`)}</b></div></div><span class="status-pill status-active">CONNECTED</span></div><div class="settings-fields">${formField('Custom domain','customDomain',settings.customDomain,'text','Enter a domain you own, like www.yourbrand.com. DNS verification is provided by your hosting provider.')}</div><div class="domain-verification"><div><span class="domain-status-dot"></span><div><b>DOMAIN VERIFICATION</b><p>Status: ${esc(settings.verificationStatus || 'not configured')} · SSL: ${esc(settings.sslStatus || 'not configured')}</p><small>DNS verification is not configured for this local preview. Add a provider to verify domain ownership.</small></div></div><button type="button" class="button button-outline" data-action="domain-verify">CHECK STATUS ${icon('arrowUpRight',14)}</button></div>`;
  if (section === 'payments') return `${selectField('Payment provider','provider',settings.provider,[['mock','Preview checkout'],['stripe','Stripe'],['razorpay','Razorpay']],'Provider selection is store-scoped; credentials stay server-side.')}${formField('Checkout label','displayName',settings.displayName,'text','Shown near checkout')}${toggleField('Test mode','testMode',settings.testMode,'No live charges are made by the local preview.')}
    <div class="integration-note"><span>${icon('spark',18)}</span><div><b>${settings.provider === 'mock' ? 'PREVIEW MODE IS READY.' : `${String(settings.provider || '').toUpperCase()} NEEDS SERVER CREDENTIALS.`}</b><p>${settings.provider === 'mock' ? 'The preview checkout creates an order record and never processes a payment.' : 'Connect encrypted provider credentials on the server before accepting payments. Secret keys are never returned to this interface.'}</p></div></div>`;
  if (section === 'shipping') return `<div class="settings-fields two-fields">${formField('Flat shipping rate','flatRate',settings.flatRate,'number','Set to 0 for free shipping','min="0" step="0.01"')}${formField('Free shipping threshold','freeShippingThreshold',settings.freeShippingThreshold,'number','Order subtotal needed for free shipping','min="0" step="0.01"')}${formField('Delivery estimate','deliveryEstimate',settings.deliveryEstimate,'text','Shown at checkout')}${toggleField('Local pickup','localPickup',settings.localPickup,'Offer pickup at a store location.')}</div><div class="integration-note"><span>${icon('globe',18)}</span><div><b>SHIPPING ZONES</b><p>${settings.zones?.length ? settings.zones.map(zone => esc(zone.name)).join(' · ') : 'No shipping zones added yet. Add delivery zones and rates when configuring this store.'}</p></div></div>`;
  if (section === 'taxes') return `<div class="settings-fields two-fields">${formField('Tax name','taxName',settings.taxName,'text','Shown on customer receipts')}${formField('Tax percentage','percentage',settings.percentage,'number','Calculated on the server','min="0" max="100" step="0.01"')}</div>${toggleField('Enable tax calculation','enabled',settings.enabled,'Tax is calculated server-side for every order.')}${toggleField('Prices include tax','pricesIncludeTax',settings.pricesIncludeTax,'Use tax-inclusive display prices where required.')}`;
  if (section === 'email') return `<div class="settings-fields two-fields">${formField('Sender name','senderName',settings.senderName,'text')}${formField('Sender email','senderEmail',settings.senderEmail,'email')}${formField('Reply-to address','replyTo',settings.replyTo,'email')}${selectField('Email provider','provider',settings.provider,[['not_configured','Not configured'],['smtp','SMTP'],['resend','Resend'],['sendgrid','SendGrid']])}</div><div class="integration-note"><span>${icon('spark',18)}</span><div><b>BRANDED TRANSACTIONAL EMAIL</b><p>Order confirmations, shipping updates and welcome messages use this store’s name, logo, palette and contact details.</p></div></div>`;
  if (section === 'seo') return `<div class="settings-fields">${formField('Meta title','metaTitle',settings.metaTitle,'text','Keep it specific to this store')}${formField('Meta description','metaDescription',settings.metaDescription,'textarea','A short summary for search results')}${formField('Open Graph image URL','openGraphImage',settings.openGraphImage,'url')}${formField('Canonical domain','canonicalDomain',settings.canonicalDomain,'url')}${selectField('Robots','robots',settings.robots,[['index,follow','Index and follow'],['noindex,nofollow','No index, no follow'],['index,nofollow','Index, no follow'],['noindex,follow','No index, follow']])}${toggleField('Include store sitemap','sitemapEnabled',settings.sitemapEnabled,'Product and category routes use the active store domain.')}</div>`;
  if (section === 'social') return `<div class="settings-fields">${formField('Instagram','instagram',settings.instagram,'url')}${formField('TikTok','tiktok',settings.tiktok,'url')}${formField('Facebook','facebook',settings.facebook,'url')}${formField('X / Twitter','x',settings.x,'url')}</div>`;
  if (section === 'policies') return `<div class="settings-fields">${formField('About the store','about',settings.about,'textarea')}${formField('Privacy policy','privacy',settings.privacy,'textarea')}${formField('Terms and conditions','terms',settings.terms,'textarea')}${formField('Refund policy','refund',settings.refund,'textarea')}${formField('Shipping policy','shipping',settings.shipping,'textarea')}</div>`;
  return '';
}
function genericSettingsPage(section, settings) {
  const meta = settingsMeta[section] || settingsMeta.general;
  return `${adminPageHeader('STORE SETTINGS', `${esc(meta.title)}.`, meta.description)}${settingsLinks(section)}<form data-form="settings-save" data-section="${esc(section)}" class="settings-main-layout"><section class="settings-card generic-settings-card"><div class="settings-card-head"><span class="settings-step">${Object.keys(settingsMeta).indexOf(section) + 1}</span><div><h2>${esc(meta.title.toUpperCase())} SETTINGS</h2><p>${esc(meta.description)}</p></div></div><div class="settings-fields">${settingFields(section, settings)}</div></section><div class="save-row"><button class="button button-dark" type="submit">SAVE ${esc(meta.title.toUpperCase())} ${icon('arrowUpRight',15)}</button><span data-save-state>Changes apply to this store.</span></div></form>`;
}
function loginPage() {
  return `<div class="admin-login-page"><div class="admin-login-card"><div class="login-brand">${brandLogo(state.storefront.branding, state.storefront.store)}<span>STORE CONTROL</span></div><p class="eyebrow">A BETTER WAY TO RUN THINGS</p><h1>YOUR STORE,<br/><em>YOUR RULES.</em></h1><p>Sign in to manage your storefront, orders and brand settings.</p>${state.session?.demoMode ? `<button class="button button-dark full-button" data-action="demo-login">OPEN PREVIEW ADMIN ${icon('arrowUpRight',16)}</button><small class="login-note">Local preview access · no password needed</small>` : `<form data-form="admin-login" class="stack-form"><label>Email<input name="email" type="email" autocomplete="username" required/></label><label>Password<input name="password" type="password" autocomplete="current-password" required/></label><button type="submit" class="button button-dark full-button">SIGN IN ${icon('arrowUpRight',16)}</button></form>`}<a href="/" data-route="/">${icon('arrow',14)} BACK TO THE STOREFRONT</a></div><div class="login-side-note"><span>${icon('spark',20)}</span><p>GOOD DESIGN. GOOD BUSINESS.<br/>THE REST IS UP TO YOU.</p></div></div>`;
}
function adminLoading() { app.innerHTML = '<div class="admin-loading"><span class="boot-mark">S</span><span>Getting everything in order…</span></div>'; }

async function renderAdmin() {
  const version = ++state.renderVersion;
  if (!state.session?.user) {
    state.session = state.session?.demoMode !== undefined ? state.session : await api('/api/admin/session');
    if (version !== state.renderVersion) return;
  }
  if (!state.session?.user) {
    app.innerHTML = loginPage();
    document.documentElement.dataset.admin = 'true';
    return;
  }
  state.session = state.session.user ? state.session : { ...state.session, user: null };
  if (!state.session.role && state.session.user) Object.assign(state.session, state.session.user);
  const user = state.session.user || state.session;
  state.session = { ...state.session, ...user, user };
  adminLoading();
    const pathname = normalizedAdminPath();
  try {
    if (user.role === 'SUPER_ADMIN') {
      const storeList = await api('/api/admin/stores', { admin: true });
      if (version !== state.renderVersion) return;
      state.adminStores = storeList.stores || [];
      if (!state.selectedStoreSlug || !state.adminStores.some(store => store.slug === state.selectedStoreSlug)) state.selectedStoreSlug = state.storefront.store.slug;
    }
    const overview = await api('/api/admin/overview', { admin: true });
    if (version !== state.renderVersion) return;
    state.adminData = overview;
    setTheme(overview.branding);
    let page = '';
    if (pathname === '/admin' || pathname === '/admin/') page = adminDashboard();
    else if (pathname === '/admin/stores') page = user.role === 'SUPER_ADMIN' ? storesPage() : adminDashboard();
    else if (pathname === '/admin/products') { const productsData=await api('/api/admin/products', { admin: true }); state.adminData.categories=productsData.categories || []; page = productsPage(productsData); }
    else if (pathname === '/admin/orders') page = ordersPage({ store: overview.store, orders: (await api('/api/admin/orders', { admin: true })).orders });
    else if (pathname === '/admin/customers') page = customersPage({ ...overview, ...(await api('/api/admin/customers', { admin: true })) });
    else if (pathname === '/admin/analytics') page = analyticsPage({ overview, customers: (await api('/api/admin/customers', { admin: true })).customers || [], analytics: await api('/api/admin/analytics', { admin: true }) });
    else if (pathname === '/admin/settings/branding') page = brandingPage({ branding: (await api('/api/admin/branding', { admin: true })).branding });
    else {
      const section = pathname.split('/').at(-1);
      if (settingsMeta[section] && section !== 'branding') page = genericSettingsPage(section, (await api(`/api/admin/settings/${section}`, { admin: true })).settings);
      else if (pathname === '/admin/settings' || pathname === '/admin/settings/') {
        history.replaceState({}, '', '/admin/settings/general');
        page = genericSettingsPage('general', (await api('/api/admin/settings/general', { admin: true })).settings);
      } else page = adminDashboard();
    }
    if (version !== state.renderVersion) return;
    renderAdminShell(page, pathname);
    document.documentElement.dataset.admin = 'true';
  } catch (error) {
    if (version !== state.renderVersion) return;
    if (/sign in/i.test(error.message)) { state.session = { ...state.session, user: null }; app.innerHTML = loginPage(); }
    else app.innerHTML = `<div class="admin-error"><span>${icon('spark',22)}</span><h1>WE HIT A SMALL SNAG.</h1><p>${esc(error.message)}</p><button class="button button-dark" data-action="admin-refresh">TRY AGAIN ${icon('arrowUpRight',15)}</button></div>`;
  }
}
function render() {
  if (/^\/admin(?:\/|$)/.test(normalizedAdminPath())) { renderAdmin(); return; }
  document.documentElement.dataset.admin = 'false';
  if (!state.storefront) { app.innerHTML = '<div class="boot-screen"><span class="boot-mark">S</span><span>Setting up your store</span></div>'; return; }
  renderStorefront();
}

async function refreshCart() {
  state.cart = await api('/api/cart');
  if (state.overlay?.type === 'cart') render();
}
async function reloadStorefront() {
  state.storefront = await api('/api/storefront');
  setTheme(state.storefront.branding); setSeo(); render();
}
function navigate(to) {
  if (!to) return;
  const current = location.pathname;
  if (to === current) return;
  state.overlay = null;
  history.pushState({}, '', to);
  if (!to.startsWith('/admin')) {
    const match = to.match(/^\/store\/([a-z0-9-]+)/i);
    const currentSlug = state.storefront?.store?.slug;
    if ((match && match[1] !== currentSlug) || (!match && current.startsWith('/store/'))) {
      reloadStorefront().catch(error => toast(error.message, 'error'));
      return;
    }
  }
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function readForm(form) {
  const values = {};
  new FormData(form).forEach((value, key) => { if (!(value instanceof File)) values[key] = value; });
  for (const input of form.querySelectorAll('input[type="checkbox"]')) values[input.name] = input.checked;
  for (const input of form.querySelectorAll('input[type="number"]')) if (values[input.name] !== undefined) values[input.name] = Number(values[input.name]);
  return values;
}
function currentBrandPreview(form) {
  const values = readForm(form);
  const brand = { ...state.adminData.branding, ...values };
  const preview = document.querySelector('#brandPreview');
  if (!preview) return;
  preview.style.setProperty('--preview-primary', brand.primaryColor || '#536579');
  preview.style.setProperty('--preview-secondary', brand.secondaryColor || '#151515');
  preview.style.setProperty('--preview-accent', brand.accentColor || '#d8dfd0');
  preview.style.setProperty('--preview-background', brand.backgroundColor || '#f7f6f2');
  preview.style.setProperty('--preview-text', brand.textColor || '#171717');
  preview.style.setProperty('--preview-radius', `${brand.borderRadius || 0}px`);
  preview.style.setProperty('--preview-font', `'${String(brand.fontFamily || 'DM Sans').replace(/[^\w -]/g, '')}',sans-serif`);
  preview.style.setProperty('--preview-heading', `'${String(brand.headingFont || 'Barlow Condensed').replace(/[^\w -]/g, '')}',sans-serif`);
  preview.dataset.buttonStyle = brand.buttonStyle || 'square';
  preview.dataset.cardStyle = brand.cardStyle || 'editorial';
  const wordmark = preview.querySelector('.preview-logo');
  if (wordmark) {
    const logo = values.logo || state.tempLogoData;
    if (logo) { const previewSource = logo === state.tempLogoData && /^data:image\/(?:png|jpeg|webp);base64,/i.test(logo) ? logo : safeHref(logo); wordmark.innerHTML = `<img src="${esc(previewSource)}" alt="${esc(values.storeName || state.adminData.store.name)}"/>`; }
    else wordmark.textContent = values.storeName || state.adminData.store.name;
  }
  const saveHint = form.querySelector('[data-radius-value]');
  if (saveHint) saveHint.textContent = `${brand.borderRadius}px`;
  const colorFields = form.querySelectorAll('.color-setting');
  colorFields.forEach(field => { const input=field.querySelector('input'); const swatch=field.querySelector('.color-swatch'); const small=field.querySelector('small'); if(input&&swatch){swatch.style.setProperty('--swatch',input.value);if(small)small.textContent=input.value;} });
}
function formMessage(form, message, good = true) {
  const target = form.querySelector('[data-save-state]');
  if (target) { target.textContent = message; target.dataset.state = good ? 'good' : 'error'; }
}
async function addProductToCart(product, variantId, qty = 1) {
  try {
    const variant = variantId || product.variants?.find(item => item.available > 0)?.id;
    if (!variant) return toast('That piece is currently sold out.', 'error');
    state.cart = await api('/api/cart/items', { method: 'POST', body: { productId: product.id, variantId: variant, quantity: qty } });
    state.overlay = { type: 'cart' };
    render();
    toast('A good choice. Added to your bag.');
  } catch (error) { toast(error.message, 'error'); }
}

app.addEventListener('click', async event => {
  const route = event.target.closest('[data-route]');
  if (route) { event.preventDefault(); navigate(route.dataset.route); return; }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  if (action.closest('[data-stop-close]') && action.dataset.action === 'modal-close') return;
  const type = action.dataset.action;
  if (type === 'modal-close') { state.overlay = null; render(); return; }
  if (type === 'cart-open') { try { state.cart = await api('/api/cart'); state.overlay = { type: 'cart' }; render(); } catch(e){toast(e.message,'error');} return; }
  if (type === 'search-open') { state.search = ''; state.overlay = { type: 'search' }; render(); setTimeout(() => document.querySelector('#storeSearch')?.focus(), 10); return; }
  if (type === 'menu-open') { state.overlay = { type: 'menu' }; render(); return; }
  if (type === 'product-open') { state.selectedVariant = null; state.overlay = { type: 'product', id: action.dataset.id }; render(); return; }
  if (type === 'variant-select') { state.selectedVariant = action.dataset.id; render(); return; }
  if (type === 'page-variant-select') { state.selectedVariant = action.dataset.id; render(); return; }
  if (type === 'page-add') { const product=state.storefront.products.find(item=>item.id===action.dataset.id); if(product) await addProductToCart(product,state.selectedVariant); return; }
  if (type === 'quick-add') { const product=state.storefront.products.find(item=>item.id===action.dataset.id); if(product?.variants?.length > 1) {state.overlay={type:'product',id:product.id};state.selectedVariant=null;render();} else if(product) await addProductToCart(product,product.variants?.[0]?.id); return; }
  if (type === 'modal-add') { const product=state.storefront.products.find(item=>item.id===action.dataset.id); if(product) await addProductToCart(product,state.selectedVariant); return; }
  if (type === 'cart-remove') { try { state.cart=await api(`/api/cart/items/${encodeURIComponent(action.dataset.id)}`,{method:'DELETE'}); render(); } catch(e){toast(e.message,'error');} return; }
  if (type === 'checkout-open') { state.overlay={type:'checkout'}; render(); return; }
  if (type === 'demo-login') { try { const result=await api('/api/admin/session/demo',{method:'POST'}); state.session={...state.session,...result,user:result.user}; render(); } catch(e){toast(e.message,'error');} return; }
  if (type === 'logout') { try { await api('/api/admin/logout',{method:'POST'}); state.session={...state.session,user:null};state.selectedStoreSlug=null;navigate('/admin'); } catch(e){toast(e.message,'error');} return; }
  if (type === 'admin-refresh') { state.session=null; renderAdmin(); return; }
  if (type === 'domain-verify') { try { const result=await api('/api/admin/domain/verify',{method:'POST',admin:true});toast(result.message || `Domain status: ${result.status}`); }catch(e){toast(e.message,'error');} return; }
  if (type === 'product-create') { state.overlay={type:'product-create'}; renderProductCreate(); return; }
  if (type === 'product-status') { try { await api(`/api/admin/products/${encodeURIComponent(action.dataset.id)}`,{method:'PATCH',admin:true,body:{status:action.dataset.status}});toast(`Product moved to ${action.dataset.status}.`);renderAdmin(); }catch(e){toast(e.message,'error');} return; }
  if (type === 'store-manage') { state.selectedStoreSlug=action.dataset.id;navigate('/admin');return; }
  if (type === 'product-filter-status') { const filter=document.querySelector('[data-control="product-filter"]'); if(filter){filter.value='';filter.focus();} toast('Use the search field to find a product.','success'); return; }
  if (type === 'newsletter') { event.preventDefault(); }
});

app.addEventListener('change', async event => {
  const switcher = event.target.closest('[data-control="store-switch"]');
  if (switcher) { state.selectedStoreSlug=switcher.value; renderAdmin(); return; }
  const brandForm = event.target.closest('form[data-form="branding-save"]');
  if (brandForm) {
    if (event.target.name === 'logoFile' && event.target.files?.[0]) {
      const file = event.target.files[0];
      if (file.size > 2 * 1024 * 1024) { event.target.value = ''; state.tempLogoData = null; toast('Choose an image smaller than 2 MB.', 'error'); return; }
      if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { event.target.value = ''; state.tempLogoData = null; toast('Use a PNG, JPEG, or WebP image.', 'error'); return; }
      state.tempLogoData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
    } else if (event.target.name === 'logo') state.tempLogoData = null;
    currentBrandPreview(brandForm);
  }
});
app.addEventListener('input', event => {
  const brandForm = event.target.closest('form[data-form="branding-save"]');
  if (brandForm) currentBrandPreview(brandForm);
  if (event.target.id === 'storeSearch') {
    state.search=event.target.value;
    const text=state.search.trim().toLowerCase();
    const results=state.storefront.products.filter(product=>`${product.name} ${product.description}`.toLowerCase().includes(text));
    const container=document.querySelector('.search-results');
    if(container) container.innerHTML=text ? (results.length ? results.slice(0,4).map(product=>`<button class="search-result" data-action="product-open" data-id="${esc(product.id)}"><img src="${esc(safeHref(product.imageUrl))}" alt=""/><span><b>${esc(product.name)}</b><small>${esc(product.badge || 'READY TO WEAR')}</small></span><strong>${money(product.priceMinor,product.currency)}</strong></button>`).join('') : '<p class="empty-inline">No matches this time. Try a different search.</p>') : '<p class="search-hint">TRY “HOODIE”, “TEE” OR “JACKET”</p>';
  }
  if (event.target.matches('[data-control="product-filter"]')) {
    const query=event.target.value.toLowerCase();
    document.querySelectorAll('.products-list-panel tbody tr').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(query));
  }
});

app.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.overlay) { state.overlay=null; render(); }
});
app.addEventListener('submit', async event => {
  const form=event.target.closest('form[data-form]'); if(!form)return;
  event.preventDefault();
  const kind=form.dataset.form;
  try {
    if(kind==='branding-save'){
      formMessage(form,'Saving your new look…');
      const body=readForm(form); const logoFile=form.querySelector('input[name="logoFile"]')?.files?.[0];
      if (logoFile) {
        formMessage(form,'Uploading your logo…');
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(logoFile);});
        const uploaded=await api('/api/admin/assets',{method:'POST',admin:true,body:{mimeType:logoFile.type,data}});body.logo=uploaded.url;
      }
      const result=await api('/api/admin/branding',{method:'PUT',admin:true,body});state.tempLogoData=null;
      state.adminData.branding={...result.branding}; setTheme(result.branding); formMessage(form,'Saved. Your storefront is wearing its new look.'); toast('Branding saved.');
      renderAdmin(); return;
    }
    if(kind==='settings-save'){
      formMessage(form,'Saving store settings…'); const section=form.dataset.section; const result=await api(`/api/admin/settings/${section}`,{method:'PUT',admin:true,body:readForm(form)});
      formMessage(form,'Saved. These settings now belong to this store.'); toast(`${settingsMeta[section].title} settings saved.`);
      if(section==='general') await reloadStorefront(); else renderAdmin(); return;
    }
    if(kind==='admin-login'){
      const result=await api('/api/admin/session',{method:'POST',body:readForm(form)});state.session={...state.session,...result,user:result.user};renderAdmin();return;
    }
    if(kind==='newsletter'){
      const button=form.querySelector('button');if(button){button.innerHTML=icon('check',18);button.disabled=true;}form.querySelector('input').value='';toast('You’re on the list. Keep an eye out.');return;
    }
    if(kind==='checkout'){
      const result=await api('/api/checkout',{method:'POST',body:readForm(form)});state.overlay=null;state.cart=await api('/api/cart');render();toast(`${result.order.orderNumber} · ${result.message}`);return;
    }
    if(kind==='store-create'){
      const result=await api('/api/admin/stores',{method:'POST',admin:true,body:readForm(form)});state.adminStores=await api('/api/admin/stores',{admin:true}).then(data=>data.stores);state.selectedStoreSlug=result.store.slug;toast(`${result.store.name} is ready to configure.`);renderAdmin();return;
    }
    if(kind==='product-create'){
      const result=await api('/api/admin/products',{method:'POST',admin:true,body:readForm(form)});state.overlay=null;toast(`${result.product.name} is in the catalog.`);renderAdmin();return;
    }
  }catch(error){
    const save=form.querySelector('[data-save-state]');if(save)formMessage(form,error.message,false);else toast(error.message,'error');
  }
});

function renderProductCreate() {
  const data=state.adminData;
  const modal=`<div class="overlay-shell" data-action="modal-close"><section class="create-product-modal" data-stop-close><div class="drawer-head"><div><p class="eyebrow">A NEW PIECE</p><h2>ADD A PRODUCT</h2></div><button class="icon-button" data-action="modal-close">${icon('close')}</button></div><form class="stack-form" data-form="product-create"><label>Product name<input name="name" required placeholder="The piece everyone asks about"/></label><div class="form-two-col"><label>SKU<input name="sku" required placeholder="SKU-001"/></label><label>Price <small>${esc(data.store.currency)}</small><input type="number" name="price" min="0" step="0.01" required placeholder="0.00"/></label></div><label>Collection<select name="categoryId"><option value="">Uncategorized</option>${(data.categories||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label>Image URL<input type="url" name="imageUrl" placeholder="https://…"/></label><label>Description<textarea name="description" rows="4"></textarea></label><button type="submit" class="button button-dark full-button">ADD TO CATALOG ${icon('arrowUpRight',16)}</button></form></section></div>`;
  app.insertAdjacentHTML('beforeend',modal);
}

window.addEventListener('popstate', () => render());
async function start() {
  try {
    const [storefront, session] = await Promise.all([api('/api/storefront'), api('/api/admin/session')]);
    state.storefront=storefront;state.session=session;state.selectedStoreSlug=storefront.store.slug;setTheme(storefront.branding);setSeo();
    try{state.cart=await api('/api/cart');}catch{}
    render();
  } catch (error) {
    app.innerHTML=`<div class="store-error"><span>${icon('globe',24)}</span><p class="eyebrow">THIS STORE ISN’T AVAILABLE HERE</p><h1>WE COULDN’T FIND<br/>YOUR STORE.</h1><p>${esc(error.message)}</p><small>Open the store’s primary domain or use its platform store path.</small></div>`;
  }
}
start();
