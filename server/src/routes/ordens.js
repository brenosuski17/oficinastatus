const router = require('express').Router();
const ordens = require('../services/ordens');
const { rota } = require('../errors');

router.get('/', rota((req, res) => res.json(ordens.listar(req.query))));
router.get('/resumo', rota((req, res) => res.json(ordens.resumo())));
router.get('/:id', rota((req, res) => res.json(ordens.detalhe(req.params.id))));
router.post('/', rota((req, res) => res.status(201).json(ordens.criar(req.body))));

// Transições de etapa: orçamento → aprovação → execução → pronto → entrega
router.post('/:id/orcamento', rota((req, res) => res.json(ordens.enviarOrcamento(req.params.id, req.body))));
router.post('/:id/aprovacao', rota((req, res) =>
  res.json(ordens.responderOrcamento(req.params.id, { ...req.body, origem: 'oficina' }))));
router.post('/:id/execucao', rota((req, res) => res.json(ordens.iniciarExecucao(req.params.id, req.body))));
router.post('/:id/pronto', rota((req, res) => res.json(ordens.marcarPronto(req.params.id, req.body))));
router.post('/:id/entrega', rota((req, res) => res.json(ordens.registrarEntrega(req.params.id))));

module.exports = router;
