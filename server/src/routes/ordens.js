const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const router = require('express').Router();
const ordens = require('../services/ordens');
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
const acao = (fn) => rota((req, res) => { fn(req); res.json(d(req)); });

router.get('/', rota((req, res) => res.json(ordens.listar(req.usuario, req.query))));
router.get('/:id', rota((req, res) => res.json(d(req))));
router.post('/', rota((req, res) => {
  const id = ordens.criar(req.body, req.usuario);
  res.status(201).json(ordens.detalhe(id, req.usuario));
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

router.post('/:id/fotos', upload.array('fotos', 10), rota((req, res) => {
  if (!req.files?.length) throw requisicaoInvalida('Selecione ao menos uma foto.');
  for (const f of req.files) ordens.adicionarFoto(req.params.id, { arquivo: f.filename, legenda: req.body.legenda, momento: req.body.momento }, req.usuario);
  res.json(d(req));
}));

module.exports = router;
