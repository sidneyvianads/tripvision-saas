// R15: sanitização de mensagens de erro pra UI.
//
// Por que existe: 5+ componentes mostravam error.message cru pro user,
// vazando nomes de tabela e código interno tipo:
//   - "duplicate key value violates unique constraint viagem_pessoas_pkey"
//   - "permission denied for table afiliados"
//   - "new row violates row-level security policy"
//
// friendlyError() recebe error (string, Error, PostgrestError, AuthError,
// fetch error) e devolve texto em português que faz sentido pro user
// final. Nunca devolve o message original.
//
// IMPORTANTE: nada de console.error aqui — o caller mantém o log técnico
// (com error.message completo) pra Sentry/DevTools. Esta função SÓ sanitiza
// pra UI. Padrão: `console.error("[x] erro:", err); setError(friendlyError(err));`

// Mapa de códigos PostgreSQL/PostgREST → mensagem. Códigos pegos do
// SQLSTATE oficial + PostgREST padrão.
const PG_CODE_MAP = {
  // Postgres SQLSTATE (5 chars)
  "23505": "Esse item já existe.",
  "23503": "Esse item está sendo usado em outro lugar.",
  "23502": "Faltou preencher um campo obrigatório.",
  "23514": "Um valor está fora do permitido.",
  "22001": "Texto muito longo.",
  "22003": "Número fora do intervalo permitido.",
  "22023": "Valor inválido pra essa ação.",
  "22P02": "Formato de dado inválido.",
  "42501": "Você não tem permissão pra isso.",
  "42P01": "Erro interno. Tenta de novo em alguns segundos.",
  "42703": "Erro interno. Tenta de novo em alguns segundos.",
  "P0001": "Operação não permitida.",
  "57014": "Operação demorou demais e foi cancelada. Tenta de novo.",
  // PostgREST custom codes (prefixo PGRST)
  PGRST116: "Não encontrei o que você procura.",
  PGRST301: "Sua sessão expirou. Faz login de novo.",
  PGRST302: "Sua sessão expirou. Faz login de novo.",
  // Supabase Auth — apesar de virem como string, mapeamos pra consistência
  "invalid_credentials": "Email ou senha incorretos.",
  "invalid_grant": "Email ou senha incorretos.",
  "user_already_exists": "Esse email já está cadastrado.",
  "email_address_invalid": "Email inválido.",
  "weak_password": "Senha muito fraca. Use 6+ caracteres com letras e números.",
  "over_email_send_rate_limit": "Muitos emails enviados. Espera 1 minuto e tenta de novo.",
  "over_request_rate_limit": "Muitas tentativas. Espera 1 minuto.",
  "email_not_confirmed": "Confirma seu email antes de entrar (cheque sua caixa).",
};

// Padrões de texto (substring case-insensitive). Casamos em ordem; o
// primeiro que bater vence. Ordem importa — coloca os mais específicos
// antes dos genéricos.
const MESSAGE_PATTERNS = [
  // Network — Failed to fetch, NetworkError, ECONNREFUSED, etc
  [/failed to fetch|network ?error|net::err|networkrequest|fetch failed/i, "Sem conexão. Verifica sua internet."],
  [/load failed|chunk\s*load(ing)? ?error|loading chunk \d+ failed/i, "Tem uma versão nova do app. Recarrega a página."],
  [/abort(ed)?|user cancelled|operation cancell?ed/i, "Operação cancelada."],
  [/timeout|timed out/i, "Servidor demorou pra responder. Tenta de novo."],

  // Supabase Auth (texto puro)
  [/invalid login credentials|invalid email or password/i, "Email ou senha incorretos."],
  [/email rate limit exceeded|rate limit/i, "Muitas tentativas. Espera 1 minuto."],
  [/user already (registered|exists)|already registered/i, "Esse email já está cadastrado."],
  [/email not confirmed/i, "Confirma seu email antes de entrar (cheque sua caixa)."],
  [/password should be at least|weak password/i, "Senha muito fraca. Use 6+ caracteres com letras e números."],
  [/captcha verification (process )?failed/i, "Verificação anti-robô falhou. Tenta de novo."],
  [/jwt expired|jwt invalid|token (has )?expired/i, "Sua sessão expirou. Faz login de novo."],
  [/email address.*invalid|invalid email/i, "Email inválido."],

  // PostgreSQL/PostgREST texto (quando code não vem)
  [/duplicate key value/i, "Esse item já existe."],
  [/violates foreign key constraint/i, "Esse item está sendo usado em outro lugar."],
  [/violates not.null constraint|null value in column/i, "Faltou preencher um campo obrigatório."],
  [/violates check constraint/i, "Um valor está fora do permitido."],
  [/violates row.level security/i, "Você não tem permissão pra isso."],
  [/permission denied/i, "Você não tem permissão pra isso."],
  [/relation .* does not exist/i, "Erro interno. Tenta de novo em alguns segundos."],
  [/value too long for type/i, "Texto muito longo."],
  [/invalid input syntax for type/i, "Formato de dado inválido."],

  // Mercado Pago / Anthropic / OpenAI surface-leaks
  [/mercado.?pago|preapproval/i, "Não consegui falar com o Mercado Pago agora. Tenta de novo daqui a pouco."],
  [/anthropic|claude|openai|gemini/i, "A IA está indisponível agora. Tenta de novo em alguns segundos."],

  // HTTP genéricos
  [/^5\d\d\b|internal server error|bad gateway|service unavailable/i, "Servidor indisponível. Tenta de novo daqui a pouco."],
  [/^429\b|too many requests/i, "Muitas tentativas. Espera 1 minuto."],
  [/^401\b|unauthorized/i, "Sua sessão expirou. Faz login de novo."],
  [/^403\b|forbidden/i, "Você não tem permissão pra isso."],
  [/^404\b|not found/i, "Não encontrei o que você procura."],
];

const FALLBACK = "Algo deu errado. Tenta de novo em alguns segundos.";

/**
 * Sanitiza qualquer erro pra UI. Sempre retorna string em português.
 *
 * Aceita:
 *   - null/undefined → FALLBACK
 *   - string ("23505", "PGRST116", "Failed to fetch", ...)
 *   - Error / TypeError / AbortError com .message / .name
 *   - PostgrestError ({ code, message, hint, details })
 *   - Supabase AuthError ({ code, message, status })
 *   - fetch Response não-ok (passado como status number/string)
 *   - objetos quaisquer com .code/.message
 */
export function friendlyError(err) {
  if (err == null) return FALLBACK;

  // Code direto (string ou número)
  if (typeof err === "string" || typeof err === "number") {
    const key = String(err);
    if (PG_CODE_MAP[key]) return PG_CODE_MAP[key];
    return matchByText(key) ?? FALLBACK;
  }

  // Objetos (Error, PostgrestError, AuthError, etc)
  if (typeof err === "object") {
    // 1) Code field primeiro — mais confiável que regex de message
    const code = err.code ?? err.error_code ?? err.statusCode;
    if (code && PG_CODE_MAP[String(code)]) return PG_CODE_MAP[String(code)];

    // 2) name field (AbortError, TimeoutError, TypeError)
    if (err.name) {
      const byName = matchByText(err.name);
      if (byName) return byName;
    }

    // 3) HTTP status
    if (err.status && PG_CODE_MAP[String(err.status)]) {
      return PG_CODE_MAP[String(err.status)];
    }

    // 4) message regex
    const msg = err.message ?? err.error_description ?? err.error ?? "";
    if (msg) {
      const byMsg = matchByText(msg);
      if (byMsg) return byMsg;
    }

    // 5) Algumas auth errors vêm como { error: "invalid_credentials" }
    if (typeof err.error === "string" && PG_CODE_MAP[err.error]) {
      return PG_CODE_MAP[err.error];
    }
  }

  return FALLBACK;
}

function matchByText(text) {
  const t = String(text ?? "");
  for (const [re, msg] of MESSAGE_PATTERNS) {
    if (re.test(t)) return msg;
  }
  return null;
}

/**
 * Helper opcional pra usar em lugares que querem prefixar contexto:
 * `setError(friendlyErrorWithContext("Não consegui salvar", err))`
 * → "Não consegui salvar. Esse item já existe."
 * Mantém o prefixo do dev + a sanitização.
 */
export function friendlyErrorWithContext(prefix, err) {
  const detail = friendlyError(err);
  if (!prefix) return detail;
  // Evita duplicar ponto final
  const clean = String(prefix).trim().replace(/[.!?]+$/, "");
  return `${clean}. ${detail}`;
}
