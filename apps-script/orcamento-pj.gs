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
