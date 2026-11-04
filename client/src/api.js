// Cliente HTTP simples para a API do OficinaStatus
async function req(metodo, url, corpo) {
  const resp = await fetch(`/api${url}`, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  if (resp.status === 204) return null
  const dados = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`)
  return dados
}

const qs = (o) => {
  const p = new URLSearchParams(Object.entries(o || {}).filter(([, v]) => v))
  return p.toString() ? `?${p}` : ''
}

export const api = {
  resumo: () => req('GET', '/ordens/resumo'),
  ordens: (f) => req('GET', `/ordens${qs(f)}`),
  ordem: (id) => req('GET', `/ordens/${id}`),
  criarOrdem: (d) => req('POST', '/ordens', d),
  enviarOrcamento: (id, d) => req('POST', `/ordens/${id}/orcamento`, d),
  responderOrcamento: (id, d) => req('POST', `/ordens/${id}/aprovacao`, d),
  iniciarExecucao: (id, d) => req('POST', `/ordens/${id}/execucao`, d),
  marcarPronto: (id, d) => req('POST', `/ordens/${id}/pronto`, d),
  registrarEntrega: (id) => req('POST', `/ordens/${id}/entrega`),

  clientes: (busca) => req('GET', `/clientes${qs({ busca })}`),
  cliente: (id) => req('GET', `/clientes/${id}`),
  salvarCliente: (d) => (d.id ? req('PUT', `/clientes/${d.id}`, d) : req('POST', '/clientes', d)),
  excluirCliente: (id) => req('DELETE', `/clientes/${id}`),

  veiculos: (busca) => req('GET', `/veiculos${qs({ busca })}`),
  veiculo: (id) => req('GET', `/veiculos/${id}`),
  salvarVeiculo: (d) => (d.id ? req('PUT', `/veiculos/${d.id}`, d) : req('POST', '/veiculos', d)),
  excluirVeiculo: (id) => req('DELETE', `/veiculos/${id}`),

  mensagens: (f) => req('GET', `/mensagens${qs(f)}`),
  marcarEnviada: (id) => req('POST', `/mensagens/${id}/enviada`),

  fipe: {
    marcas: (t) => req('GET', `/fipe/${t}/marcas`),
    modelos: (t, m) => req('GET', `/fipe/${t}/marcas/${m}/modelos`),
    anos: (t, m, mo) => req('GET', `/fipe/${t}/marcas/${m}/modelos/${mo}/anos`),
    valor: (t, m, mo, a) => req('GET', `/fipe/${t}/marcas/${m}/modelos/${mo}/anos/${a}`),
  },

  publico: (codigo) => req('GET', `/publico/ordens/${codigo}`),
  responderPublico: (codigo, d) => req('POST', `/publico/ordens/${codigo}/resposta`, d),
}
