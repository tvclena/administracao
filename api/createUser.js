import { createClient } from "@supabase/supabase-js";

/* ================= CONFIG ================= */

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

/* ================= HANDLER ================= */

export default async function handler(req, res){

  /* ===== CORS ===== */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {

    console.log("REQUEST BODY:", req.body);

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const {
      email,
      senha,
      nome,
      nivel = "user",
      empresa_id
    } = body;

    /* ================= VALIDAÇÃO ================= */

    if (!email || !senha || !empresa_id) {
      return res.status(400).json({
        error: "Email, senha e empresa são obrigatórios"
      });
    }

    /* ================= BUSCAR EMPRESA ================= */

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .select("*")
      .eq("id", empresa_id)
      .single();

    if (empresaError || !empresa) {
      return res.status(400).json({
        error: "Empresa não encontrada"
      });
    }

    /* ================= VERIFICAR STATUS ================= */

    if (empresa.status !== "ativo") {
      return res.status(403).json({
        error: "Empresa bloqueada"
      });
    }

    /* ================= VERIFICAR ASSINATURA ================= */

    if (empresa.assinatura_expira) {
      const expira = new Date(empresa.assinatura_expira);
      const agora = new Date();

      if (expira < agora) {
        return res.status(403).json({
          error: "Assinatura vencida"
        });
      }
    }

    /* ================= LIMITE DE USUÁRIOS ================= */

    const { count } = await supabaseAdmin
      .from("usuarios_empresa")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", empresa_id);

    if (count >= empresa.usuarios_limite) {
      return res.status(403).json({
        error: "Limite de usuários atingido"
      });
    }

    /* ================= DUPLICIDADE ================= */

    const { data: existente } = await supabaseAdmin
      .from("usuarios_empresa")
      .select("*")
      .eq("email", email)
      .eq("empresa_id", empresa_id)
      .maybeSingle();

    if (existente) {
      return res.status(400).json({
        error: "Usuário já existe nesta empresa"
      });
    }

    /* ================= CRIAR AUTH ================= */

    const { data: userData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome,
          empresa_id,
          nivel
        }
      });

    if (authError) {
      console.error("AUTH ERROR:", authError);
      return res.status(400).json({
        error: authError.message
      });
    }

    const user_id = userData.user.id;

    /* ================= INSERIR RELAÇÃO ================= */

    const { error: insertError } = await supabaseAdmin
      .from("usuarios_empresa")
      .insert({
        user_id,
        empresa_id,
        nome,
        email,
        nivel
      });

    if (insertError) {
      console.error("INSERT ERROR:", insertError);
      return res.status(400).json({
        error: insertError.message
      });
    }

    /* ================= ATUALIZA MÉTRICAS ================= */

    await supabaseAdmin
      .from("empresas")
      .update({
        total_logins: (empresa.total_logins || 0) + 1,
        ultimo_login: new Date()
      })
      .eq("id", empresa_id);

    /* ================= SUCESSO ================= */

    return res.status(200).json({
      ok: true,
      message: "Usuário criado com sucesso",
      user_id,
      empresa: empresa.nome
    });

  } catch (err) {

    console.error("ERRO GERAL:", err);

    return res.status(500).json({
      error: err.message || "Erro interno no servidor"
    });
  }
}
