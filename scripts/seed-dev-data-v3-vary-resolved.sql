-- =============================================================================
-- seed-dev-data-v3-vary-resolved.sql  — Varía clasificación de los 3 tickets
--                                       resueltos creados en v1
-- =============================================================================
-- Prerequisite: seed-dev-data.sql (v1) debe haber corrido primero.
-- Qué hace: UPDATE a los 3 tickets resueltos de Acme para que tengan
--           sentiment, priority y category distintos entre sí,
--           usando solo valores canónicos del schema de inteligencia:
--             sentiment : aggressive | frustrated | neutral | positive
--             priority  : P1 | P2 | P3
--             category  : technical | billing | account | general | not_applicable
--             ticket_type: support | prospect | spam | internal | other
-- Safe to re-run: WHERE conditions por subject + status evitan doble escritura.
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

  -- Ticket 1 — Error nodo HTTP
  -- Cliente frustrado por un error técnico que cortó su flujo de producción → P1, technical, frustrated
  UPDATE public.tickets
  SET sentiment    = 'frustrated',
      priority     = 'P1',
      ticket_type  = 'support',
      category     = 'technical'
  WHERE user_id = v_user_id
    AND subject  = 'Error al conectar flujo con nodo HTTP'
    AND status   = 'resolved';

  -- Ticket 2 — Credenciales Gmail caducadas
  -- Cliente molesto porque perdió acceso sin previo aviso → P2, account, aggressive
  UPDATE public.tickets
  SET sentiment    = 'aggressive',
      priority     = 'P2',
      ticket_type  = 'support',
      category     = 'account'
  WHERE user_id = v_user_id
    AND subject  = 'Credenciales de Gmail caducadas en integración'
    AND status   = 'resolved';

  -- Ticket 3 — Proceso de escalación
  -- Consulta informativa, tono tranquilo → P3, general, positive
  UPDATE public.tickets
  SET sentiment    = 'positive',
      priority     = 'P3',
      ticket_type  = 'support',
      category     = 'general'
  WHERE user_id = v_user_id
    AND subject  = 'Cómo escalar a nivel 2 cuando el cliente no responde'
    AND status   = 'resolved';

  RAISE NOTICE 'v3 classification variety applied for user=%', v_user_id;

END $$;
