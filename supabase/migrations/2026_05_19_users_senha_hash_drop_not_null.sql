-- R30-2: HOTFIX signup quebrado em produção.
-- Aplicado via Supabase MCP em 2026-05-19. Snapshot no repo pra paridade.
--
-- public.users.senha_hash é legacy do esquema bcrypt+JWT custom anterior.
-- Quando migramos pra Supabase Auth nativo, a coluna ficou esquecida com
-- NOT NULL sem default. A função handle_new_auth_user (trigger pós-signup)
-- não preenche senha_hash — INSERT viola 23502 e signup quebra.
--
-- Funcionou até 2026-05-15 16:25 UTC porque a versão anterior do trigger
-- tinha catch-all OTHERS. A migration 2026_05_15_handle_new_auth_user_specific_exceptions
-- trocou pra catch só foreign_key_violation, expondo o bug latente.
--
-- Fix mínimo: DROP NOT NULL. Coluna fica preservada (legacy bcrypt hashes
-- pra 11 users antigos) mas novos signups podem deixar NULL. Não dropo
-- a coluna ainda pra não quebrar nenhum código legacy de leitura que
-- possa existir — vai numa cleanup futura.
--
-- Idempotente: ALTER COLUMN ... DROP NOT NULL é no-op se já é nullable.

ALTER TABLE public.users ALTER COLUMN senha_hash DROP NOT NULL;
