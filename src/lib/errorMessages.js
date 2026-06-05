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
  // R43: updateUser no fluxo de reset. same_password (422) era o que mais
  // confundia — caía no fallback genérico "Algo deu errado" e o user achava
  // que estava quebrado (na real só tinha digitado a senha atual de novo).
  "same_password": "Essa já é a sua senha atual. Escolha uma senha diferente.",
  "session_not_found": "Sua sessão expirou. Faz login de novo.",
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
  // R43: same_password — bate por texto também (caso o .code se perca no caminho)
  [/new password should be different|should be different from the old|same.password/i, "Essa já é a sua senha atual. Escolha uma senha diferente."],
  [/auth session missing|session.?not.?found/i, "Sua sessão expirou. Faz login de novo."],
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

// Detectores de "mensagem TÉCNICA que não deve passar pro user".
// Se a string contém qualquer um destes, friendlyError NÃO faz
// passthrough (cai pro fallback). Cobre nomes de schema, palavras-chave
// SQL, formatos de código PG, prefixos de error de bibliotecas.
const TECHNICAL_MARKERS = /\b(constraint|relation|column|table|schema|pgrst|sqlstate|violates|duplicate key|foreign key|primary key|unique|check constraint|not.null|row.level security|permission denied|jwt|bearer|stack trace|undefined is not|cannot read property|typeerror|referenceerror|syntaxerror|networkerror|failed to fetch|abort|timeout|fetch|xhr|cors|net::)\b|(_pkey|_fkey|_idx|_check)|\b\d{5}\b|\bPGRST\d+\b/i;

// Detectores de "mensagem já em PT-BR amigável" — pelo menos um destes
// precisa bater pro passthrough acontecer. Inclui caracteres acentuados
// específicos do PT + palavras-gancho comuns nos throws PT-BR do código.
const FRIENDLY_PT_MARKERS = /[áàâãéêíóôõúç]|\b(faça|tente|tenta|informe|confira|preencha|escolha|verifique|aguarde|atualize|cadastre|aceite|aceit[eai]|cancel|inválid|incorret|m[íi]nim|m[áa]xim|senha|e-?mail|nome|conta|sess[ãa]o|caracter)/i;

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

    // 6) Passthrough: mensagem que JÁ está em PT-BR amigável (pré-formatada
    // por throws no useAuth, ex: "Esse e-mail já está cadastrado. Faça
    // login."). Detectado pela ausência de markers técnicos + presença de
    // markers PT. Evita degradar UX boa que o dev escreveu na mão.
    if (msg && typeof msg === "string" && msg.length < 200) {
      if (!TECHNICAL_MARKERS.test(msg) && FRIENDLY_PT_MARKERS.test(msg)) {
        return msg;
      }
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

/**
 * R43: sanitização ESPECÍFICA do fluxo de reset de senha (recovery).
 *
 * O friendlyError() é global e não pode saber o contexto: "sessão expirada"
 * num fluxo logado significa "faça login de novo", mas no recovery significa
 * "o LINK do email expirou — peça outro". Aqui sobrepomos só as mensagens
 * cuja AÇÃO depende do contexto de recovery; o resto (same_password,
 * weak_password, rate limit, timeout do R41, etc) delega pro friendlyError.
 *
 * Usar no catch do handleReset do Welcome, não em troca de senha logada.
 */
export function friendlyResetError(err) {
  // Timeout do R41 (withTimeout) já vem com mensagem pronta em PT-BR —
  // deixa o friendlyError fazer o passthrough, não sobrescreve.
  if (err && err.isTimeout) return friendlyError(err);

  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  const sessionMissing =
    code === "session_not_found" ||
    /auth session missing|session.?not.?found|jwt expired|token (has )?expired/i.test(msg);
  if (sessionMissing) {
    return "Seu link de recuperação expirou. Volte e peça um novo email de redefinição.";
  }
  return friendlyError(err);
}
