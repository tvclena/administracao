import { createClient } from "@supabase/supabase-js";

/* ================= CONFIG ================= */

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

/* ================= HANDLER ================= */

export default async function handler(req, res){

  /* ===== CORS (IMPORTANTE PRA FRONT FUNCIONAR) ===== */
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

    const { email, senha, nome, nivel, empresa_id } = req.body;

    /* ===== VALIDAÇÕES ===== */
    if (!email || !senha || !empresa_id) {
      return res.status(400).json({ error: "Dados obrigatórios faltando" });
    }

    /* ===== VERIFICA EMPRESA ===== */
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .select("*")
      .eq("id", empresa_id)
      .single();

    if (empresaError || !empresa) {
      return res.status(400).json({ error: "Empresa não encontrada" });
    }

    /* ===== VERIFICA SE JÁ EXISTE USUÁRIO ===== */
    const { data: existente } = await supabaseAdmin
      .from("usuarios_empresa")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (existente) {
      return res.status(400).json({ error: "Usuário já existe nessa empresa" });
    }

    /* ===== CRIA USUÁRIO NO AUTH ===== */
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
      return res.status(400).json({ error: authError.message });
    }

    const user_id = userData.user.id;

    /* ===== SALVA RELAÇÃO COM EMPRESA ===== */
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
      return res.status(400).json({ error: insertError.message });
    }

    /* ===== ATUALIZA CONTADOR DE USUÁRIOS ===== */
    await supabaseAdmin
      .from("empresas")
      .update({
        total_logins: (empresa.total_logins || 0) + 1
      })
      .eq("id", empresa_id);

    /* ===== RESPOSTA FINAL ===== */
    return res.status(200).json({
      ok: true,
      user_id,
      empresa: empresa.nome,
      mensagem: "Usuário criado com sucesso"
    });

  } catch (err) {

    console.error("ERRO API:", err);

    return res.status(500).json({
      error: "Erro interno",
      detalhe: err.message
    });
  }
}
