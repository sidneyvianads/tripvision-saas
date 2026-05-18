-- Snapshot da migration aplicada via Supabase MCP em 2026-05-18.
-- R14-2: RPCs SECURITY DEFINER pra invite flow. Toda mutação na
-- viagem_convites passa por aqui (R14-1 removeu policy de mutação
-- direta na tabela).

-- ─── plan_member_limit: Pro=5, Grupo=20, Owner=ilimitado ────────────
CREATE OR REPLACE FUNCTION public.plan_member_limit(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_plano TEXT;
DECLARE v_exp TIMESTAMPTZ;
BEGIN
  SELECT plano, plano_expires_at INTO v_plano, v_exp
    FROM public.users WHERE id = p_user_id;
  IF v_plano = 'owner' THEN RETURN 1000000; END IF;
  IF v_plano IN ('pro','grupo') AND v_exp IS NOT NULL AND v_exp > NOW() THEN
    IF v_plano = 'pro' THEN RETURN 5; END IF;
    IF v_plano = 'grupo' THEN RETURN 20; END IF;
  END IF;
  RETURN 1;
END;
$$;

-- ─── is_within_plan_limit: members + convites pendentes < limite ────
CREATE OR REPLACE FUNCTION public.is_within_plan_limit(p_viagem_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_owner uuid;
DECLARE v_limit int;
DECLARE v_used int;
BEGIN
  SELECT owner_id INTO v_owner FROM public.viagens WHERE id = p_viagem_id;
  IF v_owner IS NULL THEN RETURN false; END IF;
  v_limit := public.plan_member_limit(v_owner);
  SELECT
    (SELECT COUNT(*) FROM public.viagem_membros WHERE viagem_id = p_viagem_id)
    + (SELECT COUNT(*) FROM public.viagem_convites
       WHERE viagem_id = p_viagem_id AND aceito_em IS NULL AND expira_em > NOW())
  INTO v_used;
  RETURN v_used < v_limit;
END;
$$;

-- ─── invite_to_trip ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_to_trip(
  p_viagem_id uuid,
  p_email text,
  p_role text DEFAULT 'membro'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_email TEXT;
DECLARE v_existing public.viagem_convites%ROWTYPE;
DECLARE v_new public.viagem_convites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin_of(p_viagem_id) THEN
    RAISE EXCEPTION 'permission denied: only trip admin can invite' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('membro','admin') THEN
    RAISE EXCEPTION 'invalid role' USING ERRCODE = '22023';
  END IF;
  v_email := lower(trim(p_email));
  IF v_email IS NULL OR length(v_email) < 3 OR v_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_within_plan_limit(p_viagem_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'plan_limit_reached');
  END IF;
  SELECT * INTO v_existing FROM public.viagem_convites
    WHERE viagem_id = p_viagem_id AND lower(email) = v_email AND aceito_em IS NULL;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'token', v_existing.token, 'email', v_existing.email,
      'expira_em', v_existing.expira_em, 'already_pending', true
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.viagem_membros vm
    JOIN public.users u ON u.id = vm.user_id
    WHERE vm.viagem_id = p_viagem_id AND lower(u.email) = v_email
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'already_member');
  END IF;
  INSERT INTO public.viagem_convites (viagem_id, email, role, criado_por)
  VALUES (p_viagem_id, v_email, p_role, auth.uid())
  RETURNING * INTO v_new;
  RETURN jsonb_build_object(
    'ok', true, 'token', v_new.token, 'email', v_new.email,
    'expira_em', v_new.expira_em, 'already_pending', false
  );
END;
$$;

-- ─── accept_invite ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_invite(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_conv public.viagem_convites%ROWTYPE;
DECLARE v_user_email TEXT;
DECLARE v_slug TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF v_user_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_email');
  END IF;
  SELECT * INTO v_conv FROM public.viagem_convites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'not_found');
  END IF;
  IF v_conv.aceito_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'already_accepted');
  END IF;
  IF v_conv.expira_em < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'expired');
  END IF;
  IF lower(v_conv.email) <> v_user_email THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'email_mismatch');
  END IF;
  IF NOT public.is_within_plan_limit(v_conv.viagem_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'plan_limit_reached');
  END IF;
  INSERT INTO public.viagem_membros (viagem_id, user_id, role)
  VALUES (v_conv.viagem_id, auth.uid(), v_conv.role)
  ON CONFLICT (viagem_id, user_id) DO NOTHING;
  UPDATE public.viagem_convites
    SET aceito_em = NOW(), aceito_por = auth.uid()
    WHERE id = v_conv.id;
  SELECT slug INTO v_slug FROM public.viagens WHERE id = v_conv.viagem_id;
  RETURN jsonb_build_object(
    'ok', true, 'viagem_id', v_conv.viagem_id, 'slug', v_slug, 'role', v_conv.role
  );
END;
$$;

-- ─── revoke_invite ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_invite(p_convite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_conv public.viagem_convites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_conv FROM public.viagem_convites WHERE id = p_convite_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'not_found');
  END IF;
  IF v_conv.aceito_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'already_accepted');
  END IF;
  IF NOT (public.is_admin_of(v_conv.viagem_id) OR v_conv.criado_por = auth.uid()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.viagem_convites WHERE id = v_conv.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.invite_to_trip(uuid, text, text) FROM public;
REVOKE ALL ON FUNCTION public.accept_invite(uuid) FROM public;
REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_within_plan_limit(uuid) FROM public;
REVOKE ALL ON FUNCTION public.plan_member_limit(uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.invite_to_trip(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_within_plan_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_member_limit(uuid) TO authenticated;
