-- Snapshot da migration aplicada via Supabase MCP em 2026-05-18.
-- R14-1: tabela viagem_convites + RLS pra invite flow do Viajjei.
-- Substitui o auto-INSERT em viagem_membros do useTrip que abria
-- toda viagem pra qualquer logado que tivesse o link /v/${slug}.

CREATE TABLE IF NOT EXISTS public.viagem_convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  role TEXT NOT NULL DEFAULT 'membro' CHECK (role IN ('membro', 'admin')),
  criado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  aceito_em TIMESTAMPTZ,
  aceito_por UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- UNIQUE parcial: só um convite PENDENTE por (viagem, email lowercased).
-- Permite re-convidar depois que um foi aceito ou expirou + foi deletado.
CREATE UNIQUE INDEX IF NOT EXISTS viagem_convites_pending_unique
  ON public.viagem_convites (viagem_id, lower(email))
  WHERE aceito_em IS NULL;

CREATE INDEX IF NOT EXISTS viagem_convites_token_idx
  ON public.viagem_convites (token);

CREATE INDEX IF NOT EXISTS viagem_convites_email_pending_idx
  ON public.viagem_convites (lower(email)) WHERE aceito_em IS NULL;

ALTER TABLE public.viagem_convites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS viagem_convites_select ON public.viagem_convites;
CREATE POLICY viagem_convites_select ON public.viagem_convites
  FOR SELECT TO authenticated
  USING (
    public.is_admin_of(viagem_id)
    OR criado_por = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- INSERT/UPDATE/DELETE NÃO têm policy → RLS nega tudo direto. Toda
-- mutação passa pelos RPCs SECURITY DEFINER (R14-2) que validam
-- is_admin_of, limite de plano, expira_em, etc.
COMMENT ON TABLE public.viagem_convites IS
  'Convites pendentes pra viagens. INSERT/UPDATE/DELETE só via RPCs '
  'invite_to_trip / accept_invite / revoke_invite (SECURITY DEFINER). '
  'Sem policy de mutação aqui = client direto nega via RLS.';
