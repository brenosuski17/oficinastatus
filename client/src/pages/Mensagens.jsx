import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { avisarMudanca } from '../App'
import { Placa, useCarregar, Estado, BotaoWhatsApp } from '../components'
import { ETAPAS, dataHora } from '../util'

export default function Mensagens() {
  const [filtro, setFiltro] = useState('pendente')
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.mensagens({ status: filtro }), [filtro])

  async function marcar(id) {
    await api.marcarEnviada(id)
    recarregar()
    avisarMudanca()
  }

  return (
    <>
      <div className="cabecalho">
        <div><h1>Mensagens</h1><p className="sub">Cada mudança de etapa gera um aviso para o cliente. Envie com um clique.</p></div>
        <div className="abas" role="tablist" aria-label="Filtrar mensagens">
          {[['pendente', 'Para enviar'], ['enviada', 'Enviadas'], ['recebida', 'Respostas'], ['', 'Todas']].map(([v, nome]) => (
            <button key={v} role="tab" aria-selected={filtro === v} className={`aba ${filtro === v ? 'ativa' : ''}`} onClick={() => setFiltro(v)}>{nome}</button>
          ))}
        </div>
      </div>

      <Estado carregando={carregando && !dados} erro={erro}
        vazio={dados?.length === 0 && (filtro === 'pendente' ? 'Tudo em dia: nenhuma mensagem esperando envio.' : 'Nenhuma mensagem aqui.')}>
        <ul className="mensagens mensagens-lista">
          {dados?.map((m) => (
            <li key={m.id} className={`msg msg-${m.direcao} ${m.status === 'pendente' ? 'msg-pendente' : ''}`}>
              <div className="msg-cab">
                <Placa placa={m.placa} tamanho="p" />
                <Link to={`/ordens/${m.ordem_id}`}>OS {m.ordem_id}</Link>
                <span>{m.cliente_nome}</span>
                <span className="sub">
                  {ETAPAS.find((e) => e.tipo === m.etapa_tipo)?.nome} · {dataHora(m.criado_em)}
                </span>
              </div>
              <p className="msg-texto">{m.conteudo}</p>
              {m.direcao === 'saida' && <BotaoWhatsApp mensagem={m} aoEnviar={marcar} compacto />}
            </li>
          ))}
        </ul>
      </Estado>
    </>
  )
}
