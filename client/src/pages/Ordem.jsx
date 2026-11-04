import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { avisarMudanca } from '../App'
import { Placa, Trilha, useCarregar, Estado, Campo, BotaoWhatsApp } from '../components'
import { ESTADOS, moeda, dataHora, dia, telefone } from '../util'

/** Mostra só a próxima ação possível para a etapa atual da OS. */
function ProximaAcao({ o, executar, ocupado }) {
  const [orc, setOrc] = useState({ descricao: o.orcamento_descricao || '', valor: o.orcamento_valor || '', previsao_entrega: o.previsao_entrega || '' })
  const [previsao, setPrevisao] = useState(o.previsao_entrega || '')

  switch (o.etapa_atual) {
    case 'orcamento':
    case 'aprovacao': {
      const revisando = o.etapa_atual === 'aprovacao'
      return (
        <form
          className="acao"
          onSubmit={(e) => {
            e.preventDefault()
            executar(() => api.enviarOrcamento(o.id, orc), revisando ? 'Orçamento atualizado. Envie a nova mensagem ao cliente.' : 'Orçamento enviado para aprovação. Envie a mensagem ao cliente.')
          }}
        >
          <h2>{revisando ? 'Revisar orçamento' : 'Enviar orçamento'}</h2>
          {revisando && (
            <p className="acao-texto">
              O cliente recebe o orçamento pelo link e aprova ou recusa por lá. Se ele responder por telefone ou no balcão, registre abaixo.
            </p>
          )}
          <Campo rotulo="Serviços e peças" largo>
            <textarea required rows={4} value={orc.descricao} onChange={(e) => setOrc({ ...orc, descricao: e.target.value })}
              placeholder="Ex.: troca das pastilhas dianteiras, fluido de freio DOT4, mão de obra" />
          </Campo>
          <div className="linha">
            <Campo rotulo="Valor total (R$)">
              <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={orc.valor} onChange={(e) => setOrc({ ...orc, valor: e.target.value })} />
            </Campo>
            <Campo rotulo="Previsão de entrega">
              <input type="date" value={orc.previsao_entrega} onChange={(e) => setOrc({ ...orc, previsao_entrega: e.target.value })} />
            </Campo>
          </div>
          <div className="acao-botoes">
            <button className={revisando ? 'botao' : 'botao botao-primario'} disabled={ocupado}>
              {revisando ? 'Reenviar orçamento' : 'Enviar para aprovação'}
            </button>
          </div>
          {revisando && (
            <div className="acao-resposta">
              <span>Cliente respondeu fora do link?</span>
              <button type="button" className="botao botao-primario" disabled={ocupado}
                onClick={() => executar(() => api.responderOrcamento(o.id, { aprovado: true, observacao: 'Respondeu por telefone/balcão' }), 'Aprovação registrada.')}>
                Registrar aprovação
              </button>
              <button type="button" className="botao botao-perigo" disabled={ocupado}
                onClick={() => confirm('Registrar que o cliente recusou o orçamento? A OS será encerrada.') &&
                  executar(() => api.responderOrcamento(o.id, { aprovado: false, observacao: 'Respondeu por telefone/balcão' }), 'Recusa registrada.')}>
                Registrar recusa
              </button>
            </div>
          )}
        </form>
      )
    }
    case 'aprovado':
      return (
        <form className="acao" onSubmit={(e) => { e.preventDefault(); executar(() => api.iniciarExecucao(o.id, { previsao_entrega: previsao }), 'Serviço iniciado. Avise o cliente.') }}>
          <h2>Iniciar o serviço</h2>
          <p className="acao-texto">O cliente aprovou {moeda(o.orcamento_valor)}. Ao iniciar, ele recebe o aviso com a previsão de entrega.</p>
          <Campo rotulo="Previsão de entrega">
            <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
          </Campo>
          <div className="acao-botoes"><button className="botao botao-primario" disabled={ocupado}>Iniciar serviço</button></div>
        </form>
      )
    case 'execucao':
      return (
        <div className="acao">
          <h2>Serviço em andamento</h2>
          <p className="acao-texto">
            {o.previsao_entrega ? `Previsão de entrega: ${dia(o.previsao_entrega)}. ` : ''}
            Quando terminar, marque como pronto para avisar o cliente.
          </p>
          <div className="acao-botoes">
            <button className="botao botao-primario" disabled={ocupado} onClick={() => executar(() => api.marcarPronto(o.id), 'Veículo pronto. Avise o cliente para retirar.')}>
              Marcar como pronto
            </button>
          </div>
        </div>
      )
    case 'pronto':
    case 'recusada':
      return (
        <div className="acao">
          <h2>{o.etapa_atual === 'pronto' ? 'Pronto para retirada' : 'Orçamento recusado'}</h2>
          <p className="acao-texto">Quando o cliente buscar o veículo, registre a entrega para encerrar a OS.</p>
          <div className="acao-botoes">
            <button className="botao botao-primario" disabled={ocupado} onClick={() => executar(() => api.registrarEntrega(o.id), 'Entrega registrada. OS encerrada.')}>
              Registrar entrega
            </button>
          </div>
        </div>
      )
    default:
      return (
        <div className="acao acao-fim">
          <h2>OS encerrada</h2>
          <p className="acao-texto">Veículo entregue em {dataHora(o.entregue_em)}.</p>
        </div>
      )
  }
}

export default function Ordem() {
  const { id } = useParams()
  const { dados: o, erro, carregando, setDados, recarregar } = useCarregar(() => api.ordem(id), [id])
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null)

  async function executar(fn, sucesso) {
    setOcupado(true)
    setAviso(null)
    try {
      setDados(await fn())
      setAviso({ tipo: 'ok', texto: sucesso })
      avisarMudanca()
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e.message })
    } finally {
      setOcupado(false)
    }
  }

  async function marcarEnviada(msgId) {
    await api.marcarEnviada(msgId)
    recarregar()
    avisarMudanca()
  }

  const linkCliente = o ? `${window.location.origin}/acompanhar/${o.codigo_publico}` : ''
  const copiarLink = () => navigator.clipboard?.writeText(linkCliente).then(() => setAviso({ tipo: 'ok', texto: 'Link copiado.' }))

  return (
    <Estado carregando={carregando && !o} erro={erro}>
      {o && (
        <>
          <p className="trilha-volta"><Link to="/">Quadro</Link> / OS {o.id}</p>
          <div className="os-topo">
            <Placa placa={o.placa} tamanho="g" />
            <div className="os-titulo">
              <h1>{o.marca.replace(/^.* - /, '')} {o.modelo} {o.ano_modelo || ''}</h1>
              <p className="sub">
                OS {o.id} aberta em {dataHora(o.criado_em)} · <span className={`selo selo-${o.etapa_atual}`}>{ESTADOS[o.etapa_atual].titulo}</span>
              </p>
            </div>
          </div>

          <Trilha etapas={o.etapas} situacao={o.situacao} />

          {aviso && <p className={`aviso aviso-${aviso.tipo}`} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>{aviso.texto}</p>}

          <div className="os-grade">
            <div className="os-principal">
              <ProximaAcao key={`${o.etapa_atual}-${o.atualizado_em}`} o={o} executar={executar} ocupado={ocupado} />

              <section className="bloco" aria-labelledby="t-msg">
                <h2 id="t-msg">Mensagens ao cliente</h2>
                <ul className="mensagens">
                  {o.mensagens.map((m) => (
                    <li key={m.id} className={`msg msg-${m.direcao} ${m.status === 'pendente' ? 'msg-pendente' : ''}`}>
                      <p className="msg-meta">
                        {m.direcao === 'entrada' ? 'Resposta do cliente' : m.status === 'pendente' ? 'Para enviar' : `Enviada ${dataHora(m.enviada_em)}`}
                        {' · '}{dataHora(m.criado_em)}
                      </p>
                      <p className="msg-texto">{m.conteudo}</p>
                      {m.direcao === 'saida' && <BotaoWhatsApp mensagem={m} aoEnviar={marcarEnviada} compacto />}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className="os-lado">
              <section className="bloco">
                <h2>Cliente</h2>
                <p className="forte">{o.cliente_nome}</p>
                <p><a href={`tel:${o.cliente_telefone}`}>{telefone(o.cliente_telefone)}</a></p>
              </section>
              <section className="bloco">
                <h2>Problema relatado</h2>
                <p>{o.problema_relatado}</p>
              </section>
              {o.orcamento_valor != null && (
                <section className="bloco">
                  <h2>Orçamento</h2>
                  <p className="valor">{moeda(o.orcamento_valor)}</p>
                  <p className="pre">{o.orcamento_descricao}</p>
                </section>
              )}
              {o.fipe_valor && (
                <section className="bloco">
                  <h2>Valor FIPE</h2>
                  <p className="valor">{o.fipe_valor}</p>
                  <p className="sub">Referência {o.fipe_mes_referencia}</p>
                </section>
              )}
              <section className="bloco">
                <h2>Link do cliente</h2>
                <p className="sub">Página onde o cliente acompanha a OS e aprova o orçamento.</p>
                <div className="acao-botoes">
                  <a className="botao botao-p" href={linkCliente} target="_blank" rel="noreferrer">Abrir página</a>
                  <button className="botao botao-p botao-sutil" onClick={copiarLink}>Copiar link</button>
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </Estado>
  )
}
