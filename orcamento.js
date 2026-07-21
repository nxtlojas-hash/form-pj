// ============================================================
// ORÇAMENTO PJ — salvar / listar / recarregar / converter
// Backend: Apps Script Web App (planilha "Orçamentos PJ" em J:\Meu Drive\PJ)
// IMPORTANTE: fetch usa Content-Type text/plain (evita preflight CORS que o
// Apps Script não responde). O servidor faz JSON.parse do corpo mesmo assim.
// Não dispara Bling/estoque/NF: só o "Registrar Venda PJ" (registrarVenda) faz isso.
// ============================================================

const ORCAMENTO_URL = 'https://script.google.com/macros/s/AKfycbw5sTuN3YZjxJolYJLik25QvaX5paDJ67vsmnuVhWSBMIs2KwfJU5nNgM4rLLVO73Qy/exec';

// número do orçamento atualmente carregado (para marcar convertido na venda)
window.orcamentoCarregado = null;

function _v(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
}

// Monta o payload do orçamento lendo os mesmos campos da venda (read-only).
function montarOrcamentoPayload() {
    const total = produtosDaVenda.reduce((acc, p) => acc + p.subtotal, 0);
    return {
        action: 'salvar',
        empresa: {
            cnpj: _v('cnpjEmpresa'),
            razaoSocial: _v('razaoSocial'),
            responsavel: _v('responsavelCompra'),
            telefone: _v('telefoneEmpresa'),
            email: _v('emailEmpresa')
        },
        vendedor: _v('responsavelVenda'),
        itens: produtosDaVenda.map(p => ({
            modelo: p.modelo, cor: p.cor,
            qtd: p.quantidade, precoUnit: p.preco, subtotal: p.subtotal
        })),
        total: total,
        condicoes: {
            pagamento: Array.from(document.querySelectorAll('input[name="pagamento"]:checked')).map(e => e.value).join(', '),
            transporte: _v('tipoTransporte'),
            observacoes: _v('observacoesGerais')
        },
        validade: _v('validadeOrcamento')
    };
}

async function salvarComoOrcamento() {
    if (produtosDaVenda.length === 0) {
        mostrarFeedback('Adicione ao menos um produto para salvar o orçamento', 'erro');
        return;
    }
    if (!_v('cnpjEmpresa') || !_v('razaoSocial')) {
        mostrarFeedback('Preencha ao menos CNPJ e Razão Social para o orçamento', 'erro');
        return;
    }
    try {
        const res = await fetch(ORCAMENTO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(montarOrcamentoPayload())
        });
        const data = await res.json();
        if (data.sucesso) {
            mostrarFeedback('Orçamento salvo: ' + data.numero, 'sucesso');
            gerarEEnviarProposta(data.numero);
        } else {
            mostrarFeedback('Erro ao salvar orçamento: ' + (data.erro || 'desconhecido'), 'erro');
        }
    } catch (e) {
        mostrarFeedback('Falha de rede ao salvar orçamento', 'erro');
        console.error('salvarComoOrcamento', e);
    }
}

// Gera o PDF no Drive e oferece enviar a proposta ao cliente por WhatsApp.
async function gerarEEnviarProposta(numero) {
    try {
        const res = await fetch(ORCAMENTO_URL + '?action=pdf&numero=' + encodeURIComponent(numero));
        const data = await res.json();
        if (!data.sucesso || !data.pdfUrl) return;
        const tel = _v('telefoneEmpresa').replace(/\D/g, '');
        const texto = encodeURIComponent('Segue a proposta ' + numero + ': ' + data.pdfUrl);
        const link = 'https://wa.me/55' + tel + '?text=' + texto;
        if (confirm('Orçamento ' + numero + ' salvo e PDF gerado.\nEnviar a proposta ao cliente por WhatsApp?')) {
            window.open(link, '_blank');
        }
    } catch (e) {
        console.warn('gerarEEnviarProposta', e);
    }
}

// ---- Meus orçamentos: listar e recarregar ----

async function abrirMeusOrcamentos() {
    const painel = document.getElementById('painelOrcamentos');
    if (painel) painel.style.display = 'block';
    const busca = _v('buscaOrcamento');
    try {
        const res = await fetch(ORCAMENTO_URL + '?action=listar&status=pendente&busca=' + encodeURIComponent(busca));
        const data = await res.json();
        const ul = document.getElementById('listaOrcamentos');
        ul.innerHTML = '';
        const orcs = data.orcamentos || [];
        if (orcs.length === 0) {
            ul.innerHTML = '<li style="opacity:.7">Nenhum orçamento pendente</li>';
            return;
        }
        orcs.forEach(o => {
            const li = document.createElement('li');
            li.textContent = o.numero + ' — ' + o.razaoSocial + ' — R$ ' + o.total + ' (val. ' + o.validade + ')';
            li.style.cursor = 'pointer';
            li.style.padding = '8px 4px';
            li.style.borderBottom = '1px solid rgba(255,255,255,.1)';
            li.onclick = () => recarregarOrcamento(o.numero);
            ul.appendChild(li);
        });
    } catch (e) {
        mostrarFeedback('Falha ao listar orçamentos', 'erro');
        console.error('abrirMeusOrcamentos', e);
    }
}

async function recarregarOrcamento(numero) {
    try {
        const res = await fetch(ORCAMENTO_URL + '?action=buscar&numero=' + encodeURIComponent(numero));
        const data = await res.json();
        if (!data.sucesso) { mostrarFeedback(data.erro || 'Orçamento não encontrado', 'erro'); return; }
        const o = data.orcamento;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('cnpjEmpresa', o.empresa.cnpj);
        set('razaoSocial', o.empresa.razaoSocial);
        set('responsavelCompra', o.empresa.responsavel);
        set('telefoneEmpresa', o.empresa.telefone);
        set('emailEmpresa', o.empresa.email);
        set('responsavelVenda', o.vendedor);

        // reconstrói a lista de produtos no formato interno {modelo,cor,quantidade,preco,subtotal}
        produtosDaVenda.length = 0;
        (o.itens || []).forEach(it => produtosDaVenda.push({
            modelo: it.modelo, cor: it.cor,
            quantidade: it.qtd, preco: it.precoUnit, subtotal: it.subtotal
        }));
        if (typeof atualizarListaProdutosUI === 'function') atualizarListaProdutosUI();
        if (typeof calcularTotal === 'function') calcularTotal();
        if (typeof atualizarProgressoVenda === 'function') atualizarProgressoVenda();

        window.orcamentoCarregado = numero;

        // aviso de vencido (validade em dd/MM/yyyy)
        if (o.validade) {
            const [d, m, a] = o.validade.split('/');
            if (d && m && a && new Date(a, m - 1, d) < new Date(new Date().toDateString())) {
                mostrarFeedback('Proposta ' + numero + ' vencida (validade ' + o.validade + ') — confirme antes de converter', 'erro');
            }
        }

        const painel = document.getElementById('painelOrcamentos');
        if (painel) painel.style.display = 'none';
        mostrarFeedback('Orçamento ' + numero + ' carregado — edite e clique em Registrar Venda para converter', 'sucesso');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
        mostrarFeedback('Falha ao carregar orçamento', 'erro');
        console.error('recarregarOrcamento', e);
    }
}

// Chamado pelo registrarVenda após uma venda bem-sucedida originada de orçamento.
async function marcarOrcamentoConvertido(numero, numeroPedido) {
    try {
        await fetch(ORCAMENTO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'converter', numero: numero, numeroPedido: numeroPedido || '' })
        });
    } catch (e) {
        console.warn('marcarOrcamentoConvertido', e);
    }
}

window.salvarComoOrcamento = salvarComoOrcamento;
window.abrirMeusOrcamentos = abrirMeusOrcamentos;
window.recarregarOrcamento = recarregarOrcamento;
window.marcarOrcamentoConvertido = marcarOrcamentoConvertido;
