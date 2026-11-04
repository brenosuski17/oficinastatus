import { Link, Navigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Car, Hourglass, PackageSearch, CircleCheckBig, TrendingUp, Plus, ArrowUpRight } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ESTADOS } from '../lib/etapas'
import { moeda, moedaCurta, primeiroNome, nomeVeiculo, tempoDesde } from '../lib/formato'
import { Botao, Cabecalho, Esqueleto, ErroCarga, NumeroAnimado, Placa, Selo, useDados, lista, itemLista } from '../ui/base'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const CORES_ETAPA = { diagnostico: '#7a5af8', orcamento: '#0ba5ec', aprovacao: '#f5a300', execucao: '#ff6a13', entregue: '#12b76a' }

function Indicador({ icone: Icone, rotulo, valor, cor, para }) {
  return (
    <motion.div variants={itemLista}>
      <Link to={para} className="cartao group flex items-center gap-4 p-5 hover:-translate-y-0.5 hover:shadow-lg transition">
        <span className="grid place-items-center size-12 rounded-2xl" style={{ background: `color-mix(in srgb, ${cor} 14%, white)`, color: cor }}><Icone className="size-6" /></span>
        <div className="flex-1">
          <p className="text-[32px] font-extrabold leading-none tracking-tight"><NumeroAnimado valor={valor} /></p>
          <p className="text-[14px] text-tinta-2 font-medium mt-1">{rotulo}</p>
        </div>
        <ArrowUpRight className="size-5 text-tinta-3 opacity-0 group-hover:opacity-100 transition" />
      </Link>
    </motion.div>
  )
}

function Dica({ active, payload, label, formato }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-tinta text-white px-3.5 py-2.5 shadow-xl text-[13.5px]">
      <p className="text-white/60 font-semibold">{label}</p>
      <p className="font-bold num text-[15px]">{formato(payload[0].value)}</p>
    </div>
  )
}

export default function Painel() {
  const { usuario } = useAuth()
  const { dados: p, erro, recarregar } = useDados(() => (usuario.papel === 'admin' ? api.painel(6) : Promise.resolve(null)), [])
  const { dados: abertas } = useDados(() => api.ordens(), [])
  if (usuario.papel !== 'admin') return <Navigate to="/oficina/quadro" replace />

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const atencao = (abertas || []).filter((o) => o.situacao === 'aberta' && (o.aguardando_peca || ['aprovacao', 'pronto', 'aprovado'].includes(o.etapa_atual))).slice(0, 6)
  const serie = p?.serie.map((s) => ({ ...s, nome: MESES[Number(s.mes.slice(5)) - 1] })) || []

  return (
    <>
      <Cabecalho titulo={`${saudacao}, ${primeiroNome(usuario.nome)}`} sub="Resumo da oficina agora e dos últimos 6 meses.">
        <Botao as={Link} to="/oficina/ordens/nova" icone={Plus}>Abrir OS</Botao>
      </Cabecalho>

      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {!p && !erro && <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <Esqueleto key={i} className="h-[92px]" />)}</div>}

      {p && (
        <>
          <motion.div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4" variants={lista} initial="initial" animate="animate">
            <Indicador icone={Car} rotulo="Veículos na oficina" valor={p.kpis.na_oficina} cor="#2b4cff" para="/oficina/quadro" />
            <Indicador icone={Hourglass} rotulo="Aguardando o cliente" valor={p.kpis.aguardando_cliente} cor="#f5a300" para="/oficina/quadro" />
            <Indicador icone={PackageSearch} rotulo="Aguardando peça" valor={p.kpis.aguardando_peca} cor="#ff6a13" para="/oficina/quadro" />
            <Indicador icone={CircleCheckBig} rotulo="Prontos para retirada" valor={p.kpis.prontos} cor="#12b76a" para="/oficina/quadro" />
          </motion.div>

          <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4 mt-4">
            {/* Faturamento */}
            <motion.section className="cartao p-6 overflow-hidden" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <h2 className="text-[15px] font-semibold text-tinta-2">Faturamento do mês</h2>
                  <p className="text-[40px] font-extrabold tracking-[-0.03em] leading-tight mt-1"><NumeroAnimado valor={p.kpis.faturamento_mes} formatar={moeda} /></p>
                </div>
                <dl className="flex gap-8">
                  <div><dt className="text-[13px] text-tinta-3 font-semibold">Entregues</dt><dd className="text-[22px] font-bold num">{p.kpis.entregues_mes}</dd></div>
                  <div><dt className="text-[13px] text-tinta-3 font-semibold">Ticket médio</dt><dd className="text-[22px] font-bold num">{moeda(p.kpis.ticket_medio)}</dd></div>
                  <div><dt className="text-[13px] text-tinta-3 font-semibold">Aprovação</dt><dd className="text-[22px] font-bold num">{p.kpis.taxa_aprovacao == null ? '—' : `${Math.round(p.kpis.taxa_aprovacao * 100)}%`}</dd></div>
                </dl>
              </div>
              <div className="h-[240px] mt-6 -mx-2">
                <ResponsiveContainer>
                  <AreaChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2b4cff" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#2b4cff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#eef1f7" />
                    <XAxis dataKey="nome" axisLine={false} tickLine={false} tick={{ fill: '#7c86a2', fontSize: 13 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7c86a2', fontSize: 12 }} tickFormatter={moedaCurta} width={74} />
                    <Tooltip content={<Dica formato={moeda} />} cursor={{ stroke: '#c2ccff', strokeWidth: 2 }} />
                    <Area type="monotone" dataKey="faturamento" stroke="#2b4cff" strokeWidth={3} fill="url(#fat)" animationDuration={1200}
                      dot={{ r: 0 }} activeDot={{ r: 6, fill: '#2b4cff', stroke: 'white', strokeWidth: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.section>

            {/* Precisa de atenção */}
            <motion.section className="cartao p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
              <h2 className="text-[17px] font-bold">Precisa de atenção</h2>
              <p className="text-[14px] text-tinta-3 mb-4">Clientes esperando resposta, peças e retiradas.</p>
              {atencao.length === 0 ? (
                <p className="text-tinta-2 py-8 text-center">Tudo em dia por aqui.</p>
              ) : (
                <ul className="divide-y divide-linha">
                  {atencao.map((o) => (
                    <li key={o.id}>
                      <Link to={`/oficina/ordens/${o.id}`} className="flex items-center gap-3 py-3 hover:bg-fundo -mx-3 px-3 rounded-xl transition">
                        <Placa placa={o.placa} tamanho="p" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14.5px] truncate">{nomeVeiculo(o)}</p>
                          <p className="text-[13px] text-tinta-3">{o.aguardando_peca ? 'Aguardando peça' : ESTADOS[o.etapa_atual].oficina} · {tempoDesde(o.atualizado_em)}</p>
                        </div>
                        <Selo estado={o.aguardando_peca ? 'execucao' : o.etapa_atual} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>
          </div>

          <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
            <motion.section className="cartao p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}>
              <h2 className="text-[17px] font-bold">Tempo médio por etapa</h2>
              <p className="text-[14px] text-tinta-3">Em horas, nas OS já concluídas.</p>
              <div className="h-[220px] mt-4">
                <ResponsiveContainer>
                  <BarChart data={p.tempos} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="nome" axisLine={false} tickLine={false} width={92} tick={{ fill: '#4a5470', fontSize: 13, fontWeight: 600 }} />
                    <Tooltip content={<Dica formato={(v) => `${v} h`} />} cursor={{ fill: '#f3f5fb' }} />
                    <Bar dataKey="horas" radius={[0, 8, 8, 0]} barSize={18} animationDuration={1000}>
                      {p.tempos.map((t) => <Cell key={t.tipo} fill={CORES_ETAPA[t.tipo] || '#2b4cff'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.section>

            <motion.section className="cartao p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <h2 className="text-[17px] font-bold">OS abertas por mês</h2>
              <p className="text-[14px] text-tinta-3">Entrada de veículos na oficina.</p>
              <div className="h-[220px] mt-4">
                <ResponsiveContainer>
                  <BarChart data={serie} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid vertical={false} stroke="#eef1f7" />
                    <XAxis dataKey="nome" axisLine={false} tickLine={false} tick={{ fill: '#7c86a2', fontSize: 13 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#7c86a2', fontSize: 12 }} />
                    <Tooltip content={<Dica formato={(v) => `${v} OS`} />} cursor={{ fill: '#f3f5fb' }} />
                    <Bar dataKey="abertas" fill="#7a5af8" radius={[8, 8, 0, 0]} barSize={28} animationDuration={1000} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.section>

            <motion.section className="cartao p-6 lg:col-span-2 xl:col-span-1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46 }}>
              <h2 className="text-[17px] font-bold flex items-center gap-2"><TrendingUp className="size-5 text-pronto" />Serviços mais feitos</h2>
              <ol className="mt-4 space-y-3">
                {p.servicos_top.map((s, i) => {
                  const max = p.servicos_top[0]?.vezes || 1
                  return (
                    <li key={s.descricao}>
                      <div className="flex justify-between text-[14.5px]"><span className="font-semibold truncate">{s.descricao}</span><span className="text-tinta-3 num shrink-0 ml-3">{s.vezes}×</span></div>
                      <div className="h-2 rounded-full bg-fundo mt-1.5 overflow-hidden">
                        <motion.div className="h-full rounded-full bg-pronto" initial={{ width: 0 }} animate={{ width: `${(s.vezes / max) * 100}%` }} transition={{ delay: 0.5 + i * 0.08, duration: 0.8 }} />
                      </div>
                    </li>
                  )
                })}
                {!p.servicos_top.length && <p className="text-tinta-3">Ainda sem serviços entregues.</p>}
              </ol>
              <h3 className="text-[15px] font-bold mt-6 mb-2">Equipe</h3>
              <ul className="space-y-1.5 text-[14.5px]">
                {p.por_mecanico.map((m) => (
                  <li key={m.nome} className="flex justify-between"><span>{m.nome}</span><span className="text-tinta-3 num">{m.abertas} {m.abertas === 1 ? "aberta" : "abertas"} · {m.entregues} {m.entregues === 1 ? "entregue" : "entregues"}</span></li>
                ))}
              </ul>
            </motion.section>
          </div>
        </>
      )}
    </>
  )
}
