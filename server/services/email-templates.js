function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function money(minor, currency) {
  let digits = 2;
  try { digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits; } catch {}
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(minor || 0) / 10 ** digits); }
  catch { return `${currency} ${Number(minor || 0) / 10 ** digits}`; }
}

function emailBrand(store, branding, settings = {}) {
  const primary = /^#[0-9a-f]{6}$/i.test(branding?.primaryColor || '') ? branding.primaryColor : '#536579';
  const accent = /^#[0-9a-f]{6}$/i.test(branding?.accentColor || '') ? branding.accentColor : '#d8dfd0';
  const logo = /^https?:\/\//i.test(branding?.logo || '') ? `<img src="${escapeHtml(branding.logo)}" alt="${escapeHtml(store.name)}" style="max-width:180px;max-height:54px;object-fit:contain">` : `<strong style="font-size:22px;letter-spacing:-.04em">${escapeHtml(store.name)}</strong>`;
  const email = settings.general?.contactEmail || store.contact_email || '';
  const domain = settings.domain?.customDomain || settings.domain?.primaryDomain || '';
  return { primary, accent, logo, email, domain };
}

function renderTransactionalEmail(kind, { store, branding, settings, data = {} }) {
  const b = emailBrand(store, branding, settings);
  const subjectMap = {
    order_confirmation: `Order ${data.orderNumber || ''} confirmed · ${store.name}`,
    shipping_confirmation: `Your order is on the move · ${store.name}`,
    password_reset: `Reset your password · ${store.name}`,
    welcome: `Welcome to ${store.name}`,
    refund_notification: `Refund update · ${store.name}`,
  };
  const details = {
    order_confirmation: `<p>Thanks for your order, ${escapeHtml(data.customerName || 'there')}. We’re getting it ready.</p><div class="box"><b>Order ${escapeHtml(data.orderNumber || '')}</b><br><span>${escapeHtml(money(data.totalMinor, data.currency || store.currency))}</span></div>`,
    shipping_confirmation: `<p>Your order ${escapeHtml(data.orderNumber || '')} is on its way.</p><div class="box"><b>Tracking</b><br><span>${escapeHtml(data.trackingNumber || 'Tracking details will follow shortly.')}</span></div>`,
    password_reset: `<p>We received a request to reset your password.</p><p><a class="cta" href="${escapeHtml(data.resetUrl || '#')}">RESET PASSWORD</a></p><small>If you didn’t request this, you can ignore this email.</small>`,
    welcome: `<p>Welcome, ${escapeHtml(data.customerName || 'there')}. We’re glad you found us.</p><p>${escapeHtml(store.description || '')}</p>`,
    refund_notification: `<p>We’ve updated the refund for order ${escapeHtml(data.orderNumber || '')}.</p><div class="box"><b>Refund amount</b><br><span>${escapeHtml(money(data.amountMinor, data.currency || store.currency))}</span></div>`,
  };
  const content = details[kind];
  if (!content) throw new Error('Unknown transactional email template.');
  const safeDomain = b.domain ? `<a href="https://${escapeHtml(b.domain)}" style="color:${b.primary};text-decoration:none">${escapeHtml(b.domain)}</a>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f1;font-family:Arial,sans-serif;color:#171817"><div style="max-width:600px;margin:32px auto;background:#fff"><div style="padding:24px 28px;background:${b.primary};color:#fff;border-bottom:4px solid ${b.accent}">${b.logo}</div><main style="padding:30px 28px;line-height:1.7;font-size:14px">${content}</main><footer style="padding:20px 28px;border-top:1px solid #ecece6;color:#777870;font-size:11px">${escapeHtml(store.name)}${b.email ? ` · <a href="mailto:${escapeHtml(b.email)}" style="color:${b.primary}">${escapeHtml(b.email)}</a>` : ''}${safeDomain ? ` · ${safeDomain}` : ''}</footer></div></body></html>`;
  const text = `${subjectMap[kind]}\n\n${kind.replaceAll('_',' ')} from ${store.name}.\n${b.email ? `Contact: ${b.email}\n` : ''}${b.domain ? `Store: https://${b.domain}\n` : ''}`;
  return { subject: subjectMap[kind], html, text, fromName: settings.email?.senderName || store.name, fromEmail: settings.email?.senderEmail || store.contact_email || '' };
}

module.exports = { renderTransactionalEmail };
