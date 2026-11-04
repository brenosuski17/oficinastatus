const router = require('express').Router();
const fipe = require('../services/fipe');
const { rota } = require('../errors');

// Proxy da API FIPE (Parallelum). O front nunca chama a API externa direto:
// assim centralizamos cache, token e tratamento de erros no servidor.
router.get('/:tipo/marcas', rota(async (req, res) => res.json(await fipe.marcas(req.params.tipo))));
router.get('/:tipo/marcas/:marca/modelos', rota(async (req, res) =>
  res.json(await fipe.modelos(req.params.tipo, req.params.marca))));
router.get('/:tipo/marcas/:marca/modelos/:modelo/anos', rota(async (req, res) =>
  res.json(await fipe.anos(req.params.tipo, req.params.marca, req.params.modelo))));
router.get('/:tipo/marcas/:marca/modelos/:modelo/anos/:ano', rota(async (req, res) =>
  res.json(await fipe.valor(req.params.tipo, req.params.marca, req.params.modelo, req.params.ano))));

module.exports = router;
