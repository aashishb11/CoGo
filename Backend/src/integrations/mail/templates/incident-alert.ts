import { formatInTimeZone } from 'date-fns-tz';
import { ca } from 'date-fns/locale/ca';
import { enUS } from 'date-fns/locale/en-US';
import { es } from 'date-fns/locale/es';
import type { Locale as DateFnsLocale } from 'date-fns';
import type {
  IncidentPassengerPayload,
  IncidentRidePayload,
} from '@modules/safety/incidents.repository';
import type { IncidentCategory } from '@modules/safety/safety.types';
import type { Locale } from '@shared/i18n/locale';
import { escapeHtml } from './escape';
import { wrapLayout, type Brand } from './layout';

// Rides are scheduled in Madrid time (see modules/trips). Trusted contacts
// receiving the alert are overwhelmingly local to the reporter, so we render
// "Scheduled departure" in that same fixed zone instead of UTC.
const RIDE_TIMEZONE = 'Europe/Madrid';

const dateFnsLocale: Record<Locale, DateFnsLocale> = {
  en: enUS,
  es,
  ca,
};

export type IncidentAlertPayload = {
  reporterId: string;
  reporterName: string;
  reporterRole: 'driver' | 'passenger';
  category: IncidentCategory;
  note: string | null;
  trustedContact: { name: string; email: string };
  ride: IncidentRidePayload;
  /**
   * Empty for passenger reporters. Populated with every accepted passenger
   * on the ride (`{ userId, name, phone }`) when the driver is the
   * reporter — per plan §Decisions ("Email lists every accepted passenger.
   * No per-passenger picker.").
   */
  acceptedPassengers: IncidentPassengerPayload[];
};

type Copy = {
  subject: (reporterName: string) => string;
  preheader: (reporterName: string) => string;
  heading: string;
  intro: (reporterName: string) => string;
  routeLabel: string;
  whenLabel: string;
  categoryLabel: string;
  noteLabel: string;
  driverBlockTitle: string;
  driverNameLabel: string;
  carLabel: string;
  plateLabel: string;
  passengersBlockTitle: string;
  phoneLabel: string;
  noPhone: string;
  noPassengers: string;
  category: Record<IncidentCategory, string>;
};

const copy: Record<Locale, Copy> = {
  en: {
    subject: (n) => `${n} reported a safety incident`,
    preheader: (n) =>
      `${n} listed you as their trusted contact on a CoGo ride.`,
    heading: 'Safety incident reported',
    intro: (n) =>
      `${n} listed you as their trusted contact and just reported a safety incident on a CoGo ride.`,
    routeLabel: 'Route',
    whenLabel: 'Scheduled departure',
    categoryLabel: 'Category',
    noteLabel: 'Note',
    driverBlockTitle: 'Driver and vehicle',
    driverNameLabel: 'Driver',
    carLabel: 'Vehicle',
    plateLabel: 'Plate',
    passengersBlockTitle: 'Other accepted passengers on this ride',
    phoneLabel: 'Phone',
    noPhone: 'no phone on file',
    noPassengers: 'No other accepted passengers on this ride.',
    category: {
      harassment: 'Harassment',
      unsafe_driving: 'Unsafe driving',
      accident: 'Accident',
      other: 'Other',
    },
  },
  es: {
    subject: (n) => `${n} ha denunciado un incidente de seguridad`,
    preheader: (n) =>
      `${n} te ha indicado como su contacto de confianza en un viaje de CoGo.`,
    heading: 'Incidente de seguridad denunciado',
    intro: (n) =>
      `${n} te ha indicado como su contacto de confianza y acaba de denunciar un incidente de seguridad en un viaje de CoGo.`,
    routeLabel: 'Trayecto',
    whenLabel: 'Salida prevista',
    categoryLabel: 'Categoría',
    noteLabel: 'Nota',
    driverBlockTitle: 'Conductor/a y vehículo',
    driverNameLabel: 'Conductor/a',
    carLabel: 'Vehículo',
    plateLabel: 'Matrícula',
    passengersBlockTitle: 'Otros pasajeros aceptados en este viaje',
    phoneLabel: 'Teléfono',
    noPhone: 'sin teléfono registrado',
    noPassengers: 'No hay otros pasajeros aceptados en este viaje.',
    category: {
      harassment: 'Acoso',
      unsafe_driving: 'Conducción peligrosa',
      accident: 'Accidente',
      other: 'Otro',
    },
  },
  ca: {
    subject: (n) => `${n} ha denunciat un incident de seguretat`,
    preheader: (n) =>
      `${n} t'ha indicat com a contacte de confiança en un viatge de CoGo.`,
    heading: 'Incident de seguretat denunciat',
    intro: (n) =>
      `${n} t'ha indicat com a contacte de confiança i acaba de denunciar un incident de seguretat en un viatge de CoGo.`,
    routeLabel: 'Trajecte',
    whenLabel: 'Sortida prevista',
    categoryLabel: 'Categoria',
    noteLabel: 'Nota',
    driverBlockTitle: 'Conductor/a i vehicle',
    driverNameLabel: 'Conductor/a',
    carLabel: 'Vehicle',
    plateLabel: 'Matrícula',
    passengersBlockTitle: 'Altres passatgers acceptats en aquest viatge',
    phoneLabel: 'Telèfon',
    noPhone: 'sense telèfon registrat',
    noPassengers: 'No hi ha altres passatgers acceptats en aquest viatge.',
    category: {
      harassment: 'Assetjament',
      unsafe_driving: 'Conducció perillosa',
      accident: 'Accident',
      other: 'Altre',
    },
  },
};

export function renderIncidentAlert(
  locale: Locale,
  params: { brand: Brand; payload: IncidentAlertPayload },
): { subject: string; html: string } {
  const c = copy[locale];
  const { payload } = params;
  const subject = c.subject(payload.reporterName);
  const intro = c.intro(payload.reporterName);
  const preheader = c.preheader(payload.reporterName);
  const bodyHtml = renderIncidentBody(c, payload, locale);
  const html = wrapLayout({
    locale,
    brand: params.brand,
    preheader,
    heading: c.heading,
    intro,
    bodyHtml,
  });
  return { subject, html };
}

function renderIncidentBody(
  c: Copy,
  payload: IncidentAlertPayload,
  locale: Locale,
): string {
  const route = `${escapeHtml(payload.ride.originLabel)} → ${escapeHtml(
    payload.ride.destinationLabel,
  )}`;
  const when = formatInTimeZone(
    payload.ride.scheduledDeparture,
    RIDE_TIMEZONE,
    "d MMM yyyy, HH:mm 'h'",
    { locale: dateFnsLocale[locale] },
  );
  const categoryName = escapeHtml(c.category[payload.category]);

  const rows: string[] = [
    detailRow(c.routeLabel, route),
    detailRow(c.whenLabel, escapeHtml(when)),
    detailRow(c.categoryLabel, categoryName),
  ];
  if (payload.note && payload.note.trim().length > 0) {
    rows.push(detailRow(c.noteLabel, escapeHtml(payload.note)));
  }

  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border-collapse:collapse;">`,
    rows.join(''),
    `</table>`,
    renderOtherPartyBlock(c, payload),
  ].join('\n');
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#64748B;font-size:13px;line-height:20px;white-space:nowrap;vertical-align:top;"><strong>${escapeHtml(label)}</strong></td>
    <td style="padding:6px 0;color:#0F172A;font-size:14px;line-height:20px;">${value}</td>
  </tr>`;
}

function renderOtherPartyBlock(c: Copy, payload: IncidentAlertPayload): string {
  if (payload.reporterRole === 'passenger') {
    const driverName = escapeHtml(payload.ride.driverName);
    const car =
      payload.ride.carModelBrand || payload.ride.carModelName
        ? escapeHtml(
            [payload.ride.carModelBrand, payload.ride.carModelName]
              .filter(Boolean)
              .join(' '),
          )
        : '—';
    const plate = escapeHtml(payload.ride.carPlate ?? '—');
    return [
      sectionTitle(c.driverBlockTitle),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`,
      detailRow(c.driverNameLabel, driverName),
      detailRow(c.carLabel, car),
      detailRow(c.plateLabel, plate),
      `</table>`,
    ].join('\n');
  }
  if (payload.acceptedPassengers.length === 0) {
    return [
      sectionTitle(c.passengersBlockTitle),
      `<p style="margin:0;color:#64748B;font-size:14px;line-height:20px;">${escapeHtml(c.noPassengers)}</p>`,
    ].join('\n');
  }
  const items = payload.acceptedPassengers
    .map((p) => {
      const phone = p.phone ? escapeHtml(p.phone) : escapeHtml(c.noPhone);
      return `<li style="margin:0 0 6px 0;color:#0F172A;font-size:14px;line-height:20px;">${escapeHtml(p.name)} — <strong>${escapeHtml(c.phoneLabel)}:</strong> ${phone}</li>`;
    })
    .join('\n');
  return [
    sectionTitle(c.passengersBlockTitle),
    `<ul style="margin:0;padding-left:20px;">${items}</ul>`,
  ].join('\n');
}

function sectionTitle(text: string): string {
  return `<h3 style="margin:16px 0 8px 0;font-size:15px;line-height:20px;color:#0F172A;font-weight:700;">${escapeHtml(text)}</h3>`;
}
