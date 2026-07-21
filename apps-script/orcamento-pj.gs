// Orçamento PJ — backend (Apps Script vinculado à planilha "Orçamentos PJ")
// Conta: nxt.lojas@gmail.com | Pasta: J:\Meu Drive\PJ
// Fonte de verdade deste código: C:\dev\NXT\ativos\form-pj\apps-script\orcamento-pj.gs
// Colar no editor (Extensões → Apps Script), publicar como App da Web
// ("Executar como: eu", "Quem tem acesso: qualquer pessoa"), copiar a URL /exec.
//
// Cabeçalho esperado na linha 1 da aba "Orçamentos" (14 colunas):
// Numero | Data | Validade | Status | DataConversao | CNPJ | RazaoSocial |
// Contato | Vendedor | Itens | Total | Condicoes | PdfUrl | NumeroPedido

var ABA = 'Orçamentos';
var PASTA_PDF_NOME = 'PDFs';
var VERSAO = 'orc-pj-1';
var TZ = 'America/Sao_Paulo';

// ---------------------------------------------------------------- roteadores

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  switch (action) {
    case 'ping':   return jsonResponse({ sucesso: true, versao: VERSAO });
    case 'listar': return jsonResponse(listarOrcamentos(
                     (e.parameter.busca || ''), (e.parameter.status || '')));
    case 'buscar': return jsonResponse(buscarOrcamento(e.parameter.numero || ''));
    case 'pdf':    return jsonResponse(gerarPdfOrcamento(e.parameter.numero || ''));
    default:       return jsonResponse({ sucesso: false, erro: 'action desconhecida: ' + action });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return jsonResponse({ sucesso: false, erro: 'JSON inválido' }); }
  switch (body.action) {
    case 'salvar':    return jsonResponse(salvarOrcamento(body));
    case 'converter': return jsonResponse(atualizarStatusOrcamento(body.numero, 'convertido', body.numeroPedido));
    case 'cancelar':  return jsonResponse(atualizarStatusOrcamento(body.numero, 'cancelado', ''));
    default:          return jsonResponse({ sucesso: false, erro: 'action desconhecida: ' + body.action });
  }
}

// ---------------------------------------------------------------- helpers

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- salvar

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
  var hoje = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy');
  sheet.appendRow([
    numero, hoje, d.validade || '', 'pendente', '',
    emp.cnpj || '', emp.razaoSocial || '', contato, d.vendedor || '',
    JSON.stringify(d.itens || []), d.total || 0,
    JSON.stringify(d.condicoes || {}), '', ''
  ]);
  return { sucesso: true, numero: numero };
}

// ---------------------------------------------------------------- listar / buscar

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

// ---------------------------------------------------------------- status

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
        Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm')); // DataConversao
      sheet.getRange(linha, 14).setValue(numeroPedido || '');      // NumeroPedido
    }
    return { sucesso:true };
  }
  return { sucesso:false, erro:'orcamento nao encontrado' };
}

// ---------------------------------------------------------------- PDF

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
  var sheet = getSheet(); var vv = sheet.getDataRange().getValues();
  for (var i = 1; i < vv.length; i++) {
    if (String(vv[i][0]) === numero) { sheet.getRange(i + 1, 13).setValue(arquivo.getUrl()); break; }
  }
  return { sucesso:true, pdfUrl: arquivo.getUrl() };
}
