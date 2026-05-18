import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "../components/Logo";
import { usePageMeta } from "../lib/usePageMeta";

function LegalLayout({ title, children }) {
  return (
    <div className="min-h-screen flex flex-col bg-app">
      <header
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
        style={{ background: "rgba(255, 255, 255, 0.92)", borderBottom: "1px solid #E5E7EB" }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="rounded-full p-1.5 hover:bg-[#F3F4F6] text-[#1F2937]">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link to="/" aria-label="Viajjei"><Logo size={32} /></Link>
        </div>
      </header>

      <main className="flex-1 pt-24 px-4 pb-12">
        <article className="card max-w-3xl mx-auto p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-[#1F2937]">{title}</h1>
          <div className="mt-4 space-y-4 text-[14px] text-[#374151] leading-relaxed">
            {children}
          </div>
          <p className="text-xs text-[#9CA3AF] mt-8">Atualizado em 01/05/2026.</p>
        </article>
      </main>
    </div>
  );
}

export function TermosPage() {
  usePageMeta({
    title: "Termos de Uso | Viajjei",
    description: "Termos de uso do Viajjei, concierge de viagem com inteligência artificial.",
    canonical: "https://viajjei.com.br/termos",
  });
  return (
    <LegalLayout title="Termos de Uso">
      <p>
        O <strong>Viajjei</strong> é uma plataforma de planejamento de viagens
        operada pelo <strong>Grupo Multvision LTDA</strong> (CNPJ 49.628.444/0001-65).
      </p>
      <Section title="1. Aceitação">
        Ao criar uma conta no Viajjei você concorda com estes termos.
        Se discordar de qualquer ponto, não use o serviço.
      </Section>
      <Section title="2. Conta e responsabilidades">
        Você é responsável pela veracidade dos dados informados, pela guarda da
        sua senha e pelas ações realizadas na sua conta. Compartilhe links de
        viagem apenas com pessoas em quem você confia — qualquer pessoa com o
        link pode entrar na viagem.
      </Section>
      <Section title="3. O Jei (concierge automatizado)">
        O Viajjei usa um concierge automatizado chamado <strong>Jei</strong> pra
        sugerir hotéis, restaurantes, passeios e preços.
        <strong> O Jei pode errar.</strong> Sempre confirme preços, horários,
        disponibilidade e exigências (autorizações, reservas) diretamente com
        os estabelecimentos antes de comprar ou viajar. O Viajjei não é
        responsável por divergências entre as sugestões e a realidade.
      </Section>
      <Section title="4. Planos e pagamento">
        Os planos pagos são recorrentes (mensais ou anuais). O pagamento é
        processado pelo Mercado Pago. Você pode cancelar a qualquer momento;
        o acesso continua até o fim do período já pago. Reembolsos seguem a
        política do Mercado Pago e legislação aplicável.
      </Section>
      <Section title="5. Conduta">
        Não use o Viajjei pra atividades ilegais, spam, assédio, conteúdo
        ofensivo no chat ou tentativas de comprometer a segurança da plataforma.
        Podemos suspender contas que violem essas regras.
      </Section>
      <Section title="6. Disponibilidade">
        Trabalhamos pra manter o serviço no ar 24/7, mas não garantimos
        disponibilidade ininterrupta. Manutenções e indisponibilidades podem
        ocorrer.
      </Section>
      <Section title="7. Mudanças">
        Estes termos podem ser atualizados. Mudanças relevantes serão
        comunicadas pelo email cadastrado.
      </Section>
      <Section title="8. Foro">
        Foro de Recife/PE pra qualquer questão legal.
      </Section>
      <Section title="9. Contato">
        sidney@grupomultvision.com
      </Section>
    </LegalLayout>
  );
}

export function PrivacidadePage() {
  usePageMeta({
    title: "Política de Privacidade | Viajjei",
    description: "Como o Viajjei coleta, usa e protege seus dados. Em conformidade com a LGPD.",
    canonical: "https://viajjei.com.br/privacidade",
  });
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        Esta política descreve como o <strong>Viajjei</strong> trata os seus
        dados pessoais, em conformidade com a <strong>LGPD (Lei 13.709/2018)</strong>.
      </p>
      <Section title="Dados coletados">
        <ul className="list-disc pl-5 space-y-1">
          <li>Nome, e-mail e foto de perfil (quando você cadastra)</li>
          <li>Conteúdo das suas viagens (roteiro, mensagens, checklist)</li>
          <li>Conversas com o Jei pra contexto de planejamento</li>
          <li>Logs técnicos básicos pra estabilidade do serviço</li>
        </ul>
      </Section>
      <Section title="Finalidade">
        Os dados são usados exclusivamente pra operação do Viajjei: autenticação,
        montagem do roteiro pelo Jei, compartilhamento com membros da viagem,
        suporte e cobrança nos planos pagos.
      </Section>
      <Section title="Compartilhamento">
        Não vendemos nem compartilhamos seus dados com terceiros pra fins de
        marketing. Compartilhamentos restritos com fornecedores essenciais:
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li><strong>Supabase</strong> (banco de dados, hospedado em São Paulo)</li>
          <li><strong>Provedor de inteligência artificial</strong> (recebe apenas o contexto da viagem e sua mensagem)</li>
          <li><strong>Netlify</strong> (hospedagem do site)</li>
          <li><strong>Mercado Pago</strong> (somente pra processar pagamentos do Pro)</li>
        </ul>
      </Section>
      <Section title="Conversas com o Jei">
        Quando você fala com o Jei, sua mensagem + contexto da viagem (datas,
        cidades, composição familiar, roteiro atual) são enviados ao provedor
        de IA pra gerar a resposta. As conversas ficam guardadas em <code>ia_conversas</code> pra
        manter o contexto entre sessões. Você pode apagar todo o histórico do Jei
        a qualquer momento em <strong>Conta → Seus dados (LGPD) → Apagar histórico do Jei</strong>,
        sem precisar deletar a conta inteira.
      </Section>
      <Section title="Seus direitos">
        Você pode a qualquer momento:
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li><strong>Acessar e baixar seus dados</strong> — botão "Baixar meus dados" em Conta. Devolve JSON com tudo (LGPD Art.18-V).</li>
          <li><strong>Apagar histórico do Jei</strong> — botão dedicado em Conta, mantém a conta.</li>
          <li><strong>Corrigir informações</strong> — edite nome/avatar direto em Conta.</li>
          <li><strong>Excluir a conta inteira</strong> — botão "Excluir minha conta" em Conta. Apaga viagens, mensagens, conversas e profile. Comissões já registradas com afiliados são mantidas com snapshot do email pra auditoria fiscal (obrigatório).</li>
        </ul>
        Dúvidas adicionais: sidney@grupomultvision.com — atendemos em até 15 dias úteis.
      </Section>
      <Section title="Retenção">
        Dados ficam ativos enquanto a conta estiver ativa. Exclusão da conta
        apaga viagens/mensagens/conversas em até 24h. Registros financeiros
        (assinaturas, comissões pagas a afiliados) são mantidos pelo prazo
        legal de 5 anos com identificação por email-snapshot, mesmo que a
        conta original tenha sido excluída.
      </Section>
      <Section title="Segurança">
        Senhas armazenadas com bcrypt (via Supabase Auth). Comunicação via
        HTTPS. Row-Level Security real no banco — você só lê o que é seu.
        Acesso administrativo restrito ao DPO.
      </Section>
      <Section title="Encarregado (DPO)">
        Sidney Viana — sidney@grupomultvision.com
      </Section>
    </LegalLayout>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display font-extrabold text-[#0F1B2D] text-base mt-2">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
