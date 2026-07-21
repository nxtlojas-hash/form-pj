# Orçamento PJ que vira venda — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao form-pj a capacidade de salvar um orçamento (sem disparar venda), listá-lo, recarregá-lo editável e convertê-lo em venda usando o fluxo que já existe.

**Architecture:** Backend novo em Google Apps Script (Web App) ligado a uma planilha em `J:\Meu Drive\PJ\`, espelhando o padrão do SAC (`sac-pecas/google-apps-script.js`). O form-pj chama o backend por `fetch` (mesma forma da chamada Bling). O orçamento não toca em Bling/estoque/NF; só a conversão dispara o `registrarVenda` atual.

**Tech Stack:** HTML/CSS/JS vanilla (form-pj), Google Apps Script + Google Sheets + Drive (backend), deploy Cloud Run (form-pj) e Web App (Apps Script).

## ESTADO — Tasks 1-4 CONCLUÍDAS e verificadas ao vivo (21/07)

- **ORCAMENTO_URL** = `https://script.google.com/macros/s/AKfycbw5sTuN3YZjxJolYJLik25QvaX5paDJ67vsmnuVhWSBMIs2KwfJU5nNgM4rLLVO73Qy/exec`
- Planilha `Orçamentos PJ` em `J:\Meu Drive\PJ` (conta nxt.lojas), aba `Orçamentos`, 14 colunas, subpasta `PDFs`.
- Verificado por fetch da origem real do form-pj: ping ✓, salvar ✓ (ORC-2026-001..003), listar ✓, buscar ✓, datas dd/MM/yyyy ✓.
- ⚠️ **ACHADO CRÍTICO (frontend):** o fetch DEVE usar `Content-Type: text/plain;charset=utf-8` — `application/json` dispara preflight CORS que o Apps Script NÃO responde (quebra silenciosa). O servidor faz `JSON.parse` do corpo de qualquer forma.
- Pendente: apagar as 3 linhas de teste (Teste LTDA) da planilha antes do encerramento.

## Global Constraints

- **Conta Google:** `nxt.lojas@gmail.com` — pasta PJ, planilha, Apps Script e PDFs todos sob ela.
- **Armazenamento:** `J:\Meu Drive\PJ\` (raiz do Drive), separado de qualquer pasta do SAC.
- **Numeração:** `ORC-2026-NNN` sequencial, sem furos nem repetição.
- **Dois relógios:** salvar/editar orçamento NÃO dispara Bling, planilha de vendas, estoque nem NF. Só "Converter" dispara, e apenas em caso de sucesso marca `convertido`.
- **Sem framework de teste no repo:** verificação é por `curl` (backend) e navegador (frontend), não jest/pytest. É o padrão real do codebase.
- **Deploy do form-pj:** editar em `C:\dev\NXT\ativos\form-pj` → `git commit` + `push` → deploy Cloud Run. Nunca no ar direto (Cloud Run builda da pasta local).
- **Deploy do Apps Script:** colar o código no editor em script.google.com sob `nxt.lojas@gmail.com` → Implantar como Web App ("Executar como: eu", "Quem tem acesso: qualquer pessoa") → copiar a URL `/exec`.

## File Structure

- `apps-script/orcamento-pj.gs` (novo, no repo, fonte de verdade do backend) — todo o Apps Script: `doGet`/`doPost`, `salvarOrcamento`, `listarOrcamentos`, `buscarOrcamento`, `atualizarStatusOrcamento`, `gerarPdfOrcamento`, helpers. É colado no editor do Google.
- `orcamento.js` (novo) — lógica de orçamento no form: salvar, listar, recarregar, converter. Isola do `script.js`.
- `index.html` (modificar) — botão "Salvar como orçamento", aba "Meus orçamentos".
- `script.js` (modificar) — expor o `venda` montado por `registrarVenda` para reuso na conversão; ponto de gancho pós-venda para marcar `convertido`.

---

## Task 1: Backend — esqueleto do Apps Script + planilha

**Files:**
- Create: `apps-script/orcamento-pj.gs`
- Manual (Google): planilha `Orçamentos PJ` em `J:\Meu Drive\PJ\` + Apps Script vinculado, sob `nxt.lojas@gmail.com`

**Interfaces:**
- Produces: URL do Web App (`.../exec`); endpoint `doGet(?action=ping)` → `{sucesso:true, versao:"orc-pj-1"}`; aba `Orçamentos` com cabeçalho de 14 colunas.

- [ ] **Step 1: Criar a pasta e a planilha (manual, no navegador logado como nxt.lojas@gmail.com)**

1. No Drive, na raiz, criar pasta `PJ` e dentro dela a subpasta `PDFs`.
2. Dentro de `PJ`, criar uma planilha Google chamada `Orçamentos PJ`.
3. Renomear a primeira aba para `Orçamentos`.
4. Na linha 1, colar o cabeçalho (uma célula por coluna):
   `Numero | Data | Validade | Status | DataConversao | CNPJ | RazaoSocial | Contato | Vendedor | Itens | Total | Condicoes | PdfUrl | NumeroPedido`

- [ ] **Step 2: Escrever o esqueleto do Apps Script no repo**

Criar `apps-script/orcamento-pj.gs`:

```javascript
// Orçamento PJ — backend (Apps Script vinculado à planilha "Orçamentos PJ")
// Conta: nxt.lojas@gmail.com | Pasta: J:\Meu Drive\PJ
var ABA = 'Orçamentos';
var PASTA_PDF_NOME = 'PDFs';
var VERSAO = 'orc-pj-1';

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  switch (action) {
    case 'ping':
      return jsonResponse({ sucesso: true, versao: VERSAO });
    case 'listar':
      return jsonResponse(listarOrcamentos(
        (e.parameter.busca || ''), (e.parameter.status || '')));
    case 'buscar':
      return jsonResponse(buscarOrcamento(e.parameter.numero || ''));
    case 'pdf':
      return jsonResponse(gerarPdfOrcamento(e.parameter.numero || ''));
    default:
      return jsonResponse({ sucesso: false, erro: 'action desconhecida: ' + action });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return jsonResponse({ sucesso: false, erro: 'JSON inválido' }); }
  switch (body.action) {
    case 'salvar':
      return jsonResponse(salvarOrcamento(body));
    case 'converter':
      return jsonResponse(atualizarStatusOrcamento(body.numero, 'convertido', body.numeroPedido));
    case 'cancelar':
      return jsonResponse(atualizarStatusOrcamento(body.numero, 'cancelado', ''));
    default:
      return jsonResponse({ sucesso: false, erro: 'action desconhecida: ' + body.action });
  }
}

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// stubs preenchidos nas próximas tasks
function salvarOrcamento(d) { return { sucesso: false, erro: 'nao implementado' }; }
function listarOrcamentos(busca, status) { return { sucesso: true, orcamentos: [] }; }
function buscarOrcamento(n) { return { sucesso: false, erro: 'nao implementado' }; }
function atualizarStatusOrcamento(n, s, ped) { return { sucesso: false, erro: 'nao implementado' }; }
function gerarPdfOrcamento(n) { return { sucesso: false, erro: 'nao implementado' }; }
```

- [ ] **Step 3: Colar no editor e publicar (manual)**

1. Na planilha `Orçamentos PJ` → Extensões → Apps Script.
2. Apagar o conteúdo padrão, colar o `orcamento-pj.gs` inteiro, salvar.
3. Implantar → Nova implantação → tipo "App da Web" → Executar como **eu (nxt.lojas)**, Acesso **qualquer pessoa** → Implantar.
4. Copiar a URL `/exec` e guardar (será a constante `ORCAMENTO_URL` no form).

- [ ] **Step 4: Verificar o ping**

Run: `curl -s "<URL_EXEC>?action=ping"`
Expected: `{"sucesso":true,"versao":"orc-pj-1"}`

- [ ] **Step 5: Commit**

```bash
git add apps-script/orcamento-pj.gs
git commit -m "feat(orcamento): esqueleto do Apps Script + planilha PJ"
```

---

## Task 2: Backend — salvar orçamento com numeração sequencial

**Files:**
- Modify: `apps-script/orcamento-pj.gs` (funções `salvarOrcamento`, `proximoNumero`)

**Interfaces:**
- Consumes: `getSheet()`, cabeçalho de 14 colunas da Task 1.
- Produces: `salvarOrcamento(body)` → `{sucesso:true, numero:"ORC-2026-001"}`. Payload esperado: `{action:"salvar", empresa:{cnpj,razaoSocial,responsavel,telefone,email}, vendedor, itens:[{modelo,cor,qtd,precoUnit,subtotal}], total, condicoes:{pagamento,transporte,observacoes}, validade}`.

- [ ] **Step 1: Implementar `proximoNumero` e `salvarOrcamento`**

Substituir os stubs correspondentes:

```javascript
function proximoNumero() {
  var sheet = getSheet();
  var valores = sheet.getDataRange().getValues();
  var ano = new Date().getFullYear();
  var maior = 0;
  for (var i = 1; i < valores.length; i++) {
    var num = String(valores[i][0] || '');
    var m = num.match(/^ORC-(\d{4})-(\d+)$/);
    if (m && m[1] == String(ano)) maior = Math.max(maior, parseInt(m[2], 10));
  }
  var seq = ('000' + (maior + 1)).slice(-3);
  return 'ORC-' + ano + '-' + seq;
}

function salvarOrcamento(d) {
  var sheet = getSheet();
  var numero = proximoNumero();
  var emp = d.empresa || {};
  var contato = [emp.responsavel, emp.telefone, emp.email].filter(function (x){return x;}).join(' · ');
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
  sheet.appendRow([
    numero, hoje, d.validade || '', 'pendente', '',
    emp.cnpj || '', emp.razaoSocial || '', contato, d.vendedor || '',
    JSON.stringify(d.itens || []), d.total || 0,
    JSON.stringify(d.condicoes || {}), '', ''
  ]);
  return { sucesso: true, numero: numero };
}
```

- [ ] **Step 2: Republicar (Implantar → Gerenciar implantações → editar → Nova versão)**

Sempre que o `.gs` muda, é preciso publicar nova versão para o `/exec` refletir.

- [ ] **Step 3: Verificar salvar**

Run:
```bash
curl -s -X POST "<URL_EXEC>" -H "Content-Type: application/json" \
  -d '{"action":"salvar","empresa":{"cnpj":"11.111.111/0001-11","razaoSocial":"Teste LTDA","responsavel":"Ana","telefone":"11999","email":"a@x.com"},"vendedor":"Beto","itens":[{"modelo":"Kay","cor":"Preto","qtd":10,"precoUnit":7990,"subtotal":79900}],"total":79900,"condicoes":{"pagamento":"PIX","transporte":"Próprio","observacoes":""},"validade":"31/07/2026"}'
```
Expected: `{"sucesso":true,"numero":"ORC-2026-001"}` e uma linha nova na planilha.

- [ ] **Step 4: Verificar que NÃO disparou venda**

Confirmar no Bling que nenhum pedido novo foi criado (o salvar não chama Bling). Critério de aceite 1.

- [ ] **Step 5: Commit**

```bash
git add apps-script/orcamento-pj.gs
git commit -m "feat(orcamento): salvar com numeracao ORC-2026-NNN"
```

---

## Task 3: Backend — listar e buscar

**Files:**
- Modify: `apps-script/orcamento-pj.gs` (`listarOrcamentos`, `buscarOrcamento`)

**Interfaces:**
- Produces:
  - `listarOrcamentos(busca, status)` → `{sucesso:true, orcamentos:[{numero,data,status,razaoSocial,total,validade}]}` (mais novos primeiro).
  - `buscarOrcamento(numero)` → `{sucesso:true, orcamento:{numero,data,validade,status,empresa:{cnpj,razaoSocial,responsavel,telefone,email}, vendedor, itens:[...], total, condicoes:{...}, pdfUrl, numeroPedido}}`.

- [ ] **Step 1: Implementar as duas funções**

```javascript
function _linhaParaResumo(r) {
  return { numero:String(r[0]), data:String(r[1]||''), status:String(r[3]||'pendente'),
           razaoSocial:String(r[6]||''), total:parseFloat(r[10])||0, validade:String(r[2]||'') };
}

function listarOrcamentos(busca, status) {
  var sheet = getSheet();
  var v = sheet.getDataRange().getValues();
  var out = [];
  busca = (busca || '').toLowerCase();
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!r[0]) continue;
    if (status && String(r[3]) !== status) continue;
    if (busca && String(r[6]).toLowerCase().indexOf(busca) === -1
             && String(r[0]).toLowerCase().indexOf(busca) === -1) continue;
    out.push(_linhaParaResumo(r));
  }
  out.reverse();
  return { sucesso: true, orcamentos: out };
}

function buscarOrcamento(numero) {
  if (!numero) return { sucesso:false, erro:'numero nao informado' };
  var sheet = getSheet();
  var v = sheet.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (String(r[0]) !== numero) continue;
    var contato = String(r[7]||'').split(' · ');
    var itens = []; var cond = {};
    try { itens = JSON.parse(r[9] || '[]'); } catch (e) {}
    try { cond = JSON.parse(r[11] || '{}'); } catch (e) {}
    return { sucesso:true, orcamento:{
      numero:String(r[0]), data:String(r[1]||''), validade:String(r[2]||''),
      status:String(r[3]||'pendente'),
      empresa:{ cnpj:String(r[5]||''), razaoSocial:String(r[6]||''),
                responsavel:contato[0]||'', telefone:contato[1]||'', email:contato[2]||'' },
      vendedor:String(r[8]||''), itens:itens, total:parseFloat(r[10])||0,
      condicoes:cond, pdfUrl:String(r[12]||''), numeroPedido:String(r[13]||'') }};
  }
  return { sucesso:false, erro:'orcamento nao encontrado' };
}
```

- [ ] **Step 2: Republicar (nova versão)**

- [ ] **Step 3: Verificar listar e buscar**

Run: `curl -s "<URL_EXEC>?action=listar&status=pendente"`
Expected: contém `"numero":"ORC-2026-001"` e `"razaoSocial":"Teste LTDA"`.

Run: `curl -s "<URL_EXEC>?action=buscar&numero=ORC-2026-001"`
Expected: `orcamento.empresa.razaoSocial == "Teste LTDA"` e `itens[0].modelo == "Kay"`.

- [ ] **Step 4: Commit**

```bash
git add apps-script/orcamento-pj.gs
git commit -m "feat(orcamento): listar e buscar"
```

---

## Task 4: Backend — PDF e status (converter/cancelar)

**Files:**
- Modify: `apps-script/orcamento-pj.gs` (`gerarPdfOrcamento`, `atualizarStatusOrcamento`)

**Interfaces:**
- Produces:
  - `gerarPdfOrcamento(numero)` → `{sucesso:true, pdfUrl:"https://drive..."}`; grava o link na coluna PdfUrl.
  - `atualizarStatusOrcamento(numero, status, numeroPedido)` → `{sucesso:true}`; grava DataConversao e NumeroPedido quando `status=convertido`; bloqueia se já `convertido`.

- [ ] **Step 1: Implementar status**

```javascript
function atualizarStatusOrcamento(numero, novoStatus, numeroPedido) {
  var sheet = getSheet();
  var v = sheet.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) !== numero) continue;
    if (String(v[i][3]) === 'convertido')
      return { sucesso:false, erro:'orcamento ja convertido' };
    var linha = i + 1;
    sheet.getRange(linha, 4).setValue(novoStatus);       // Status
    if (novoStatus === 'convertido') {
      sheet.getRange(linha, 5).setValue(
        Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm')); // DataConversao
      sheet.getRange(linha, 14).setValue(numeroPedido || '');  // NumeroPedido
    }
    return { sucesso:true };
  }
  return { sucesso:false, erro:'orcamento nao encontrado' };
}
```

- [ ] **Step 2: Implementar PDF (HTML → PDF no Drive, pasta PJ\PDFs)**

```javascript
function gerarPdfOrcamento(numero) {
  var res = buscarOrcamento(numero);
  if (!res.sucesso) return res;
  var o = res.orcamento;
  var linhas = (o.itens || []).map(function (it) {
    return '<tr><td>' + it.modelo + ' ' + it.cor + '</td><td>' + it.qtd +
      '</td><td>R$ ' + it.precoUnit + '</td><td>R$ ' + it.subtotal + '</td></tr>';
  }).join('');
  var html = '<h2>Orçamento ' + o.numero + '</h2>' +
    '<p><b>' + o.empresa.razaoSocial + '</b> — ' + o.empresa.cnpj + '<br>' +
    'Validade: ' + o.validade + '</p>' +
    '<table border="1" cellpadding="6" style="border-collapse:collapse">' +
    '<tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th></tr>' +
    linhas + '</table><h3>Total: R$ ' + o.total + '</h3>';
  var blob = Utilities.newBlob(html, 'text/html', numero + '.html').getAs('application/pdf');
  blob.setName('Orcamento_' + numero + '.pdf');
  var pastaPJ = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId())
                        .getParents().next();
  var pastaPDF = pastaPJ.getFoldersByName(PASTA_PDF_NOME);
  var destino = pastaPDF.hasNext() ? pastaPDF.next() : pastaPJ.createFolder(PASTA_PDF_NOME);
  var arquivo = destino.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // grava o link
  var sheet = getSheet(); var vv = sheet.getDataRange().getValues();
  for (var i = 1; i < vv.length; i++) {
    if (String(vv[i][0]) === numero) { sheet.getRange(i + 1, 13).setValue(arquivo.getUrl()); break; }
  }
  return { sucesso:true, pdfUrl: arquivo.getUrl() };
}
```

- [ ] **Step 3: Republicar (nova versão)**

- [ ] **Step 4: Verificar PDF e conversão**

Run: `curl -s "<URL_EXEC>?action=pdf&numero=ORC-2026-001"`
Expected: `sucesso:true` e um `pdfUrl` que abre um PDF na pasta `PJ\PDFs`.

Run: `curl -s -X POST "<URL_EXEC>" -H "Content-Type: application/json" -d '{"action":"converter","numero":"ORC-2026-001","numeroPedido":"TESTE-123"}'`
Expected: `sucesso:true`; a linha vira `convertido` com data e `TESTE-123`.
Repetir a mesma chamada → Expected: `{"sucesso":false,"erro":"orcamento ja convertido"}` (caso de borda).

- [ ] **Step 5: Commit**

```bash
git add apps-script/orcamento-pj.gs
git commit -m "feat(orcamento): PDF no Drive + status converter/cancelar"
```

---

## Task 5: Frontend — módulo orcamento.js + botão "Salvar como orçamento"

**Files:**
- Create: `orcamento.js`
- Modify: `index.html` (incluir `<script src="orcamento.js">` e o botão), `script.js` (expor `montarVenda()` reutilizável)

**Interfaces:**
- Consumes: os IDs de campo do form (`cnpjEmpresa`, `razaoSocial`, `responsavelCompra`, `telefoneEmpresa`, `emailEmpresa`, `responsavelVenda`, ...), o array global `produtosDaVenda`, o endpoint `ORCAMENTO_URL`.
- Produces: `window.montarOrcamentoPayload()`, `window.salvarComoOrcamento()`.

- [ ] **Step 1: Refatorar `registrarVenda` para expor a montagem do objeto**

Em `script.js`, extrair a construção do objeto `venda` (linhas ~641+) para uma função `montarVenda()` que `registrarVenda` passa a chamar. Isso permite reusar a mesma coleta de campos no orçamento. Não muda comportamento — só isola.

```javascript
function montarVenda() {
  const totalProdutos = produtosDaVenda.reduce((acc, p) => acc + p.subtotal, 0);
  const frete = obterValorNumerico('valorFrete');
  return {
    responsavelVenda: document.getElementById('responsavelVenda').value.trim(),
    dataVenda: document.getElementById('dataVenda').value,
    numeroPedidoOC: document.getElementById('numeroPedidoOC').value.trim(),
    empresa: {
      cnpj: document.getElementById('cnpjEmpresa').value.trim(),
      razaoSocial: document.getElementById('razaoSocial').value.trim(),
      nomeFantasia: document.getElementById('nomeFantasia').value.trim(),
      inscricaoEstadual: document.getElementById('inscricaoEstadual').value.trim(),
      ieIsento: document.getElementById('ieIsentoCheck').checked,
      responsavel: document.getElementById('responsavelCompra').value.trim(),
      cargoResponsavel: document.getElementById('cargoResponsavel').value.trim(),
      telefone: document.getElementById('telefoneEmpresa').value.trim(),
      email: document.getElementById('emailEmpresa').value.trim(),
      endereco: {
        cep: document.getElementById('cepEmpresa').value.trim(),
        rua: document.getElementById('ruaEmpresa').value.trim(),
        numero: document.getElementById('numeroEmpresa').value.trim(),
        bairro: document.getElementById('bairroEmpresa').value.trim(),
        cidade: document.getElementById('cidadeEmpresa').value.trim(),
        estado: document.getElementById('estadoEmpresa').value
      }
    },
    produtos: produtosDaVenda.map(p => ({ modelo:p.modelo, cor:p.cor, quantidade:p.quantidade, precoUnitario:p.precoUnitario, subtotal:p.subtotal })),
    totalProdutos, frete
  };
}
```
E em `registrarVenda`, trocar o bloco `const venda = {...}` por `const venda = montarVenda();`.

- [ ] **Step 2: Criar `orcamento.js` com salvar**

```javascript
const ORCAMENTO_URL = '<URL_EXEC>'; // da Task 1

function montarOrcamentoPayload() {
  const v = montarVenda();
  return {
    action: 'salvar',
    empresa: {
      cnpj: v.empresa.cnpj, razaoSocial: v.empresa.razaoSocial,
      responsavel: v.empresa.responsavel, telefone: v.empresa.telefone, email: v.empresa.email
    },
    vendedor: v.responsavelVenda,
    itens: v.produtos.map(p => ({ modelo:p.modelo, cor:p.cor, qtd:p.quantidade, precoUnit:p.precoUnitario, subtotal:p.subtotal })),
    total: v.produtos.reduce((a,p)=>a+p.subtotal,0),
    condicoes: {
      pagamento: [...document.querySelectorAll('input[name="pagamento"]:checked')].map(e=>e.value).join(', '),
      transporte: document.getElementById('tipoTransporte').value,
      observacoes: (document.getElementById('observacoesGerais')||{value:''}).value.trim()
    },
    validade: (document.getElementById('validadeOrcamento')||{value:''}).value
  };
}

async function salvarComoOrcamento() {
  if (produtosDaVenda.length === 0) { mostrarFeedback('Adicione ao menos um produto', 'erro'); return; }
  try {
    const res = await fetch(ORCAMENTO_URL, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(montarOrcamentoPayload())
    });
    const data = await res.json();
    if (data.sucesso) {
      mostrarFeedback('Orçamento salvo: ' + data.numero, 'sucesso');
      gerarEEnviarProposta(data.numero);
    } else mostrarFeedback('Erro: ' + (data.erro||'desconhecido'), 'erro');
  } catch (e) { mostrarFeedback('Falha de rede ao salvar orçamento', 'erro'); }
}

// Gera o PDF no Drive e oferece enviar ao cliente por WhatsApp (spec §7).
// Reaproveita o número/telefone do cliente já no form.
async function gerarEEnviarProposta(numero) {
  try {
    const res = await fetch(ORCAMENTO_URL + '?action=pdf&numero=' + encodeURIComponent(numero));
    const data = await res.json();
    if (!data.sucesso || !data.pdfUrl) return;
    const tel = document.getElementById('telefoneEmpresa').value.replace(/\D/g,'');
    const texto = encodeURIComponent('Segue a proposta ' + numero + ': ' + data.pdfUrl);
    const link = 'https://wa.me/55' + tel + '?text=' + texto;
    if (confirm('Orçamento ' + numero + ' salvo. Enviar a proposta ao cliente por WhatsApp?'))
      window.open(link, '_blank');
  } catch (e) { console.warn('PDF/WhatsApp da proposta falhou', e); }
}
window.salvarComoOrcamento = salvarComoOrcamento;
window.montarOrcamentoPayload = montarOrcamentoPayload;
window.gerarEEnviarProposta = gerarEEnviarProposta;
```

- [ ] **Step 3: Adicionar o botão e o script no `index.html`**

Perto do botão de finalizar venda, adicionar o botão e o campo de validade (coluna da spec;
`observacoesGerais` já existe em index.html:576, não recriar):
```html
<label>Validade da proposta <input type="date" id="validadeOrcamento"></label>
<button type="button" class="btn-orcamento" onclick="salvarComoOrcamento()">Salvar como orçamento</button>
```
E antes de `</body>`, depois de `script.js`:
```html
<script src="orcamento.js"></script>
```

- [ ] **Step 4: Bumpar o cache do service worker**

Em `service-worker.js`, subir o `CACHE_NAME` (ex.: `v-N` → `v-N+1`) para os clientes pegarem o `orcamento.js` novo.

- [ ] **Step 5: Verificar no navegador (local ou após deploy)**

Preencher o form, clicar "Salvar como orçamento" → feedback com número; a planilha ganha a linha; o Bling **não** ganha pedido.

- [ ] **Step 6: Commit**

```bash
git add orcamento.js index.html script.js service-worker.js
git commit -m "feat(orcamento): botao salvar + montarVenda reutilizavel"
```

---

## Task 6: Frontend — aba "Meus orçamentos" (listar + recarregar editável)

**Files:**
- Modify: `index.html` (aba/painel "Meus orçamentos"), `orcamento.js` (listar, recarregar)

**Interfaces:**
- Consumes: `ORCAMENTO_URL`, `buscarOrcamento`/`listar` do backend, os IDs de campo do form, `produtosDaVenda` e a função que redesenha a lista de produtos (`renderProdutos()` ou equivalente — usar a que já existe).
- Produces: `window.abrirMeusOrcamentos()`, `window.recarregarOrcamento(numero)`.

- [ ] **Step 1: Painel no HTML**

```html
<div id="painelOrcamentos" style="display:none">
  <input id="buscaOrcamento" placeholder="Buscar por empresa ou número" oninput="abrirMeusOrcamentos()">
  <ul id="listaOrcamentos"></ul>
</div>
<button type="button" onclick="abrirMeusOrcamentos()">Meus orçamentos</button>
```

- [ ] **Step 2: Listar e recarregar no `orcamento.js`**

```javascript
async function abrirMeusOrcamentos() {
  document.getElementById('painelOrcamentos').style.display = 'block';
  const busca = (document.getElementById('buscaOrcamento')||{value:''}).value;
  const res = await fetch(ORCAMENTO_URL + '?action=listar&status=pendente&busca=' + encodeURIComponent(busca));
  const data = await res.json();
  const ul = document.getElementById('listaOrcamentos'); ul.innerHTML = '';
  (data.orcamentos||[]).forEach(o => {
    const li = document.createElement('li');
    li.innerHTML = o.numero + ' — ' + o.razaoSocial + ' — R$ ' + o.total + ' (val. ' + o.validade + ')';
    li.style.cursor = 'pointer';
    li.onclick = () => recarregarOrcamento(o.numero);
    ul.appendChild(li);
  });
}

async function recarregarOrcamento(numero) {
  const res = await fetch(ORCAMENTO_URL + '?action=buscar&numero=' + encodeURIComponent(numero));
  const data = await res.json();
  if (!data.sucesso) { mostrarFeedback(data.erro||'nao encontrado', 'erro'); return; }
  const o = data.orcamento;
  document.getElementById('cnpjEmpresa').value = o.empresa.cnpj;
  document.getElementById('razaoSocial').value = o.empresa.razaoSocial;
  document.getElementById('responsavelCompra').value = o.empresa.responsavel;
  document.getElementById('telefoneEmpresa').value = o.empresa.telefone;
  document.getElementById('emailEmpresa').value = o.empresa.email;
  document.getElementById('responsavelVenda').value = o.vendedor;
  produtosDaVenda.length = 0;
  o.itens.forEach(it => produtosDaVenda.push({ modelo:it.modelo, cor:it.cor, quantidade:it.qtd, precoUnitario:it.precoUnit, subtotal:it.subtotal }));
  if (typeof atualizarListaProdutosUI === 'function') atualizarListaProdutosUI();
  if (o.validade) {
    const [d,m,a] = o.validade.split('/');
    const venc = new Date(a, (m||1)-1, d||1);
    if (venc < new Date()) mostrarFeedback('Proposta vencida (validade ' + o.validade + ') — confirme antes de converter', 'aviso');
  }
  window.orcamentoCarregado = numero;   // marca para a conversão (Task 7)
  document.getElementById('painelOrcamentos').style.display = 'none';
  mostrarFeedback('Orçamento ' + numero + ' carregado — edite e converta', 'sucesso');
}
window.abrirMeusOrcamentos = abrirMeusOrcamentos;
window.recarregarOrcamento = recarregarOrcamento;
```

> `atualizarListaProdutosUI()` (script.js:377) é a função real que desenha `listaProdutosVenda` — já confirmada.

- [ ] **Step 3: Bumpar cache do service worker**

- [ ] **Step 4: Verificar no navegador**

"Meus orçamentos" lista o ORC-2026-001; clicar recarrega o form com Teste LTDA e o Kay x10; os campos são editáveis.

- [ ] **Step 5: Commit**

```bash
git add index.html orcamento.js service-worker.js
git commit -m "feat(orcamento): aba Meus orcamentos + recarregar editavel"
```

---

## Task 7: Frontend — converter em venda (reusa registrarVenda + marca status)

**Files:**
- Modify: `script.js` (gancho pós-venda), `orcamento.js` (marcar convertido)

**Interfaces:**
- Consumes: `window.orcamentoCarregado` (Task 6), o resultado da venda (nº do pedido Bling) que `registrarVenda` já obtém, `ORCAMENTO_URL`.
- Produces: após uma venda bem-sucedida originada de um orçamento, POST `converter` marca `convertido` com o nº do pedido.

- [ ] **Step 1: Gancho pós-venda no `script.js`**

No fim do fluxo de sucesso de `registrarVenda` (onde já se tem o `blingPedidoId`/nº do pedido), adicionar:
```javascript
if (window.orcamentoCarregado && typeof marcarOrcamentoConvertido === 'function') {
  marcarOrcamentoConvertido(window.orcamentoCarregado, blingPedidoId || '');
  window.orcamentoCarregado = null;
}
```
(Usar o nome real da variável do pedido Bling que a função já produz.)

- [ ] **Step 2: `marcarOrcamentoConvertido` no `orcamento.js`**

```javascript
async function marcarOrcamentoConvertido(numero, numeroPedido) {
  try {
    await fetch(ORCAMENTO_URL, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ action:'converter', numero:numero, numeroPedido:numeroPedido })
    });
  } catch (e) { console.warn('Falha ao marcar orcamento convertido', e); }
}
window.marcarOrcamentoConvertido = marcarOrcamentoConvertido;
```

> A venda dispara pelo botão **Finalizar venda** que já existe. Não há botão "Converter" separado: recarregar o orçamento preenche o form, e "Finalizar venda" fecha a venda; o gancho marca o orçamento. Se preferir um rótulo "Converter em venda" quando um orçamento está carregado, trocar o texto do botão via JS quando `window.orcamentoCarregado` estiver setado (cosmético).

- [ ] **Step 3: Bumpar cache do service worker**

- [ ] **Step 4: Verificar o ciclo completo no navegador**

Recarregar ORC-2026-001 → editar o preço → Finalizar venda → confirmar: pedido criado no Bling **com os valores editados**; a linha do orçamento vira `convertido` com o nº do pedido; tentar converter de novo → bloqueado.

- [ ] **Step 5: Commit**

```bash
git add script.js orcamento.js service-worker.js
git commit -m "feat(orcamento): conversao marca status apos venda bem-sucedida"
```

---

## Task 8: Deploy e verificação de aceite ponta a ponta

**Files:**
- Nenhum novo — deploy do form-pj (Cloud Run) e verificação.

- [ ] **Step 1: Push e deploy do form-pj**

```bash
cd C:/dev/NXT/ativos/form-pj
git push
```
Depois o deploy Cloud Run (comando/procedimento do projeto — `plataforma-nxt-99c15`, southamerica-east1). Verificar a revisão nova no ar.

- [ ] **Step 2: Rodar os 6 critérios de aceite da spec, no ar**

1. Salvar orçamento → planilha ganha linha, Bling **sem** pedido novo.
2. "Meus orçamentos" lista e recarrega editável.
3. Editar e converter usa os valores da tela.
4. Converter roda a venda e só então marca `convertido`.
5. Dados em `J:\Meu Drive\PJ\`, fora do SAC.
6. Numeração sequencial (criar 2-3, conferir 001/002/003 sem furos).

- [ ] **Step 3: Apagar os orçamentos de teste da planilha**

Remover as linhas de teste (`Teste LTDA`, `TESTE-123`) para não sujar a base real.

- [ ] **Step 4: Atualizar o painel e a memória**

- No `PAINEL-NXT.md`: mover "orçamento PJ" da Caixa de Entrada para concluído, com a URL do Web App e a localização da planilha.
- Rodar `py C:/dev/NXT/atualizar-painel.py`.
- Atualizar a memória do form-pj com a URL `ORCAMENTO_URL` e o caminho `J:\Meu Drive\PJ`.

- [ ] **Step 5: Commit final**

```bash
cd C:/dev/NXT && git add PAINEL-NXT.md && git commit -m "docs(painel): orcamento PJ no ar" && git push
```

---

## Notas de verificação (padrão do codebase, não há jest/pytest)

- **Backend:** cada task verifica por `curl` com JSON esperado — é o teste real do Apps Script.
- **Frontend:** verificação no navegador (o form é vanilla, sem harness). Onde possível, testar local antes do deploy.
- **Dois relógios:** o critério mais importante é "salvar orçamento não cria pedido no Bling". Conferir isso explicitamente na Task 2 Step 4 e na Task 8.
- **Falha silenciosa:** se `curl` do `ping` falhar após republicar, quase sempre é implantação não atualizada (esqueceu "Nova versão") ou acesso não "qualquer pessoa". Conferir antes de suspeitar do código.
