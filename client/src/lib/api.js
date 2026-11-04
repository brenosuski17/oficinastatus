// Cliente HTTP da API. O token de login fica no localStorage.
const CHAVE = 'oficinastatus.token'

export const token = {
  ler: () => { try { return localStorage.getItem(CHAVE) } catch { return null } },
  salvar: (t) => { try { t ? localStorage.setItem(CHAVE, t) : localStorage.removeItem(CHAVE) } catch { /* modo privado */ } },
}

export class ErroApi extends Error {
  constructor(status, msg) { super(msg); this.status = status }
}

async function req(metodo, url, corpo) {
  const t = token.ler()
  const ehForm = corpo instanceof FormData
  let resp
  try {
    resp = await fetch(`/api${url}`, {
      method: metodo,
      headers: { ...(corpo && !ehForm ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: corpo ? (ehForm ? corpo : JSON.stringify(corpo)) : undefined,
    })
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique se ele está rodando.')
  }
  if (resp.status === 204) return null
  const dados = await resp.json().catch(() => ({}))
  if (resp.status === 401 && t) {
    token.salvar(null)
    window.dispatchEvent(new Event('sessao:expirou'))
  }
  if (!resp.ok) throw new ErroApi(resp.status, dados.erro || `Erro ${resp.status}`)
  return dados
}

const qs = (o) => {
  const p = new URLSearchParams(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  return p.toString() ? `?${p}` : ''
}
const get = (u, q) => req('GET', u + qs(q))
const post = (u, c) => req('POST', u, c || {})

export const api = {
  auth: {
    estado: () => get('/auth/estado'),
    configurar: (d) => post('/auth/configurar', d),
    login: (d) => post('/auth/login', d),
    eu: () => get('/auth/eu'),
    convite: (t) => get(`/auth/convite/${t}`),
    definirSenha: (t, senha) => post(`/auth/convite/${t}`, { senha }),
    esqueci: (email) => post('/auth/esqueci', { email }),
  },
  painel: (meses) => get('/relatorios/painel', { meses }),
  integracoes: () => get('/integracoes'),
  testeEmail: (para) => post('/integracoes/teste-email', { para }),
  testeWhatsapp: (telefone) => post('/integracoes/teste-whatsapp', { telefone }),

  ordens: (f) => get('/ordens', f),
  ordem: (id) => get(`/ordens/${id}`),
  criarOrdem: (d) => post('/ordens', d),
  diagnostico: (id, d) => post(`/ordens/${id}/diagnostico`, d),
  addItem: (id, d) => post(`/ordens/${id}/itens`, d),
  editItem: (id, item, d) => req('PUT', `/ordens/${id}/itens/${item}`, d),
  delItem: (id, item) => req('DELETE', `/ordens/${id}/itens/${item}`),
  enviarOrcamento: (id, d) => post(`/ordens/${id}/orcamento/enviar`, d),
  aprovacao: (id, d) => post(`/ordens/${id}/aprovacao`, d),
  execucao: (id, d) => post(`/ordens/${id}/execucao`, d),
  peca: (id, d) => post(`/ordens/${id}/peca`, d),
  pronto: (id, d) => post(`/ordens/${id}/pronto`, d),
  entrega: (id) => post(`/ordens/${id}/entrega`),
  responsavel: (id, mecanico_id) => post(`/ordens/${id}/responsavel`, { mecanico_id }),
  fotos: (id, form) => req('POST', `/ordens/${id}/fotos`, form),
  avarias: {
    sugestao: (id, q) => get(`/ordens/${id}/avarias/sugestao`, q),
    criar: (id, d) => post(`/ordens/${id}/avarias`, d),
    editar: (id, a, d) => req('PUT', `/ordens/${id}/avarias/${a}`, d),
    remover: (id, a) => req('DELETE', `/ordens/${id}/avarias/${a}`),
    gerarOrcamento: (id) => post(`/ordens/${id}/avarias/orcamento`),
  },
  catalogo: (f) => get('/catalogo', f),
  salvarServicoCatalogo: (id, d) => req('PUT', `/catalogo/${id}`, d),

  clientes: (busca) => get('/clientes', { busca }),
  cliente: (id) => get(`/clientes/${id}`),
  salvarCliente: (d) => (d.id ? req('PUT', `/clientes/${d.id}`, d) : post('/clientes', d)),
  excluirCliente: (id) => req('DELETE', `/clientes/${id}`),
  conviteCliente: (id) => post(`/clientes/${id}/convite`),

  veiculos: (busca) => get('/veiculos', { busca }),
  veiculoPorPlaca: (placa) => get(`/veiculos/placa/${encodeURIComponent(placa)}`),
  salvarVeiculo: (d) => (d.id ? req('PUT', `/veiculos/${d.id}`, d) : post('/veiculos', d)),
  excluirVeiculo: (id) => req('DELETE', `/veiculos/${id}`),

  mensagens: (f) => get('/mensagens', f),
  marcarEnviada: (id) => post(`/mensagens/${id}/enviada`),
  reenviar: (id) => post(`/mensagens/${id}/reenviar`),

  equipe: () => get('/equipe'),
  mecanicos: () => get('/equipe/mecanicos'),
  addMembro: (d) => post('/equipe', d),
  editMembro: (id, d) => req('PUT', `/equipe/${id}`, d),
  conviteMembro: (id) => post(`/equipe/${id}/convite`),

  fipe: {
    marcas: (t) => get(`/fipe/${t}/marcas`),
    modelos: (t, m) => get(`/fipe/${t}/marcas/${m}/modelos`),
    anos: (t, m, mo) => get(`/fipe/${t}/marcas/${m}/modelos/${mo}/anos`),
    valor: (t, m, mo, a) => get(`/fipe/${t}/marcas/${m}/modelos/${mo}/anos/${a}`),
  },

  portal: {
    resumo: () => get('/portal/resumo'),
    ordem: (id) => get(`/portal/ordens/${id}`),
    responder: (id, d) => post(`/portal/ordens/${id}/resposta`, d),
  },
  publico: {
    ordem: (c) => get(`/publico/ordens/${c}`),
    responder: (c, d) => post(`/publico/ordens/${c}/resposta`, d),
  },
}
