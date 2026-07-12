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
    subject: 'Reset your password',
    preheader: 'Tap to choose a new password for your CoGo account.',
    heading: 'Reset your password',
    intro: 'We received a request to reset the password for your CoGo account.',
    cta: 'Choose a new password',
    expiry: 'This link expires in 1 hour.',
    ignore:
      "If you didn't request a password reset, you can safely ignore this email — your current password is still active.",
  },
  es: {
    subject: 'Restablece tu contraseña',
    preheader: 'Pulsa para elegir una nueva contraseña en tu cuenta de CoGo.',
    heading: 'Restablece tu contraseña',
    intro:
      'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de CoGo.',
    cta: 'Elegir nueva contraseña',
    expiry: 'Este enlace caduca en 1 hora.',
    ignore:
      'Si no has solicitado restablecer la contraseña, puedes ignorar este correo — tu contraseña actual sigue activa.',
  },
  ca: {
    subject: 'Restableix la teva contrasenya',
    preheader: 'Prem per triar una nova contrasenya del teu compte de CoGo.',
    heading: 'Restableix la teva contrasenya',
    intro:
      'Hem rebut una sol·licitud per restablir la contrasenya del teu compte de CoGo.',
    cta: 'Tria una nova contrasenya',
    expiry: 'Aquest enllaç caduca en 1 hora.',
    ignore:
      'Si no has sol·licitat restablir la contrasenya, pots ignorar aquest correu — la teva contrasenya actual continua activa.',
  },
};

export function renderResetPassword(
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
