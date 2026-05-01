import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

function LegalLayout({ title, children }) {
  return (
    <div className="min-h-screen flex flex-col gradient-night">
      <header
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md"
        style={{ background: "rgba(15, 27, 45, 0.85)", borderBottom: "1px solid rgba(124, 185, 232, 0.18)" }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="rounded-full p-1.5 hover:bg-white/10 text-[#E8F0FE]">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link to="/" className="font-display font-extrabold text-[#E8F0FE] text-lg">❄️ TripVision</Link>
        </div>
      </header>

      <main className="flex-1 pt-24 px-4 pb-12">
        <article className="card max-w-3xl mx-auto p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-[#0F1B2D]">{title}</h1>
          <div className="mt-4 space-y-4 text-[14px] text-[#1A3A4A] leading-relaxed">
            {children}
          </div>
          <p className="text-xs text-[#1A3A4A]/55 mt-8">Atualizado em 01/05/2026.</p>
        </article>
      </main>
    </div>
  );
}

export function TermosPage() {
  return (
    <LegalLayout title="Termos de Uso">
      <p>
        O <strong>TripVision</strong> é uma plataforma de planejamento de viagens
        operada pelo <strong>Grupo Multvision LTDA</strong> (CNPJ 49.628.444/0001-65).
      </p>
      <Section title="1. Aceitação">
        Ao criar uma conta no TripVision você concorda com estes termos.
        Se discordar de qualquer ponto, não use o serviço.
      </Section>
      <Section title="2. Conta e responsabilidades">
        Você é responsável pela veracidade dos dados informados, pela guarda da
        sua senha e pelas ações realizadas na sua conta. Compartilhe links de
        viagem apenas com pessoas em quem você confia — qualquer pessoa com o
        link pode entrar na viagem.
      </Section>
      <Section title="3. Inteligência Artificial">
        O TripVision usa IA pra sugerir hotéis, restaurantes, passeios e preços.
        <strong> A IA pode errar.</strong> Sempre confirme preços, horários,
        disponibilidade e exigências (autorizações, reservas) diretamente com
        os estabelecimentos antes de comprar ou viajar. O TripVision não é
        responsável por divergências entre as sugestões e a realidade.
      </Section>
      <Section title="4. Planos e pagamento">
        Os planos pagos são recorrentes (mensais ou anuais). O pagamento é
        processado pelo Mercado Pago. Você pode cancelar a qualquer momento;
        o acesso continua até o fim do período já pago. Reembolsos seguem a
        política do Mercado Pago e legislação aplicável.
      </Section>
      <Section title="5. Conduta">
        Não use o TripVision pra atividades ilegais, spam, assédio, conteúdo
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
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        Esta política descreve como o <strong>TripVision</strong> trata os seus
        dados pessoais, em conformidade com a <strong>LGPD (Lei 13.709/2018)</strong>.
      </p>
      <Section title="Dados coletados">
        <ul className="list-disc pl-5 space-y-1">
          <li>Nome, e-mail e foto de perfil (quando você cadastra)</li>
          <li>Conteúdo das suas viagens (roteiro, mensagens, checklist)</li>
          <li>Conversas com a IA pra contexto de planejamento</li>
          <li>Logs técnicos básicos pra estabilidade do serviço</li>
        </ul>
      </Section>
      <Section title="Finalidade">
        Os dados são usados exclusivamente pra operação do TripVision: autenticação,
        montagem do roteiro pela IA, compartilhamento com membros da viagem,
        suporte e cobrança nos planos pagos.
      </Section>
      <Section title="Compartilhamento">
        Não vendemos nem compartilhamos seus dados com terceiros pra fins de
        marketing. Compartilhamentos restritos com fornecedores essenciais:
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li><strong>Supabase</strong> (banco de dados, hospedado em São Paulo)</li>
          <li><strong>Anthropic</strong> (IA Claude — recebe apenas contexto da viagem e sua mensagem)</li>
          <li><strong>Netlify</strong> (hospedagem do site)</li>
          <li><strong>Mercado Pago</strong> (somente pra processar pagamentos do Pro/Grupo)</li>
        </ul>
      </Section>
      <Section title="Seus direitos">
        Você pode a qualquer momento:
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Acessar seus dados</li>
          <li>Corrigir informações</li>
          <li>Excluir sua conta e todos os dados associados</li>
          <li>Exportar seus dados em formato legível</li>
        </ul>
        Pra exercer qualquer direito, escreva pra sidney@grupomultvision.com.
        Atendemos em até 15 dias úteis.
      </Section>
      <Section title="Retenção">
        Mantemos seus dados enquanto sua conta estiver ativa. Após exclusão da
        conta, os dados são removidos em até 30 dias (exceto registros
        financeiros, que mantemos pelo prazo legal).
      </Section>
      <Section title="Segurança">
        Senhas são armazenadas com hash criptográfico. Comunicação via HTTPS.
        Acesso administrativo restrito.
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
