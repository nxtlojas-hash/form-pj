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
var LOGO_B64 = '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';

// Roda UMA vez a partir do editor: renomeia a planilha, nomeia a aba e
// escreve o cabeçalho de 14 colunas. Idempotente (pode rodar de novo sem estragar).
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename('Orçamentos PJ');
  var sheet = ss.getSheets()[0];
  if (sheet.getName() !== ABA) sheet.setName(ABA);
  var header = ['Numero','Data','Validade','Status','DataConversao','CNPJ',
                'RazaoSocial','Contato','Vendedor','Itens','Total','Condicoes',
                'PdfUrl','NumeroPedido'];
  if (String(sheet.getRange(1, 1).getValue()) !== 'Numero') {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
  }
  return 'setup ok — planilha "Orçamentos PJ", aba "' + ABA + '", cabeçalho pronto';
}

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

// O Sheets auto-converte "31/07/2026" em objeto Date. Na leitura, devolve
// sempre como texto dd/MM/yyyy para o form não receber um timestamp cru.
function fmtData(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'dd/MM/yyyy');
  return String(v || '');
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
  return { numero:String(r[0]), data:fmtData(r[1]), status:String(r[3]||'pendente'),
           razaoSocial:String(r[6]||''), total:parseFloat(r[10])||0, validade:fmtData(r[2]) };
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
      numero:String(r[0]), data:fmtData(r[1]), validade:fmtData(r[2]),
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

function fmtMoeda(v) {
  v = Math.round((Number(v) || 0) * 100) / 100;
  var p = v.toFixed(2).split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return p[0] + ',' + p[1];
}

function gerarPdfOrcamento(numero) {
  var res = buscarOrcamento(numero);
  if (!res.sucesso) return res;
  var o = res.orcamento;

  var doc = DocumentApp.create('NXT Orcamento ' + numero);
  var body = doc.getBody();
  body.setMarginTop(30).setMarginBottom(30).setMarginLeft(40).setMarginRight(40);

  // remove o paragrafo vazio inicial
  var first = body.getChild(0);

  // Logo NXT
  try {
    var logoBlob = Utilities.newBlob(Utilities.base64Decode(LOGO_B64), 'image/png', 'logo.png');
    var img = body.appendImage(logoBlob);
    var larg = 190;
    img.setWidth(larg).setHeight(larg * img.getHeight() / img.getWidth());
  } catch (e) {}

  // Faixa lime (accent da marca)
  var bar = body.appendTable([['']]);
  bar.setBorderWidth(0);
  var barCell = bar.getCell(0, 0);
  barCell.setBackgroundColor('#C6FF00').setPaddingTop(2).setPaddingBottom(2)
         .setPaddingLeft(0).setPaddingRight(0);

  // Titulo
  var titulo = body.appendParagraph('ORCAMENTO');
  titulo.setFontSize(22).setBold(true).setForegroundColor('#111111');
  var sub = body.appendParagraph(o.numero + '   ·   ' + o.data + '   ·   Validade: ' + (o.validade || '-'));
  sub.setFontSize(9).setBold(false).setForegroundColor('#777777');

  body.appendParagraph('').setFontSize(4);

  // Cliente
  var cli = body.appendParagraph('CLIENTE');
  cli.setFontSize(10).setBold(true).setForegroundColor('#111111');
  var emp = o.empresa || {};
  body.appendParagraph(emp.razaoSocial + '    CNPJ ' + emp.cnpj).setFontSize(10).setBold(false).setForegroundColor('#111111');
  var contato = [emp.responsavel, emp.telefone, emp.email].filter(function (x) { return x; }).join('   ·   ');
  if (contato) body.appendParagraph(contato).setFontSize(9).setForegroundColor('#777777').setBold(false);

  body.appendParagraph('').setFontSize(4);

  // Tabela de itens
  var linhas = [['MODELO', 'COR', 'QTD', 'PRECO UNIT.', 'SUBTOTAL']];
  (o.itens || []).forEach(function (it) {
    linhas.push([String(it.modelo || ''), String(it.cor || ''), String(it.qtd || ''),
                 'R$ ' + fmtMoeda(it.precoUnit), 'R$ ' + fmtMoeda(it.subtotal)]);
  });
  var table = body.appendTable(linhas);
  table.setBorderColor('#DDDDDD').setBorderWidth(1);
  // cabecalho: fundo preto, texto lime
  var hrow = table.getRow(0);
  for (var c = 0; c < hrow.getNumCells(); c++) {
    var hc = hrow.getCell(c);
    hc.setBackgroundColor('#111111').setPaddingTop(4).setPaddingBottom(4);
    hc.editAsText().setForegroundColor('#C6FF00').setBold(true).setFontSize(8);
  }
  // dados
  for (var r = 1; r < table.getNumRows(); r++) {
    var drow = table.getRow(r);
    for (var d = 0; d < drow.getNumCells(); d++) {
      drow.getCell(d).editAsText().setFontSize(9).setBold(false).setForegroundColor('#222222');
    }
  }

  body.appendParagraph('').setFontSize(4);

  // Total
  var tot = body.appendParagraph('TOTAL   R$ ' + fmtMoeda(o.total));
  tot.setFontSize(15).setBold(true).setForegroundColor('#111111')
     .setAlignment(DocumentApp.HorizontalAlignment.RIGHT);

  // Condicoes
  var cond = o.condicoes || {};
  var linhaCond = [];
  if (cond.pagamento) linhaCond.push('Pagamento: ' + cond.pagamento);
  if (cond.transporte) linhaCond.push('Transporte: ' + cond.transporte);
  if (linhaCond.length) body.appendParagraph(linhaCond.join('    ·    ')).setFontSize(9).setBold(false).setForegroundColor('#777777');
  if (cond.observacoes) body.appendParagraph('Obs.: ' + cond.observacoes).setFontSize(9).setBold(false).setForegroundColor('#777777');
  if (o.vendedor) body.appendParagraph('Vendedor: ' + o.vendedor).setFontSize(9).setBold(false).setForegroundColor('#777777');

  body.appendParagraph('').setFontSize(6);
  var foot = body.appendParagraph('NXT Autopropelidos    ·    nxt.eco.br');
  foot.setFontSize(9).setBold(false).setForegroundColor('#999999')
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  // remove o primeiro paragrafo vazio que o Doc cria
  try { if (first && first.getType() === DocumentApp.ElementType.PARAGRAPH && first.asParagraph().getText() === '') first.removeFromParent(); } catch (e) {}

  doc.saveAndClose();

  // Converte para PDF na pasta PJ/PDFs e apaga o Doc temp
  var docFile = DriveApp.getFileById(doc.getId());
  var pdfBlob = docFile.getAs('application/pdf');
  pdfBlob.setName('Orcamento_' + numero + '.pdf');
  var pastaPJ = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents().next();
  var pastaPDF = pastaPJ.getFoldersByName(PASTA_PDF_NOME);
  var destino = pastaPDF.hasNext() ? pastaPDF.next() : pastaPJ.createFolder(PASTA_PDF_NOME);
  var arquivo = destino.createFile(pdfBlob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  docFile.setTrashed(true);
  var sheet = getSheet(); var vv = sheet.getDataRange().getValues();
  for (var i = 1; i < vv.length; i++) {
    if (String(vv[i][0]) === numero) { sheet.getRange(i + 1, 13).setValue(arquivo.getUrl()); break; }
  }
  return { sucesso: true, pdfUrl: arquivo.getUrl() };
}
