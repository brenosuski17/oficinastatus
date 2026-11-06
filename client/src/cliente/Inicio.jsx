import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronRight, ThumbsUp, CarFront, History, MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import { ESTADOS } from '../lib/etapas'
import { dataCurta, moeda, nomeVeiculo, primeiroNome, tempoDesde } from '../lib/formato'
import { Botao, ErroCarga, Esqueleto, Placa, Selo, Vazio, useDados, lista, itemLista } from '../ui/base'
import { useToast } from '../ui/Toast'
import { MiniTrilha } from '../ui/Trilha'

/** Botão para o cliente vincular o Telegram e receber os avisos pelo bot. */
function VinculoTelegram({ vinculado }) {
  const avisar = useToast()
  const [link, setLink] = useState(null)
  async function gerar() {
    try { setLink((await api.portal.telegram()).link) } catch (e) { avisar(e.message, 'erro') }
  }
  return (
    <section className="cartao p-5 mb-6 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[200px]">
        <p className="font-bold">{vinculado ? 'Telegram vinculado' : 'Receba os avisos no Telegram'}</p>
        <p className="text-[14px] text-tinta-3">{vinculado ? 'Você recebe cada etapa e aprova o orçamento pelo bot.' : 'Acompanhe cada etapa e aprove o orçamento pelo bot.'}</p>
      </div>
      {link
        ? <Botao as="a" href={link} target="_blank" rel="noreferrer" variante="telegram" icone={MessageCircle}>Abrir o bot e tocar em Iniciar</Botao>
        : <Botao variante={vinculado ? 'secundario' : 'telegram'} icone={MessageCircle} onClick={gerar}>{vinculado ? 'Vincular outra conta' : 'Vincular Telegram'}</Botao>}
    </section>
  )
}

export default function InicioCliente() {
  const { dados: d, erro, recarregar } = useDados(() => api.portal.resumo(), [])
  if (erro) return <ErroCarga erro={erro} tentar={recarregar} />
  if (!d) return <div className="space-y-4"><Esqueleto className="h-10 w-48" /><Esqueleto className="h-52" /><Esqueleto className="h-32" /></div>

  const abertas = d.ordens.filter((o) => o.situacao === 'aberta')
  const historico = d.ordens.filter((o) => o.situacao !== 'aberta')
  const veiculo = (id) => d.veiculos.find((v) => v.id === id) || {}

  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-[-0.02em]">Olá, {primeiroNome(d.cliente.nome)}</h1>
      <p className="text-tinta-2 mt-1 mb-6">{abertas.length ? `Você tem ${abertas.length} ${abertas.length === 1 ? 'veículo' : 'veículos'} na ${d.oficina.nome}.` : `Nenhum veículo na ${d.oficina.nome} agora.`}</p>

      {d.telegram?.disponivel && <VinculoTelegram vinculado={d.telegram.vinculado} />}

      <motion.ul className="space-y-4" variants={lista} initial="initial" animate="animate">
        {abertas.map((o) => {
          const e = ESTADOS[o.etapa_atual]
          const v = veiculo(o.veiculo_id)
          const pedeAcao = o.etapa_atual === 'aprovacao'
          return (
            <motion.li key={o.id} variants={itemLista}>
              <Link to={`/cliente/ordens/${o.id}`} className={`block cartao p-5 hover:shadow-xl hover:-translate-y-0.5 transition ${pedeAcao ? 'ring-2 ring-aprovacao' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <Placa placa={o.placa} />
                  <Selo estado={o.aguardando_peca ? 'execucao' : o.etapa_atual} />
                </div>
                <p className="font-bold text-[18px] mt-4">{nomeVeiculo(v)}</p>
                <p className="text-[15px] mt-0.5" style={{ color: e.cor }}><strong>{o.aguardando_peca ? 'Aguardando peça' : e.cliente}</strong> <span className="text-tinta-3 font-normal">· {tempoDesde(o.atualizado_em)}</span></p>
                <div className="mt-4"><MiniTrilha etapas={o.etapas} situacao={o.situacao} /></div>
                {pedeAcao ? (
                  <p className="mt-4 flex items-center justify-between rounded-xl bg-aprovacao text-white font-bold px-4 py-3">
                    <span className="flex items-center gap-2"><ThumbsUp className="size-5" />Aprovar orçamento de {moeda(o.total)}</span><ChevronRight className="size-5" />
                  </p>
                ) : (
                  <p className="mt-4 flex items-center justify-end text-[14px] font-semibold text-ultramar-600">Ver detalhes<ChevronRight className="size-4" /></p>
                )}
              </Link>
            </motion.li>
          )
        })}
      </motion.ul>

      {abertas.length === 0 && <Vazio icone={CarFront} titulo="Tudo certo por aqui" texto="Quando seu veículo entrar na oficina, você acompanha cada etapa nesta tela." />}

      <h2 className="text-[19px] font-bold mt-10 mb-3 flex items-center gap-2"><CarFront className="size-5 text-tinta-3" />Seus veículos</h2>
      <ul className="grid sm:grid-cols-2 gap-3">
        {d.veiculos.map((v) => (
          <li key={v.id} className="cartao p-4">
            <Placa placa={v.placa} tamanho="p" />
            <p className="font-bold mt-3">{nomeVeiculo(v)}</p>
            <p className="text-[14px] text-tinta-3">{[v.ano_modelo, v.cor].filter(Boolean).join(' · ')}</p>
            {v.fipe_valor && <p className="text-[13.5px] text-tinta-2 mt-2">FIPE: <strong className="num">{v.fipe_valor}</strong></p>}
          </li>
        ))}
      </ul>

      {historico.length > 0 && (
        <>
          <h2 className="text-[19px] font-bold mt-10 mb-3 flex items-center gap-2"><History className="size-5 text-tinta-3" />Serviços anteriores</h2>
          <ul className="cartao divide-y divide-linha">
            {historico.map((o) => (
              <li key={o.id}>
                <Link to={`/cliente/ordens/${o.id}`} className="flex items-center gap-3 p-4 hover:bg-fundo">
                  <Placa placa={o.placa} tamanho="p" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate">{o.problema_relatado}</span>
                    <span className="block text-[13px] text-tinta-3">{dataCurta(o.entregue_em || o.atualizado_em)} · {o.situacao === 'recusada' ? 'Orçamento recusado' : moeda(o.total_aprovado)}</span>
                  </span>
                  <ChevronRight className="size-4 text-tinta-3" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
