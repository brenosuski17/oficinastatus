import { useCallback, useEffect, useState } from 'react'
import { ETAPAS, dataHora } from './util'

/** Placa no padrão Mercosul: a peça visual que identifica cada carro no sistema. */
export function Placa({ placa, tamanho = 'm' }) {
  const p = String(placa || '').toUpperCase()
  const texto = p.length === 7 ? `${p.slice(0, 3)}${/\d/.test(p[4]) ? '-' : ''}${p.slice(3)}` : p
  return (
    <span className={`placa placa-${tamanho}`} aria-label={`Placa ${p.split('').join(' ')}`}>
      <span className="placa-faixa" aria-hidden="true">
        <span>BRASIL</span>
      </span>
      <span className="placa-texto" aria-hidden="true">{texto}</span>
    </span>
  )
}

/** Trilha das 4 etapas da OS. */
export function Trilha({ etapas, situacao, vertical = false }) {
  return (
    <ol className={`trilha ${vertical ? 'trilha-vertical' : ''}`}>
      {ETAPAS.map(({ tipo, nome }, i) => {
        const e = etapas.find((x) => x.tipo === tipo) || {}
        const recusada = e.status === 'recusada'
        const estado = recusada ? 'recusada' : e.status || 'pendente'
        const quando = e.concluida_em || e.iniciada_em
        return (
          <li key={tipo} className={`passo passo-${estado}`} aria-current={estado === 'em_andamento' ? 'step' : undefined}>
            <span className="passo-marca" aria-hidden="true">
              {estado === 'concluida' ? '✓' : recusada ? '✕' : i + 1}
            </span>
            <span className="passo-corpo">
              <span className="passo-nome">{nome}</span>
              <span className="passo-info">
                {estado === 'concluida' && `Concluída ${dataHora(e.concluida_em)}`}
                {estado === 'em_andamento' && (situacao === 'aberta' ? `Desde ${dataHora(quando)}` : '')}
                {recusada && `Recusada ${dataHora(e.concluida_em)}`}
                {estado === 'pendente' && 'Aguardando'}
              </span>
              {vertical && e.observacao && <span className="passo-obs">{e.observacao}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Carrega dados assíncronos com estados de carregando/erro e função para recarregar. */
export function useCarregar(fn, deps = []) {
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const carregar = useCallback(fn, deps)
  const recarregar = useCallback(() => {
    setEstado((s) => ({ ...s, carregando: true }))
    return carregar()
      .then((dados) => setEstado({ dados, erro: null, carregando: false }))
      .catch((e) => setEstado({ dados: null, erro: e.message, carregando: false }))
  }, [carregar])
  useEffect(() => {
    recarregar()
  }, [recarregar])
  return { ...estado, recarregar, setDados: (dados) => setEstado({ dados, erro: null, carregando: false }) }
}

export function Estado({ carregando, erro, vazio, children }) {
  if (erro) return <p className="aviso aviso-erro" role="alert">{erro}</p>
  if (carregando) return <p className="carregando">Carregando…</p>
  if (vazio) return <div className="vazio">{vazio}</div>
  return children
}

export function Campo({ rotulo, dica, children, largo }) {
  return (
    <label className={`campo ${largo ? 'campo-largo' : ''}`}>
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  )
}

/** Botão que abre o WhatsApp com a mensagem pronta e marca como enviada. */
export function BotaoWhatsApp({ mensagem, aoEnviar, compacto }) {
  const enviada = mensagem.status === 'enviada'
  return (
    <a
      className={`botao ${enviada ? 'botao-sutil' : 'botao-whats'} ${compacto ? 'botao-p' : ''}`}
      href={mensagem.link_envio}
      target="_blank"
      rel="noreferrer"
      onClick={() => aoEnviar?.(mensagem.id)}
    >
      {enviada ? 'Reenviar no WhatsApp' : 'Enviar no WhatsApp'}
    </a>
  )
}
