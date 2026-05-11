-- =============================================================================
-- seed-dev-clients-v2.sql — 4 additional phantom clients with varied profiles
-- =============================================================================
-- HOW TO RUN:
--   Paste this entire script in the Supabase SQL Editor and click "Run".
--   Idempotent: re-running is safe (INSERT ... ON CONFLICT DO NOTHING).
--
-- WHAT IT CREATES:
--   • 4 new clients — Enterprise/Pro/Starter, Critical/High/Standard SLA
--   • 14 resolved tickets spread across them with realistic timestamps
--   • CSAT events for 3 of the 4 clients (Starter trial intentionally has none)
-- =============================================================================

DO $$
DECLARE
  v_user_id      uuid;

  -- client IDs (stable so re-runs are idempotent)
  v_nw_id        uuid := 'aaaaaaaa-0001-0001-0001-000000000001'::uuid;
  v_lu_id        uuid := 'aaaaaaaa-0002-0002-0002-000000000002'::uuid;
  v_ta_id        uuid := 'aaaaaaaa-0003-0003-0003-000000000003'::uuid;
  v_mi_id        uuid := 'aaaaaaaa-0004-0004-0004-000000000004'::uuid;

  -- ticket IDs
  v_t1  uuid; v_t2  uuid; v_t3  uuid; v_t4  uuid; v_t5  uuid;
  v_t6  uuid; v_t7  uuid; v_t8  uuid; v_t9  uuid; v_t10 uuid;
  v_t11 uuid; v_t12 uuid; v_t13 uuid; v_t14 uuid;

BEGIN

  -- ── 1. First registered user ───────────────────────────────────────────────
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found. Create an account first.';
  END IF;
  RAISE NOTICE 'Seeding phantom clients for user=%', v_user_id;

  -- ── 2. INSERT CLIENTS ──────────────────────────────────────────────────────

  -- Northwind Technologies — Enterprise, Critical SLA (churn risk indicator)
  -- Many tickets, tech-heavy, flagged as priority account
  INSERT INTO public.clients (
    id, user_id, internal_id, name, telephone,
    authorized_emails, contact_persons, plan_type, sla_level
  ) VALUES (
    v_nw_id, v_user_id,
    'CLI-NW-002',
    'Northwind Technologies',
    '+57 (1) 800-4321',
    ARRAY['diego@northwind.dev', 'ops@northwind.dev'],
    '[{"name":"Diego Tovar","role":"CTO"},{"name":"Sara Molina","role":"Ops Lead"}]'::jsonb,
    'Enterprise',
    'Critical'
  ) ON CONFLICT (user_id, internal_id) DO NOTHING;

  -- Lumen Studio — Pro, High SLA, excellent CSAT, creative agency
  INSERT INTO public.clients (
    id, user_id, internal_id, name, telephone,
    authorized_emails, contact_persons, plan_type, sla_level
  ) VALUES (
    v_lu_id, v_user_id,
    'CLI-LU-003',
    'Lumen Studio',
    '+52 55 3344-8800',
    ARRAY['luisa@lumen.mx'],
    '[{"name":"Luisa Romero","role":"CEO"}]'::jsonb,
    'Pro',
    'High'
  ) ON CONFLICT (user_id, internal_id) DO NOTHING;

  -- Tarsier Labs — Starter, Standard SLA, no CSAT (trial user, just signed up)
  INSERT INTO public.clients (
    id, user_id, internal_id, name, telephone,
    authorized_emails, contact_persons, plan_type, sla_level
  ) VALUES (
    v_ta_id, v_user_id,
    'CLI-TA-004',
    'Tarsier Labs',
    NULL,
    ARRAY['andres@tarsier.co'],
    '[{"name":"Andrés Núñez","role":"Founder"}]'::jsonb,
    'Starter',
    'Standard'
  ) ON CONFLICT (user_id, internal_id) DO NOTHING;

  -- Mira & Co — Pro, High SLA, logistics, last contacted 1 week ago
  INSERT INTO public.clients (
    id, user_id, internal_id, name, telephone,
    authorized_emails, contact_persons, plan_type, sla_level
  ) VALUES (
    v_mi_id, v_user_id,
    'CLI-MI-005',
    'Mira & Co',
    '+56 2 2900-0055',
    ARRAY['camila@miraco.cl', 'soporte@miraco.cl'],
    '[{"name":"Camila Ortega","role":"Support Manager"},{"name":"Rodrigo Vásquez","role":"Tech Lead"}]'::jsonb,
    'Pro',
    'High'
  ) ON CONFLICT (user_id, internal_id) DO NOTHING;

  -- ── 3. INSERT RESOLVED TICKETS ────────────────────────────────────────────
  -- (ticket_number is GENERATED ALWAYS — omit it)

  -- Northwind: 5 tickets, spread over 6 months, recent burst (churn signal)
  SELECT gen_random_uuid() INTO v_t1;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t1, v_user_id, v_nw_id,
    'API endpoint retorna 500 en producción',
    'diego@northwind.dev', 'Diego Tovar',
    'resolved', 'support', 'P1', 'technical', 'frustrated',
    now() - interval '3 hours',
    now() - interval '1 hour',
    'Se identificó un rate limit en la capa de autenticación. Se aumentó el límite y se desplegó hotfix.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t2;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t2, v_user_id, v_nw_id,
    'Webhook no dispara en ambiente staging',
    'ops@northwind.dev', 'Sara Molina',
    'resolved', 'support', 'P2', 'technical', 'neutral',
    now() - interval '2 days',
    now() - interval '1 day 18 hours',
    'El endpoint de staging tenía el HMAC secret incorrecto. Se corrigió en el dashboard.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t3;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t3, v_user_id, v_nw_id,
    'Timeout en consultas con más de 10k registros',
    'diego@northwind.dev', 'Diego Tovar',
    'resolved', 'support', 'P2', 'technical', 'frustrated',
    now() - interval '10 days',
    now() - interval '9 days',
    'Se habilitó paginación server-side con cursor. Documentación actualizada.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t4;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t4, v_user_id, v_nw_id,
    'Factura de abril con monto duplicado',
    'ops@northwind.dev', 'Sara Molina',
    'resolved', 'support', 'P1', 'billing', 'aggressive',
    now() - interval '30 days',
    now() - interval '29 days 4 hours',
    'Crédito aplicado al siguiente ciclo. Error en lógica de prorrataeo corregido.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t5;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t5, v_user_id, v_nw_id,
    'Solicitud de migración de datos a nuevo workspace',
    'diego@northwind.dev', 'Diego Tovar',
    'resolved', 'support', 'P3', 'account', 'neutral',
    now() - interval '60 days',
    now() - interval '58 days',
    'Migración completada en ventana de mantenimiento programada.'
  ) ON CONFLICT (id) DO NOTHING;

  -- Lumen Studio: 4 tickets, low priority, happy customer
  SELECT gen_random_uuid() INTO v_t6;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t6, v_user_id, v_lu_id,
    '¿Cómo configuro dominio personalizado para emails?',
    'luisa@lumen.mx', 'Luisa Romero',
    'resolved', 'support', 'P3', 'technical', 'positive',
    now() - interval '14 days',
    now() - interval '13 days 22 hours',
    'Se guió paso a paso en la configuración de DNS y SPF/DKIM. Verificado en 24h.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t7;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t7, v_user_id, v_lu_id,
    'Quiero agregar 2 agentes más al plan',
    'luisa@lumen.mx', 'Luisa Romero',
    'resolved', 'prospect', 'P3', 'general', 'positive',
    now() - interval '45 days',
    now() - interval '44 days 23 hours',
    'Upgrade procesado. Plan actualizado a 5 asientos.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t8;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t8, v_user_id, v_lu_id,
    'Sugerencia: exportar reportes en CSV',
    'luisa@lumen.mx', 'Luisa Romero',
    'resolved', 'support', 'P3', 'general', 'positive',
    now() - interval '90 days',
    now() - interval '89 days',
    'Feature registrada en el roadmap. Se notificará al cliente al lanzar.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t9;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t9, v_user_id, v_lu_id,
    'Error al cargar panel en Safari 17',
    'luisa@lumen.mx', 'Luisa Romero',
    'resolved', 'support', 'P2', 'technical', 'neutral',
    now() - interval '120 days',
    now() - interval '119 days 6 hours',
    'Parche CSS para Safari WebKit desplegado en v2.14.1.'
  ) ON CONFLICT (id) DO NOTHING;

  -- Tarsier Labs: 2 tickets, new user, no CSAT yet
  SELECT gen_random_uuid() INTO v_t10;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t10, v_user_id, v_ta_id,
    'No puedo conectar mi Gmail al workspace',
    'andres@tarsier.co', 'Andrés Núñez',
    'resolved', 'support', 'P2', 'general', 'neutral',
    now() - interval '3 days',
    now() - interval '2 days 20 hours',
    'Se guió al usuario a reconectar OAuth con los permisos correctos.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t11;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t11, v_user_id, v_ta_id,
    'Pregunta sobre límites del plan Starter',
    'andres@tarsier.co', 'Andrés Núñez',
    'resolved', 'support', 'P3', 'account', 'neutral',
    now() - interval '5 days',
    now() - interval '4 days 22 hours',
    'Se explicaron los límites de tickets/mes y cómo ver el uso en el dashboard.'
  ) ON CONFLICT (id) DO NOTHING;

  -- Mira & Co: 3 tickets, solid customer, moderate frequency
  SELECT gen_random_uuid() INTO v_t12;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t12, v_user_id, v_mi_id,
    'Actualizar email autorizado para despachos',
    'camila@miraco.cl', 'Camila Ortega',
    'resolved', 'support', 'P3', 'account', 'neutral',
    now() - interval '7 days',
    now() - interval '6 days 23 hours',
    'Email actualizado en los destinatarios autorizados del workspace.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t13;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t13, v_user_id, v_mi_id,
    'Reporte de SLA incumplido en noviembre',
    'camila@miraco.cl', 'Camila Ortega',
    'resolved', 'support', 'P2', 'billing', 'frustrated',
    now() - interval '40 days',
    now() - interval '39 days 2 hours',
    'Se aplicó crédito de SLA según contrato. Se auditó el proceso de alerta.'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT gen_random_uuid() INTO v_t14;
  INSERT INTO public.tickets (
    id, user_id, client_id, subject, from_email, from_name,
    status, ticket_type, priority, category, sentiment,
    received_at, resolved_at, resolution_summary
  ) VALUES (
    v_t14, v_user_id, v_mi_id,
    'Solicitar informe de uso mensual en PDF',
    'soporte@miraco.cl', 'Rodrigo Vásquez',
    'resolved', 'support', 'P3', 'general', 'positive',
    now() - interval '75 days',
    now() - interval '74 days 18 hours',
    'Informe enviado por correo. Se configuró envío automático mensual.'
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 4. INSERT CSAT EVENTS ─────────────────────────────────────────────────
  -- Northwind: unhappy (3-4/5) — signals churn risk
  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t1, v_user_id, 3) ON CONFLICT DO NOTHING;

  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t2, v_user_id, 4) ON CONFLICT DO NOTHING;

  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t3, v_user_id, 3) ON CONFLICT DO NOTHING;

  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t4, v_user_id, 2) ON CONFLICT DO NOTHING;

  -- Lumen Studio: excellent (5/5) — happy creative agency
  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t6, v_user_id, 5) ON CONFLICT DO NOTHING;

  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t7, v_user_id, 5) ON CONFLICT DO NOTHING;

  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t8, v_user_id, 5) ON CONFLICT DO NOTHING;

  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t9, v_user_id, 4) ON CONFLICT DO NOTHING;

  -- Tarsier Labs: NO CSAT (trial user, never rated — shows "—" in table)

  -- Mira & Co: mixed (4-5/5)
  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t12, v_user_id, 5) ON CONFLICT DO NOTHING;

  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t13, v_user_id, 4) ON CONFLICT DO NOTHING;

  INSERT INTO public.csat_events (ticket_id, user_id, score)
  VALUES (v_t14, v_user_id, 5) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Done. 4 clients + 14 tickets + 11 CSAT events created.';
END $$;
