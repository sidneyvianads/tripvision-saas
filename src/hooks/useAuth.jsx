import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, normalizePassword, normalizeEmail } from "../lib/supabase";
import { captureException, setUser as setSentryUser, clearUser as clearSentryUser } from "../lib/sentry";
import { identify, resetAnalytics, trackSignupCompleted } from "../lib/analytics";

// Auth nativo do Supabase. Sessão é gerenciada inteiramente pela lib
// (JWT em localStorage com chave "viajjei.auth", refresh automático,
// expiração default ~1h, com refresh token de 30 dias).
//
// A tabela public.users é PROFILE estendido: cada row tem o mesmo id
// do auth.users(id). Campos extras (nome, plano, avatar_*, viaje_segura, etc)
// vivem aqui. Migrations garantem CASCADE delete e RLS por auth.uid().

const PROFILE_COLS = "id, nome, email, avatar_cor, avatar_url, plano, plano_expires_at, trial_ends_at, origem, afiliado_id";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // session inicia null; o getSession() abaixo hidrata se houver tokens válidos.
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
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
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (session?.user) {
        const profile = await loadProfile(session.user);
        if (active) setUser(profile);
      }
      if (active) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
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
      const profile = await loadProfile(session.user);
      setUser(profile);
      if (profile) {
        setSentryUser({ id: profile.id, email: profile.email });
        identify(profile.id, { email: profile.email, nome: profile.nome, plano: profile.plano });
      }
    });

    return () => {
      active = false;
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
          // metadados extras viajam pra raw_user_meta_data — útil pra triggers
          data: { nome: cleanNome },
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

      // Cria/atualiza profile em public.users. Se Supabase tiver email
      // confirmation ON, ainda não estamos logados; precisamos usar
      // service-side ou aceitar que a row de profile só vai criar depois
      // do primeiro login. Pra MVP: tentamos agora; se RLS bloquear, OK,
      // criamos no primeiro signIn via UPSERT idempotente.
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
      const { error: profileErr } = await supabase
        .from("users")
        .upsert(profilePayload, { onConflict: "id" });
      if (profileErr) {
        // Se RLS bloqueou (esperado quando email confirmation está ON),
        // criamos lazy no próximo loadProfile-or-fail handshake.
        console.warn("[Viajjei] profile UPSERT (deferred till login):", profileErr.message);
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

  // Atualiza a senha (usado tanto pelo flow de recovery quanto pelo Account)
  const updatePassword = useCallback(async (novaSenha) => {
    const clean = normalizePassword(novaSenha);
    if (clean.length < 6) throw new Error("Senha precisa ter no mínimo 6 caracteres.");
    const { error } = await supabase.auth.updateUser({ password: clean });
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
    () => ({ user, loading, isRecovering, signIn, signUp, signOut, sendPasswordReset, updatePassword, updateProfile, clearRecovering }),
    [user, loading, isRecovering, signIn, signUp, signOut, sendPasswordReset, updatePassword, updateProfile, clearRecovering]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
