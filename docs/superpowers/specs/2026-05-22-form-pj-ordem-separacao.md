# Form PJ — Ordem de Separacao/Expedicao no wizard pos-venda

**Data:** 2026-05-22
**Repo:** `ativos/form-pj` (https://github.com/nxtlojas-hash/form-pj.git, branch `master`)
**Stack:** HTML/CSS/JS vanilla, Vercel + Cloud Functions, Docker

## Contexto

O wizard pos-venda do `form-pj` hoje tem 3 etapas (Status & Resumo → WhatsApp NF-e → Finalizar) e nao gera nenhum artefato direcionado para a equipe de expedicao. Por isso a separacao tem ocorrido com erros recorrentes:

- Modelo/cor trocados
- Quantidade errada
- Enderecos/transporte equivocados
- Sem rastro de quem separou nem comprovante de conferencia

A solucao e introduzir uma **etapa 3 nova** entre WhatsApp e Finalizar (renumerando a antiga 3 para 4) que produz dois artefatos com o **mesmo conteudo, sem valores**:

1. **Texto pronto** para colar no grupo de expedicao do WhatsApp
2. **PDF imprimivel** com bloco de assinatura para conferencia fisica

O padrao reaproveita o que ja existe no APP principal NXT (`ativos/nxt-app/app`):

- `abrirWhatsAppGrupo()` — abre `https://wa.me/?text=...` sem numero
- `wizardGerarPDF()` + `gerarPDF()` — jspdf 2.5.1 + html2canvas 1.4.1
- `copiarResumoVenda()` ja existe no proprio form-pj para clipboard

## Wizard atualizado

| # | Etapa | Estado |
|---|-------|--------|
| 1 | Status & Resumo (com valores) | existente |
| 2 | WhatsApp NF-e ao cliente | existente |
| 3 | **Ordem de Separacao / Expedicao** | **NOVA** |
| 4 | Finalizar | existente (renumerada de 3) |

Indicadores de progresso, linhas conectoras e `_wizardIrParaPasso` passam a operar com 4 passos.

## Etapa 3 — Layout

```
+--------------------------------------------------+
| Ordem de Separacao                               |
| Envie ao grupo de expedicao e imprima para       |
| conferencia da separacao fisica.                 |
|                                                  |
| +--- Previa do texto ----------------------+     |
| | *ORDEM DE SEPARACAO PJ*                  |     |
| | ...                                      |     |
| +------------------------------------------+     |
|                                                  |
| [Copiar texto] [Enviar no Grupo]                 |
| [Baixar PDF]   [Imprimir]                        |
|                                                  |
| [Voltar]                              [Avancar]  |
+--------------------------------------------------+
```

- Textarea readonly com o texto da ordem (preview = mesma string usada no botao Copiar e no botao WhatsApp)
- 4 botoes de acao em grid 2x2 no mobile, 1x4 no desktop
- Navegacao Voltar/Avancar identica ao padrao das outras etapas

## Conteudo (texto e PDF compartilham os mesmos dados)

```
*ORDEM DE SEPARACAO PJ*
NXT Autopropelidos

*Pedido:* OC #{numeroPedidoOC} / Bling #{blingPedidoId}
*Data:* dd/mm/yyyy
*Vendedor:* {responsavelVenda}

*CLIENTE*
{razaoSocial}
CNPJ: {cnpj}
Resp: {responsavel} - {telefone}

*ENDERECO DE ENTREGA*
{rua}, {numero} - {bairro}
{cidade}/{uf} - CEP {cep}

*PRODUTOS A SEPARAR*
[ ] {qtd}x {MODELO_CAIXA_ALTA} - {COR_CAIXA_ALTA}
[ ] ...

*TRANSPORTE*
{tipo} / {nomeTransportadora}
Previsao: dd/mm/yyyy
Obs: {observacoes}
```

**Apenas no PDF**, acrescenta no rodape:

```
________________________________________
Separado por: ____________________________
Assinatura:   ____________________________
Data/Hora:    ____________________________

Conferido por: ___________________________
Assinatura:    ___________________________
```

Regras de conteudo:
- Modelo e cor em CAIXA ALTA (ataca erro "modelo/cor trocados")
- Quantidade em **bold** no inicio de cada linha (ataca erro "quantidade errada")
- Bloco endereco em destaque visual no PDF, fonte maior (ataca erro "endereco errado")
- Se `numeroPedidoOC` vazio, mostra so o numero Bling; se ambos vazios, omite a linha "Pedido"
- Se transportadora vazia (transporte proprio), mostra apenas o tipo
- Se `dataPrevista` ausente, omite a linha
- Se observacoes vazias, omite a linha

## Componentes a criar (`script.js`)

**Geracao de conteudo:**
- `gerarTextoSeparacaoPJ(venda, blingPedidoId)` — retorna string formatada para WhatsApp/clipboard
- `gerarHTMLOrdemSeparacao(venda, blingPedidoId)` — cria/atualiza `<div id="ordemSeparacaoContent">` (escondida fora da tela) com layout impressao

**Acoes do usuario:**
- `copiarOrdemSeparacao()` — clipboard write + feedback (mesmo padrao de `copiarResumoVenda`)
- `enviarSeparacaoGrupo()` — abre `https://wa.me/?text=...` sem numero
- `gerarPDFSeparacao()` — jspdf + html2canvas (espelho de `wizardGerarPDF` do APP principal, ajustado pro div de separacao); arquivo nomeado `ordem-separacao-{id}.pdf` onde `{id}` = `numeroPedidoOC` se existir, senao `blingPedidoId`, senao timestamp `yyyyMMddHHmm`
- `imprimirOrdemSeparacao()` — `window.print()` numa janela auxiliar contendo so o HTML da ordem (evita imprimir o wizard inteiro)

**Wizard:**
- Estender `_wizardIrParaPasso(passo)` para aceitar 1..4 e atualizar os 4 steps/3 progress-lines correspondentes
- Adicionar `_preencherPane3Separacao(venda, blingPedidoId)` chamado em `abrirWizardPosVenda` (apos `_preencherPane2WhatsApp`)
- Botao "Avancar" da nova etapa chama `wizardAvancar()` que ja sobe para a etapa 4

## Componentes a criar (`index.html`)

- Incluir no `<head>` (apos linha 11 do APP principal, antes de `script.js`):
  ```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  ```
- Atualizar `.wizard-progress`:
  - Adicionar `wStep3` "Separacao" entre os atuais 2 e 3
  - Adicionar uma `wizard-progress-line` extra
  - Renumerar o step "Finalizar" para `wStep4`
- Adicionar novo `<div id="wPane3" class="wizard-pane">` com:
  - Titulo e descricao curta
  - `<textarea id="ordemSeparacaoTexto" readonly>`
  - 4 botoes (`btnCopiarSeparacao`, `btnEnviarGrupoSep`, `btnPdfSeparacao`, `btnImprimirSep`)
  - Acoes Voltar/Avancar
- Renumerar o pane "Finalizar" para `wPane4`
- Criar `<div id="ordemSeparacaoContent" class="ordem-separacao-document" aria-hidden="true">` fora do fluxo visual (estilo display:none ou off-screen), usado por html2canvas e window.print

## Estilos (`style.css`)

- `.ordem-separacao-document` — A4 portrait, padding 24mm, font sans 12pt, fundo branco (compatibilidade impressao)
- `.ordem-separacao-document h1` — titulo grande centralizado
- `.ordem-separacao-document .bloco-cliente`, `.bloco-endereco`, `.bloco-produtos`, `.bloco-transporte` — separados por margem + linha sutil
- `.ordem-separacao-document .produtos-tabela` — tabela com checkbox grande (□ 18px), modelo/cor uppercase
- `.ordem-separacao-document .assinaturas` — linhas longas com label acima
- `@media print { body > *:not(#ordemSeparacaoContent) { display: none; } #ordemSeparacaoContent { display: block; } }` — pra `window.print` mostrar so a ordem
- Botoes do wizard pane 3 reaproveitam `.btn-wizard-primary`, `.btn-wizard-secondary`, `.btn-wizard-whatsapp` existentes

## Service worker

- Bumpar `CACHE_NAME` em `form-pj/service-worker.js` (ex: `nxt-pj-cache-v12` → `v13`)
- Verificar lista de arquivos cacheados — manter `index.html`, `script.js`, `style.css`; nao precisa cachear as libs CDN

## Fora de escopo

- Nao integra com Bling para "marcar como separado"
- Nao persiste a ordem em backend (cada pedido gera ordem na hora; nao guarda historico)
- Nao gera QR code de rastreio (ideia ja existe em `project_qrcode_os_futuro.md` para o futuro)
- Nao envia automatico pro grupo (WhatsApp Web nao permite link direto pra grupo; usuario escolhe na lista)
- Nao altera o resumo da etapa 1 (continua com valores)

## Como cobre os erros levantados

| Erro | Mitigacao |
|------|-----------|
| Modelo/cor trocados | MODELO + COR em caixa alta, fonte maior na tabela do PDF |
| Quantidade errada | Qtd em bold no inicio + checkbox por linha forca conferencia item a item |
| Endereco/transporte errado | Bloco endereco destacado, bloco transporte com tipo + transportadora + previsao |
| Falta rastreio/assinatura | Bloco "Separado por / Conferido por" com linhas para nome + assinatura + data/hora |

## Criterios de aceite

- Wizard mostra 4 etapas com indicadores corretos
- Botao "Copiar texto" copia ordem completa pro clipboard com feedback visual
- Botao "Enviar no Grupo" abre WhatsApp (web/app) com texto pre-colado, sem numero
- Botao "Baixar PDF" gera arquivo nomeado `ordem-separacao-{OC ou Bling ou timestamp}.pdf`
- Botao "Imprimir" abre dialogo de impressao mostrando apenas a ordem (nao o wizard inteiro)
- PDF/impressao contem bloco de assinatura (Separado por / Conferido por)
- Texto e PDF NAO contem valores monetarios
- Service worker atualiza cache (clientes existentes recebem versao nova)
