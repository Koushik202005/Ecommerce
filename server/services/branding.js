const BRANDING_COLUMNS = Object.freeze([
  'logo', 'favicon', 'primary_color', 'secondary_color', 'accent_color', 'background_color',
  'text_color', 'muted_color', 'border_color', 'font_family', 'heading_font', 'heading_style',
  'body_style', 'border_radius', 'button_style', 'card_style',
]);

function publicBranding(row) {
  if (!row) return {};
  return {
    logo: row.logo, favicon: row.favicon, primaryColor: row.primary_color,
    secondaryColor: row.secondary_color, accentColor: row.accent_color,
    backgroundColor: row.background_color, textColor: row.text_color,
    mutedColor: row.muted_color, borderColor: row.border_color, fontFamily: row.font_family,
    headingFont: row.heading_font, headingStyle: row.heading_style, bodyStyle: row.body_style,
    borderRadius: row.border_radius, buttonStyle: row.button_style, cardStyle: row.card_style,
  };
}

function safeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}

module.exports = { BRANDING_COLUMNS, publicBranding, safeColor };
