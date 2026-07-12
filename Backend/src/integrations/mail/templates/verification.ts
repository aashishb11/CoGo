import type { Locale } from '@shared/i18n/locale';
import { wrapLayout, type Brand } from './layout';

type Copy = {
  subject: string;
  preheader: string;
  heading: string;
  intro: string;
  cta: string;
  expiry: string;
  ignore: string;
};

const copy: Record<Locale, Copy> = {
  en: {
    subject: 'Verify your email address',
    preheader: 'Confirm your email to finish setting up your CoGo account.',
    heading: 'Verify your email',
    intro:
      'Tap the button below to confirm this email and finish setting up your CoGo account.',
    cta: 'Verify email',
    expiry: 'This link expires in 1 hour.',
    ignore:
      "If you didn't create a CoGo account, you can safely ignore this email.",
  },
  es: {
    subject: 'Verifica tu correo electrónico',
    preheader:
      'Confirma tu correo para terminar de configurar tu cuenta de CoGo.',
    heading: 'Verifica tu correo',
    intro:
      'Pulsa el botón de abajo para confirmar este correo y terminar de configurar tu cuenta de CoGo.',
    cta: 'Verificar correo',
    expiry: 'Este enlace caduca en 1 hora.',
    ignore:
      'Si no has creado una cuenta de CoGo, puedes ignorar este correo sin problema.',
  },
  ca: {
    subject: 'Verifica el teu correu electrònic',
    preheader:
      'Confirma el teu correu per acabar de configurar el teu compte de CoGo.',
    heading: 'Verifica el teu correu',
    intro:
      'Prem el botó de sota per confirmar aquest correu i acabar de configurar el teu compte de CoGo.',
    cta: 'Verifica el correu',
    expiry: 'Aquest enllaç caduca en 1 hora.',
    ignore:
      'Si no has creat un compte de CoGo, pots ignorar aquest correu sense problema.',
  },
};

export function renderVerification(
  locale: Locale,
  params: { brand: Brand; url: string },
): { subject: string; html: string } {
  const c = copy[locale];
  const html = wrapLayout({
    locale,
    brand: params.brand,
    preheader: c.preheader,
    heading: c.heading,
    intro: c.intro,
    cta: { url: params.url, label: c.cta },
    bodyHtml: `
      <p style="margin:0 0 8px 0;color:#64748B;font-size:13px;line-height:20px;">${c.expiry}</p>
      <p style="margin:0;color:#64748B;font-size:13px;line-height:20px;">${c.ignore}</p>
    `,
  });
  return { subject: c.subject, html };
}
