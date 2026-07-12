import type { Locale } from '@shared/i18n/locale';
import { escapeHtml } from './escape';

const COLORS = {
  brand: '#7FB738',
  brandDark: '#365314',
  text: '#0F172A',
  textMuted: '#64748B',
  surface: '#F3F4F6',
  card: '#FFFFFF',
  border: '#E2E8F0',
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type ChromeCopy = {
  footerTagline: string;
  footerSupport: (supportEmail: string) => string;
  footerAutomated: string;
};

const chromeCopy: Record<Locale, ChromeCopy> = {
  en: {
    footerTagline: 'CoGo — carpool, save, share the planet.',
    footerSupport: (e) => `Need help? Reply to this email or write to ${e}.`,
    footerAutomated:
      'This is an automated message; please do not reply directly.',
  },
  es: {
    footerTagline: 'CoGo — comparte coche, ahorra y cuida el planeta.',
    footerSupport: (e) =>
      `¿Necesitas ayuda? Responde a este correo o escribe a ${e}.`,
    footerAutomated:
      'Este es un mensaje automático; por favor, no respondas directamente.',
  },
  ca: {
    footerTagline: 'CoGo — comparteix cotxe, estalvia i cuida el planeta.',
    footerSupport: (e) =>
      `Necessites ajuda? Respon aquest correu o escriu a ${e}.`,
    footerAutomated:
      'Aquest és un missatge automàtic; si us plau, no responguis directament.',
  },
};

export type Brand = {
  /** Display name. Used as the `alt` for the logo image and as the wordmark
   *  fallback when `logoUrl` is unset. Sourced from MAIL_FROM_NAME. */
  productName: string;
  /** Reply-to / support address shown in the footer (from MAIL_FROM_EMAIL). */
  supportEmail: string;
  /** Publicly fetchable URL of the logo PNG (from MAIL_LOGO_URL). When
   *  present, the header shows the image instead of the text wordmark. */
  logoUrl?: string;
};

export type LayoutParams = {
  locale: Locale;
  brand: Brand;
  /** Hidden preview text shown in inbox snippets (≤90 chars recommended). */
  preheader: string;
  /** Email H1, rendered inside the card. */
  heading: string;
  /** Lead paragraph under the heading. */
  intro: string;
  /** Optional CTA button. Omit for emails that just show information. */
  cta?: { url: string; label: string };
  /** Additional HTML (pre-escaped) appended after the CTA / intro. */
  bodyHtml?: string;
};

/**
 * Renders the shared branded email chrome (header bar, card, button, footer).
 * Uses table-based layout + inline CSS for max client compatibility
 * (Gmail, Outlook, Apple Mail, mobile clients).
 *
 * Translatable strings: only the footer chrome lives here. Per-template
 * copy (subject, heading, intro, CTA label) is owned by the template file
 * and passed in already localised — same `Record<Locale, T>` convention
 * used elsewhere (see `@shared/i18n/locale`).
 */
export function wrapLayout(params: LayoutParams): string {
  const { locale, brand, preheader, heading, intro, cta, bodyHtml } = params;
  const chrome = chromeCopy[locale];
  const productName = escapeHtml(brand.productName);
  const supportEmail = escapeHtml(brand.supportEmail);

  const ctaBlock = cta
    ? `
            <tr>
              <td align="center" style="padding:8px 0 16px 0;">
                <a href="${escapeHtml(cta.url)}"
                   style="display:inline-block;padding:14px 28px;background:${COLORS.brand};color:#ffffff;font-family:${FONT_STACK};font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">
                  ${escapeHtml(cta.label)}
                </a>
              </td>
            </tr>`
    : '';

  const extraBlock = bodyHtml
    ? `
            <tr>
              <td style="padding:8px 0 0 0;font-family:${FONT_STACK};font-size:15px;line-height:22px;color:${COLORS.text};">
                ${bodyHtml}
              </td>
            </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.surface};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden;mso-hide:all;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.surface};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${COLORS.card};border-radius:14px;overflow:hidden;border:1px solid ${COLORS.border};">
          <tr>
            <td style="background:${COLORS.brand};height:6px;line-height:6px;font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 32px 0 32px;font-family:${FONT_STACK};">
              ${
                brand.logoUrl
                  ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${productName}" width="120" height="72" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:120px;">`
                  : `<div style="font-size:20px;font-weight:800;letter-spacing:-0.3px;color:${COLORS.brandDark};">${productName}</div>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0 32px;font-family:${FONT_STACK};">
              <h1 style="margin:0 0 12px 0;font-size:22px;line-height:28px;font-weight:800;color:${COLORS.text};">
                ${escapeHtml(heading)}
              </h1>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:22px;color:${COLORS.text};">
                ${escapeHtml(intro)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${ctaBlock}
                ${extraBlock}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px 32px;border-top:1px solid ${COLORS.border};font-family:${FONT_STACK};color:${COLORS.textMuted};font-size:12px;line-height:18px;">
              <div style="margin-bottom:6px;">${escapeHtml(chrome.footerTagline)}</div>
              <div style="margin-bottom:6px;">${chrome.footerSupport(supportEmail)}</div>
              <div>${escapeHtml(chrome.footerAutomated)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
