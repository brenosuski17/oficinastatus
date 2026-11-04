// Rotas abertas, usadas pela página de acompanhamento enviada ao cliente.
// O acesso é feito pelo código público aleatório da OS (não pelo ID sequencial).
const router = require('express').Router();
const ordens = require('../services/ordens');
const { requisicaoInvalida, rota } = require('../errors');

router.get('/ordens/:codigo', rota((req, res) => res.json(ordens.publico(req.params.codigo))));

router.post('/ordens/:codigo/resposta', rota((req, res) => {
  const { aprovado, observacao } = req.body;
  if (typeof aprovado !== 'boolean') throw requisicaoInvalida('Informe se o orçamento foi aprovado.');
  const { id } = ordens.publico(req.params.codigo);
  ordens.responderOrcamento(id, { aprovado, observacao, origem: 'cliente' });
  res.json(ordens.publico(req.params.codigo));
}));

module.exports = router;
