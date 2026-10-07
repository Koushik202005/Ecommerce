CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','suspended')),
  currency TEXT NOT NULL,
  currency_symbol TEXT NOT NULL,
  country TEXT NOT NULL,
  timezone TEXT NOT NULL,
  language TEXT NOT NULL,
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  business_address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_domains (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','failed','not_configured')),
  ssl_status TEXT NOT NULL DEFAULT 'pending' CHECK (ssl_status IN ('pending','active','failed','not_configured')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_store_domains_store ON store_domains(store_id, is_primary);

CREATE TABLE IF NOT EXISTS store_branding (
  store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  logo TEXT NOT NULL DEFAULT '', favicon TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#536579', secondary_color TEXT NOT NULL DEFAULT '#25282c',
  accent_color TEXT NOT NULL DEFAULT '#d8dfd0', background_color TEXT NOT NULL DEFAULT '#f7f6f2',
  text_color TEXT NOT NULL DEFAULT '#171717', muted_color TEXT NOT NULL DEFAULT '#77766f',
  border_color TEXT NOT NULL DEFAULT '#e3e1db', font_family TEXT NOT NULL DEFAULT 'DM Sans',
  heading_font TEXT NOT NULL DEFAULT 'Barlow Condensed', heading_style TEXT NOT NULL DEFAULT 'condensed',
  body_style TEXT NOT NULL DEFAULT 'modern', border_radius INTEGER NOT NULL DEFAULT 4,
  button_style TEXT NOT NULL DEFAULT 'square', card_style TEXT NOT NULL DEFAULT 'editorial',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_settings (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, section)
);
CREATE INDEX IF NOT EXISTS idx_store_settings_store ON store_settings(store_id, section);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','STORE_ADMIN','STORE_MANAGER','STORE_STAFF','CUSTOMER')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_store_role ON users(store_id, role);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(store_id, name)
);
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL, slug TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '', seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(store_id, slug), UNIQUE(store_id, id)
);
-- Older local databases may have been created before the composite parent key
-- was added. Keep the index as an idempotent migration for those databases.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_store_id_unique ON categories(store_id, id);
CREATE INDEX IF NOT EXISTS idx_categories_store_slug ON categories(store_id, slug);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id TEXT,
  name TEXT NOT NULL, slug TEXT NOT NULL, sku TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', price_minor INTEGER NOT NULL,
  compare_at_minor INTEGER, currency TEXT NOT NULL,
  seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '', secondary_image_url TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  featured INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, category_id) REFERENCES categories(store_id, id) ON DELETE RESTRICT,
  UNIQUE(store_id, slug), UNIQUE(store_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_products_store_status ON products(store_id, status);
CREATE INDEX IF NOT EXISTS idx_products_store_category ON products(store_id, category_id);
CREATE INDEX IF NOT EXISTS idx_products_store_created ON products(store_id, created_at);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL, sku TEXT NOT NULL, name TEXT NOT NULL,
  price_minor INTEGER, compare_at_minor INTEGER, options_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(store_id, product_id) REFERENCES products(store_id, id) ON DELETE CASCADE,
  UNIQUE(store_id, sku), UNIQUE(store_id, id)
);
CREATE INDEX IF NOT EXISTS idx_variants_store_product ON product_variants(store_id, product_id);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL, image_url TEXT NOT NULL, alt_text TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(store_id, product_id) REFERENCES products(store_id, id) ON DELETE CASCADE,
  UNIQUE(store_id, id)
);
CREATE INDEX IF NOT EXISTS idx_product_images_store_product ON product_images(store_id, product_id);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, variant_id) REFERENCES product_variants(store_id, id) ON DELETE CASCADE,
  UNIQUE(store_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_store_quantity ON inventory(store_id, quantity);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL, actor_user_id TEXT, delta INTEGER NOT NULL, reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, variant_id) REFERENCES product_variants(store_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_store_created ON inventory_transactions(store_id, created_at);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email TEXT NOT NULL, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, email), UNIQUE(store_id, id)
);
CREATE INDEX IF NOT EXISTS idx_customers_store_created ON customers(store_id, created_at);

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id TEXT, token_hash TEXT NOT NULL, currency TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT,
  UNIQUE(store_id, token_hash), UNIQUE(store_id, id)
);
CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  cart_id TEXT NOT NULL, product_id TEXT NOT NULL, variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, cart_id) REFERENCES carts(store_id, id) ON DELETE CASCADE,
  FOREIGN KEY(store_id, product_id) REFERENCES products(store_id, id) ON DELETE CASCADE,
  FOREIGN KEY(store_id, variant_id) REFERENCES product_variants(store_id, id) ON DELETE CASCADE,
  UNIQUE(store_id, cart_id, variant_id), UNIQUE(store_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_store_cart ON cart_items(store_id, cart_id);

CREATE TABLE IF NOT EXISTS wishlists (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE CASCADE,
  UNIQUE(store_id, customer_id), UNIQUE(store_id, id)
);
CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  wishlist_id TEXT NOT NULL, product_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, wishlist_id) REFERENCES wishlists(store_id, id) ON DELETE CASCADE,
  FOREIGN KEY(store_id, product_id) REFERENCES products(store_id, id) ON DELETE CASCADE,
  UNIQUE(store_id, wishlist_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id TEXT, order_number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  currency TEXT NOT NULL, subtotal_minor INTEGER NOT NULL, tax_minor INTEGER NOT NULL,
  shipping_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL,
  customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, shipping_address_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT,
  UNIQUE(store_id, order_number), UNIQUE(store_id, id)
);
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(store_id, status);
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL, product_id TEXT, variant_id TEXT, product_name TEXT NOT NULL,
  sku TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price_minor INTEGER NOT NULL, line_total_minor INTEGER NOT NULL,
  FOREIGN KEY(store_id, order_id) REFERENCES orders(store_id, id) ON DELETE CASCADE,
  FOREIGN KEY(store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id, variant_id) REFERENCES product_variants(store_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_order_items_store_order ON order_items(store_id, order_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL, provider TEXT NOT NULL, provider_reference TEXT NOT NULL DEFAULT '',
  amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, order_id) REFERENCES orders(store_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payments_store_order ON payments(store_id, order_id);

CREATE TABLE IF NOT EXISTS store_payment_configs (
  store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mock', is_test INTEGER NOT NULL DEFAULT 1,
  public_settings_json TEXT NOT NULL DEFAULT '{}', secret_ciphertext TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL, discount_type TEXT NOT NULL, value REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT, ends_at TEXT, usage_limit INTEGER,
  UNIQUE(store_id, code), UNIQUE(store_id, id)
);
CREATE TABLE IF NOT EXISTS coupon_usage (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  coupon_id TEXT NOT NULL, order_id TEXT NOT NULL, customer_id TEXT,
  FOREIGN KEY(store_id, coupon_id) REFERENCES coupons(store_id, id) ON DELETE CASCADE,
  FOREIGN KEY(store_id, order_id) REFERENCES orders(store_id, id) ON DELETE CASCADE,
  FOREIGN KEY(store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_store_coupon ON coupon_usage(store_id, coupon_id);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL, customer_id TEXT, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id, product_id) REFERENCES products(store_id, id) ON DELETE CASCADE,
  FOREIGN KEY(store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_reviews_store_product ON reviews(store_id, product_id);

CREATE TABLE IF NOT EXISTS banners (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, eyebrow TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '', link_url TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, UNIQUE(store_id, id)
);
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 1,
  UNIQUE(store_id, slug), UNIQUE(store_id, id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_store_created ON notifications(store_id, created_at);

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id TEXT PRIMARY KEY, store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  actor_user_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activity_store_created ON admin_activity_logs(store_id, created_at);

-- Composite foreign keys also need a matching unique parent key. These
-- idempotent indexes upgrade databases created by earlier local previews.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_store_id_unique ON categories(store_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_store_id_unique ON products(store_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_store_id_unique ON product_variants(store_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_store_id_unique ON customers(store_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_store_id_unique ON carts(store_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlists_store_id_unique ON wishlists(store_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_store_id_unique ON orders(store_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_store_id_unique ON coupons(store_id, id);


CREATE TABLE IF NOT EXISTS store_assets (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, id)
);
CREATE INDEX IF NOT EXISTS idx_store_assets_store_created ON store_assets(store_id, created_at);
