-- =============================================================================
-- seed-dev-data-v2-body-plain.sql  — Backfill body_plain on KAI-161 seed rows
-- =============================================================================
-- Prerequisite: seed-dev-data.sql must have been run first.
-- What it does:
--   • Sets body_plain on the 3 resolved tickets seeded in v1 (matched by subject)
--   • Sets body_plain on the open ticket linked to Acme Corporation (if still null)
-- Safe to re-run: all statements are UPDATE … WHERE body_plain IS NULL.
-- =============================================================================

DO $$
DECLARE
  v_user_id uuid;
BEGIN

  SELECT id INTO v_user_id
  FROM auth.users
  ORDER BY created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found.';
  END IF;

  -- Resolved ticket 1 — nodo HTTP
  UPDATE public.tickets
  SET body_plain = E'Hola equipo de soporte,\n\nEstoy teniendo problemas con un flujo de n8n que deja de funcionar cada vez que intento conectar un nodo HTTP a nuestra API interna. El error que aparece en la consola es:\n\n  "Error: Request failed with status code 405 - Method Not Allowed"\n\nRevisé la URL y parece correcta, pero el nodo sigue fallando. ¿Pueden ayudarme a identificar qué está mal?\n\nGracias,\nEquipo Acme'
  WHERE user_id = v_user_id
    AND subject  = 'Error al conectar flujo con nodo HTTP'
    AND status   = 'resolved'
    AND body_plain IS NULL;

  -- Resolved ticket 2 — credenciales Gmail
  UPDATE public.tickets
  SET body_plain = E'Buenos días,\n\nDesde esta mañana nuestro flujo de clasificación de correos dejó de funcionar. El panel de Kairo ya no está recibiendo nuevos tickets y cuando revisamos los logs vemos el siguiente error:\n\n  "OAuth token expired or revoked. Re-authentication required."\n\nNo hemos cambiado ninguna configuración. ¿Es un problema del lado de ustedes o necesitamos hacer algo por nuestra parte?\n\nSaludos,\nAcme Corporation'
  WHERE user_id = v_user_id
    AND subject  = 'Credenciales de Gmail caducadas en integración'
    AND status   = 'resolved'
    AND body_plain IS NULL;

  -- Resolved ticket 3 — escalación L2
  UPDATE public.tickets
  SET body_plain = E'Hola,\n\nTenemos un cliente que abrió un ticket hace 3 días sobre un problema de sincronización de datos y no ha respondido a nuestros mensajes de seguimiento. ¿Cuál es el proceso correcto para escalar este caso a nivel 2?\n\n¿Existe algún SLA establecido para este tipo de situaciones? Queremos asegurarnos de seguir el procedimiento adecuado antes de escalar.\n\nGracias,\nSoporte Acme'
  WHERE user_id = v_user_id
    AND subject  = 'Cómo escalar a nivel 2 cuando el cliente no responde'
    AND status   = 'resolved'
    AND body_plain IS NULL;

  -- Open ticket linked to Acme (fallback for tickets created without a body)
  UPDATE public.tickets t
  SET body_plain = E'Hola,\n\nEscribimos porque estamos teniendo dificultades con la integración de Kairo en nuestro flujo de trabajo actual. Específicamente, notamos que algunos tickets no están siendo clasificados automáticamente y otros están apareciendo con prioridad incorrecta.\n\n¿Podrían revisar la configuración de nuestro tenant? También nos gustaría entender mejor cómo funciona el sistema de clasificación por IA para poder ajustar las reglas según nuestras necesidades.\n\nQuedamos a la espera de su respuesta.\n\nSaludos,\nEquipo Acme Corporation'
  FROM public.clients c
  WHERE t.user_id   = v_user_id
    AND t.client_id = c.id
    AND c.internal_id = 'CLI-DEMO-001'
    AND t.status      = 'open'
    AND t.body_plain IS NULL;

  RAISE NOTICE 'v2 body_plain backfill complete for user=%', v_user_id;

END $$;
