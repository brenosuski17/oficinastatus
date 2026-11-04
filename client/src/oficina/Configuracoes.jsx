import { useState } from 'react'
import { motion } from 'motion/react'
import { Mail, MessageCircle, ScanLine, Table2, CircleCheck, CircleDashed, Send } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Botao, Cabecalho, ErroCarga, Esqueleto, useDados, lista, itemLista } from '../ui/base'
import { useToast } from '../ui/Toast'

const INTEGRACOES = [
  { chave: 'email', nome: 'E-mail (SMTP)', icone: Mail, cor: '#2b4cff', texto: 'Avisos de cada etapa e links de acesso enviados por e-mail.', variaveis: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM' },
  { chave: 'whatsapp', nome: 'WhatsApp (API da Meta)', icone: MessageCircle, cor: '#1fa855', texto: 'Envio automático pelo número oficial da oficina.', variaveis: 'WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE' },
  { chave: 'placa', nome: 'Consulta por placa', icone: ScanLine, cor: '#ff6a13', texto: 'Preenche marca, modelo, ano e cor ao digitar a placa (PlacaFipe).', variaveis: 'PLACA_API_TOKEN' },
  { chave: 'fipe', nome: 'Tabela FIPE', icone: Table2, cor: '#7a5af8', texto: 'Valor de referência do veículo (Parallelum).', variaveis: 'FIPE_TOKEN (opcional)' },
]

export default function Configuracoes() {
  const { usuario } = useAuth()
  const avisar = useToast()
  const { dados, erro, recarregar } = useDados(() => api.integracoes(), [])
  const [teste, setTeste] = useState({ email: usuario.email, telefone: '' })
  const [enviando, setEnviando] = useState(null)
  const admin = usuario.papel === 'admin'

  async function testar(tipo) {
    setEnviando(tipo)
    try {
      if (tipo === 'email') { const r = await api.testeEmail(teste.email); avisar(`E-mail de teste enviado para ${r.para}.`) }
      else { await api.testeWhatsapp(teste.telefone); avisar('Mensagem de teste enviada pelo WhatsApp.') }
    } catch (e) { avisar(e.message, 'erro') } finally { setEnviando(null) }
  }

  return (
    <>
      <Cabecalho titulo="Integrações" sub="Serviços externos usados pelo sistema. As chaves ficam no arquivo server/.env." />
      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {!dados && !erro && <div className="grid md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <Esqueleto key={i} className="h-44" />)}</div>}
      {dados && (
        <>
          <motion.div className="grid md:grid-cols-2 gap-4" variants={lista} initial="initial" animate="animate">
            {INTEGRACOES.map((i) => {
              const st = dados[i.chave]
              return (
                <motion.section key={i.chave} variants={itemLista} className="cartao p-6">
                  <div className="flex items-start gap-4">
                    <span className="grid place-items-center size-12 rounded-2xl text-white shrink-0" style={{ background: i.cor }}><i.icone className="size-6" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold text-[17px]">{i.nome}</h2>
                        {st.ativo
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf3] text-[#067647] text-[12.5px] font-bold px-2.5 py-0.5"><CircleCheck className="size-3.5" />Ativo</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-fundo text-tinta-3 text-[12.5px] font-bold px-2.5 py-0.5"><CircleDashed className="size-3.5" />Não configurado</span>}
                      </div>
                      <p className="text-tinta-2 text-[14.5px] mt-1">{i.texto}</p>
                      <p className="text-[13.5px] text-tinta-3 mt-2">{st.detalhe}</p>
                      {!st.ativo && <p className="text-[12.5px] text-tinta-3 mt-2 font-mono break-words">{i.variaveis}</p>}
                    </div>
                  </div>
                  {admin && i.chave === 'email' && st.ativo && (
                    <div className="flex gap-2 mt-5">
                      <input className="entrada" type="email" value={teste.email} onChange={(e) => setTeste({ ...teste, email: e.target.value })} aria-label="E-mail para teste" />
                      <Botao variante="secundario" icone={Send} carregando={enviando === 'email'} onClick={() => testar('email')}>Testar</Botao>
                    </div>
                  )}
                  {admin && i.chave === 'whatsapp' && st.ativo && (
                    <div className="flex gap-2 mt-5">
                      <input className="entrada" type="tel" placeholder="(42) 99999-9999" value={teste.telefone} onChange={(e) => setTeste({ ...teste, telefone: e.target.value })} aria-label="Número para teste" />
                      <Botao variante="secundario" icone={Send} carregando={enviando === 'whatsapp'} onClick={() => testar('whatsapp')}>Testar</Botao>
                    </div>
                  )}
                </motion.section>
              )
            })}
          </motion.div>
          <p className="text-tinta-3 text-[14px] mt-6">Links enviados aos clientes usam o endereço <strong className="text-tinta-2">{dados.app_url}</strong> (APP_URL). Depois de alterar o .env, reinicie o servidor.</p>
        </>
      )}
    </>
  )
}
