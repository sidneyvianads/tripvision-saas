import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, normalizePassword, normalizeEmail, withTimeout } from "../lib/supabase";
import { captureException, setUser as setSentryUser, clearUser as clearSentryUser } from "../lib/sentry";
import { identify, resetAnalytics, trackSignupCompleted } from "../lib/analytics";
import { clearSessionScopedStorage } from "../lib/storage";

// Auth nativo do Supabase. Sessão é gerenciada inteiramente pela lib
// (JWT em localStorage com chave "viajjei.auth", refresh automático,
// expiração default ~1h, com refresh token de 30 dias).
//
// A tabela public.users é PROFILE estendido: cada row tem o mesmo id
// do auth.users(id). Campos extras (nome, plano, avatar_*, viaje_segura, etc)
// vivem aqui. Migrations garantem CASCADE delete e RLS por auth.uid().

const PROFILE_COLS = "id, nome, email, avatar_cor, avatar_url, plano, plano_expires_at, trial_ends_at, origem, afiliado_id";

const AuthContext = createContext(null);

// R36: timeout máximo de hidratação. Safari ITP às vezes faz
// supabase.auth.getSession() travar silenciosamente (storage policies
// bloqueando o IndexedDB do supabase-js). Antes disso travava `loading`
// em true pra sempre → forms de auth ficavam disabled → sintoma R34/R36
// (cursor not-allowed em signup). Esse safety net garante que mesmo se
// getSession nunca resolver, `hydrating` vira false e a UI destrava.
const HYDRATION_TIMEOUT_MS = 5000;

// R41: timeouts pras chamadas auth do updatePassword. Sem isso, se a
// hidratação do supabase-js travar (Safari ITP / storage bloqueado), tanto
// getSession() quanto updateUser() ficam pendurados pra sempre — botão
// "Atualizar senha" não faz NADA. Ver withTimeout() em lib/supabase.js.
// SESSION_CHECK: getSession só lê estado local (rápido); 8s é folga
// generosa que só estoura se a init travou. UPDATE_USER: é um PUT /user
// na rede, então damos 15s antes de desistir.
const SESSION_CHECK_MS = 8000;
const UPDATE_USER_MS = 15000;

export function AuthProvider({ children }) {
  // session inicia null; o getSession() abaixo hidrata se houver tokens válidos.
  const [user, setUser] = useState(null);
  // R36: `loading` reflete APENAS operações ativas (signIn/signUp/updateProfile)
  // que o usuário disparou. Começa false. Forms travam disabled SÓ enquanto
  // a operação está em curso, não durante a hidratação inicial silenciosa.
  const [loading, setLoading] = useState(false);
  // R36: hidratação inicial separada. UI pode escolher mostrar splash ou
  // simplesmente ignorar — Welcome usa só `loading`, então o form de signup
  // fica sempre interativo durante o boot.
  const [hydrating, setHydrating] = useState(true);
  // isRecovering: setado pelo listener PASSWORD_RECOVERY quando o user clica
  // no link "esqueci a senha". Enquanto true, App.jsx NÃO redireciona /welcome
  // pra / — o Welcome continua renderizado pra o user definir nova senha.
  // Limpado por clearRecovering() depois do reset bem-sucedido.
  const [isRecovering, setIsRecovering] = useState(false);

  // Faz fetch do profile estendido (public.users) usando o id do auth.users.
  // RLS garante que só puxa a row do user atual.
  const loadProfile = useCallback(async (authUser) => {
    if (!authUser) return null;
    const { data, error } = await supabase
      .from("users")
      .select(PROFILE_COLS)
      .eq("id", authUser.id)
      .maybeSingle();
    if (error) {
      console.error("[Viajjei] loadProfile error:", error);
      captureException(error, { phase: "loadProfile", userId: authUser.id });
      return null;
    }
    return data;
  }, []);

  // Hidratação inicial + listener das mudanças de sessão (login, logout,
  // refresh, recovery). Quando muda, recarrega o profile.
  useEffect(() => {
    let active = true;
    // R36: safety net pra Safari ITP — se getSession() travar silenciosamente,
    // hydrating fica false após HYDRATION_TIMEOUT_MS pra não bloquear UI
    // pra sempre. console.warn pra rastrear nos logs de prod se acontecer.
    const safetyTimer = setTimeout(() => {
      if (active) {
        console.warn(`[useAuth] hydration timeout (${HYDRATION_TIMEOUT_MS}ms) — forçando hydrating=false. Provavelmente Safari ITP ou storage bloqueado.`);
        setHydrating(false);
      }
    }, HYDRATION_TIMEOUT_MS);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        if (session?.user) {
          const profile = await loadProfile(session.user);
          if (active) setUser(profile);
        }
      } catch (err) {
        // getSession pode throw em browsers com storage bloqueado.
        // Captura e segue — user fica deslogado, que é o estado correto.
        console.warn("[useAuth] getSession throw — assumindo sem session:", err?.message);
      } finally {
        if (active) {
          clearTimeout(safetyTimer);
          setHydrating(false);
        }
      }
    })();

    // R42: o callback do onAuthStateChange é SÍNCRONO de propósito. Causa
    // raiz do bug de reset (reproduzido em Chromium E node):
    //
    //   supabase-js segura o auth lock (lock:viajjei.auth via navigator.locks)
    //   ENQUANTO executa os listeners. Se o listener chamar QUALQUER outro
    //   método supabase que precise do lock — getSession() ou qualquer
    //   .from().select() (que lê o token internamente) — re-entra no lock
    //   que já está preso → DEADLOCK.
    //
    //   updateUser() é o gatilho: ele emite USER_UPDATED *dentro* do próprio
    //   lock e só resolve DEPOIS de drenar os callbacks. O loadProfile()
    //   antigo (supabase.from("users").select()) rodava aqui dentro e
    //   travava o lock → updateUser nunca resolvia. Evidência: o
    //   PUT /auth/v1/user retornava 200 em ~300ms, mas a Promise pendurava
    //   pra sempre (R41 só mascarava com timeout de 15s). O LOGIN não
    //   travava porque signInWithPassword não bloqueia a própria resolução
    //   na drenagem do lock — por isso só o recovery quebrava.
    //
    // Fix: o callback só faz trabalho SÍNCRONO que NÃO chama supabase
    // (setState/Sentry/analytics são seguros). Qualquer chamada supabase
    // (loadProfile) é deferida via setTimeout(0), rodando DEPOIS do lock
    // liberar. Padrão recomendado oficialmente pelo supabase-js.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY: link do email criou uma session válida. Marcamos
      // isRecovering=true pra App.jsx NÃO redirecionar /welcome → / antes
      // do user trocar a senha. O Welcome.jsx vê o evento via listener
      // local e renderiza o form de nova senha.
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovering(true);
        return;
      }
      if (event === "SIGNED_OUT" || !session) {
        setUser(null);
        setIsRecovering(false);
        clearSentryUser();
        resetAnalytics();
        return;
      }
      // Defere pra FORA do lock — NÃO chamar supabase de forma síncrona aqui.
      setTimeout(async () => {
        if (!active) return; // effect desmontou enquanto deferido
        const profile = await loadProfile(session.user);
        if (!active) return;
        setUser(profile);
        if (profile) {
          // Sentry user é interno/error-tracking, OK ter email pra debug.
          setSentryUser({ id: profile.id, email: profile.email });
          // identify() decide internamente se envia PII conforme consent.
          // plano é traits funcional (não PII) — sempre OK enviar.
          identify(profile.id, { plano: profile.plano, email: profile.email, nome: profile.nome });
        }
      }, 0);
    });

    return () => {
      active = false;
      clearTimeout(safetyTimer);
      sub?.subscription?.unsubscribe?.();
    };
  }, [loadProfile]);

  // signIn — Supabase faz o bcrypt internamente. Auth state listener atualiza
  // o user state quando o login completa.
  const signIn = useCallback(async (email, senha) => {
    setLoading(true);
    try {
      const cleanEmail = normalizeEmail(email);
      const cleanSenha = normalizePassword(senha);
      if (!cleanSenha) throw new Error("Informe sua senha.");
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanSenha,
      });
      if (error) {
        // Mensagens amigáveis pros 2 erros comuns
        if (/invalid login credentials/i.test(error.message)) {
          throw new Error("Email ou senha incorretos.");
        }
        if (/email not confirmed/i.test(error.message)) {
          throw new Error("Confirme seu email antes de entrar. Veja na caixa de entrada.");
        }
        throw new Error(error.message);
      }
      const profile = await loadProfile(data.user);
      setUser(profile);
      return profile;
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  // signUp — Cria entrada em auth.users (Supabase faz bcrypt + envia email
  // de confirmação). Depois cria a row em public.users com nome/avatar/origem.
  // Quando email confirmation está ON no Supabase, o user NÃO loga automaticamente;
  // precisa clicar no link do email. Por isso retornamos `needsConfirmation: true`
  // pra o Welcome saber o que mostrar.
  const signUp = useCallback(async ({ nome, email, senha, avatar_cor, avatar_url, origem, afiliado_id }) => {
    setLoading(true);
    try {
      const cleanNome = (nome ?? "").trim();
      const cleanEmail = normalizeEmail(email);
      const cleanSenha = normalizePassword(senha);
      if (!cleanNome) throw new Error("Informe seu nome.");
      if (!cleanEmail) throw new Error("Informe seu e-mail.");
      if (cleanSenha.length < 6) throw new Error("Senha precisa ter no mínimo 6 caracteres.");

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanSenha,
        options: {
          // raw_user_meta_data — usado pelo trigger SQL on_auth_user_created
          // pra preencher public.users no momento do INSERT em auth.users.
          // Sem isso, profile teria nome="parte antes do @" como fallback.
          data: {
            nome: cleanNome,
            avatar_cor: avatar_cor ?? "#7CB9E8",
            origem: origem ?? "organico",
            afiliado_id: afiliado_id ?? null,
          },
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/welcome` : undefined,
        },
      });
      if (signUpErr) {
        if (/already registered/i.test(signUpErr.message) || /already exists/i.test(signUpErr.message)) {
          throw new Error("Esse e-mail já está cadastrado. Faça login.");
        }
        if (/weak password/i.test(signUpErr.message)) {
          throw new Error("Senha muito fraca. Use 6+ caracteres com letras e números.");
        }
        throw new Error(signUpErr.message);
      }

      const newUser = signUpData.user;
      if (!newUser) throw new Error("Falha ao criar conta — tente novamente.");

      // Profile já foi criado pelo trigger SQL on_auth_user_created. Aqui
      // só fazemos UPDATE pra avatar_url (que não cabe em raw_user_meta_data
      // por ser uma data URL/Base64 que pode passar dos 2KB). Se RLS
      // bloquear (sem session por email confirmation ON), tudo bem — o
      // avatar fica default até o primeiro login.
      const profilePayload = {
        id: newUser.id,
        nome: cleanNome,
        email: cleanEmail,
        avatar_cor: avatar_cor ?? "#7CB9E8",
        avatar_url: avatar_url ?? null,
        plano: "pending",
        origem: origem ?? "organico",
        afiliado_id: afiliado_id ?? null,
      };
      if (avatar_url) {
        // só atualiza avatar_url (única coluna que não veio via trigger).
        // RLS users_update_own column-grant permite avatar_url.
        const { error: updErr } = await supabase
          .from("users")
          .update({ avatar_url })
          .eq("id", newUser.id);
        if (updErr) console.warn("[Viajjei] avatar update (will retry on login):", updErr.message);
      }

      // Quando session vem null = email confirmation ativo. Avisa caller.
      const needsConfirmation = !signUpData.session;
      if (signUpData.session) {
        setUser(profilePayload);
      }
      // Funil: signup completou (independente de confirmação por email).
      trackSignupCompleted(newUser.id, {
        origem: origem ?? "organico",
        afiliado_id: afiliado_id ?? null,
        needs_confirmation: needsConfirmation,
      });
      return { ...profilePayload, needsConfirmation };
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // R12-2: limpa residuais antes de zerar o user state.
    // clearSessionScopedStorage cobre cupom, origem, plan-usage e roteiro:*
    // (lista única em src/lib/storage.js). Safari-ITP-safe internamente.
    clearSessionScopedStorage();
    setUser(null);
  }, []);

  // Envia email de reset. Link volta como /welcome#access_token=...&type=recovery.
  // O detectSessionInUrl: true do supabase-js consome o token e dispara o
  // listener com event PASSWORD_RECOVERY — o Welcome detecta e mostra form
  // de nova senha.
  const sendPasswordReset = useCallback(async (email) => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) throw new Error("Informe seu e-mail.");
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/welcome` : undefined,
    });
    if (error) throw new Error(error.message);
  }, []);

  // Atualiza a senha (usado tanto pelo flow de recovery quanto pelo Account).
  //
  // R41: blindado contra o travamento silencioso. Antes era só
  // `updateUser({password})` cru — que faz `await initializePromise` antes
  // de qualquer coisa. Se a init travou (Safari ITP / storage bloqueado,
  // cenário R36/R38), a Promise nunca resolvia: o botão "Atualizar senha"
  // não fazia nada (sem loading, sem erro). Repro empírico confirmou:
  // updateUser fica unsettled pra sempre quando a init não resolve.
  //
  // Agora, em duas etapas, cada uma com timeout que vira erro VISÍVEL:
  //   1. getSession() — garante que existe sessão ANTES do updateUser.
  //      No recovery a sessão vem do #access_token do link (detectSessionInUrl).
  //      Se o link expirou/foi reusado, não há sessão → avisa pra pedir
  //      um novo (em vez do "Auth session missing!" cru do supabase).
  //      Se a init travou, o timeout dispara e o user vê o erro.
  //   2. updateUser() — o PUT de fato, também com timeout.
  const updatePassword = useCallback(async (novaSenha) => {
    const clean = normalizePassword(novaSenha);
    if (clean.length < 6) throw new Error("Senha precisa ter no mínimo 6 caracteres.");

    const { data } = await withTimeout(
      supabase.auth.getSession(),
      SESSION_CHECK_MS,
      "Não consegui validar seu link de recuperação a tempo. Abra de novo o link do email e tente mais uma vez."
    );
    if (!data?.session) {
      throw new Error("Seu link de recuperação expirou ou já foi usado. Volte para Esqueci a senha e peça um novo.");
    }

    const { error } = await withTimeout(
      supabase.auth.updateUser({ password: clean }),
      UPDATE_USER_MS,
      "O servidor demorou demais pra atualizar a senha. Confira sua conexão e tente de novo."
    );
    if (error) throw new Error(error.message);
  }, []);

  // Chamado pelo Welcome após resetar a senha. Libera o App.jsx pra
  // navegar normalmente — o user agora tem session válida e senha nova.
  const clearRecovering = useCallback(() => setIsRecovering(false), []);

  const updateProfile = useCallback(async (patch) => {
    if (!user?.id) throw new Error("Não logado.");
    const updates = {};
    if (typeof patch.nome === "string") {
      const trimmed = patch.nome.trim();
      if (!trimmed) throw new Error("Nome não pode ficar vazio.");
      updates.nome = trimmed;
    }
    if (patch.avatar_cor) updates.avatar_cor = patch.avatar_cor;
    if (patch.avatar_url !== undefined) updates.avatar_url = patch.avatar_url || null;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", user.id)
        .select(PROFILE_COLS)
        .single();
      if (error) throw new Error(error.message);
      setUser(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const value = useMemo(
    () => ({ user, loading, hydrating, isRecovering, signIn, signUp, signOut, sendPasswordReset, updatePassword, updateProfile, clearRecovering }),
    [user, loading, hydrating, isRecovering, signIn, signUp, signOut, sendPasswordReset, updatePassword, updateProfile, clearRecovering]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
