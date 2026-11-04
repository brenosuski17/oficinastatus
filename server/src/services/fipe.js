// Integração com a API FIPE da Parallelum (v2).
// Referência dos endpoints: https://github.com/parallelum/fipe-go
const { HttpError } = require('../errors');

const BASE = () => (process.env.FIPE_API_URL || 'https://fipe.parallelum.com.br/api/v2').replace(/\/$/, '');
const TIPOS = ['cars', 'motorcycles', 'trucks'];
const TTL_MS = 12 * 60 * 60 * 1000; // a tabela FIPE muda uma vez por mês; 12h de cache é suficiente
const cache = new Map();

async function get(caminho) {
  if (process.env.FIPE_MOCK === '1') return mock(caminho);

  const hit = cache.get(caminho);
  if (hit && Date.now() - hit.em < TTL_MS) return hit.dados;

  const headers = { Accept: 'application/json' };
  if (process.env.FIPE_TOKEN) headers['X-Subscription-Token'] = process.env.FIPE_TOKEN;

  let resp;
  try {
    resp = await fetch(`${BASE()}${caminho}`, { headers, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new HttpError(502, 'Não foi possível conectar à API FIPE. Tente novamente em instantes.');
  }
  if (resp.status === 429)
    throw new HttpError(429, 'Limite de consultas da API FIPE atingido. Configure FIPE_TOKEN ou aguarde.');
  if (resp.status === 404) throw new HttpError(404, 'Veículo não encontrado na tabela FIPE.');
  if (!resp.ok) throw new HttpError(502, `A API FIPE respondeu com erro (${resp.status}).`);

  const dados = await resp.json();
  cache.set(caminho, { em: Date.now(), dados });
  return dados;
}

function validarTipo(tipo) {
  if (!TIPOS.includes(tipo)) throw new HttpError(400, `Tipo inválido. Use: ${TIPOS.join(', ')}.`);
}

const enc = encodeURIComponent;

module.exports = {
  TIPOS,
  marcas: (tipo) => (validarTipo(tipo), get(`/${tipo}/brands`)),
  modelos: (tipo, marca) => (validarTipo(tipo), get(`/${tipo}/brands/${enc(marca)}/models`)),
  anos: (tipo, marca, modelo) =>
    (validarTipo(tipo), get(`/${tipo}/brands/${enc(marca)}/models/${enc(modelo)}/years`)),
  valor: (tipo, marca, modelo, ano) =>
    (validarTipo(tipo), get(`/${tipo}/brands/${enc(marca)}/models/${enc(modelo)}/years/${enc(ano)}`)),
};

// ---------------------------------------------------------------------------
// Modo de demonstração (FIPE_MOCK=1): respostas no mesmo formato da API real,
// útil para apresentar o trabalho sem internet.
function mock(caminho) {
  const p = caminho.split('/').filter(Boolean);
  const marcas = [
    { code: '59', name: 'VW - VolksWagen' },
    { code: '21', name: 'Fiat' },
    { code: '23', name: 'GM - Chevrolet' },
    { code: '56', name: 'Toyota' },
  ];
  const modelos = {
    59: [{ code: '5585', name: 'Gol 1.0 Flex 12V 5p' }, { code: '9248', name: 'Polo Track 1.0 Flex 12V 5p' }],
    21: [{ code: '7686', name: 'Argo 1.0 6V Flex' }, { code: '4828', name: 'Strada Freedom 1.3 Flex 8V CS' }],
    23: [{ code: '8536', name: 'Onix HATCH 1.0 12V Flex 5p Mec.' }],
    56: [{ code: '7392', name: 'Corolla XEi 2.0 Flex 16V Aut.' }],
  };
  if (p.length === 2) return marcas;
  if (p.length === 4) return modelos[p[2]] || [];
  if (p.length === 6) return [2023, 2022, 2021, 2020].map((a) => ({ code: `${a}-5`, name: `${a} Flex` }));
  if (p.length === 7) {
    const marca = marcas.find((m) => m.code === p[2]);
    const modelo = (modelos[p[2]] || []).find((m) => m.code === p[4]);
    const ano = Number(p[6].split('-')[0]);
    const base = 60000 + Number(p[4]) * 3 - (2023 - ano) * 6500;
    return {
      vehicleType: 1,
      price: Number(base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      brand: marca?.name,
      model: modelo?.name,
      modelYear: ano,
      fuel: 'Flex',
      codeFipe: `00${p[4]}-1`,
      referenceMonth: 'novembro de 2026',
      fuelAcronym: 'F',
    };
  }
  throw new HttpError(404, 'Veículo não encontrado na tabela FIPE.');
}
