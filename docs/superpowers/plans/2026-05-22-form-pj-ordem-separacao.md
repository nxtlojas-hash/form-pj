# Form PJ — Ordem de Separacao/Expedicao — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma etapa 3 "Ordem de Separacao" no wizard pos-venda do `form-pj` que gera um texto sem valores para o grupo de expedicao no WhatsApp e um PDF imprimivel com bloco de assinatura, reduzindo erros de separacao (modelo/cor, qtd, endereco, falta de rastreio).

**Architecture:** Reusa o padrao do wizard atual (HTML estatico + JS vanilla preenchendo `.wizard-pane`). Adiciona um quarto passo renumerando o "Finalizar" atual de wPane3 para wPane4. PDF usa jspdf 2.5.1 + html2canvas 1.4.1 (espelho do APP principal). Texto para grupo abre `https://wa.me/?text=...` sem numero (usuario escolhe o grupo). Impressao usa `window.print()` com regra `@media print` que esconde tudo exceto o div `#ordemSeparacaoContent`.

**Tech Stack:** HTML5, CSS3, JavaScript ES6 (vanilla), jsPDF 2.5.1, html2canvas 1.4.1, PWA service worker.

**Spec:** `docs/superpowers/specs/2026-05-22-form-pj-ordem-separacao.md`

**No automated test framework:** form-pj nao tem suite de testes. Cada task termina com **verificacao manual** no navegador (abrir o app, registrar uma venda PJ de teste e validar comportamento).

---

## File Structure

Arquivos modificados:
- `index.html` — adicionar libs CDN, novo step na progress bar, novo `wPane3`, renumerar Finalizar para `wPane4`, container oculto `#ordemSeparacaoContent`
- `script.js` — novas funcoes (`gerarTextoSeparacaoPJ`, `gerarHTMLOrdemSeparacao`, `copiarOrdemSeparacao`, `enviarSeparacaoGrupo`, `gerarPDFSeparacao`, `imprimirOrdemSeparacao`, `_preencherPane3Separacao`), ajustar `wizardAvancar`/`wizardVoltar`/`_wizardIrParaPasso` para 4 passos
- `style.css` — estilos do documento de separacao + regra `@media print`
- `service-worker.js` — bumpar `CACHE_NAME` de `nxt-lojas-cache-v14` para `v15`

Sem arquivos novos. Sem dependencias npm (libs vem via CDN).

---

## Task 1: Bumpar cache do service worker e incluir libs PDF

**Files:**
- Modify: `service-worker.js:1`
- Modify: `index.html:8-10`

- [ ] **Step 1: Bumpar cache key do service worker**

Editar `service-worker.js` linha 1:

```javascript
const CACHE_NAME = 'nxt-lojas-cache-v15';
```

- [ ] **Step 2: Incluir libs jspdf e html2canvas no `<head>` do index.html**

Editar `index.html`, apos a linha 10 (`<meta name="theme-color"...>`) e antes de `</head>` (linha 11):

```html
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
```

Bloco `<head>` resultante deve ficar:

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NXT Autopropelidos - Vendas PJ</title>
    <link rel="stylesheet" href="style.css">
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#C6FF00"/>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
</head>
```

- [ ] **Step 3: Verificar no navegador**

Abrir `index.html` localmente (ou via `npm start` / `docker compose up` se houver), DevTools console:

```javascript
typeof window.jspdf !== 'undefined' && typeof window.html2canvas === 'function'
```

Expected: `true`

- [ ] **Step 4: Commit**

```bash
git add service-worker.js index.html
git commit -m "chore(pj): bump cache v14->v15 e adiciona jspdf+html2canvas"
```

---

## Task 2: Reestruturar HTML do wizard para 4 passos

**Files:**
- Modify: `index.html:632-647` (progress bar)
- Modify: `index.html:704-727` (renumerar Finalizar)
- Modify: `index.html` (inserir novo wPane3 e ordemSeparacaoContent)

- [ ] **Step 1: Atualizar a barra de progresso para 4 passos**

Substituir as linhas 632-647 de `index.html` por:

```html
                <!-- Barra de progresso do wizard -->
                <div class="wizard-progress" role="tablist" aria-label="Etapas do pós-venda">
                    <div class="wizard-step active" id="wStep1" role="tab" aria-selected="true" aria-controls="wPane1">
                        <div class="wizard-step-circle">1</div>
                        <span class="wizard-step-label">Status</span>
                    </div>
                    <div class="wizard-progress-line"></div>
                    <div class="wizard-step" id="wStep2" role="tab" aria-selected="false" aria-controls="wPane2">
                        <div class="wizard-step-circle">2</div>
                        <span class="wizard-step-label">WhatsApp</span>
                    </div>
                    <div class="wizard-progress-line"></div>
                    <div class="wizard-step" id="wStep3" role="tab" aria-selected="false" aria-controls="wPane3">
                        <div class="wizard-step-circle">3</div>
                        <span class="wizard-step-label">Separação</span>
                    </div>
                    <div class="wizard-progress-line"></div>
                    <div class="wizard-step" id="wStep4" role="tab" aria-selected="false" aria-controls="wPane4">
                        <div class="wizard-step-circle">4</div>
                        <span class="wizard-step-label">Finalizar</span>
                    </div>
                </div>
```

- [ ] **Step 2: Renumerar o pane "Finalizar" de wPane3 para wPane4**

No bloco do PASSO 3 atual (linhas 704-727), trocar:
- `id="wPane3"` → `id="wPane4"`
- `aria-labelledby="wStep3"` → `aria-labelledby="wStep4"`
- O comentario `<!-- PASSO 3: Finalizar -->` → `<!-- PASSO 4: Finalizar -->`

Tambem ajustar o `aria-label` do botao "Avançar" do antigo wPane2 (linha 697): trocar `aria-label="Avançar para etapa 3"` por `aria-label="Avançar para etapa 3"` (ja esta correto, manter).

- [ ] **Step 3: Inserir o novo PASSO 3 (Ordem de Separação) entre wPane2 e o novo wPane4**

Inserir, logo apos o fechamento `</div>` do wPane2 (apos linha 702, antes do comentario `<!-- PASSO 3: Finalizar -->` que agora sera `<!-- PASSO 4: Finalizar -->`):

```html
            <!-- PASSO 3: Ordem de Separação -->
            <div id="wPane3" class="wizard-pane" role="tabpanel" aria-labelledby="wStep3">
                <h4 class="wizard-pane-titulo">Ordem de Separação</h4>
                <p class="wizard-pane-descricao">Envie ao grupo de expedição e imprima para conferência da separação física.</p>

                <div class="wizard-resumo-section">
                    <div class="wizard-resumo-header">
                        <span class="wizard-resumo-label">Prévia da ordem (sem valores)</span>
                        <button type="button" class="btn-wizard-copy" id="btnCopiarSeparacao" onclick="copiarOrdemSeparacao()" aria-label="Copiar texto da ordem de separação">
                            Copiar Texto
                        </button>
                    </div>
                    <textarea
                        id="ordemSeparacaoTexto"
                        class="wizard-resumo-textarea"
                        rows="14"
                        readonly
                        onclick="this.select()"
                        aria-label="Texto da ordem de separação"
                        spellcheck="false"
                    ></textarea>
                </div>

                <div class="wizard-acoes-separacao">
                    <button type="button" class="btn-wizard-whatsapp" onclick="enviarSeparacaoGrupo()" aria-label="Abrir WhatsApp para enviar ao grupo de expedição">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        Enviar no Grupo
                    </button>
                    <button type="button" class="btn-wizard-secondary" id="btnPdfSeparacao" onclick="gerarPDFSeparacao()" aria-label="Baixar PDF da ordem de separação">
                        Baixar PDF
                    </button>
                    <button type="button" class="btn-wizard-secondary" id="btnImprimirSep" onclick="imprimirOrdemSeparacao()" aria-label="Imprimir ordem de separação">
                        Imprimir
                    </button>
                </div>

                <div class="wizard-actions wizard-actions-duo">
                    <button type="button" class="btn-wizard-secondary" onclick="wizardVoltar()" aria-label="Voltar para etapa 2">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        Voltar
                    </button>
                    <button type="button" class="btn-wizard-primary" onclick="wizardAvancar()" aria-label="Avançar para etapa 4">
                        Avançar
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>
            </div>
```

- [ ] **Step 4: Inserir o container oculto `#ordemSeparacaoContent` fora do wizard**

Inserir antes do fechamento `</body>` do `index.html`, em qualquer ponto apos o modal Fatura (apos linha ~760, escolha um ponto antes de `<script src="script.js"></script>`):

```html
    <!-- Container off-screen usado para renderizar o PDF da ordem de separação -->
    <div id="ordemSeparacaoContent" class="ordem-separacao-document" aria-hidden="true" style="position: fixed; left: -10000px; top: 0;"></div>
```

- [ ] **Step 5: Verificar no navegador**

Abrir DevTools → Elements e confirmar:
- `#wizardPosVenda` contem 4 elementos `.wizard-step` (Status, WhatsApp, Separação, Finalizar)
- 3 elementos `.wizard-progress-line`
- 4 paineis: `#wPane1`, `#wPane2`, `#wPane3`, `#wPane4`
- `#wPane3` tem textarea `#ordemSeparacaoTexto` e os 3 botoes (`#btnCopiarSeparacao`, `#btnPdfSeparacao`, `#btnImprimirSep`)
- Existe `#ordemSeparacaoContent` no body, fora do wizard

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(pj): adiciona etapa 3 Ordem de Separacao no wizard (HTML)"
```

---

## Task 3: Atualizar navegacao do wizard para 4 passos

**Files:**
- Modify: `script.js:842-875` (`wizardAvancar`, `wizardVoltar`, `_wizardIrParaPasso`)

- [ ] **Step 1: Trocar limites de `wizardAvancar` e `wizardVoltar` de 3 para 4**

Em `script.js` linha 842, substituir:

```javascript
function wizardAvancar() {
    if (wizardPassoAtual < 3) {
        _wizardIrParaPasso(wizardPassoAtual + 1);
    }
}
```

Por:

```javascript
function wizardAvancar() {
    if (wizardPassoAtual < 4) {
        _wizardIrParaPasso(wizardPassoAtual + 1);
    }
}
```

(O `wizardVoltar` continua igual porque ja usa `> 1`.)

- [ ] **Step 2: Verificar no navegador**

Sem registrar venda real ainda. No DevTools console, abrir o wizard manualmente e clicar 3x em "Avançar":

```javascript
document.getElementById('wizardPosVenda').style.display = 'flex';
wizardPassoAtual = 1;
_wizardIrParaPasso(1);
```

Clicar "Avançar" na etapa 1 → vai pra etapa 2. Clicar de novo → etapa 3 (separacao). Clicar de novo → etapa 4 (finalizar). Clicar de novo → nada (chegou no limite). Voltar funciona ate o passo 1.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat(pj): wizard suporta 4 passos (limite ajustado de 3 para 4)"
```

---

## Task 4: Implementar `gerarTextoSeparacaoPJ`

**Files:**
- Modify: `script.js` (adicionar funcao apos `gerarTextoResumoVendaPJ`, ~linha 1092)

- [ ] **Step 1: Adicionar a funcao geradora de texto**

Inserir em `script.js` apos o `return texto;` da `gerarTextoResumoVendaPJ` (apos linha 1092, antes do comentario `// WHATSAPP NF-e`):

```javascript
// ============================================================
// ORDEM DE SEPARACAO PJ - GERADOR DE TEXTO (sem valores)
// ============================================================

function gerarTextoSeparacaoPJ(venda, blingPedidoId) {
    const dataFormatada = new Date(venda.dataVenda + 'T12:00:00').toLocaleDateString('pt-BR');
    const e = venda.empresa;
    const end = e.endereco || {};
    const t = venda.transporte || {};

    let texto = '';
    texto += `*ORDEM DE SEPARACAO PJ*\n`;
    texto += `NXT Autopropelidos\n\n`;

    const pedidoLinha = [];
    if (venda.numeroPedidoOC) pedidoLinha.push(`OC #${venda.numeroPedidoOC}`);
    if (blingPedidoId) pedidoLinha.push(`Bling #${blingPedidoId}`);
    if (pedidoLinha.length) texto += `*Pedido:* ${pedidoLinha.join(' / ')}\n`;

    texto += `*Data:* ${dataFormatada}\n`;
    if (venda.responsavelVenda) texto += `*Vendedor:* ${venda.responsavelVenda}\n`;
    texto += `\n`;

    texto += `*CLIENTE*\n`;
    texto += `${e.razaoSocial}\n`;
    texto += `CNPJ: ${e.cnpj}\n`;
    if (e.responsavel) {
        const tel = e.telefone ? ` - ${e.telefone}` : '';
        texto += `Resp: ${e.responsavel}${tel}\n`;
    }
    texto += `\n`;

    texto += `*ENDERECO DE ENTREGA*\n`;
    const linha1 = [end.rua, end.numero].filter(Boolean).join(', ');
    if (linha1) texto += `${linha1}`;
    if (end.bairro) texto += ` - ${end.bairro}`;
    texto += `\n`;
    const cidadeUf = [end.cidade, end.estado].filter(Boolean).join('/');
    if (cidadeUf) texto += `${cidadeUf}`;
    if (end.cep) texto += ` - CEP ${end.cep}`;
    texto += `\n\n`;

    texto += `*PRODUTOS A SEPARAR*\n`;
    venda.produtos.forEach(p => {
        const modelo = (p.modelo || '').toUpperCase();
        const cor = (p.cor || '').toUpperCase();
        texto += `[ ] *${p.quantidade}x* ${modelo} - ${cor}\n`;
    });
    texto += `\n`;

    texto += `*TRANSPORTE*\n`;
    const tiposTransporte = { proprio: 'Transporte Proprio', transportadora: 'Transportadora', terceirizado: 'Terceirizado' };
    const tipoNome = tiposTransporte[t.tipo] || t.tipo || '';
    const transpLinha = [tipoNome, t.nomeTransportadora].filter(Boolean).join(' / ');
    if (transpLinha) texto += `${transpLinha}\n`;
    if (t.dataPrevista) {
        const dp = new Date(t.dataPrevista + 'T12:00:00').toLocaleDateString('pt-BR');
        texto += `Previsao: ${dp}\n`;
    }
    if (t.observacoes) texto += `Obs: ${t.observacoes}\n`;

    return texto;
}
```

- [ ] **Step 2: Verificar a saida no console**

DevTools console (em qualquer pagina do form-pj com `script.js` carregado):

```javascript
gerarTextoSeparacaoPJ({
    dataVenda: '2026-05-22',
    numeroPedidoOC: '1234',
    responsavelVenda: 'João',
    empresa: {
        razaoSocial: 'Teste Ltda',
        cnpj: '00.000.000/0001-00',
        responsavel: 'Maria',
        telefone: '(11) 99999-9999',
        endereco: { rua: 'Rua X', numero: '123', bairro: 'Centro', cidade: 'SP', estado: 'SP', cep: '00000-000' }
    },
    produtos: [
        { modelo: 'Voltz EVS', cor: 'Preto', quantidade: 2 },
        { modelo: 'Smart Juna', cor: 'Azul', quantidade: 1 }
    ],
    transporte: { tipo: 'transportadora', nomeTransportadora: 'ABC', dataPrevista: '2026-05-25', observacoes: 'retirar 8h-17h' }
}, 5678);
```

Expected output (texto):

```
*ORDEM DE SEPARACAO PJ*
NXT Autopropelidos

*Pedido:* OC #1234 / Bling #5678
*Data:* 22/05/2026
*Vendedor:* João

*CLIENTE*
Teste Ltda
CNPJ: 00.000.000/0001-00
Resp: Maria - (11) 99999-9999

*ENDERECO DE ENTREGA*
Rua X, 123 - Centro
SP/SP - CEP 00000-000

*PRODUTOS A SEPARAR*
[ ] *2x* VOLTZ EVS - PRETO
[ ] *1x* SMART JUNA - AZUL

*TRANSPORTE*
Transportadora / ABC
Previsao: 25/05/2026
Obs: retirar 8h-17h
```

Confirmar visualmente: cabecalho presente, sem valores monetarios, modelo/cor em caixa alta, qtd em bold.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat(pj): adiciona gerarTextoSeparacaoPJ (texto sem valores)"
```

---

## Task 5: Implementar `gerarHTMLOrdemSeparacao` e estilos do documento

**Files:**
- Modify: `script.js` (adicionar funcao logo apos `gerarTextoSeparacaoPJ`)
- Modify: `style.css` (adicionar bloco de estilos `.ordem-separacao-document`)

- [ ] **Step 1: Adicionar a funcao que renderiza HTML do PDF**

Em `script.js`, logo apos a `gerarTextoSeparacaoPJ`:

```javascript
function gerarHTMLOrdemSeparacao(venda, blingPedidoId) {
    const dataFormatada = new Date(venda.dataVenda + 'T12:00:00').toLocaleDateString('pt-BR');
    const e = venda.empresa;
    const end = e.endereco || {};
    const t = venda.transporte || {};

    const pedidoParts = [];
    if (venda.numeroPedidoOC) pedidoParts.push(`OC #${venda.numeroPedidoOC}`);
    if (blingPedidoId) pedidoParts.push(`Bling #${blingPedidoId}`);
    const pedidoStr = pedidoParts.join(' / ') || '—';

    const enderecoLinha1Parts = [end.rua, end.numero].filter(Boolean).join(', ');
    const enderecoLinha1 = end.bairro ? `${enderecoLinha1Parts} - ${end.bairro}` : enderecoLinha1Parts;
    const enderecoLinha2Parts = [];
    const cidadeUf = [end.cidade, end.estado].filter(Boolean).join('/');
    if (cidadeUf) enderecoLinha2Parts.push(cidadeUf);
    if (end.cep) enderecoLinha2Parts.push(`CEP ${end.cep}`);
    const enderecoLinha2 = enderecoLinha2Parts.join(' - ');

    const tiposTransporte = { proprio: 'Transporte Proprio', transportadora: 'Transportadora', terceirizado: 'Terceirizado' };
    const tipoNome = tiposTransporte[t.tipo] || t.tipo || '';
    const transpLinha = [tipoNome, t.nomeTransportadora].filter(Boolean).join(' / ') || '—';
    const previsao = t.dataPrevista ? new Date(t.dataPrevista + 'T12:00:00').toLocaleDateString('pt-BR') : '';

    const produtosRows = venda.produtos.map(p => `
        <tr>
            <td class="col-check">☐</td>
            <td class="col-qtd">${p.quantidade}x</td>
            <td class="col-modelo">${(p.modelo || '').toUpperCase()}</td>
            <td class="col-cor">${(p.cor || '').toUpperCase()}</td>
        </tr>
    `).join('');

    const html = `
        <div class="osep-header">
            <h1>ORDEM DE SEPARAÇÃO</h1>
            <div class="osep-header-meta">
                <div><strong>NXT Autopropelidos</strong></div>
                <div>Pedido: <strong>${pedidoStr}</strong></div>
                <div>Data: ${dataFormatada}${venda.responsavelVenda ? ' · Vendedor: ' + venda.responsavelVenda : ''}</div>
            </div>
        </div>

        <div class="osep-bloco">
            <div class="osep-bloco-titulo">CLIENTE</div>
            <div>${e.razaoSocial}</div>
            <div>CNPJ: ${e.cnpj}</div>
            ${e.responsavel ? `<div>Resp: ${e.responsavel}${e.telefone ? ' — ' + e.telefone : ''}</div>` : ''}
        </div>

        <div class="osep-bloco osep-bloco-endereco">
            <div class="osep-bloco-titulo">ENDEREÇO DE ENTREGA</div>
            <div class="osep-endereco-linha">${enderecoLinha1 || '—'}</div>
            ${enderecoLinha2 ? `<div class="osep-endereco-linha">${enderecoLinha2}</div>` : ''}
        </div>

        <div class="osep-bloco">
            <div class="osep-bloco-titulo">PRODUTOS A SEPARAR</div>
            <table class="osep-produtos">
                <thead>
                    <tr><th class="col-check"></th><th class="col-qtd">Qtd</th><th class="col-modelo">Modelo</th><th class="col-cor">Cor</th></tr>
                </thead>
                <tbody>${produtosRows}</tbody>
            </table>
        </div>

        <div class="osep-bloco">
            <div class="osep-bloco-titulo">TRANSPORTE</div>
            <div>${transpLinha}</div>
            ${previsao ? `<div>Previsão: ${previsao}</div>` : ''}
            ${t.observacoes ? `<div>Obs: ${t.observacoes}</div>` : ''}
        </div>

        <div class="osep-assinaturas">
            <div class="osep-assinatura-linha">Separado por: <span class="osep-linha-longa"></span></div>
            <div class="osep-assinatura-linha">Assinatura: <span class="osep-linha-longa"></span></div>
            <div class="osep-assinatura-linha">Data/Hora: <span class="osep-linha-curta"></span></div>
            <br>
            <div class="osep-assinatura-linha">Conferido por: <span class="osep-linha-longa"></span></div>
            <div class="osep-assinatura-linha">Assinatura: <span class="osep-linha-longa"></span></div>
        </div>
    `;

    const container = document.getElementById('ordemSeparacaoContent');
    if (container) {
        container.innerHTML = html;
    }
    return container;
}
```

- [ ] **Step 2: Adicionar estilos do documento em `style.css`**

Adicionar no final de `style.css`:

```css
/* ============================================================
   ORDEM DE SEPARACAO - documento impressao/PDF
   ============================================================ */
.ordem-separacao-document {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm;
    box-sizing: border-box;
    background: #fff;
    color: #000;
    font-family: 'Helvetica', 'Arial', sans-serif;
    font-size: 12pt;
    line-height: 1.4;
}

.ordem-separacao-document .osep-header {
    border-bottom: 2px solid #000;
    padding-bottom: 8mm;
    margin-bottom: 8mm;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10mm;
}
.ordem-separacao-document .osep-header h1 {
    font-size: 22pt;
    margin: 0;
    letter-spacing: 1px;
}
.ordem-separacao-document .osep-header-meta {
    text-align: right;
    font-size: 11pt;
}

.ordem-separacao-document .osep-bloco {
    margin-bottom: 6mm;
}
.ordem-separacao-document .osep-bloco-titulo {
    font-weight: bold;
    font-size: 11pt;
    text-transform: uppercase;
    border-bottom: 1px solid #000;
    margin-bottom: 2mm;
    padding-bottom: 1mm;
}

.ordem-separacao-document .osep-bloco-endereco .osep-endereco-linha {
    font-size: 14pt;
    font-weight: 600;
}

.ordem-separacao-document .osep-produtos {
    width: 100%;
    border-collapse: collapse;
    margin-top: 2mm;
}
.ordem-separacao-document .osep-produtos th,
.ordem-separacao-document .osep-produtos td {
    border: 1px solid #000;
    padding: 3mm 4mm;
    text-align: left;
    vertical-align: middle;
}
.ordem-separacao-document .osep-produtos thead th {
    background: #f0f0f0;
    font-size: 10pt;
    text-transform: uppercase;
}
.ordem-separacao-document .osep-produtos .col-check { width: 12mm; text-align: center; font-size: 18pt; }
.ordem-separacao-document .osep-produtos .col-qtd { width: 18mm; font-weight: bold; font-size: 14pt; }
.ordem-separacao-document .osep-produtos .col-modelo { font-size: 14pt; font-weight: 600; }
.ordem-separacao-document .osep-produtos .col-cor { font-size: 14pt; font-weight: 600; }

.ordem-separacao-document .osep-assinaturas {
    margin-top: 14mm;
    padding-top: 6mm;
    border-top: 1px dashed #000;
}
.ordem-separacao-document .osep-assinatura-linha {
    margin-bottom: 5mm;
    font-size: 11pt;
}
.ordem-separacao-document .osep-linha-longa {
    display: inline-block;
    border-bottom: 1px solid #000;
    width: 110mm;
    margin-left: 4mm;
}
.ordem-separacao-document .osep-linha-curta {
    display: inline-block;
    border-bottom: 1px solid #000;
    width: 60mm;
    margin-left: 4mm;
}

/* Container do pane 3 - botoes de acao */
.wizard-acoes-separacao {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 12px 0 16px 0;
}
@media (max-width: 600px) {
    .wizard-acoes-separacao { grid-template-columns: 1fr; }
}

.wizard-pane-descricao {
    font-size: 0.9em;
    color: #888;
    margin: 0 0 12px 0;
}
```

- [ ] **Step 3: Verificar no console**

DevTools console:

```javascript
gerarHTMLOrdemSeparacao({
    dataVenda: '2026-05-22',
    numeroPedidoOC: '1234',
    responsavelVenda: 'João',
    empresa: {
        razaoSocial: 'Teste Ltda', cnpj: '00.000.000/0001-00',
        responsavel: 'Maria', telefone: '(11) 99999-9999',
        endereco: { rua: 'Rua X', numero: '123', bairro: 'Centro', cidade: 'SP', estado: 'SP', cep: '00000-000' }
    },
    produtos: [{ modelo: 'Voltz EVS', cor: 'Preto', quantidade: 2 }],
    transporte: { tipo: 'transportadora', nomeTransportadora: 'ABC', dataPrevista: '2026-05-25' }
}, 5678);

// Tornar visivel temporariamente pra inspecionar
const c = document.getElementById('ordemSeparacaoContent');
c.style.left = '0'; c.style.zIndex = '99999';
```

Expected: documento renderiza com cabecalho "ORDEM DE SEPARAÇÃO", tabela de produtos com checkbox, blocos cliente/endereco/transporte, e linhas de assinatura no rodape. Esconder de volta:

```javascript
c.style.left = '-10000px'; c.style.zIndex = '';
```

- [ ] **Step 4: Commit**

```bash
git add script.js style.css
git commit -m "feat(pj): gerarHTMLOrdemSeparacao + estilos do documento PDF"
```

---

## Task 6: Acoes de copiar, enviar no grupo e imprimir

**Files:**
- Modify: `script.js` (adicionar funcoes apos `gerarHTMLOrdemSeparacao`)

- [ ] **Step 1: Adicionar as tres funcoes de acao simples**

Inserir em `script.js`, apos a `gerarHTMLOrdemSeparacao`:

```javascript
async function copiarOrdemSeparacao() {
    const textarea = document.getElementById('ordemSeparacaoTexto');
    const btn = document.getElementById('btnCopiarSeparacao');
    if (!textarea || !btn) return;

    const texto = textarea.value;

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(texto);
        } else {
            textarea.select();
            document.execCommand('copy');
        }

        const textoOriginal = btn.textContent;
        btn.textContent = 'Copiado!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = textoOriginal;
            btn.classList.remove('copied');
        }, 2000);
    } catch {
        mostrarFeedback('Erro ao copiar. Selecione o texto manualmente.', 'erro');
    }
}

function enviarSeparacaoGrupo() {
    const textarea = document.getElementById('ordemSeparacaoTexto');
    if (!textarea || !textarea.value) {
        mostrarFeedback('Texto da ordem nao disponivel.', 'erro');
        return;
    }
    const url = `https://wa.me/?text=${encodeURIComponent(textarea.value)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    mostrarFeedback('WhatsApp aberto. Escolha o grupo de expedicao.', 'sucesso');
}

function imprimirOrdemSeparacao() {
    if (!ultimaVendaRegistrada) {
        mostrarFeedback('Nenhuma venda registrada.', 'erro');
        return;
    }
    // Renderiza HTML antes de imprimir (garante conteudo atualizado)
    gerarHTMLOrdemSeparacao(ultimaVendaRegistrada, ultimoResultadoBling && ultimoResultadoBling.blingPedidoId);
    document.body.classList.add('print-ordem-separacao');
    window.print();
    // Remove a classe apos o dialog fechar (timeout simples; print eh sincrono em alguns browsers, async em outros)
    setTimeout(() => document.body.classList.remove('print-ordem-separacao'), 500);
}
```

- [ ] **Step 2: Adicionar a regra `@media print` em `style.css`**

Adicionar no final de `style.css`:

```css
@media print {
    body.print-ordem-separacao > *:not(#ordemSeparacaoContent) {
        display: none !important;
    }
    body.print-ordem-separacao #ordemSeparacaoContent {
        position: static !important;
        left: 0 !important;
        display: block !important;
    }
}
```

- [ ] **Step 3: Verificar no navegador**

Pre-condicao: textarea `#ordemSeparacaoTexto` precisa ter conteudo. No DevTools:

```javascript
document.getElementById('ordemSeparacaoTexto').value = 'teste copiar';
copiarOrdemSeparacao();
// Aguardar 1s, checar clipboard
navigator.clipboard.readText().then(v => console.log('clipboard:', v));
// Expected: 'teste copiar'

enviarSeparacaoGrupo();
// Expected: abre nova aba do WhatsApp Web com texto pre-colado
```

Para `imprimirOrdemSeparacao`, simular venda:

```javascript
ultimaVendaRegistrada = {
    dataVenda: '2026-05-22', responsavelVenda: 'João',
    empresa: { razaoSocial: 'X', cnpj: '00.000.000/0001-00', endereco: {} },
    produtos: [{ modelo: 'V', cor: 'P', quantidade: 1 }],
    transporte: { tipo: 'proprio' }
};
ultimoResultadoBling = { blingPedidoId: 5678 };
imprimirOrdemSeparacao();
// Expected: dialog de impressao do navegador mostra APENAS o documento ordem-separacao (nao o wizard nem header)
```

Cancelar o dialog de impressao apos validar.

- [ ] **Step 4: Commit**

```bash
git add script.js style.css
git commit -m "feat(pj): acoes copiar/enviar grupo/imprimir da ordem de separacao"
```

---

## Task 7: Implementar `gerarPDFSeparacao` (jspdf + html2canvas)

**Files:**
- Modify: `script.js` (adicionar funcao apos as acoes anteriores)

- [ ] **Step 1: Adicionar a funcao de geracao de PDF**

Inserir em `script.js`, apos `imprimirOrdemSeparacao`:

```javascript
async function gerarPDFSeparacao() {
    if (!ultimaVendaRegistrada) {
        mostrarFeedback('Nenhuma venda registrada.', 'erro');
        return;
    }
    if (!window.html2canvas || !window.jspdf) {
        mostrarFeedback('Bibliotecas de PDF nao carregadas.', 'erro');
        return;
    }

    const btn = document.getElementById('btnPdfSeparacao');
    const labelOriginal = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }

    try {
        const blingPedidoId = ultimoResultadoBling && ultimoResultadoBling.blingPedidoId;
        const container = gerarHTMLOrdemSeparacao(ultimaVendaRegistrada, blingPedidoId);
        if (!container) {
            mostrarFeedback('Container do PDF nao encontrado.', 'erro');
            return;
        }

        // Tornar visivel para html2canvas conseguir capturar (mantem off-screen)
        const leftAnterior = container.style.left;
        container.style.left = '0';
        container.style.top = '0';
        container.style.zIndex = '-1';

        // Aguarda render
        await new Promise(resolve => setTimeout(resolve, 300));

        const canvas = await window.html2canvas(container, { scale: 2, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = 210;
        const pageHeight = 297;
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (imgHeight <= pageHeight) {
            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        } else {
            // Documento muito longo: dividir em paginas
            let heightLeft = imgHeight;
            let position = 0;
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
        }

        // Nome do arquivo: OC, senao Bling, senao timestamp
        let id = ultimaVendaRegistrada.numeroPedidoOC || blingPedidoId;
        if (!id) {
            const d = new Date();
            id = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
        }
        pdf.save(`ordem-separacao-${id}.pdf`);

        // Restaurar posicao off-screen
        container.style.left = leftAnterior || '-10000px';
        container.style.top = '0';
        container.style.zIndex = '';

        mostrarFeedback('PDF gerado.', 'sucesso');
    } catch (err) {
        console.error('Erro ao gerar PDF:', err);
        mostrarFeedback('Erro ao gerar PDF.', 'erro');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = labelOriginal; }
    }
}
```

- [ ] **Step 2: Verificar no navegador**

DevTools console (simulando venda como na Task 6):

```javascript
ultimaVendaRegistrada = {
    dataVenda: '2026-05-22', numeroPedidoOC: '1234', responsavelVenda: 'João',
    empresa: {
        razaoSocial: 'Teste Ltda', cnpj: '00.000.000/0001-00',
        responsavel: 'Maria', telefone: '(11) 99999-9999',
        endereco: { rua: 'Rua X', numero: '123', bairro: 'Centro', cidade: 'SP', estado: 'SP', cep: '00000-000' }
    },
    produtos: [
        { modelo: 'Voltz EVS', cor: 'Preto', quantidade: 2 },
        { modelo: 'Smart Juna', cor: 'Azul', quantidade: 1 }
    ],
    transporte: { tipo: 'transportadora', nomeTransportadora: 'ABC', dataPrevista: '2026-05-25', observacoes: 'retirar 8h-17h' }
};
ultimoResultadoBling = { blingPedidoId: 5678 };
gerarPDFSeparacao();
// Expected: download de ordem-separacao-1234.pdf
```

Abrir o PDF baixado e validar:
- Layout A4 retrato, 1 pagina
- Titulo "ORDEM DE SEPARAÇÃO" grande
- Tabela de produtos visivel com checkbox, qtd, modelo (caixa alta), cor (caixa alta)
- Bloco de assinaturas no rodape com linhas "Separado por", "Conferido por", "Data/Hora"
- Sem valores monetarios

Testar caso sem OC e sem Bling:

```javascript
ultimaVendaRegistrada.numeroPedidoOC = '';
ultimoResultadoBling = {};
gerarPDFSeparacao();
// Expected: arquivo nomeado ordem-separacao-YYYYMMDDHHMM.pdf
```

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat(pj): gerarPDFSeparacao baixa PDF da ordem (jspdf+html2canvas)"
```

---

## Task 8: Plugar `_preencherPane3Separacao` no `abrirWizardPosVenda`

**Files:**
- Modify: `script.js` (adicionar `_preencherPane3Separacao` proximo ao `_preencherPane2WhatsApp`, e chama-lo dentro de `abrirWizardPosVenda`)

- [ ] **Step 1: Adicionar a funcao de preenchimento da etapa 3**

Adicionar em `script.js`, logo antes de `_preencherPane2WhatsApp` (ou logo apos — manter agrupado):

```javascript
function _preencherPane3Separacao(venda, blingPedidoId) {
    const textarea = document.getElementById('ordemSeparacaoTexto');
    if (textarea) {
        textarea.value = gerarTextoSeparacaoPJ(venda, blingPedidoId);
    }
    // Pre-renderiza o HTML no container oculto (usado por PDF e impressao)
    gerarHTMLOrdemSeparacao(venda, blingPedidoId);
}
```

- [ ] **Step 2: Chamar `_preencherPane3Separacao` dentro de `abrirWizardPosVenda`**

Em `script.js`, no corpo de `abrirWizardPosVenda` (linha ~806-834), apos a chamada `_preencherPane2WhatsApp(...)` na linha 822 e antes do bloco "Passo 3: checklist final" (que vai virar "Passo 4: checklist final"), inserir:

```javascript
    // --- Passo 3: preencher Ordem de Separacao (texto + HTML oculto) ---
    _preencherPane3Separacao(venda, blingPedidoId);
```

Atualizar o comentario do bloco seguinte de `// --- Passo 3: checklist final ---` para `// --- Passo 4: checklist final ---`.

- [ ] **Step 3: Verificar fluxo completo no navegador**

Recarregar a pagina (hard refresh para invalidar SW). Preencher uma venda PJ de teste completa e clicar "Registrar Venda PJ".

Esperado:
- Wizard abre no passo 1 (Status)
- Avancar leva ao passo 2 (WhatsApp)
- Avancar leva ao passo 3 (Separacao) — textarea ja vem preenchida com a ordem sem valores
- Clicar "Copiar Texto" → feedback "Copiado!" e clipboard com a ordem
- Clicar "Enviar no Grupo" → abre WhatsApp Web em nova aba com texto pre-colado
- Clicar "Baixar PDF" → download de `ordem-separacao-<id>.pdf`
- Clicar "Imprimir" → dialog do navegador mostra so o documento da ordem
- Avancar leva ao passo 4 (Finalizar)
- Voltar funciona em todos os passos

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "feat(pj): integra etapa 3 Ordem de Separacao no abrirWizardPosVenda"
```

---

## Task 9: Verificacao end-to-end e bump de versao visivel

**Files:**
- Possible modify: `index.html:20` (label de versao visivel "v1.0")

- [ ] **Step 1: Bumpar o label de versao visivel no header**

Em `index.html:20`, trocar:

```html
                <span class="header-subtitle">Sistema de Vendas PJ · v1.0</span>
```

Por:

```html
                <span class="header-subtitle">Sistema de Vendas PJ · v1.1</span>
```

(O comentario `<!-- NXT Autopropelidos - Form PJ v1.0 | Build: 2026-03-22 -->` em `index.html:2` tambem pode ser atualizado para `v1.1 | Build: 2026-05-22`.)

- [ ] **Step 2: Checklist end-to-end no navegador**

Com hard refresh (Ctrl+Shift+R) ou unregister do SW pelo DevTools → Application → Service Workers. Registrar uma venda PJ real (ou em ambiente de teste se houver) com:
- Cliente PJ com CNPJ valido (ou usar um de teste)
- 2 produtos diferentes (ex: 2x Voltz EVS Preto + 1x Smart Juna Azul)
- Endereco completo
- Transporte: Transportadora "Teste Express" com data prevista e observacao

Validar no wizard:

| Item | Expected |
|------|----------|
| Wizard abre no passo 1 com checklist e resumo COM valores | OK |
| Passo 2 mostra preview da mensagem WhatsApp (se NF-e gerada) | OK |
| Passo 3 mostra textarea com texto SEM valores monetarios | OK |
| Textarea da etapa 3 tem produtos em CAIXA ALTA com qtd em bold | OK |
| Botao "Copiar Texto" copia conteudo da textarea | OK |
| Botao "Enviar no Grupo" abre wa.me sem numero, texto pre-colado | OK |
| Botao "Baixar PDF" baixa `ordem-separacao-<id>.pdf` | OK |
| PDF contem bloco "Separado por / Conferido por" | OK |
| PDF NAO contem nenhum "R$" | OK |
| Botao "Imprimir" abre dialog mostrando apenas o documento | OK |
| Passo 4 (Finalizar) com checklist final + botao "Nova Venda" | OK |
| Voltar funciona em todos os passos | OK |

- [ ] **Step 3: Forcar reload pra todos os clientes via SW**

Confirmar que `service-worker.js:1` esta com `nxt-lojas-cache-v15`. Em DevTools → Application → Service Workers, verificar que apos atualizar o servico, o cache novo e baixado.

- [ ] **Step 4: Commit final**

```bash
git add index.html
git commit -m "chore(pj): bump versao visivel para v1.1 com etapa Separacao"
```

- [ ] **Step 5: Resumo na sessao**

Verificar `git log --oneline -10` e confirmar que existem ~7-8 commits do trabalho:
- chore(pj): bump cache v14->v15 e adiciona jspdf+html2canvas
- feat(pj): adiciona etapa 3 Ordem de Separacao no wizard (HTML)
- feat(pj): wizard suporta 4 passos
- feat(pj): adiciona gerarTextoSeparacaoPJ
- feat(pj): gerarHTMLOrdemSeparacao + estilos
- feat(pj): acoes copiar/enviar/imprimir
- feat(pj): gerarPDFSeparacao
- feat(pj): integra etapa 3 no abrirWizardPosVenda
- chore(pj): bump versao visivel para v1.1

---

## Fora de escopo (NAO implementar nesta plano)

- Integracao com Bling para "marcar como separado"
- Persistencia da ordem em backend / historico
- QR code de rastreio
- Envio automatico pro grupo via API (impossivel com WhatsApp Web)
- Mudar resumo da etapa 1 (continua com valores)

## Pontos de atencao

- `html2canvas` precisa que o container esteja visivel no DOM. A funcao move temporariamente `#ordemSeparacaoContent` de `left: -10000px` para `left: 0` durante a captura, com `z-index: -1` para nao bloquear interacao. Restaura no `finally`.
- `window.print()` da etapa 6 depende da classe `print-ordem-separacao` no body para o CSS `@media print` esconder tudo. A classe e removida via `setTimeout(500ms)` — em alguns browsers `print()` e sincrono e a classe sai antes de o dialog ler o CSS; se isso ocorrer, mover a remocao para o evento `afterprint` (`window.addEventListener('afterprint', ...)`).
- Acentos no nome do arquivo PDF foram evitados (`ordem-separacao-...` sem cedilha) pra compatibilidade com sistemas de arquivos.
- `wizardPassoAtual` ja existia como variavel global; nao precisa de migracao.
