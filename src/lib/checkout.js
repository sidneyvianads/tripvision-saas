// R29-6: extraído do Welcome.jsx pra deixar a chamada do Mercado Pago
// testável isoladamente e fora do componente.
//
// Chama /api/create-subscription com o access_token do user, e retorna:
//   - { init_point } quando o checkout subiu OK → caller deve fazer
//     window.location.href = init_point
//   - { placeholder: true } quando o backend respondeu 503 com flag
//     placeholder=true (ambiente sem MP configurado) → caller deve
//     mostrar mensagem de contato manual
//
// Throws em qualquer outro erro (HTTP != 2xx, init_point ausente, etc).
// Caller é responsável por capturar e exibir o erro.

export async function startCheckoutSession({ plano, ciclo, cupom, accessToken }) {
  if (!accessToken) {
    throw new Error("Sessão não disponível — confirme seu email antes de assinar.");
  }
  const res = await fetch("/api/create-subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ plano, ciclo, cupom }),
  });
  const data = await res.json();
  if (res.status === 503 && data?.placeholder) {
    return { placeholder: true };
  }
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  if (!data?.init_point) throw new Error("Resposta sem URL de pagamento.");
  return { init_point: data.init_point };
}
