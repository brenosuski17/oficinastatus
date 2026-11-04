import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { Placa, Trilha, useCarregar, Estado } from '../components'
import { moeda, dia, dataHora, telefone } from '../util'

const MANCHETE = {
  orcamento: (o) => ({ titulo: 'Estamos avaliando o seu veículo', texto: 'Assim que o orçamento estiver pronto, ele aparece aqui para você aprovar.' }),
  aprovacao: (o) => ({ titulo: 'Seu orçamento está pronto', texto: 'Confira os serviços abaixo e responda por aqui mesmo.' }),
  aprovado: (o) => ({ titulo: 'Orçamento aprovado', texto: 'Obrigado! O serviço vai começar em breve.' }),
  execucao: (o) => ({ titulo: 'Serviço em andamento', texto: o.previsao_entrega ? `Previsão de entrega: ${dia(o.previsao_entrega)}.` : 'Avisaremos quando terminar.' }),
  pronto: (o) => ({ titulo: 'Pronto para retirada', texto: `Pode vir buscar o seu ${o.veiculo.modelo} na ${o.oficina}.` }),
  recusada: () => ({ titulo: 'Orçamento não aprovado', texto: 'O veículo está disponível para retirada.' }),
  entregue: (o) => ({ titulo: 'Veículo entregue', texto: `Retirado em ${dataHora(o.entregue_em)}. Obrigado pela confiança!` }),
}

export default function Acompanhar() {
  const { codigo } = useParams()
  const { dados: o, erro, carregando, setDados } = useCarregar(() => api.publico(codigo), [codigo])
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroResp, setErroResp] = useState(null)

  async function responder(aprovado) {
    if (!aprovado && !confirm('Recusar o orçamento? A oficina será avisada.')) return
    setEnviando(true)
    setErroResp(null)
    try {
      setDados(await api.responderPublico(codigo, { aprovado, observacao: obs }))
    } catch (e) {
      setErroResp(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const m = o && MANCHETE[o.etapa_atual](o)

  return (
    <div className="publico">
      <Estado carregando={carregando && !o} erro={erro && 'Não encontramos esta ordem de serviço. Confira o link recebido.'}>
        {o && (
          <main className="publico-cartao">
            <p className="publico-oficina">{o.oficina}</p>
            <div className="publico-veiculo">
              <Placa placa={o.veiculo.placa} tamanho="g" />
              <p>{o.veiculo.marca.replace(/^.* - /, '')} {o.veiculo.modelo}{o.veiculo.ano_modelo ? ` ${o.veiculo.ano_modelo}` : ''}</p>
            </div>

            <div className={`manchete manchete-${o.etapa_atual}`} role="status">
              <h1>{m.titulo}</h1>
              <p>{m.texto}</p>
            </div>

            {o.etapa_atual === 'aprovacao' && (
              <section className="orcamento-publico" aria-labelledby="t-orc">
                <h2 id="t-orc">Orçamento</h2>
                <p className="pre">{o.orcamento_descricao}</p>
                <p className="valor-grande">{moeda(o.orcamento_valor)}</p>
                {o.previsao_entrega && <p className="sub">Previsão de entrega: {dia(o.previsao_entrega)}</p>}
                <label className="campo campo-largo">
                  <span className="campo-rotulo">Algum comentário? (opcional)</span>
                  <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
                </label>
                {erroResp && <p className="aviso aviso-erro" role="alert">{erroResp}</p>}
                <div className="publico-botoes">
                  <button className="botao botao-primario botao-g" disabled={enviando} onClick={() => responder(true)}>Aprovar orçamento</button>
                  <button className="botao botao-sutil botao-g" disabled={enviando} onClick={() => responder(false)}>Recusar</button>
                </div>
              </section>
            )}

            <section aria-labelledby="t-and">
              <h2 id="t-and" className="publico-sec">Andamento da OS {o.id}</h2>
              <Trilha etapas={o.etapas} situacao={o.situacao} vertical />
            </section>

            {o.orcamento_valor != null && o.etapa_atual !== 'aprovacao' && (
              <section className="orcamento-publico discreto">
                <h2>Orçamento</h2>
                <p className="pre">{o.orcamento_descricao}</p>
                <p className="forte">{moeda(o.orcamento_valor)}</p>
              </section>
            )}

            {o.telefone_oficina && (
              <p className="publico-contato">
                Dúvidas? <a href={`https://wa.me/55${o.telefone_oficina}`}>Fale com a oficina</a> · {telefone(o.telefone_oficina)}
              </p>
            )}
          </main>
        )}
      </Estado>
    </div>
  )
}
