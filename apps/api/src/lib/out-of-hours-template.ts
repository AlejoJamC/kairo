// KAI-40: default auto-reply templates for out-of-hours messages.
//
// TODO: read tenant locale from `profiles.locale` when that column exists.
//   For now we default to ES (LatAm market, default TZ America/Bogota).
// TODO: SLA hours per-tenant. Hardcoded to 24h until tenant config exists.

export type Locale = "es" | "en";

const DEFAULT_SLA_HOURS = 24;

const SCHEDULE_DESCRIPTION: Record<Locale, string> = {
  es: "lunes a viernes de 8:00 a 18:00 y sábados de 8:00 a 12:00 (hora Colombia)",
  en: "Monday to Friday from 8:00 to 18:00 and Saturdays from 8:00 to 12:00 (Colombia time)",
};

export interface OutOfHoursReply {
  subject: string;
  bodyPlain: string;
}

export function buildOutOfHoursReply(opts: {
  originalSubject: string;
  locale?: Locale;
  slaHours?: number;
}): OutOfHoursReply {
  const locale: Locale = opts.locale ?? "es";
  const sla = opts.slaHours ?? DEFAULT_SLA_HOURS;
  const schedule = SCHEDULE_DESCRIPTION[locale];

  const subject = opts.originalSubject.startsWith("Re:")
    ? opts.originalSubject
    : `Re: ${opts.originalSubject}`;

  const bodyPlain = locale === "es"
    ? `Hemos recibido tu solicitud. Nuestro horario de soporte es ${schedule}. ` +
      `Te responderemos en un máximo de ${sla} horas.\n\n` +
      `— Equipo de soporte`
    : `We have received your request. Our support hours are ${schedule}. ` +
      `We will get back to you within ${sla} hours.\n\n` +
      `— Support team`;

  return { subject, bodyPlain };
}
