# Relatório final: noite de 10 para 11/11/2026

O que foi feito sem o Breno acompanhando, o resultado de cada teste e o que falta antes da apresentação.

## Resumo

| Parte | Situação |
|---|---|
| 1. Domínio oficinastatus.com.br | ⏳ **Bloqueado no Registro.br:** os 4 registros foram salvos no painel, mas não foram publicados durante a noite (veja abaixo). Os hostnames, o certificado, o `APP_URL` e o webhook no domínio não foram feitos. |
| 2. Carros 3D | ✅ Os 4 modelos do Sketchfab foram baixados, com a licença conferida, otimizados, publicados no Azure e testados. |
| 3. Documentação | ✅ Checklist do projeto integrador no README, `docs/apresentacao.md` e `docs/deploy/telegram-webhook.txt`. |
| 4. Revisão final | ✅ Azure, repositório e histórico conferidos; correções feitas. O que depende do domínio ficou pendente. |

**No ar:** https://oficinastatus.graystone-3f5d3230.brazilsouth.azurecontainerapps.io (imagem `7f86cf5`, revisão
`oficinastatus--0000003`, 1 réplica). Para voltar à versão anterior, a imagem antiga é `oficinastatus:60703bd`.

## 1. Domínio

**O que foi conferido:**
- A delegação no `.br` continua no `a.auto.dns.br` e no `b.auto.dns.br`, os nameservers do Registro.br.
- De 00:00 às 01:00 (horário de Brasília), e depois a cada 3 minutos, a zona servida pelo `a.auto.dns.br` não tinha nenhum dos 4 registros: nem o A da raiz, nem o CNAME `www`, nem os TXT `asuid`. Só havia o TXT `v=spf1 -all` e um MX nulo.
- O serial do SOA subiu (`2026315100` → `…120` → `…130` → `…150` → `…160`), então o Registro.br está republicando a zona, mas sem os registros novos.
- Os servidores do modo avançado (`a/b/c.sec.dns.br`) recusam consultas sobre o domínio.

**Provável causa:** os registros ficaram salvos, mas não publicados. Isso acontece quando falta confirmar a edição da zona ou quando o modo avançado ainda está sendo ativado.

**O que não foi feito, por depender do DNS:** `hostname add/bind` no Container Apps, o certificado gerenciado, a troca do `APP_URL` e o `setWebhook` no domínio.

**Webhook do Telegram:** continua no túnel antigo do cloudflared, que está fora do ar. Por isso o bot **não recebe** mensagens nem cliques agora. Não mudei o webhook para o endereço `*.azurecontainerapps.io` porque você pediu o domínio e o `CLAUDE.md` pede para não mexer no bot real sem pedido. Se o domínio não sair a tempo, veja o "Plano B" abaixo.

## 2. Carros 3D

| Arquivo | Modelo (Sketchfab) | Autor | Licença conferida pela API | Original | Otimizado |
|---|---|---|---|---|---|
| `hatch.glb` | 2025 Volkswagen Golf GTI MK8.5 | BMW'S Lost Proxy | CC BY 4.0 (`by`) | 29,3 MB | 2,54 MB |
| `sedan.glb` | Toyota Corolla E170 2017 | Blender Boy | CC BY-SA 4.0 (`by-sa`) | 34,3 MB | 1,78 MB |
| `picape.glb` | Toyota Hilux Revo | David_Holiday | CC BY 4.0 (`by`) | 17,2 MB | 1,68 MB |
| `suv.glb` | Hyundai Creta 2016 | marcianozx | CC BY 4.0 (`by`) | 96,1 MB | 1,48 MB |

As 4 licenças eram as indicadas, então nenhum modelo foi pulado.

**O que foi feito:**
- **Uso:** cada modelo vale para todos os veículos da sua carroceria, de qualquer marca. O carro desenhado continua só como reserva.
- **Script novo** (`client/scripts/otimizar-modelo.mjs`):
  - põe cada carro nas coordenadas da inspeção, com o comprimento real e centrado entre os eixos;
  - corrige o giro de 3,7° do Creta original;
  - separa por lado as rodas, os faróis, as lanternas, os vidros e os retrovisores;
  - calcula as medidas do clique por peça e grava em `client/src/vistoria/medidas-modelos.json`;
  - troca a transmissão (vidro refrativo) por transparência comum, porque ela travava o SUV no navegador.
- **Script auxiliar:** o `inspecionar-modelo.mjs` ajuda a configurar um modelo novo.
- **Mantido:** a cor do veículo, o clique por peça, as marcações de avaria e a prévia do cliente.
- **Crédito:** aparece na tela de cada modelo, e as licenças estão no README, seção "Modelos 3D". O crédito agora quebra em duas linhas, sem cobrir a legenda nem passar da tela no celular.
- **Golf antigo:** o `golf.glb` (licença Standard) continua fora do Git e da imagem. Em produção, `/modelos/golf.glb` devolve só a página do site.
- **Prints:** `docs/telas/vistoria.png`, `vistoria-avaria.png`, `acompanhamento.png` e `cliente-vistoria.png` foram refeitos com os modelos novos.

**Testes:**
- **Local, na tela real de inspeção:**
  - OS 16 (Polo, hatch) mostra as 4 avarias nas peças certas: porta dianteira direita, para-lama, para-choque e farol direito;
  - OS 14 (Corolla, sedã) aparece preta, que é a cor cadastrada;
  - OS 12 (Strada, picape) aparece como a Hilux branca;
  - OS 17 (SUV) foi criada **só no banco local** para o teste. Passando o mouse, o sistema reconheceu a porta dianteira direita, as rodas dianteira e traseira direitas e o capô.
  - No celular (390 px), não há rolagem horizontal. Nenhum erro no console.
- **Produção:**
  - os 4 `.glb` são servidos (200, `model/gltf-binary`);
  - a página pública da OS 16 mostra o Golf com as 4 avarias e o crédito, no desktop e no celular, sem erros no console;
  - a OS 12 não tem avarias, então a página dela não mostra o 3D;
  - **não há SUV nem sedã com página pública** em produção, então esses dois foram testados na tela real só no ambiente local.

## 3. Documentação

- **README:**
  - seção **Checklist do projeto integrador**, com cada requisito comum, do Anexo A e do B.8, a situação, a evidência e **print pendente** onde falta print;
  - passo 9 com o domínio no DNS do Registro.br;
  - respostas 4 a 6 do B.9 e a estrutura atualizadas;
  - orçamento documentado: `orcamento-oficinastatus`, US$ 100 por mês, alertas de 25/50/100 % no escopo da conta de cobrança *breno suski*, conferido pela API;
  - seção "Modelos 3D".
- **`docs/apresentacao.md`:** roteiro de 5 minutos, ordem da demonstração ao vivo e perguntas prováveis.
- **`docs/deploy/telegram-webhook.txt`:** `getMe` e `getWebhookInfo` sem o token. Hoje mostra o túnel antigo; atualizar depois do `setWebhook` no domínio.

## 4. Revisão final

**Azure (conferido com o az):**

| Recurso | Estado |
|---|---|
| App | imagem `7f86cf5`; min/max de 1 réplica; 0,25 vCPU e 0,5 GiB; ingress externo sem HTTP inseguro; ACR por identidade gerenciada |
| Secrets | `database-url`, `jwt-secret` e `telegram-*`; as variáveis só usam `secretref` |
| Banco | `oficinastatus-db-breno` em *Ready*; B1ms Burstable, PostgreSQL 17, 32 GB; sem alta disponibilidade; backup de 7 dias sem redundância geográfica; **acesso público desligado**; nenhuma regra de firewall (o Azure nem aceita mais) |
| Private Endpoint | `pe-oficinastatus-db` aprovado, com o banco em 10.20.1.4 |
| Ambiente | IP estático `4.238.147.212`, o do registro A |

**Testes em produção** (11/11, 04:07 UTC), pelo endereço do Azure, porque o domínio ainda não resolve:

| Teste | Resultado |
|---|---|
| `GET /`, `/entrar`, `/api/saude`, `/api/auth/estado` (lê o banco) | 200 |
| Login com senha errada | 401 |
| Login com `oficina123`, nas **8** contas | 401: as senhas foram mesmo trocadas |
| `/api/ordens` e `/api/mensagens` sem login | 401 |
| `POST /webhook/telegram` sem o segredo e com segredo errado | 401 |
| `http://` | 301 para `https://` |
| Certificado | *Microsoft TLS G2 RSA CA OCSP 04*, válido até 18/02/2027, TLS 1.3, `Verify return code: 0` |
| Inspeção 3D da OS 16 pelo link público | ok, sem erros no console |

**Não testado em produção:** o login com sucesso, abrir uma OS como admin e a tela *Mensagens*, porque as senhas
novas são só suas. Esses fluxos foram testados no ambiente local, e as rotas respondem 401 sem login em produção.

**Segredos no Git:**
- procurei em todo o histórico (`git log -p --all`) os valores reais do `server/.env`, sem imprimi-los;
- procurei padrões de token do Telegram, de URL do Postgres com senha e de chave privada.

Nenhum segredo apareceu. Os únicos valores do `.env` no histórico são o nome público do bot e o `DATABASE_URL` de
desenvolvimento, igual ao do `.env.example`. Só os dois `.env.*.example` foram versionados.

**Correções feitas na revisão:**
- O README dizia que o carro 3D era "modelado no próprio sistema". Agora aponta para os modelos do Sketchfab.
- A estrutura do README marcava o `docker-compose.prod.yml` e o `Caddyfile` como produção. Agora estão marcados como caminho 1, não usado.
- O passo 9 e as respostas 4 e 5 do B.9 falavam em zona no Azure DNS. Agora descrevem o DNS do Registro.br e deixam o Azure DNS como alternativa.
- A tela de inspeção no celular passava da largura da tela: a coluna do grid foi corrigida.
- Os prints de `docs/telas` mostravam o Golf antigo, com "licença Standard" no crédito.

## O que fazer de manhã (nesta ordem)

1. **Registro.br:**
   - abrir o painel do domínio, em *DNS*, e conferir se os 4 registros aparecem na zona;
   - se houver botão de salvar ou publicar pendente, confirmar;
   - testar com `nslookup oficinastatus.com.br` (deve dar `4.238.147.212`) e `nslookup -type=TXT asuid.oficinastatus.com.br`.
2. **Quando o DNS responder**, me peça para seguir, ou rode os comandos do README (Deploy, passo 9):
   - `hostname add/bind` da raiz (validação HTTP) e do `www` (validação CNAME);
   - troca do `APP_URL`;
   - `npm run webhook -- --url https://oficinastatus.com.br`;
   - depois, atualizar o `docs/deploy/telegram-webhook.txt` e marcar os itens ⏳ do checklist.
3. **Plano B, se o domínio não sair antes da apresentação** (decisão sua, porque muda o bot real):
   ```bash
   npm run webhook -- --url https://oficinastatus.graystone-3f5d3230.brazilsouth.azurecontainerapps.io
   ```
   Assim, o "Aprovar pelo Telegram" funciona na apresentação. Quando o domínio sair, rode de novo com o domínio.
4. **Prints pendentes** (lista no checklist do README):
   - *Overview* do banco, com o B1ms;
   - *Networking* do banco, com *Public access: Disabled*, e a conexão aprovada do `pe-oficinastatus-db`;
   - cadeado no navegador, com o emissor do certificado;
   - `nslookup` do domínio;
   - `getWebhookInfo` ou a configuração do webhook apontando para o domínio;
   - o orçamento com os 3 alertas e o *Cost analysis* com o consumo.
5. **Antes de apresentar:** seguir a lista "Antes de começar" do `docs/apresentacao.md`.

## Pendências fora do escopo desta noite

- **Tags e release:** o PDF pede uma tag por aula (`aula-01` a `aula-18`) e a release `v1.0.0`, e o repositório não tem nenhuma. Não criei, porque as tags deveriam marcar o estado de cada aula.
- **Prometheus e Grafana (2º bimestre):** não existem no projeto.
- **E-mail (SMTP) em produção:** não configurado. Os avisos saem só pelo Telegram.
- **Fotos das OS:** se perdem a cada nova revisão do contêiner, porque ele não tem disco persistente.
- **`NOME_OFICINA`, `TELEFONE_OFICINA` e `ENDERECO_OFICINA`:** não estão definidos em produção, então a página mostra "OficinaStatus", sem telefone.
- **Banco local:** ficou com um veículo SUV (`SUV1A23`) e a OS 17, criados para o teste do modelo. Não afeta a produção. Não apaguei, pela regra de não apagar nada no banco.
