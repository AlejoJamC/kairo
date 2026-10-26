// Industries an account can choose during onboarding, and the interpretation
// examples each one gives to the ticket groups. The examples describe how a
// group is read in that industry; they are not stored on tickets.

export const INDUSTRIES = ['customer_service', 'financial', 'technology', 'legal', 'accounting'] as const;
export type Industry = (typeof INDUSTRIES)[number];

/** What the account stores: an industry, or `other` when none of the names fits. */
export const INDUSTRY_CHOICES = [...INDUSTRIES, 'other'] as const;
export type IndustryChoice = (typeof INDUSTRY_CHOICES)[number];

/** Used when the choice is skipped, is `other`, or cannot be read. */
export const DEFAULT_INDUSTRY: Industry = 'customer_service';

export const TICKET_GROUPS = ['support', 'prospect', 'internal', 'other', 'spam', 'general'] as const;
export type TicketGroup = (typeof TICKET_GROUPS)[number];

export type IndustryLang = 'es' | 'en';
type Example = Record<IndustryLang, string>;

const e = (es: string, en: string): Example => ({ es, en });

export const INDUSTRY_NAMES: Record<Industry, Example> = {
  customer_service: e('Atención al cliente', 'Customer service'),
  financial: e('Financiera', 'Financial'),
  technology: e('Tecnología', 'Technology'),
  legal: e('Derecho', 'Legal'),
  accounting: e('Contable', 'Accounting'),
};

const SHARED_INTERNAL: Example[] = [e('Administrativo', 'Administrative'), e('Recursos humanos', 'Human resources')];

export const INDUSTRY_EXAMPLES: Record<Industry, Partial<Record<TicketGroup, Example[]>>> = {
  customer_service: {
    support: [
      e('Estado del pedido', 'Order status'),
      e('Devolución y reembolso', 'Returns and refunds'),
      e('Problemas de envío', 'Shipping problems'),
      e('Preguntas de producto', 'Product questions'),
      e('Pagos y facturación', 'Payments and billing'),
      e('Cuentas y suscripciones', 'Accounts and subscriptions'),
    ],
    prospect: [e('Compras al por mayor', 'Bulk purchases'), e('Cotización a empresas', 'Quotes for businesses'), e('Distribución', 'Distribution')],
  },
  financial: {
    support: [
      e('Pagos y transferencias', 'Payments and transfers'),
      e('Créditos', 'Credits'),
      e('Cuentas y tarjetas', 'Accounts and cards'),
      e('Fraude y seguridad', 'Fraud and security'),
      e('Reclamos formales', 'Formal complaints'),
    ],
    prospect: [e('Solicitud de créditos', 'Credit applications'), e('Apertura de productos', 'Product openings'), e('Seguros e inversiones', 'Insurance and investments')],
    internal: SHARED_INTERNAL,
    other: [e('Proveedores y cotizaciones', 'Suppliers and quotes'), e('Autoridades o entes de control', 'Authorities or regulators')],
  },
  technology: {
    support: [
      e('Falla técnica', 'Technical failure'),
      e('Uso y capacitaciones', 'Usage and training'),
      e('Cuentas y accesos', 'Accounts and access'),
      e('Facturación y planes', 'Billing and plans'),
      e('Integración de APIs', 'API integration'),
      e('Solicitudes de funcionalidad', 'Feature requests'),
    ],
    prospect: [e('Solicitud de demo', 'Demo requests'), e('Cotización de plan', 'Plan quotes'), e('Piloto o pruebas', 'Pilots or trials')],
    internal: SHARED_INTERNAL,
    other: [e('Proveedores y cotizaciones', 'Suppliers and quotes'), e('Autoridades y entes de control', 'Authorities and regulators'), e('Partners y eventos', 'Partners and events')],
  },
  legal: {
    support: [
      e('Estado del caso', 'Case status'),
      e('Documentación y evidencias', 'Documents and evidence'),
      e('Audiencias y plazos', 'Hearings and deadlines'),
      e('Honorarios y pagos', 'Fees and payments'),
      e('Citas y reuniones', 'Appointments and meetings'),
    ],
    prospect: [
      e('Familiar', 'Family'),
      e('Laboral', 'Labor'),
      e('Penal', 'Criminal'),
      e('Civil y comercial', 'Civil and commercial'),
      e('Inmobiliaria y sucesiones', 'Real estate and inheritance'),
    ],
  },
  accounting: {
    support: [
      e('Documentos y soportes', 'Documents and supporting records'),
      e('Contabilidad y conciliaciones', 'Bookkeeping and reconciliations'),
      e('Impuestos y declaraciones', 'Taxes and filings'),
      e('Nóminas', 'Payroll'),
      e('Estados financieros', 'Financial statements'),
      e('Honorarios y cobros de facturas', 'Fees and invoice collection'),
    ],
    prospect: [e('Contabilidad mensual', 'Monthly bookkeeping'), e('Impuestos', 'Taxes'), e('Nómina', 'Payroll'), e('Estados financieros', 'Financial statements')],
  },
};

/** Maps any stored value, including null and unknown ones, to the industry that applies. */
export function resolveIndustry(value: string | null | undefined): Industry {
  return (INDUSTRIES as readonly string[]).includes(value ?? '') ? (value as Industry) : DEFAULT_INDUSTRY;
}

export function isIndustryChoice(value: unknown): value is IndustryChoice {
  return typeof value === 'string' && (INDUSTRY_CHOICES as readonly string[]).includes(value);
}

/**
 * The industry's interpretation examples as text for the classifier, in the
 * account's language. Undefined while the account has no industry recorded, so
 * accounts created before the setting keep classifying as they did.
 */
export function industryGuidance(industry: string | null | undefined, lang: IndustryLang): string | undefined {
  if (!industry) return undefined;
  const resolved = resolveIndustry(industry);
  const lines = TICKET_GROUPS.flatMap((group) => {
    const examples = INDUSTRY_EXAMPLES[resolved][group];
    return examples?.length ? [`- ${group}: ${examples.map((example) => example[lang]).join('; ')}`] : [];
  });
  const intro = lang === 'es'
    ? `Industria de la cuenta: ${INDUSTRY_NAMES[resolved].es}. Ejemplos de cómo se lee cada tipo de ticket en esta industria (orientativos, no exhaustivos; clasifica por lo que pide quien escribe):`
    : `Account industry: ${INDUSTRY_NAMES[resolved].en}. Examples of how each ticket type is read in this industry (illustrative, not exhaustive; classify by what the sender is asking for):`;
  return [intro, ...lines].join('\n');
}
