class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const naoEncontrado = (o = 'Registro') => new HttpError(404, `${o} não encontrado.`);
const requisicaoInvalida = (msg) => new HttpError(400, msg);
const conflito = (msg) => new HttpError(409, msg);
const naoAutorizado = (msg = 'Faça login para continuar.') => new HttpError(401, msg);
const proibido = (msg = 'Você não tem permissão para isso.') => new HttpError(403, msg);

// Envolve handlers async para que erros cheguem ao middleware de erro.
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, naoEncontrado, requisicaoInvalida, conflito, naoAutorizado, proibido, rota };
