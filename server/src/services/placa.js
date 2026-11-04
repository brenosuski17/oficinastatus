// Consulta de veículo pela placa — provedor PlacaFipe (https://doc.placafipe.com.br/api/getplaca.html)
// A API exige um token de um plano pago, configurado em PLACA_API_TOKEN.
const config = require('../config');
const fipe = require('./fipe');
const { HttpError } = require('../errors');

const PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
const normalizarPlaca = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function tipoPorSegmento(seg = '') {
  const s = seg.toLowerCase();
  if (s.includes('moto')) return 'motorcycles';
  if (s.includes('caminh') || s.includes('pesado')) return 'trucks';
  return 'cars';
}

const ano = (v) => {
  const n = parseInt(String(v || '').slice(0, 4), 10);
  return Number.isFinite(n) ? n : null;
};

async function consultar(placaBruta) {
  const placa = normalizarPlaca(placaBruta);
  if (!PLACA.test(placa)) throw new HttpError(400, 'Placa inválida. Use o formato ABC1234 ou ABC1D23.');

  const { url, token } = config.placa();
  if (!token)
    throw new HttpError(501, 'A consulta por placa não está configurada (PLACA_API_TOKEN). Use a busca pela FIPE.');

  let resp;
  try {
    resp = await fetch(`${url}/getplaca`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ placa, token }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, 'Não foi possível conectar ao serviço de consulta de placa.');
  }
  const dados = await resp.json().catch(() => ({}));
  const v = dados.informacoes_veiculo;
  if (!resp.ok || !v) {
    const msg = dados.msg || `O serviço de placa respondeu com erro ${resp.status}.`;
    throw new HttpError(resp.status === 401 || resp.status === 403 ? 502 : 404, `Consulta de placa: ${msg}`);
  }

  const tipo = tipoPorSegmento(v.segmento);
  const veiculo = {
    placa,
    tipo,
    marca: v.marca || '',
    modelo: v.modelo || '',
    ano_fabricacao: ano(v.ano),
    ano_modelo: ano(v.ano_modelo),
    cor: v.cor || '',
    combustivel: v.combustivel || '',
    municipio: v.municipio && v.uf ? `${v.municipio}/${v.uf}` : v.municipio || '',
  };

  // Sugere a marca correspondente na FIPE para o usuário só escolher o modelo e ver o valor.
  let fipe_marca = null;
  try {
    fipe_marca = await fipe.encontrarMarca(tipo, veiculo.marca);
  } catch {
    /* FIPE indisponível: segue só com os dados da placa */
  }
  return { veiculo, fipe_marca };
}

module.exports = { consultar, normalizarPlaca, PLACA };
