import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, sha256Hex, normalizePassword, normalizeEmail } from "../lib/supabase";

const SESSION_KEY = "tripvision-saas:user:v1";

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.id ? parsed : null;
  } catch {
    return null;
  }
}
function saveSession(user) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {}
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

const PROFILE_COLS = "id, nome, email, avatar_cor, avatar_url, plano, plano_expires_at, trial_ends_at, origem, afiliado_id";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadSession());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from("users")
      .select(PROFILE_COLS)
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("[Viajjei] profile refresh:", error);
          return;
        }
        if (!data) {
          console.warn("[Viajjei] sessão órfã. Limpando.");
          clearSession();
          setUser(null);
          return;
        }
        const changed =
          data.nome       !== user.nome ||
          data.avatar_cor !== user.avatar_cor ||
          (data.avatar_url ?? null) !== (user.avatar_url ?? null) ||
          data.plano      !== user.plano;
        if (changed) {
          saveSession(data);
          setUser(data);
        }
      });
    return () => { active = false; };
  }, [user?.id]);

  const signIn = useCallback(async (email, senha) => {
    setLoading(true);
    try {
      const cleanEmail = normalizeEmail(email);
      const cleanSenha = normalizePassword(senha);
      if (!cleanSenha) throw new Error("Informe sua senha.");
      const hash = await sha256Hex(cleanSenha);

      const { data, error } = await supabase
        .from("users")
        .select(`${PROFILE_COLS}, senha_hash`)
        .ilike("email", cleanEmail)
        .maybeSingle();
      if (error) {
        console.error("[Viajjei] signIn error:", error);
        throw new Error(error.message);
      }
      if (!data) throw new Error("E-mail não encontrado. Cadastre-se primeiro.");
      if (data.senha_hash !== hash) {
        console.error("[Viajjei] signIn hash mismatch", {
          esperado: data.senha_hash.slice(0, 8) + "…",
          recebido: hash.slice(0, 8) + "…",
          senhaLen: cleanSenha.length,
        });
        throw new Error("Senha incorreta.");
      }
      const { senha_hash: _omit, ...safe } = data;
      saveSession(safe);
      setUser(safe);
      return safe;
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async ({ nome, email, senha, avatar_cor, avatar_url, origem, afiliado_id }) => {
    setLoading(true);
    try {
      const cleanNome  = (nome ?? "").trim();
      const cleanEmail = normalizeEmail(email);
      const cleanSenha = normalizePassword(senha);
      // SEMPRE cria como "pending" (sem assinatura ativa). Upgrade só após webhook
      // do Mercado Pago confirmar pagamento (vira pro/grupo com trial de 7 dias).
      const cleanPlano = "pending";
      if (!cleanNome)  throw new Error("Informe seu nome.");
      if (!cleanEmail) throw new Error("Informe seu e-mail.");
      if (cleanSenha.length < 6) throw new Error("Senha precisa ter no mínimo 6 caracteres.");

      const { data: existing, error: checkErr } = await supabase
        .from("users")
        .select("id, email")
        .ilike("email", cleanEmail)
        .maybeSingle();
      if (checkErr) console.error("[Viajjei] signUp pre-check:", checkErr);
      else if (existing) throw new Error("Esse e-mail já está cadastrado. Faça login.");

      const hash = await sha256Hex(cleanSenha);
      const avatarLen = (avatar_url ?? "").length;
      console.log("[Viajjei] signUp inserindo:", { email: cleanEmail, hasAvatarUrl: !!avatar_url, avatarLen, origem, afiliado_id });
      const { data, error } = await supabase
        .from("users")
        .insert({
          nome: cleanNome,
          email: cleanEmail,
          senha_hash: hash,
          avatar_cor,
          avatar_url: avatar_url ?? null,
          plano: cleanPlano,
          origem: origem ?? "organico",
          afiliado_id: afiliado_id ?? null,
        })
        .select(PROFILE_COLS)
        .single();

      if (error) {
        console.error("[Viajjei] signUp insert:", error);
        if (error.code === "23505") throw new Error("Esse e-mail já está cadastrado. Faça login.");
        throw new Error(`Erro ao criar conta: ${error.message ?? "desconhecido"}`);
      }
      console.log("[Viajjei] signUp ok:", { id: data.id, hasAvatarUrl: !!data.avatar_url, avatarLenSaved: (data.avatar_url ?? "").length });
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

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
      console.log("[Viajjei] updateProfile:", { fields: Object.keys(updates), avatarLen: (updates.avatar_url ?? "").length });
      const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", user.id)
        .select(PROFILE_COLS)
        .single();
      if (error) {
        console.error("[Viajjei] updateProfile:", error);
        throw new Error(error.message);
      }
      saveSession(data);
      setUser(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut, updateProfile }),
    [user, loading, signIn, signUp, signOut, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
