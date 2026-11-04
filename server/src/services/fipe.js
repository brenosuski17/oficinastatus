// Integração com a API FIPE da Parallelum (v2) — referência: https://github.com/parallelum/fipe-go
const config = require('../config');
const { HttpError } = require('../errors');

const TIPOS = ['cars', 'motorcycles', 'trucks'];
const TTL_MS = 12 * 60 * 60 * 1000; // a tabela FIPE é mensal; 12h de cache poupa o limite diário
const cache = new Map();

async function get(caminho) {
  const hit = cache.get(caminho);
  if (hit && Date.now() - hit.em < TTL_MS) return hit.dados;

  const { url, token } = config.fipe();
  const headers = { Accept: 'application/json' };
  if (token) headers['X-Subscription-Token'] = token;

  let resp;
  try {
    resp = await fetch(`${url}${caminho}`, { headers, signal: AbortSignal.timeout(12000) });
  } catch {
    throw new HttpError(502, 'Não foi possível conectar à API FIPE. Verifique a internet e tente de novo.');
  }
  if (resp.status === 429) throw new HttpError(429, 'Limite diário da API FIPE atingido. Configure FIPE_TOKEN ou tente amanhã.');
  if (resp.status === 404) throw new HttpError(404, 'Veículo não encontrado na tabela FIPE.');
  if (!resp.ok) throw new HttpError(502, `A API FIPE respondeu com erro ${resp.status}.`);

  const dados = await resp.json();
  cache.set(caminho, { em: Date.now(), dados });
  return dados;
}

function validarTipo(tipo) {
  if (!TIPOS.includes(tipo)) throw new HttpError(400, `Tipo inválido. Use: ${TIPOS.join(', ')}.`);
}

const enc = encodeURIComponent;
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const fipe = {
  TIPOS,
  marcas: (t) => (validarTipo(t), get(`/${t}/brands`)),
  modelos: (t, m) => (validarTipo(t), get(`/${t}/brands/${enc(m)}/models`)),
  anos: (t, m, mo) => (validarTipo(t), get(`/${t}/brands/${enc(m)}/models/${enc(mo)}/years`)),
  valor: (t, m, mo, a) => (validarTipo(t), get(`/${t}/brands/${enc(m)}/models/${enc(mo)}/years/${enc(a)}`)),

  /** Acha a marca da FIPE que corresponde ao nome vindo da consulta de placa (ex.: "VW" → "VW - VolksWagen"). */
  async encontrarMarca(tipo, nome) {
    const alvo = normalizar(nome);
    if (!alvo) return null;
    const marcas = await fipe.marcas(tipo);
    return (
      marcas.find((m) => normalizar(m.name) === alvo) ||
      marcas.find((m) => m.name.split(/\s*-\s*/).some((parte) => normalizar(parte) === alvo)) ||
      marcas.find((m) => normalizar(m.name).includes(alvo) || alvo.includes(normalizar(m.name))) ||
      null
    );
  },
};

module.exports = fipe;
