-- =============================================================================
-- seed-dev-data.sql  — Synthetic development data for KAI-161 right-rail tabs
-- =============================================================================
-- HOW TO RUN:
--   Paste this entire script in the Supabase SQL Editor and click "Run".
--   It is idempotent: re-running it is safe (uses INSERT ... ON CONFLICT DO NOTHING
--   and UPDATE ... WHERE conditions).
--
-- WHAT IT CREATES:
--   • 1 client record (Pro plan) linked to an existing open ticket
--   • 3 resolved tickets from the same sender (for the "Similares" tab fallback)
--   • 3 published KB articles (for the "Artículos" tab)
-- =============================================================================

DO $$
DECLARE
  v_user_id        uuid;
  v_ticket_id      uuid;
  v_from_email     text;
  v_client_id      uuid := gen_random_uuid();
  v_next_number    bigint;
BEGIN

  -- ─── 1. Discover the first registered user ──────────────────────────────────
  SELECT id INTO v_user_id
  FROM auth.users
  ORDER BY created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found. Create an account first.';
  END IF;

  -- ─── 2. Pick the most recent open ticket without a client_id ────────────────
  SELECT id, from_email INTO v_ticket_id, v_from_email
  FROM public.tickets
  WHERE user_id   = v_user_id
    AND status    = 'open'
    AND client_id IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_ticket_id IS NULL THEN
    -- Fallback: any open ticket
    SELECT id, from_email INTO v_ticket_id, v_from_email
    FROM public.tickets
    WHERE user_id = v_user_id
      AND status  = 'open'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'No open tickets found for user %. Create at least one ticket first.', v_user_id;
  END IF;

  -- Use a placeholder email if the ticket has none
  IF v_from_email IS NULL OR v_from_email = '' THEN
    v_from_email := 'demo-client@example.com';
  END IF;

  RAISE NOTICE 'Seeding for user=% | ticket=% | email=%', v_user_id, v_ticket_id, v_from_email;

  -- ─── 3. Insert client record ────────────────────────────────────────────────
  INSERT INTO public.clients (
    id, user_id, internal_id, name, telephone,
    authorized_emails, plan_type, sla_level
  ) VALUES (
    v_client_id,
    v_user_id,
    'CLI-DEMO-001',
    'Acme Corporation (Demo)',
    '+1 (555) 100-2000',
    ARRAY[v_from_email],
    'Pro',
    'High'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ─── 4. Link the open ticket to the new client ──────────────────────────────
  UPDATE public.tickets
  SET client_id  = v_client_id,
      updated_at = now()
  WHERE id      = v_ticket_id
    AND user_id = v_user_id;

  -- ─── 5. Compute a safe next ticket_number ───────────────────────────────────
  SELECT COALESCE(MAX(ticket_number), 0) + 1 INTO v_next_number
  FROM public.tickets
  WHERE user_id = v_user_id;

  -- ─── 6. Insert 3 resolved tickets from the same sender ──────────────────────
  INSERT INTO public.tickets (
    id, user_id, subject, from_email, from_name,
    status, resolved_at, resolution_summary,
    ticket_type, priority, category, sentiment,
    ticket_number, client_id
  ) VALUES
  (
    gen_random_uuid(), v_user_id,
    'Error al conectar flujo con nodo HTTP',
    v_from_email, 'Acme Support',
    'resolved',
    now() - interval '12 days',
    'Se detectó que el nodo HTTP tenía el método configurado en GET en lugar de POST. Se corrigió y el flujo procesó correctamente. Verificar siempre el método HTTP y los headers de autorización.',
    'technical', 'P2', 'technical', 'neutral',
    v_next_number, v_client_id
  ),
  (
    gen_random_uuid(), v_user_id,
    'Credenciales de Gmail caducadas en integración',
    v_from_email, 'Acme Support',
    'resolved',
    now() - interval '25 days',
    'El token de OAuth de Gmail expiró. Se guió al cliente para revocar y volver a autorizar la integración desde Configuración → Integraciones → Gmail. El flujo de lectura de correos quedó operativo en 10 minutos.',
    'technical', 'P2', 'account', 'neutral',
    v_next_number + 1, v_client_id
  ),
  (
    gen_random_uuid(), v_user_id,
    'Cómo escalar a nivel 2 cuando el cliente no responde',
    v_from_email, 'Acme Support',
    'resolved',
    now() - interval '40 days',
    'Se explicó el proceso de escalación: tras 48 horas sin respuesta del cliente se puede marcar el ticket como "En espera" y enviar un seguimiento automático. Si en 72 horas adicionales no responde, escalar a L2 con el botón "Escalar" del panel derecho.',
    'general', 'P3', 'general', 'neutral',
    v_next_number + 2, v_client_id
  );

  -- ─── 7. Insert 3 published KB articles ──────────────────────────────────────
  INSERT INTO public.kb_articles (
    id, user_id, title, content, tags, is_published
  ) VALUES
  (
    gen_random_uuid(), v_user_id,
    'Cómo reconectar una integración de Gmail',
    E'## Síntomas\nEl flujo de lectura de correos devuelve un error de autenticación o deja de clasificar tickets.\n\n## Causa\nEl token de OAuth de Gmail expira cada 6 meses o cuando el usuario cambia su contraseña de Google.\n\n## Solución\n1. Ve a **Configuración → Integraciones**.\n2. Haz clic en **Reconectar** junto a Gmail.\n3. Autoriza los permisos solicitados.\n4. Espera 30 segundos y verifica que los nuevos correos aparecen en el panel.\n\n## Notas\n- El historial de tickets previos no se pierde.\n- Si el error persiste, revoca el acceso desde tu cuenta Google y vuelve a autorizar.',
    ARRAY['gmail', 'integración', 'oauth', 'autenticación'],
    true
  ),
  (
    gen_random_uuid(), v_user_id,
    'Resolución de errores en nodos HTTP de n8n',
    E'## Errores comunes\n- **401 Unauthorized**: Revisar headers de autorización (Bearer token o API key).\n- **400 Bad Request**: Verificar que el método HTTP coincide (GET vs POST) y que el body está en formato JSON válido.\n- **Connection timeout**: Revisar URL del endpoint y si el servicio destino está activo.\n\n## Pasos de diagnóstico\n1. Abrir el nodo HTTP en n8n y hacer clic en **Test step**.\n2. Revisar la pestaña **Output** para ver el error exacto.\n3. Usar **curl** o Postman para descartar problemas de red.\n\n## Tips\n- Activar **Always Output Data** para ver errores aunque el nodo falle.\n- Usar el nodo **IF** para manejar respuestas de error de forma explícita.',
    ARRAY['n8n', 'http', 'técnico', 'debugging'],
    true
  ),
  (
    gen_random_uuid(), v_user_id,
    'Proceso de escalación a nivel 2',
    E'## ¿Cuándo escalar?\n- El ticket lleva más de 48 horas sin resolución.\n- El cliente expresa frustración alta o amenaza con cancelar.\n- El problema requiere acceso a infraestructura o decisiones de negocio.\n\n## Pasos\n1. Documenta el contexto en la sección **Notas** del ticket.\n2. Haz clic en el botón **Escalar** en el panel derecho.\n3. Selecciona **Nivel 2** y agrega un motivo breve.\n4. El sistema notificará automáticamente al agente L2 asignado.\n\n## Comunicación con el cliente\nEnvía un mensaje como:\n> "Hemos escalado tu caso a nuestro equipo especializado. Recibirás una respuesta en menos de 4 horas hábiles."',
    ARRAY['escalación', 'proceso', 'sla', 'l2'],
    true
  );

  RAISE NOTICE 'Seed complete. client_id=%', v_client_id;

END $$;
