const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const router = require('express').Router();
const ordens = require('../services/ordens');
const avarias = require('../services/avarias');
const catalogo = require('../services/catalogo');
const auth = require('../services/auth');
const config = require('../config');
const { rota, requisicaoInvalida } = require('../errors');

router.use(auth.equipe);

fs.mkdirSync(config.uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(12).toString('hex')}${path.extname(file.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) =>
    /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype) ? cb(null, true) : cb(requisicaoInvalida('Envie fotos em JPG, PNG, WEBP ou HEIC.')),
});

const d = (req) => ordens.detalhe(req.params.id, req.usuario);
/** Executa a ação e responde com a OS atualizada. */
const acao = (fn) => rota(async (req, res) => { await fn(req); res.json(await d(req)); });

router.get('/', rota(async (req, res) => res.json(await ordens.listar(req.usuario, req.query))));
router.get('/:id', rota(async (req, res) => res.json(await d(req))));
router.post('/', rota(async (req, res) => {
  const id = await ordens.criar(req.body, req.usuario);
  res.status(201).json(await ordens.detalhe(id, req.usuario));
}));

// Etapas: recebido → diagnóstico → orçamento → aprovação → execução → pronto → entregue
router.post('/:id/diagnostico', acao((req) => ordens.registrarDiagnostico(req.params.id, req.body, req.usuario)));
router.post('/:id/itens', acao((req) => ordens.adicionarItem(req.params.id, req.body, req.usuario)));
router.put('/:id/itens/:item', acao((req) => ordens.editarItem(req.params.id, req.params.item, req.body, req.usuario)));
router.delete('/:id/itens/:item', acao((req) => ordens.removerItem(req.params.id, req.params.item, req.usuario)));
router.post('/:id/orcamento/enviar', acao((req) => ordens.enviarOrcamento(req.params.id, req.body, req.usuario)));
router.post('/:id/aprovacao', acao((req) => ordens.responderOrcamento(req.params.id, { ...req.body, origem: 'oficina' }, req.usuario)));
router.post('/:id/execucao', acao((req) => ordens.iniciarExecucao(req.params.id, req.body, req.usuario)));
router.post('/:id/peca', acao((req) => ordens.definirAguardandoPeca(req.params.id, req.body, req.usuario)));
router.post('/:id/pronto', acao((req) => ordens.concluirExecucao(req.params.id, req.body, req.usuario)));
router.post('/:id/entrega', acao((req) => ordens.registrarEntrega(req.params.id, req.usuario)));
router.post('/:id/responsavel', acao((req) => ordens.atribuir(req.params.id, req.body, req.usuario)));

// Vistoria 3D
router.get('/:id/avarias/sugestao', rota(async (req, res) => {
  await ordens.buscar(req.params.id, req.usuario);
  res.json(await catalogo.sugerir(req.query.zona, req.query.tipo, req.query.gravidade));
}));
router.post('/:id/avarias', rota(async (req, res) => { await avarias.criar(req.params.id, req.body, req.usuario); res.status(201).json(await d(req)); }));
router.put('/:id/avarias/:avaria', acao((req) => avarias.editar(req.params.id, req.params.avaria, req.body, req.usuario)));
router.delete('/:id/avarias/:avaria', acao((req) => avarias.remover(req.params.id, req.params.avaria, req.usuario)));
router.post('/:id/avarias/orcamento', acao((req) => avarias.gerarOrcamento(req.params.id, req.usuario)));

router.post('/:id/fotos', upload.array('fotos', 10), rota(async (req, res) => {
  if (!req.files?.length) throw requisicaoInvalida('Selecione ao menos uma foto.');
  for (const f of req.files) await ordens.adicionarFoto(req.params.id, { arquivo: f.filename, legenda: req.body.legenda, momento: req.body.momento }, req.usuario);
  res.json(await d(req));
}));

module.exports = router;
