// Visão do cliente: o carro 3D com as avarias encontradas pela oficina (só leitura).
import { useState } from 'react'
import { motion } from 'motion/react'
import { RotateCw } from 'lucide-react'
import { moeda } from '../lib/formato'
import Carro3D, { VISTAS } from './Carro3D'
import { corAvaria, nomeTipo } from './zonas'

export default function VistoriaCliente({ avarias, carroceria, cor }) {
  const [sel, setSel] = useState(null)
  const [vista, setVista] = useState(null)
  const [girar, setGirar] = useState(true)
  const lista = avarias.map((a) => ({ ...a, id: a.numero }))

  function focar(a) {
    setGirar(false)
    setSel(a.numero)
    setVista({
      pos: [a.pos_x + a.nor_x * 3.4, Math.max(0.9, a.pos_y + a.nor_y * 3.4 + 0.9), a.pos_z + a.nor_z * 3.4],
      alvo: [a.pos_x * 0.6, Math.max(0.5, a.pos_y), a.pos_z * 0.6], foco: true, k: Date.now(),
    })
  }

  return (
    <section className="rounded-[28px] overflow-hidden bg-[#070c22] text-white" aria-labelledby="t-avarias">
      <div className="relative h-[300px] sm:h-[360px] bg-[radial-gradient(ellipse_at_50%_30%,#1a2660_0%,#0b1233_55%,#070c22_100%)]">
        <Carro3D carroceria={carroceria} cor={cor} avarias={lista} selecionada={sel} aoSelecionar={focar} vista={vista} girar={girar} />
        <div className="absolute top-4 left-5 right-5 flex items-start justify-between pointer-events-none">
          <div>
            <h2 id="t-avarias" className="text-[19px] font-extrabold">Inspeção do veículo</h2>
            <p className="text-[13.5px] text-[#9aa6cf]">Toque nos números ou arraste para girar.</p>
          </div>
          <button onClick={() => { setGirar(true); setSel(null); setVista({ ...VISTAS.perspectiva, k: Date.now() }) }} aria-label="Voltar à visão geral"
            className="pointer-events-auto grid place-items-center size-10 rounded-xl bg-white/10 hover:bg-white/15"><RotateCw className="size-[18px]" /></button>
        </div>
      </div>
      <ul className="p-3 space-y-1">
        {avarias.map((a, i) => (
          <motion.li key={a.numero} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <button onClick={() => focar(a)} className={`w-full flex items-start gap-3 rounded-2xl p-3 text-left transition ${sel === a.numero ? 'bg-white/10' : 'hover:bg-white/5'}`}>
              <span className="grid place-items-center size-8 shrink-0 rounded-full font-extrabold text-[14px]" style={{ background: corAvaria(a) }}>{a.numero}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold">{a.zona_nome}</span>
                <span className="block text-[14px] text-[#9aa6cf]">{a.tipo === 'servico' ? 'Serviço' : `${nomeTipo(a.tipo)} · ${a.gravidade}`}{a.observacao ? ` · ${a.observacao}` : ''}</span>
                <span className="block text-[13.5px] text-[#c9d2f0] mt-1">
                  {a.servicos.map((s) => `${s.descricao}${s.valor != null ? ` (${moeda(s.valor)})` : ''}`).join(' + ')}
                </span>
              </span>
            </button>
          </motion.li>
        ))}
      </ul>
    </section>
  )
}
