import type { Translations } from "./en";

export const es: Translations = {
  header: {
    login: "Iniciar sesión",
    signup: "Registrarse",
  },
  hero: {
    titlePrefix: "Resuelve tickets en",
    titleHighlight: "segundos",
    description:
      "Cockpit de Soporte con IA para equipos de atención. Triaje automático, priorización inteligente, tiempo de respuesta < 4h.",
  },
  cta: {
    button: "Comenzar →",
  },
  footer: {
    tagline: "Cockpit de Soporte con IA",
    privacy: "Política de Privacidad",
    terms: "Términos de Servicio",
    copyright: "© 2026 Kairo. Todos los derechos reservados.",
  },
  wizard: {
    title: "Bienvenido a Kairo",
    subtitle: "Conecta tu bandeja de soporte para empezar",
    googleButton: "Continuar con Google",
    gmailNote1: "Kairo necesita acceso para leer tu Gmail",
    gmailNote2: "y clasificar automáticamente los tickets de soporte",
    emailButton: "Continuar con Email →",
    emailComingSoon: "(Próximamente)",
  },
  privacy: {
    title: "Política de Privacidad",
    updated: "Última actualización: 20 de febrero de 2026",
    s1: {
      title: "1. Introducción",
      p1: "Kairo («nosotros», «nuestro» o «nos») está comprometido con la protección de tu privacidad. Esta Política de Privacidad explica cómo recopilamos, usamos y protegemos tu información cuando utilizas nuestro servicio de Cockpit de Soporte con IA.",
      p2: "Al usar Kairo, aceptas la recopilación y el uso de información de acuerdo con esta política.",
    },
    s2: {
      title: "2. Información que Recopilamos",
      intro: "Recopilamos los siguientes tipos de información:",
      items: [
        {
          label: "Información de Cuenta:",
          text: "Nombre, dirección de correo electrónico y nombre de la empresa al registrarte",
        },
        {
          label: "Datos de Gmail:",
          text: "Contenido de correos, metadatos (remitente, asunto, fecha) y adjuntos para la clasificación de tickets de soporte",
        },
        {
          label: "Datos de Uso:",
          text: "Cómo interactúas con el servicio, funciones utilizadas e información de sesión",
        },
        {
          label: "Datos Técnicos:",
          text: "Dirección IP, tipo de navegador, información del dispositivo y cookies",
        },
      ],
    },
    s3: {
      title: "3. Manejo de Datos de Gmail",
      importantLabel: "Importante:",
      p1: "El uso de información recibida de las APIs de Gmail por parte de Kairo cumple con la",
      linkText: "Política de Datos de Usuarios de los Servicios de la API de Google",
      p1After: ", incluidos los requisitos de Uso Limitado.",
      items: [
        { pre: "", bold: "Solo leemos", post: " tus mensajes de Gmail para identificar y clasificar tickets de soporte" },
        { pre: "", bold: "Nunca eliminamos, modificamos ni enviamos", post: " correos desde tu cuenta" },
        { pre: "Los datos de Gmail se usan ", bold: "exclusivamente", post: " para proporcionar el servicio de Kairo (clasificación y priorización de tickets)" },
        { pre: "", bold: "No compartimos", post: " tus datos de Gmail con terceros para fines publicitarios o de marketing" },
        { pre: "", bold: "", post: "Puedes revocar el acceso a Gmail en cualquier momento desde la configuración de tu cuenta de Google" },
      ],
    },
    s4: {
      title: "4. Cómo Usamos tu Información",
      intro: "Usamos tu información para:",
      items: [
        "Proporcionar y mantener el servicio de Kairo",
        "Clasificar y priorizar automáticamente los tickets de soporte de tu bandeja de entrada",
        "Mejorar nuestros algoritmos de clasificación con IA",
        "Notificarte sobre actualizaciones del servicio o problemas de seguridad",
        "Responder a tus solicitudes de soporte",
        "Prevenir fraudes y garantizar la seguridad de la plataforma",
      ],
    },
    s5: {
      title: "5. Almacenamiento y Seguridad de Datos",
      intro: "Tus datos se almacenan de forma segura utilizando prácticas estándar de la industria:",
      items: [
        "Datos cifrados en tránsito (TLS/SSL) y en reposo (AES-256)",
        "Tokens OAuth almacenados con cifrado en bases de datos seguras",
        "Acceso limitado únicamente al personal autorizado",
        "Auditorías de seguridad y monitoreo regulares",
        "Alojado en infraestructura cloud segura (Supabase/Vercel)",
      ],
    },
    s6: {
      title: "6. Tus Derechos",
      intro: "Tienes el derecho de:",
      items: [
        "Acceder a tus datos personales",
        "Corregir datos inexactos",
        "Solicitar la eliminación de tus datos",
        "Revocar el acceso a Gmail en cualquier momento",
        "Exportar tus datos en formato portátil",
        "Oponerte al procesamiento de tus datos",
      ],
      contactPrefix: "Para ejercer estos derechos, contáctanos en",
    },
    s7: {
      title: "7. Retención de Datos",
      p: "Conservamos tus datos mientras tu cuenta esté activa o según sea necesario para proporcionar los servicios. Cuando eliminas tu cuenta, eliminamos permanentemente tus datos en un plazo de 30 días, excepto cuando lo exija la ley.",
    },
    s8: {
      title: "8. Cambios en esta Política",
      p: "Podemos actualizar esta Política de Privacidad periódicamente. Te notificaremos los cambios significativos por correo electrónico o a través del servicio. El uso continuado después de los cambios constituye la aceptación.",
    },
    s9: {
      title: "9. Contáctanos",
      intro: "Si tienes preguntas sobre esta Política de Privacidad, contáctanos:",
      emailLabel: "Correo:",
      websiteLabel: "Sitio web:",
    },
  },
  terms: {
    title: "Términos de Servicio",
    updated: "Última actualización: 20 de febrero de 2026",
    s1: {
      title: "1. Aceptación de los Términos",
      p: "Al acceder o utilizar Kairo («Servicio»), aceptas estar vinculado por estos Términos de Servicio («Términos»). Si no estás de acuerdo con estos Términos, no utilices el Servicio.",
    },
    s2: {
      title: "2. Descripción del Servicio",
      intro: "Kairo es un cockpit de soporte impulsado por IA que:",
      items: [
        "Se conecta a tu cuenta de Gmail para leer correos de soporte",
        "Clasifica y prioriza automáticamente los tickets de soporte",
        "Proporciona sugerencias asistidas por IA para la resolución de tickets",
        "Organiza las comunicaciones con clientes en un panel unificado",
      ],
    },
    s3: {
      title: "3. Responsabilidades del Usuario",
      intro: "Aceptas:",
      items: [
        "Proporcionar información de cuenta precisa",
        "Mantener seguras tus credenciales de acceso",
        "Utilizar el Servicio solo para fines legales",
        "No intentar realizar ingeniería inversa ni hackear el Servicio",
        "No utilizar el Servicio para enviar spam o contenido malicioso",
        "Cumplir con todas las leyes y regulaciones aplicables",
      ],
    },
    s4: {
      title: "4. Integración con Gmail",
      intro: "Al conectar tu cuenta de Gmail:",
      items: [
        "Autorizas a Kairo a leer correos para la identificación de tickets de soporte",
        "Reconoces que Kairo no eliminará, modificará ni enviará correos",
        "Puedes revocar el acceso en cualquier momento desde la configuración de Google",
        "Entiendes que revocar el acceso desactivará la funcionalidad principal de Kairo",
      ],
    },
    s5: {
      title: "5. Propiedad de los Datos",
      p: "Conservas todos los derechos de propiedad sobre tus datos. Kairo no reclama la propiedad de tus correos, tickets o información de clientes. Solo procesamos tus datos para proporcionar el Servicio descrito en nuestra Política de Privacidad.",
    },
    s6: {
      title: "6. Disponibilidad del Servicio",
      p: "Nos esforzamos por mantener un 99,9% de tiempo de actividad, pero no garantizamos el acceso ininterrumpido. El Servicio puede estar temporalmente no disponible por mantenimiento, actualizaciones o circunstancias fuera de nuestro control.",
    },
    s7: {
      title: "7. Limitación de Responsabilidad",
      intro: "En la máxima medida permitida por la ley:",
      items: [
        "Kairo se proporciona «tal cual» sin garantías de ningún tipo",
        "No somos responsables de daños indirectos, incidentales o consecuentes",
        "Nuestra responsabilidad total no excederá el monto que pagaste en los últimos 12 meses",
        "No somos responsables de servicios de terceros (p. ej., Gmail, APIs de Google)",
      ],
    },
    s8: {
      title: "8. Terminación",
      intro: "Cualquiera de las partes puede dar por terminado este acuerdo:",
      items: [
        "Puedes eliminar tu cuenta en cualquier momento desde la configuración del panel",
        "Podemos suspender o cancelar cuentas por violaciones de los Términos",
        "Tras la terminación, tus datos serán eliminados en un plazo de 30 días",
        "Las secciones sobre responsabilidad y disputas sobreviven a la terminación",
      ],
    },
    s9: {
      title: "9. Cambios en los Términos",
      p: "Podemos modificar estos Términos en cualquier momento. Te notificaremos los cambios materiales por correo electrónico o a través del Servicio. El uso continuado tras los cambios constituye la aceptación de los Términos actualizados.",
    },
    s10: {
      title: "10. Ley Aplicable",
      p: "Estos Términos se rigen por las leyes de los Países Bajos. Cualquier disputa se resolverá en los tribunales de Ámsterdam, Países Bajos.",
    },
    s11: {
      title: "11. Contáctanos",
      intro: "¿Preguntas sobre estos Términos? Contáctanos:",
      emailLabel: "Correo:",
      websiteLabel: "Sitio web:",
    },
  },
};
