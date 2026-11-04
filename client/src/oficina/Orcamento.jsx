import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, Trash2, Package, Wrench, Check, X } from 'lucide-react'
import { api } from '../lib/api'
import { moeda } from '../lib/formato'
import { Botao, Campo } from '../ui/base'
import { useToast } from '../ui/Toast'

const VAZIO = { tipo: 'peca', descricao: '', quantidade: 1, valor_unitario: '' }

/** Tabela de itens do orçamento (peças e mão de obra), editável enquanto o orçamento não foi aprovado. */
export default function Orcamento({ o, aoAtualizar }) {
  const avisar = useToast()
  const [novo, setNovo] = useState(VAZIO)
  const [salvando, setSalvando] = useState(false)
  const editavel = o.situacao === 'aberta' && ['orcamento', 'aprovacao'].includes(o.etapa_atual)
  const respondido = o.itens.some((i) => i.aprovado != null)

  async function adicionar(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      aoAtualizar(await api.addItem(o.id, novo))
      setNovo({ ...VAZIO, tipo: novo.tipo })
      if (o.etapa_atual === 'aprovacao') avisar('Orçamento alterado. Envie de novo para o cliente aprovar.')
    } catch (err) { avisar(err.message, 'erro') } finally { setSalvando(false) }
  }
  async function remover(item) {
    try { aoAtualizar(await api.delItem(o.id, item.id)) } catch (err) { avisar(err.message, 'erro') }
  }

  const pecas = o.itens.filter((i) => i.tipo === 'peca').reduce((s, i) => s + i.quantidade * i.valor_unitario, 0)
  const servicos = o.total - pecas

  return (
    <div>
      {o.itens.length > 0 ? (
        <div className="overflow-x-auto -mx-6 sm:mx-0">
          <table className="w-full text-[14.5px] min-w-[560px]">
            <thead className="text-left text-[13px] text-tinta-3">
              <tr><th className="px-6 sm:px-0 pb-2 font-semibold">Item</th><th className="pb-2 font-semibold text-right">Qtd.</th><th className="pb-2 font-semibold text-right">Unitário</th><th className="pb-2 font-semibold text-right">Subtotal</th><th className="w-12" /></tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {o.itens.map((i) => (
                  <motion.tr key={i.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className="border-t border-linha">
                    <td className="px-6 sm:px-0 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className={`grid place-items-center size-8 rounded-lg ${i.tipo === 'peca' ? 'bg-orcamento/15 text-orcamento' : 'bg-diagnostico/15 text-diagnostico'}`}>
                          {i.tipo === 'peca' ? <Package className="size-4" /> : <Wrench className="size-4" />}
                        </span>
                        <span>
                          <span className="font-semibold">{i.descricao}</span>
                          {i.aprovado === 1 && <span className="ml-2 inline-flex items-center gap-1 text-[12px] font-bold text-pronto"><Check className="size-3.5" />aprovado</span>}
                          {i.aprovado === 0 && <span className="ml-2 inline-flex items-center gap-1 text-[12px] font-bold text-recusada"><X className="size-3.5" />recusado</span>}
                        </span>
                      </span>
                    </td>
                    <td className="text-right num">{i.quantidade.toLocaleString('pt-BR')}</td>
                    <td className="text-right num">{moeda(i.valor_unitario)}</td>
                    <td className={`text-right num font-semibold ${i.aprovado === 0 ? 'line-through text-tinta-3' : ''}`}>{moeda(i.quantidade * i.valor_unitario)}</td>
                    <td className="text-right pr-6 sm:pr-0">
                      {editavel && <button onClick={() => remover(i)} className="p-2 rounded-lg text-tinta-3 hover:text-recusada hover:bg-erro-bg" aria-label={`Remover ${i.descricao}`}><Trash2 className="size-4" /></button>}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-tinta-2 py-4">Nenhum item ainda. Adicione as peças e a mão de obra abaixo.</p>
      )}

      {o.itens.length > 0 && (
        <dl className="mt-4 rounded-2xl bg-fundo p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[14px]">
          <div><dt className="text-tinta-3 font-semibold">Peças</dt><dd className="font-bold num">{moeda(pecas)}</dd></div>
          <div><dt className="text-tinta-3 font-semibold">Mão de obra</dt><dd className="font-bold num">{moeda(servicos)}</dd></div>
          <div><dt className="text-tinta-3 font-semibold">Total</dt><dd className="font-extrabold text-[18px] num">{moeda(o.total)}</dd></div>
          {respondido && <div><dt className="text-tinta-3 font-semibold">Aprovado</dt><dd className="font-extrabold text-[18px] num text-pronto">{moeda(o.total_aprovado)}</dd></div>}
        </dl>
      )}

      {editavel && (
        <form onSubmit={adicionar} className="mt-5 grid grid-cols-2 sm:grid-cols-[150px_1fr_90px_130px_auto] gap-3 items-end">
          <Campo rotulo="Tipo">
            <select className="entrada" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>
              <option value="peca">Peça</option><option value="servico">Mão de obra</option>
            </select>
          </Campo>
          <Campo rotulo="Descrição" className="col-span-2 sm:col-span-1 order-first sm:order-none">
            <input className="entrada" required value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder={novo.tipo === 'peca' ? 'Ex.: pastilhas de freio dianteiras' : 'Ex.: troca das pastilhas'} />
          </Campo>
          <Campo rotulo="Qtd.">
            <input className="entrada num" type="number" min="0.01" step="0.01" required value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} />
          </Campo>
          <Campo rotulo="Valor unit. (R$)">
            <input className="entrada num" type="number" min="0" step="0.01" inputMode="decimal" required value={novo.valor_unitario} onChange={(e) => setNovo({ ...novo, valor_unitario: e.target.value })} />
          </Campo>
          <Botao type="submit" variante="secundario" icone={Plus} carregando={salvando} className="col-span-2 sm:col-span-1">Adicionar</Botao>
        </form>
      )}
    </div>
  )
}
