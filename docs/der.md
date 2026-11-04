# Diagrama Entidade-Relacionamento — OficinaStatus

Versões em imagem para o relatório: [der.png](der.png) e [fluxo-estados.png](fluxo-estados.png).
O GitHub também renderiza os diagramas abaixo diretamente a partir do código Mermaid.

```mermaid
erDiagram
    CLIENTES ||--o{ VEICULOS : "possui"
    VEICULOS ||--o{ ORDENS_SERVICO : "recebe"
    ORDENS_SERVICO ||--|{ ETAPAS : "passa por (4)"
    ORDENS_SERVICO ||--o{ MENSAGENS : "gera"
    ETAPAS |o--o{ MENSAGENS : "notifica"

    CLIENTES {
        INTEGER id PK
        TEXT nome "NOT NULL"
        TEXT telefone "NOT NULL, WhatsApp com DDD"
        TEXT email
        TEXT criado_em
    }

    VEICULOS {
        INTEGER id PK
        INTEGER cliente_id FK
        TEXT placa "UNIQUE"
        TEXT tipo "cars | motorcycles | trucks"
        TEXT marca
        TEXT modelo
        INTEGER ano_modelo
        TEXT combustivel
        TEXT cor
        INTEGER quilometragem
        TEXT fipe_codigo "da API FIPE"
        TEXT fipe_ano_id "da API FIPE"
        TEXT fipe_valor "da API FIPE"
        TEXT fipe_mes_referencia "da API FIPE"
        TEXT fipe_consultado_em
        TEXT criado_em
    }

    ORDENS_SERVICO {
        INTEGER id PK
        INTEGER veiculo_id FK
        TEXT codigo_publico "UNIQUE, link do cliente"
        TEXT problema_relatado
        TEXT orcamento_descricao
        REAL orcamento_valor
        TEXT previsao_entrega
        TEXT situacao "aberta | recusada | finalizada"
        TEXT criado_em
        TEXT atualizado_em
        TEXT entregue_em
    }

    ETAPAS {
        INTEGER id PK
        INTEGER ordem_id FK
        TEXT tipo "orcamento | aprovacao | execucao | pronto"
        INTEGER sequencia "1 a 4"
        TEXT status "pendente | em_andamento | concluida | recusada"
        TEXT observacao
        TEXT iniciada_em
        TEXT concluida_em
    }

    MENSAGENS {
        INTEGER id PK
        INTEGER ordem_id FK
        INTEGER etapa_id FK
        TEXT direcao "saida | entrada"
        TEXT canal "whatsapp"
        TEXT conteudo
        TEXT link_envio "wa.me"
        TEXT status "pendente | enviada | recebida"
        TEXT criado_em
        TEXT enviada_em
    }
```

## Cardinalidades

| Relação | Cardinalidade | Regra |
|---|---|---|
| Cliente → Veículos | 1 : N | Um cliente pode ter vários veículos; excluir o cliente exclui os veículos (`ON DELETE CASCADE`). |
| Veículo → Ordens de serviço | 1 : N | Um veículo tem histórico de OS, mas só **uma OS aberta por vez** (regra na aplicação). |
| Ordem de serviço → Etapas | 1 : 4 | Toda OS é criada com as 4 etapas; `UNIQUE (ordem_id, tipo)`. |
| Ordem de serviço → Mensagens | 1 : N | Cada mudança de etapa gera uma mensagem de saída; a resposta do cliente gera uma de entrada. |
| Etapa → Mensagens | 0..1 : N | A mensagem guarda qual etapa a originou (`ON DELETE SET NULL`). |

## Fluxo de estados da OS

```mermaid
stateDiagram-v2
    [*] --> Orcamento: abrir OS (avisa cliente)
    Orcamento --> Aprovacao: enviar orçamento (pede aprovação)
    Aprovacao --> Aprovacao: revisar orçamento
    Aprovacao --> Aprovado: cliente aprova (link ou balcão)
    Aprovacao --> Recusada: cliente recusa
    Aprovado --> Execucao: iniciar serviço (avisa cliente)
    Execucao --> Pronto: marcar como pronto (avisa cliente)
    Pronto --> Entregue: registrar entrega
    Recusada --> Entregue: registrar entrega
    Entregue --> [*]
```
