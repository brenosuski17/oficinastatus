# Diagrama Entidade-Relacionamento — OficinaStatus

Versões em imagem para o relatório: [der.png](der.png) e [fluxo-estados.png](fluxo-estados.png).
O GitHub também renderiza os diagramas abaixo diretamente a partir do código Mermaid.

As cinco entidades exigidas (`clientes`, `veiculos`, `ordens_servico`, `etapas`, `mensagens`) estão presentes. As tabelas extras dão suporte ao login (`usuarios`), ao orçamento por itens (`itens_orcamento`), às fotos (`fotos`) e à vistoria 3D (`avarias`, `avaria_servicos` e `catalogo_servicos`).

```mermaid
erDiagram
    CLIENTES ||--o{ VEICULOS : "possui"
    CLIENTES ||--o| USUARIOS : "acessa o portal"
    VEICULOS ||--o{ ORDENS_SERVICO : "recebe"
    USUARIOS |o--o{ ORDENS_SERVICO : "é responsável (mecânico)"
    ORDENS_SERVICO ||--|{ ETAPAS : "passa por (7)"
    ORDENS_SERVICO ||--o{ ITENS_ORCAMENTO : "tem"
    ORDENS_SERVICO ||--o{ FOTOS : "tem"
    ORDENS_SERVICO ||--o{ MENSAGENS : "gera"
    ETAPAS |o--o{ MENSAGENS : "notifica"
    ORDENS_SERVICO ||--o{ AVARIAS : "vistoria 3D"
    AVARIAS ||--|{ AVARIA_SERVICOS : "precisa de"
    CATALOGO_SERVICOS |o--o{ AVARIA_SERVICOS : "preço de"
    AVARIAS |o--o{ ITENS_ORCAMENTO : "gera"

    CLIENTES {
        INTEGER id PK
        TEXT nome
        TEXT telefone "WhatsApp com DDD"
        TEXT email
        TEXT cpf
        TEXT criado_em
    }
    USUARIOS {
        INTEGER id PK
        TEXT nome
        TEXT email "UNIQUE"
        TEXT senha_hash "bcrypt"
        TEXT papel "admin | mecanico | cliente"
        INTEGER cliente_id FK "só para clientes"
        TEXT convite_token "link de criar senha"
        TEXT convite_expira
        INTEGER ativo
    }
    VEICULOS {
        INTEGER id PK
        INTEGER cliente_id FK
        TEXT placa "UNIQUE"
        TEXT tipo "cars | motorcycles | trucks"
        TEXT marca
        TEXT modelo
        INTEGER ano_fabricacao
        INTEGER ano_modelo
        TEXT combustivel
        TEXT cor
        INTEGER quilometragem
        TEXT fipe_codigo "API FIPE"
        TEXT fipe_valor "API FIPE"
        TEXT fipe_mes_referencia "API FIPE"
        TEXT origem_dados "manual | fipe | placa"
    }
    ORDENS_SERVICO {
        INTEGER id PK
        INTEGER veiculo_id FK
        INTEGER mecanico_id FK
        TEXT codigo_publico "UNIQUE, link do cliente"
        TEXT problema_relatado
        TEXT diagnostico
        INTEGER km_entrada
        TEXT previsao_entrega
        INTEGER aguardando_peca
        TEXT situacao "aberta | recusada | finalizada"
        TEXT criado_em
        TEXT entregue_em
    }
    ETAPAS {
        INTEGER id PK
        INTEGER ordem_id FK
        TEXT tipo "recebido ... entregue"
        INTEGER sequencia "1 a 7"
        TEXT status "pendente | em_andamento | concluida | recusada"
        TEXT observacao
        INTEGER responsavel_id FK
        TEXT iniciada_em
        TEXT concluida_em
    }
    ITENS_ORCAMENTO {
        INTEGER id PK
        INTEGER ordem_id FK
        TEXT tipo "peca | servico"
        TEXT descricao
        REAL quantidade
        REAL valor_unitario
        INTEGER aprovado "NULL | 1 | 0"
        INTEGER avaria_id FK "quando veio da vistoria"
    }
    FOTOS {
        INTEGER id PK
        INTEGER ordem_id FK
        TEXT arquivo
        TEXT momento "entrada | diagnostico | execucao | entrega"
        INTEGER enviada_por FK
    }
    AVARIAS {
        INTEGER id PK
        INTEGER ordem_id FK
        INTEGER numero "nº do pino"
        TEXT zona "peça: porta_dianteira_direita..."
        TEXT tipo "amassado | risco | trinca | quebra | corrosao | pintura"
        TEXT gravidade "leve | moderada | grave"
        REAL pos_x_y_z "ponto no modelo 3D"
        REAL nor_x_y_z "normal da superfície"
        INTEGER orcada
    }
    AVARIA_SERVICOS {
        INTEGER id PK
        INTEGER avaria_id FK
        INTEGER catalogo_id FK
        TEXT descricao
        REAL valor
        INTEGER minutos
    }
    CATALOGO_SERVICOS {
        INTEGER id PK
        TEXT codigo "martelinho, pintura..."
        TEXT zona "grupo de peça"
        TEXT nome
        REAL valor
        INTEGER minutos
    }
    MENSAGENS {
        INTEGER id PK
        INTEGER ordem_id FK
        INTEGER etapa_id FK
        TEXT canal "email | whatsapp | sistema"
        TEXT direcao "saida | entrada"
        TEXT destinatario
        TEXT assunto
        TEXT conteudo
        TEXT status "pendente | enviada | falhou | recebida"
        TEXT erro
        TEXT id_externo "id do SMTP ou da Meta"
        TEXT enviada_em
        TEXT status_entrega "sent | delivered | read | failed"
        TEXT status_entrega_em
        INTEGER erro_codigo "código de erro da Meta"
    }
```

## Cardinalidades

| Relação | Cardinalidade | Regra |
|---|---|---|
| Cliente → Veículos | 1 : N | Excluir o cliente exclui os veículos (`ON DELETE CASCADE`). |
| Cliente → Usuário | 1 : 0..1 | Clientes com e-mail ganham uma conta para o portal. |
| Veículo → Ordens de serviço | 1 : N | Só **uma OS aberta por veículo** (regra na aplicação). |
| Usuário (mecânico) → Ordens | 0..1 : N | Mecânico vê só as OS dele e as sem responsável. |
| Ordem → Etapas | 1 : 7 | Toda OS nasce com as 7 etapas; `UNIQUE (ordem_id, tipo)`. |
| Ordem → Itens de orçamento | 1 : N | O cliente aprova item por item. |
| Ordem → Mensagens | 1 : N | Cada mudança de etapa gera uma mensagem por canal; o envio real fica registrado (`status`, `erro`, `id_externo`). |

## Fluxo de estados da OS

```mermaid
stateDiagram-v2
    [*] --> Diagnostico: abrir OS (Recebido ✓, avisa cliente)
    Diagnostico --> Orcamento: registrar diagnóstico (avisa)
    Orcamento --> Aprovacao: enviar orçamento (pede aprovação)
    Aprovacao --> Orcamento: alterar itens
    Aprovacao --> Aprovado: cliente aprova itens (link, portal ou balcão)
    Aprovacao --> Recusada: cliente recusa tudo
    Aprovado --> Execucao: iniciar serviço (avisa)
    Execucao --> Execucao: peça (avisa)
    Execucao --> Pronto: marcar como pronto (avisa)
    Pronto --> Entregue: registrar entrega (avisa)
    Recusada --> Entregue: registrar retirada
    Entregue --> [*]
```
