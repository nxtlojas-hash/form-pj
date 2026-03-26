// ============================================================
// NXT AUTOPROPELIDOS — FORM PJ — SCRIPT
// Versão: 1.0 | Build: 2026-03-22
// ============================================================

const WEBHOOK_URL = 'https://hook.us2.make.com/bd6vnalfa7jrem88601pi79zcwqk3rhx';
const BLING_API_URL = 'https://buscar-contato-bling-132604245790.southamerica-east1.run.app';
const BLING_VENDA_URL = 'https://registrar-venda-bling-132604245790.southamerica-east1.run.app';

// ---- Estado Global ----
let dadosProdutos = {};
let dadosFiscais = {};
let produtosDaVenda = [];
let vendaJaEnviada = false;
let ultimaVendaRegistrada = null;
let ultimoResultadoBling = {};

// ---- Estado do Wizard ----
let wizardPassoAtual = 1;

// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await carregarDadosIniciais();
    definirDataAtual();
    aplicarMascaras();
    configurarFormulario();
    configurarPagamentoCards();
    atualizarProgressoVenda();
});

async function carregarDadosIniciais() {
    try {
        const [produtosRes, fiscalRes] = await Promise.all([
            fetch('dados/produtos.json'),
            fetch('dados/produtos-fiscal.json')
        ]);
        if (!produtosRes.ok) throw new Error('Erro ao carregar produtos.json');
        dadosProdutos = await produtosRes.json();
        preencherDropdownsProdutos();

        if (fiscalRes.ok) {
            const fiscalRaw = await fiscalRes.json();
            dadosFiscais = {};
            Object.keys(fiscalRaw).forEach(k => {
                if (k !== '_info') dadosFiscais[k] = fiscalRaw[k];
            });
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        mostrarFeedback('Erro ao carregar dados de configuracao: ' + error.message, 'erro');
    }
}

function preencherDropdownsProdutos() {
    const modeloProdutoSelect = document.getElementById('modeloProduto');
    const corProdutoSelect = document.getElementById('corProduto');

    if (dadosProdutos.modelos) {
        dadosProdutos.modelos.forEach(m => modeloProdutoSelect.add(new Option(m, m)));
    }

    if (dadosProdutos.cores) {
        dadosProdutos.cores.forEach(c => corProdutoSelect.add(new Option(c, c)));
    }
}

function definirDataAtual() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const dataInput = document.getElementById('dataVenda');
    if (dataInput) dataInput.value = `${ano}-${mes}-${dia}`;
}

// ============================================================
// CONFIGURAÇÃO DO FORMULÁRIO
// ============================================================

function configurarFormulario() {
    document.getElementById('vendaForm').addEventListener('submit', registrarVenda);
    document.getElementById('adicionarProdutoBtn').addEventListener('click', adicionarProduto);
    document.getElementById('limparFormularioBtn').addEventListener('click', () => limparFormulario(true));

    document.getElementById('cepEmpresa').addEventListener('blur', buscarCEP);

    // Busca Bling ao sair do campo CNPJ
    document.getElementById('cnpjEmpresa').addEventListener('blur', buscarContatoBling);

    document.querySelectorAll('.valor-forma-pagamento').forEach(input => {
        input.addEventListener('input', calcularTotalFormasPagamento);
    });

    document.querySelectorAll('.currency-input').forEach(input => {
        input.addEventListener('input', formatarMoeda);
        input.addEventListener('blur', finalizarFormatacaoMoeda);
    });

    document.getElementById('precoProduto').addEventListener('input', () => {
        calcularTotal();
        atualizarSubtotalDisplay();
    });
    document.getElementById('quantidadeProduto').addEventListener('input', () => {
        calcularTotal();
        atualizarSubtotalDisplay();
    });
    document.getElementById('valorFrete').addEventListener('input', calcularTotal);

    // Atualizar progresso ao preencher campos-chave
    ['responsavelVenda', 'cnpjEmpresa', 'responsavelCompra', 'telefoneEmpresa'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', atualizarProgressoVenda);
            el.addEventListener('change', atualizarProgressoVenda);
        }
    });

    // CNPJ da transportadora — máscara
    const cnpjTransp = document.getElementById('cnpjTransportadora');
    if (cnpjTransp) {
        cnpjTransp.addEventListener('input', function () {
            let v = this.value.replace(/\D/g, '').slice(0, 14);
            v = v.replace(/^(\d{2})(\d)/, '$1.$2');
            v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
            v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
            v = v.replace(/(\d{4})(\d)/, '$1-$2');
            this.value = v;
        });
    }
}

// ============================================================
// MÁSCARAS
// ============================================================

function aplicarMascaras() {
    // CNPJ: 00.000.000/0000-00
    const cnpj = document.getElementById('cnpjEmpresa');
    if (cnpj) {
        cnpj.addEventListener('input', function () {
            let v = this.value.replace(/\D/g, '').slice(0, 14);
            v = v.replace(/^(\d{2})(\d)/, '$1.$2');
            v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
            v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
            v = v.replace(/(\d{4})(\d)/, '$1-$2');
            this.value = v;
            // Limpar status Bling quando o usuário edita o CNPJ
            limparStatusBling();
        });
    }

    // Telefone: (00) 00000-0000
    const tel = document.getElementById('telefoneEmpresa');
    if (tel) {
        tel.addEventListener('input', function () {
            let v = this.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 10) {
                v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
            } else if (v.length > 6) {
                v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
            } else if (v.length > 2) {
                v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
            }
            this.value = v;
        });
    }

    // CEP: 00000-000
    const cep = document.getElementById('cepEmpresa');
    if (cep) {
        cep.addEventListener('input', function () {
            let v = this.value.replace(/\D/g, '').slice(0, 8);
            v = v.replace(/^(\d{5})(\d)/, '$1-$2');
            this.value = v;
        });
    }
}

// ============================================================
// TOGGLE IE ISENTO
// ============================================================

function toggleIeIsento() {
    const check = document.getElementById('ieIsentoCheck');
    const ieInput = document.getElementById('inscricaoEstadual');
    if (!check || !ieInput) return;

    if (check.checked) {
        ieInput.value = 'ISENTO';
        ieInput.disabled = true;
        ieInput.style.opacity = '0.5';
    } else {
        ieInput.value = '';
        ieInput.disabled = false;
        ieInput.style.opacity = '';
    }
}

// ============================================================
// BUSCA BLING (CNPJ AUTO-FILL)
// ============================================================

async function buscarContatoBling() {
    const cnpjInput = document.getElementById('cnpjEmpresa');
    const loader = document.getElementById('cnpjLoader');
    const statusEl = document.getElementById('blingStatus');

    if (!cnpjInput) return;

    const cnpjRaw = cnpjInput.value.replace(/\D/g, '');
    if (cnpjRaw.length !== 14) return;

    loader.classList.add('loading');
    limparStatusBling();

    try {
        const res = await fetch(`${BLING_API_URL}?cnpj=${cnpjRaw}`);

        if (!res.ok) {
            exibirStatusBling('nao-encontrado', 'Cliente não encontrado no Bling');
            return;
        }

        const data = await res.json();

        if (!data || data.error || data.encontrado === false) {
            exibirStatusBling('nao-encontrado', 'Cliente não encontrado no Bling');
            return;
        }

        // Preencher campos com os dados retornados
        if (data.razaoSocial) document.getElementById('razaoSocial').value = data.razaoSocial;
        if (data.nomeFantasia) document.getElementById('nomeFantasia').value = data.nomeFantasia;
        if (data.inscricaoEstadual) document.getElementById('inscricaoEstadual').value = data.inscricaoEstadual;
        if (data.telefone) document.getElementById('telefoneEmpresa').value = data.telefone;
        if (data.email) document.getElementById('emailEmpresa').value = data.email;

        // Endereço
        if (data.endereco) {
            if (data.endereco.cep) {
                let cepFormatado = data.endereco.cep.replace(/\D/g, '');
                cepFormatado = cepFormatado.replace(/^(\d{5})(\d)/, '$1-$2');
                document.getElementById('cepEmpresa').value = cepFormatado;
            }
            if (data.endereco.logradouro) document.getElementById('ruaEmpresa').value = data.endereco.logradouro;
            if (data.endereco.numero) document.getElementById('numeroEmpresa').value = data.endereco.numero;
            if (data.endereco.bairro) document.getElementById('bairroEmpresa').value = data.endereco.bairro;
            if (data.endereco.cidade) document.getElementById('cidadeEmpresa').value = data.endereco.cidade;
            if (data.endereco.uf) {
                const estadoSelect = document.getElementById('estadoEmpresa');
                if (estadoSelect) estadoSelect.value = data.endereco.uf;
            }
        }

        exibirStatusBling('importado', 'Dados importados do Bling');
        atualizarProgressoVenda();

    } catch (err) {
        console.warn('Erro ao buscar contato no Bling:', err);
        exibirStatusBling('nao-encontrado', 'Erro ao consultar o Bling');
    } finally {
        loader.classList.remove('loading');
    }
}

function exibirStatusBling(tipo, mensagem) {
    const statusEl = document.getElementById('blingStatus');
    if (!statusEl) return;
    statusEl.className = `bling-status ${tipo}`;
    statusEl.textContent = mensagem;
}

function limparStatusBling() {
    const statusEl = document.getElementById('blingStatus');
    if (!statusEl) return;
    statusEl.className = 'bling-status';
    statusEl.textContent = '';
}

// ============================================================
// CEP (ViaCEP)
// ============================================================

async function buscarCEP() {
    const cepInput = document.getElementById('cepEmpresa');
    const loader = document.getElementById('cepLoader');
    const status = document.getElementById('cepStatus');

    if (!cepInput) return;

    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) return;

    loader.classList.add('loading');
    status.className = 'cep-status';
    status.textContent = '';

    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();

        if (data.erro) {
            status.className = 'cep-status error';
            status.textContent = 'CEP não encontrado';
        } else {
            document.getElementById('ruaEmpresa').value = data.logradouro || '';
            document.getElementById('bairroEmpresa').value = data.bairro || '';
            document.getElementById('cidadeEmpresa').value = data.localidade || '';
            const estadoSelect = document.getElementById('estadoEmpresa');
            if (estadoSelect) estadoSelect.value = data.uf || '';
            status.className = 'cep-status success';
            status.textContent = 'Endereço preenchido';
            document.getElementById('numeroEmpresa').focus();
        }
    } catch {
        status.className = 'cep-status error';
        status.textContent = 'Erro ao buscar CEP';
    } finally {
        loader.classList.remove('loading');
    }
}

// ============================================================
// PRODUTO
// ============================================================

function atualizarSubtotalDisplay() {
    const preco = obterValorNumerico('precoProduto');
    const qtd = parseInt(document.getElementById('quantidadeProduto')?.value || '1', 10) || 1;
    const subtotal = preco * qtd;
    const el = document.getElementById('subtotalDisplay');
    if (el) el.textContent = `R$ ${formatarValorMonetario(subtotal)}`;
}

function adicionarProduto() {
    const modelo = document.getElementById('modeloProduto').value;
    const cor = document.getElementById('corProduto').value;
    const preco = obterValorNumerico('precoProduto');
    const qtdRaw = parseInt(document.getElementById('quantidadeProduto')?.value || '1', 10);
    const quantidade = isNaN(qtdRaw) || qtdRaw < 1 ? 1 : qtdRaw;

    if (!modelo || !cor || preco <= 0) {
        mostrarFeedback('Selecione modelo, cor e informe um preço válido', 'erro');
        return;
    }

    produtosDaVenda.push({
        id: Date.now(),
        modelo,
        cor,
        quantidade,
        preco,
        subtotal: preco * quantidade
    });

    atualizarListaProdutosUI();
    calcularTotal();
    limparCamposProduto();
    mostrarFeedback(`${modelo} (${quantidade}x) adicionado à venda!`, 'sucesso');
}

function atualizarListaProdutosUI() {
    const container = document.getElementById('listaProdutosVenda');
    const counter = document.getElementById('produtosCounter');

    if (counter) {
        counter.querySelector('.counter-number').textContent = produtosDaVenda.length;
    }

    if (produtosDaVenda.length === 0) {
        container.innerHTML = `
            <div class="empty-state-produtos">
                <p class="empty-state-icon-text">Carrinho vazio</p>
                <p class="empty-hint">Preencha os dados acima e clique em adicionar</p>
            </div>`;
        atualizarProgressoVenda();
        return;
    }

    container.innerHTML = '';
    produtosDaVenda.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = 'produto-item-novo';
        div.innerHTML = `
            <div class="produto-info">
                <div class="produto-modelo">${p.modelo} — ${p.cor}</div>
                <div class="produto-detalhes">${p.quantidade}x R$ ${formatarValorMonetario(p.preco)} = R$ ${formatarValorMonetario(p.subtotal)}</div>
            </div>
            <div class="produto-preco">R$ ${formatarValorMonetario(p.subtotal)}</div>
            <button class="btn-remover-produto" onclick="removerProduto(${idx})" aria-label="Remover produto">&#x2715;</button>
        `;
        container.appendChild(div);
    });

    atualizarProgressoVenda();
}

function removerProduto(idx) {
    produtosDaVenda.splice(idx, 1);
    atualizarListaProdutosUI();
    calcularTotal();
}

function limparCamposProduto() {
    document.getElementById('modeloProduto').value = '';
    document.getElementById('corProduto').value = '';
    document.getElementById('precoProduto').value = '';
    const qtdEl = document.getElementById('quantidadeProduto');
    if (qtdEl) qtdEl.value = '1';
    const subtotalEl = document.getElementById('subtotalDisplay');
    if (subtotalEl) subtotalEl.textContent = 'R$ 0,00';
}

// ============================================================
// PAGAMENTO
// ============================================================

function configurarPagamentoCards() {
    document.querySelectorAll('.pagamento-card input').forEach(input => {
        input.addEventListener('change', () => {
            handlePagamentoChange();
            atualizarProgressoVenda();

            const pixInfo = document.getElementById('pixInfoCard');
            if (pixInfo) {
                const pixChecked = document.querySelector('input[name="pagamento"][value="pix"]')?.checked;
                pixInfo.style.display = pixChecked ? 'block' : 'none';
            }

            const dinheiroInfo = document.getElementById('dinheiroInfoCard');
            if (dinheiroInfo) {
                const dinheiroChecked = document.querySelector('input[name="pagamento"][value="dinheiro"]')?.checked;
                dinheiroInfo.style.display = dinheiroChecked ? 'block' : 'none';
            }
        });
    });

    document.querySelectorAll('.parcela-btn').forEach(btn => {
        btn.addEventListener('click', () => selecionarParcelas(parseInt(btn.dataset.parcelas)));
    });

    selecionarParcelas(1);
}

function handlePagamentoChange() {
    const selecionadas = Array.from(document.querySelectorAll('input[name="pagamento"]:checked')).map(cb => cb.value);
    const valoresSection = document.getElementById('valoresFormasPagamento');
    const parcelasGroup = document.getElementById('parcelasGroup');
    const outrosGroup = document.getElementById('outrosPagamentoGroup');
    const prazoGroup = document.getElementById('prazoGroup');

    const formas = ['pix', 'pos', 'dinheiro', 'debito', 'credito', 'prazo', 'outros'];
    formas.forEach(forma => {
        const group = document.getElementById(`${forma}ValorGroup`);
        if (group) group.style.display = selecionadas.includes(forma) ? 'flex' : 'none';
    });

    valoresSection.style.display = selecionadas.length > 0 ? 'block' : 'none';
    parcelasGroup.style.display = selecionadas.includes('credito') ? 'block' : 'none';
    outrosGroup.style.display = selecionadas.includes('outros') ? 'block' : 'none';
    prazoGroup.style.display = selecionadas.includes('prazo') ? 'block' : 'none';

    // Tornar condição de pagamento obrigatória quando "a prazo" estiver selecionado
    const condicaoPrazo = document.getElementById('condicaoPagamentoPrazo');
    if (condicaoPrazo) {
        condicaoPrazo.required = selecionadas.includes('prazo');
    }
}

function selecionarParcelas(parcelas) {
    document.querySelectorAll('.parcela-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.parcelas === String(parcelas));
    });
    document.getElementById('parcelasCredito').value = parcelas;
}

function obterValoresFormasPagamento() {
    const valores = {};
    const formas = ['pix', 'pos', 'dinheiro', 'debito', 'credito', 'prazo', 'outros'];
    formas.forEach(forma => {
        const input = document.getElementById(`valor${forma.charAt(0).toUpperCase() + forma.slice(1)}`);
        if (input && input.closest('[style*="block"], [style*="flex"]')) {
            const val = obterValorNumericoDeInput(input);
            if (val > 0) valores[forma] = val;
        }
    });
    return valores;
}

function calcularTotalFormasPagamento() {
    calcularTotal();
}

// ============================================================
// TRANSPORTE
// ============================================================

function selecionarTipoTransporte(tipo) {
    document.querySelectorAll('.entrega-card').forEach(card => {
        card.classList.toggle('active', card.dataset.tipo === tipo);
    });
    document.getElementById('tipoTransporte').value = tipo;

    const transpGroup = document.getElementById('transportadoraGroup');
    if (transpGroup) {
        const mostrar = tipo === 'transportadora';
        transpGroup.style.display = mostrar ? 'block' : 'none';
        const nomeTransp = document.getElementById('nomeTransportadora');
        if (nomeTransp) nomeTransp.required = mostrar;
    }

    atualizarProgressoVenda();
}

// ============================================================
// TOTAL
// ============================================================

function calcularTotal() {
    const totalProdutos = produtosDaVenda.reduce((acc, p) => acc + p.subtotal, 0);
    const frete = obterValorNumerico('valorFrete');
    const total = totalProdutos + frete;
    const el = document.getElementById('totalVenda');
    if (el) el.textContent = `R$ ${formatarValorMonetario(total)}`;
}

// ============================================================
// PROGRESS STEPS
// ============================================================

function atualizarProgressoVenda() {
    const steps = document.querySelectorAll('.progress-step');
    if (steps.length < 5) return;

    const responsavel = document.getElementById('responsavelVenda')?.value;
    const dataVenda = document.getElementById('dataVenda')?.value;
    steps[0].classList.toggle('completed', !!(responsavel && dataVenda));

    const cnpj = document.getElementById('cnpjEmpresa')?.value;
    const responsavelCompra = document.getElementById('responsavelCompra')?.value;
    const tel = document.getElementById('telefoneEmpresa')?.value;
    steps[1].classList.toggle('completed', !!(cnpj && responsavelCompra && tel));

    steps[2].classList.toggle('completed', produtosDaVenda.length > 0);

    const pagSelecionado = document.querySelectorAll('input[name="pagamento"]:checked').length > 0;
    steps[3].classList.toggle('completed', pagSelecionado);

    const tipoTransporte = document.getElementById('tipoTransporte')?.value;
    steps[4].classList.toggle('completed', !!tipoTransporte);

    // Atualiza step ativo (primeiro não completado)
    let atualizado = false;
    steps.forEach(s => s.classList.remove('active'));
    for (let i = 0; i < steps.length; i++) {
        if (!steps[i].classList.contains('completed')) {
            steps[i].classList.add('active');
            atualizado = true;
            break;
        }
    }
    if (!atualizado) steps[steps.length - 1].classList.add('active');
}

// ============================================================
// SEÇÕES COLAPSÁVEIS
// ============================================================

function toggleSecao(header) {
    header.closest('.secao-card').classList.toggle('collapsed');
}

// ============================================================
// SUBMIT — REGISTRAR VENDA
// ============================================================

async function registrarVenda(event) {
    event.preventDefault();

    if (vendaJaEnviada) {
        mostrarFeedback('Esta venda já foi enviada. Clique em "Nova Venda" para registrar outra.', 'erro');
        return;
    }

    if (produtosDaVenda.length === 0) {
        mostrarFeedback('Adicione pelo menos um produto à venda', 'erro');
        expandirSecao(3);
        return;
    }

    const formasSelecionadas = document.querySelectorAll('input[name="pagamento"]:checked');
    if (formasSelecionadas.length === 0) {
        mostrarFeedback('Selecione pelo menos uma forma de pagamento', 'erro');
        expandirSecao(4);
        return;
    }

    const tipoTransporte = document.getElementById('tipoTransporte').value;
    if (!tipoTransporte) {
        mostrarFeedback('Selecione o tipo de transporte', 'erro');
        expandirSecao(5);
        return;
    }

    // Expandir todas as seções para validação HTML5
    document.querySelectorAll('.secao-card.collapsed').forEach(s => s.classList.remove('collapsed'));

    const form = event.target;
    if (!form.checkValidity()) {
        const primeiroInvalido = form.querySelector(':invalid');
        if (primeiroInvalido) {
            primeiroInvalido.scrollIntoView({ behavior: 'smooth', block: 'center' });
            primeiroInvalido.focus();
        }
        form.reportValidity();
        mostrarFeedback('Preencha todos os campos obrigatórios', 'erro');
        return;
    }

    const btnRegistrar = document.querySelector('.btn-registrar');
    btnRegistrar.disabled = true;
    btnRegistrar.textContent = 'Enviando...';

    try {
        const totalProdutos = produtosDaVenda.reduce((acc, p) => acc + p.subtotal, 0);
        const frete = obterValorNumerico('valorFrete');

        const venda = {
            tipo: 'PJ',
            id: `VNDA-PJ-${Date.now()}`,
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

            produtos: produtosDaVenda.map(p => ({
                modelo: p.modelo,
                cor: p.cor,
                quantidade: p.quantidade,
                precoUnitario: p.preco,
                subtotal: p.subtotal
            })),

            pagamento: {
                formas: Array.from(formasSelecionadas).map(cb => cb.value),
                valores: obterValoresFormasPagamento(),
                parcelas: document.getElementById('parcelasCredito').value,
                condicaoPrazo: document.getElementById('condicaoPagamentoPrazo').value,
                observacoesPrazo: document.getElementById('observacoesPrazo').value.trim(),
                observacoes: document.getElementById('observacoesPagamento').value.trim(),
                condicoesComerciais: document.getElementById('condicoesComerciais').value.trim()
            },

            transporte: {
                tipo: tipoTransporte,
                nomeTransportadora: document.getElementById('nomeTransportadora').value.trim(),
                cnpjTransportadora: document.getElementById('cnpjTransportadora').value.trim(),
                dataPrevista: document.getElementById('prazoEntrega').value,
                valorFrete: frete,
                observacoes: document.getElementById('observacoesTransporte').value.trim()
            },

            observacoesGerais: document.getElementById('observacoesGerais').value.trim(),

            totalProdutos,
            frete,
            total: totalProdutos + frete
        };

        // Enviar em paralelo: Make.com + Bling
        let webhookSucesso = false;
        let blingSucesso = false;
        let blingPedidoId = null;
        let nfeId = null;
        let nfeEnviada = false;

        const envios = await Promise.allSettled([
            // Caminho 1: Webhook Make.com
            fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(venda)
            }).then(res => {
                webhookSucesso = res.ok;
                if (!res.ok) console.warn('Make.com retornou:', res.status);
            }),

            // Caminho 2: Bling (cria contato + pedido de venda) — envia com dados fiscais para fracionamento
            fetch(BLING_VENDA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...venda, dadosFiscais })
            }).then(async res => {
                const data = await res.json();
                if (res.ok && data.sucesso) {
                    blingSucesso = true;
                    blingPedidoId = data.pedidoId;
                    nfeId = data.nfeId;
                    nfeEnviada = data.nfeEnviada;
                } else {
                    console.warn('Bling retornou:', data);
                }
            })
        ]);

        // Log dos resultados
        envios.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.warn(`Envio ${i === 0 ? 'Make.com' : 'Bling'} falhou:`, r.reason);
            }
        });

        // Salvar localmente
        venda.blingPedidoId = blingPedidoId;
        const vendasSalvas = JSON.parse(localStorage.getItem('vendas_pj') || '[]');
        vendasSalvas.push(venda);
        localStorage.setItem('vendas_pj', JSON.stringify(vendasSalvas));

        vendaJaEnviada = true;
        btnRegistrar.textContent = 'Venda Enviada';

        // Mostrar modal de sucesso
        exibirModalSucesso(venda, webhookSucesso, blingSucesso, blingPedidoId, nfeId, nfeEnviada);

        // Baixa automática no Sistema de Estoque (fire-and-forget)
        venda.produtos.forEach(prod => {
            if (prod.chassi) {
                fetch('https://estoque-baixa-venda-yr6pk2gb3a-rj.a.run.app', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': 'e4218efd6d48b67425efe89efe602c9321b98c31d5c7c7315c6a579b235cafe4',
                        'X-App-Name': 'form-pj'
                    },
                    body: JSON.stringify({
                        chassi: prod.chassi,
                        motor: prod.motor || '',
                        tipo: 'PJ',
                        local: venda.loja,
                        formularioRef: venda.id + '-' + prod.chassi
                    })
                }).catch(err => console.error('Baixa estoque erro:', err));
            }
        });

    } catch (error) {
        console.error('Erro ao registrar venda:', error);
        mostrarFeedback('Erro ao registrar venda: ' + error.message, 'erro');
        btnRegistrar.disabled = false;
        btnRegistrar.textContent = 'Registrar Venda PJ';
    }
}

function expandirSecao(num) {
    const secao = document.querySelector(`.secao-card[data-secao="${num}"]`);
    if (secao) {
        secao.classList.remove('collapsed');
        secao.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ============================================================
// MODAL DE SUCESSO
// ============================================================

// exibirModalSucesso — agora abre o wizard pós-venda
function exibirModalSucesso(venda, webhookSucesso, blingSucesso = false, blingPedidoId = null, nfeId = null, nfeEnviada = false) {
    // Armazenar estado global para uso pelo wizard
    ultimaVendaRegistrada = venda;
    ultimoResultadoBling = { webhookSucesso, blingSucesso, blingPedidoId, nfeId, nfeEnviada };

    abrirWizardPosVenda(venda, webhookSucesso, blingSucesso, blingPedidoId, nfeId, nfeEnviada);
}

function fecharModalSucesso() {
    document.getElementById('modalSucesso').style.display = 'none';
    limparFormulario(false);
}

// ============================================================
// WIZARD PÓS-VENDA
// ============================================================

function abrirWizardPosVenda(venda, webhookSucesso, blingSucesso, blingPedidoId, nfeId, nfeEnviada) {
    wizardPassoAtual = 1;

    // --- Passo 1: preencher checklist de status ---
    const checklist = document.getElementById('wizardChecklist');
    if (checklist) {
        checklist.innerHTML = _wizardChecklistStatusHTML(webhookSucesso, blingSucesso, blingPedidoId, nfeId, nfeEnviada);
    }

    // --- Passo 1: preencher textarea de resumo ---
    const textarea = document.getElementById('wizardResumoTexto');
    if (textarea) {
        textarea.value = gerarTextoResumoVendaPJ(venda, blingSucesso, blingPedidoId, nfeId, nfeEnviada);
    }

    // --- Passo 2: preencher conteúdo WhatsApp ---
    _preencherPane2WhatsApp(venda, blingSucesso, blingPedidoId, nfeId, nfeEnviada);

    // --- Passo 3: checklist final ---
    const checklistFinal = document.getElementById('wizardChecklistFinal');
    if (checklistFinal) {
        checklistFinal.innerHTML = _wizardChecklistFinalHTML(webhookSucesso, blingSucesso, blingPedidoId, nfeId, nfeEnviada);
    }

    // Exibir wizard no passo 1
    _wizardIrParaPasso(1);
    document.getElementById('wizardPosVenda').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function fecharWizardPosVenda() {
    document.getElementById('wizardPosVenda').style.display = 'none';
    document.body.style.overflow = '';
    limparFormulario(false);
}

function wizardAvancar() {
    if (wizardPassoAtual < 3) {
        _wizardIrParaPasso(wizardPassoAtual + 1);
    }
}

function wizardVoltar() {
    if (wizardPassoAtual > 1) {
        _wizardIrParaPasso(wizardPassoAtual - 1);
    }
}

function _wizardIrParaPasso(passo) {
    wizardPassoAtual = passo;

    // Atualizar painéis
    document.querySelectorAll('.wizard-pane').forEach((pane, idx) => {
        pane.classList.toggle('active', idx + 1 === passo);
    });

    // Atualizar indicadores de progresso
    document.querySelectorAll('.wizard-step').forEach((step, idx) => {
        const num = idx + 1;
        step.classList.remove('active', 'completed');
        step.setAttribute('aria-selected', num === passo ? 'true' : 'false');
        if (num < passo) step.classList.add('completed');
        if (num === passo) step.classList.add('active');
    });

    // Atualizar linhas de progresso
    document.querySelectorAll('.wizard-progress-line').forEach((line, idx) => {
        line.classList.toggle('completed', idx + 1 < passo);
    });
}

function _wizardChecklistStatusHTML(webhookSucesso, blingSucesso, blingPedidoId, nfeId, nfeEnviada) {
    const makeStatus = webhookSucesso
        ? { icon: 'ok', text: 'Make.com — Enviado' }
        : { icon: 'erro', text: 'Make.com — Indisponível' };

    const blingStatus = blingSucesso
        ? { icon: 'ok', text: `Bling Pedido — #${blingPedidoId}` }
        : { icon: 'erro', text: 'Bling Pedido — Indisponível' };

    let nfeText, nfeIcon;
    if (nfeId && nfeEnviada) {
        nfeIcon = 'ok';
        nfeText = `NF-e — #${nfeId} enviada para SEFAZ`;
    } else if (nfeId && !nfeEnviada) {
        nfeIcon = 'aviso';
        nfeText = `NF-e — #${nfeId} criada (enviar manualmente)`;
    } else {
        nfeIcon = 'erro';
        nfeText = 'NF-e — Não gerada';
    }

    return [
        { icon: makeStatus.icon, text: makeStatus.text },
        { icon: blingStatus.icon, text: blingStatus.text },
        { icon: nfeIcon, text: nfeText }
    ].map(item => `
        <div class="wizard-checklist-item wizard-checklist-item--${item.icon}">
            <span class="wizard-checklist-icon" aria-hidden="true">${_iconePorTipo(item.icon)}</span>
            <span class="wizard-checklist-text">${item.text}</span>
        </div>
    `).join('');
}

function _wizardChecklistFinalHTML(webhookSucesso, blingSucesso, blingPedidoId, nfeId, nfeEnviada) {
    const itens = [
        { ok: true, text: 'Venda salva localmente' },
        { ok: webhookSucesso, text: webhookSucesso ? 'Make.com — Webhook enviado' : 'Make.com — Não enviado' },
        { ok: blingSucesso, text: blingSucesso ? `Bling — Pedido #${blingPedidoId} criado` : 'Bling — Pedido não criado' },
    ];

    if (nfeId && nfeEnviada) {
        itens.push({ ok: true, text: `NF-e #${nfeId} enviada para SEFAZ` });
    } else if (nfeId) {
        itens.push({ ok: false, text: `NF-e #${nfeId} criada — enviar manualmente` });
    } else {
        itens.push({ ok: false, text: 'NF-e não gerada' });
    }

    itens.push({ ok: true, text: 'Resumo copiável disponível na etapa 1' });

    return itens.map(item => {
        const tipo = item.ok ? 'ok' : 'erro';
        return `
            <div class="wizard-checklist-item wizard-checklist-item--${tipo}">
                <span class="wizard-checklist-icon" aria-hidden="true">${_iconePorTipo(tipo)}</span>
                <span class="wizard-checklist-text">${item.text}</span>
            </div>
        `;
    }).join('');
}

function _iconePorTipo(tipo) {
    if (tipo === 'ok') return '&#10003;';
    if (tipo === 'aviso') return '&#9888;';
    return '&#10007;';
}

function _preencherPane2WhatsApp(venda, blingSucesso, blingPedidoId, nfeId, nfeEnviada) {
    const pane = document.getElementById('wPane2Conteudo');
    if (!pane) return;

    if (!nfeId) {
        // NF-e não disponível — oferecer fatura como alternativa
        pane.innerHTML = `
            <div class="wizard-wpp-indisponivel">
                <span class="wizard-checklist-icon wizard-checklist-icon--aviso" aria-hidden="true">&#9888;</span>
                <p>NF-e não disponível. Enviar Fatura por WhatsApp como alternativa.</p>
                <p class="wizard-wpp-dica">A NF-e não foi gerada (geralmente por cadastro de produto pendente no Bling). Use a fatura abaixo como documento provisório para o cliente.</p>
            </div>
            <div class="wizard-fatura-acoes">
                <button type="button" class="btn-wizard-whatsapp" onclick="enviarFaturaWhatsApp()" aria-label="Enviar fatura por WhatsApp ao cliente">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Enviar Fatura por WhatsApp
                </button>
                <button type="button" class="btn-wizard-ver-fatura" onclick="gerarFaturaPJ()" aria-label="Visualizar fatura completa">
                    Ver Fatura
                </button>
            </div>
        `;
        return;
    }

    const mensagem = _gerarMensagemWhatsAppNFe(venda, blingPedidoId, nfeId);
    const telefoneRaw = (venda.empresa.telefone || '').replace(/\D/g, '');
    const telefone = telefoneRaw.startsWith('55') ? telefoneRaw : `55${telefoneRaw}`;
    const urlWpp = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;

    pane.innerHTML = `
        <div class="wizard-wpp-info">
            <p class="wizard-wpp-desc">
                Clique em <strong>Abrir WhatsApp</strong> para enviar a confirmação do pedido e NF-e ao cliente
                <strong>${venda.empresa.responsavel}</strong> no número <strong>${venda.empresa.telefone}</strong>.
            </p>
        </div>
        <div class="wizard-wpp-preview">
            <div class="wizard-wpp-preview-header">
                <span>Prévia da mensagem</span>
            </div>
            <pre class="wizard-wpp-preview-text">${_escaparHTML(mensagem)}</pre>
        </div>
        <a
            href="${urlWpp}"
            target="_blank"
            rel="noopener noreferrer"
            class="btn-wizard-whatsapp"
            aria-label="Abrir WhatsApp para enviar mensagem ao cliente"
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Abrir WhatsApp
        </a>
    `;
}

function _escaparHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ============================================================
// GERADOR DE TEXTO DE RESUMO
// ============================================================

function gerarTextoResumoVendaPJ(venda, blingSucesso, blingPedidoId, nfeId, nfeEnviada) {
    const dataFormatada = new Date(venda.dataVenda + 'T12:00:00').toLocaleDateString('pt-BR');
    const e = venda.empresa;
    const end = e.endereco || {};

    let texto = '';
    texto += `=== NXT AUTOPROPELIDOS v1.0 ===\n`;
    texto += `*RESUMO DA VENDA PJ*\n`;
    texto += `*Responsavel:* ${venda.responsavelVenda}\n`;
    texto += `*Data:* ${dataFormatada}\n`;
    if (venda.numeroPedidoOC) texto += `*OC:* ${venda.numeroPedidoOC}\n`;
    texto += `\n`;

    texto += `*EMPRESA*\n`;
    texto += `*Razao Social:* ${e.razaoSocial}\n`;
    texto += `*CNPJ:* ${e.cnpj}\n`;
    texto += `*Responsavel Compra:* ${e.responsavel}\n`;
    texto += `*Telefone:* ${e.telefone}\n`;
    if (e.email) texto += `*E-mail:* ${e.email}\n`;

    const endPartes = [];
    if (end.rua) endPartes.push(`${end.rua}${end.numero ? ', ' + end.numero : ''}`);
    if (end.bairro) endPartes.push(end.bairro);
    const cidadeUf = [end.cidade, end.estado].filter(Boolean).join('/');
    if (cidadeUf) endPartes.push(cidadeUf);
    if (end.cep) endPartes.push(`CEP: ${end.cep}`);
    if (endPartes.length) texto += `*Endereço:* ${endPartes.join(' - ')}\n`;
    texto += `\n`;

    texto += `*PRODUTOS*\n`;
    venda.produtos.forEach(p => {
        texto += `- ${p.modelo} ${p.cor} | Qtd: ${p.quantidade} | Unit: R$ ${formatarValorMonetario(p.precoUnitario)} | Sub: R$ ${formatarValorMonetario(p.subtotal)}\n`;
    });
    texto += `\n`;

    texto += `*PAGAMENTO*\n`;
    const pag = venda.pagamento;
    if (pag.formas && pag.formas.length) {
        const nomesFormas = {
            pix: 'PIX', pos: 'PIX POS', dinheiro: 'Dinheiro',
            debito: 'Débito', credito: 'Crédito', prazo: 'A Prazo', outros: 'Outros'
        };
        const formasTexto = pag.formas.map(f => {
            const nome = nomesFormas[f] || f;
            const val = pag.valores && pag.valores[f] ? ` (R$ ${formatarValorMonetario(pag.valores[f])})` : '';
            return `${nome}${val}`;
        }).join(', ');
        texto += `*Formas:* ${formasTexto}\n`;
    }
    if (pag.condicaoPrazo) texto += `*Condição:* ${pag.condicaoPrazo}\n`;
    if (pag.condicoesComerciais) texto += `*Condições Comerciais:* ${pag.condicoesComerciais}\n`;
    if (pag.observacoes) texto += `*Obs:* ${pag.observacoes}\n`;
    if (venda.frete > 0) texto += `*Frete:* R$ ${formatarValorMonetario(venda.frete)}\n`;
    texto += `*TOTAL:* R$ ${formatarValorMonetario(venda.total)}\n`;
    texto += `\n`;

    texto += `*TRANSPORTE*\n`;
    const t = venda.transporte;
    const tiposTransporte = { proprio: 'Transporte Próprio', transportadora: 'Transportadora', terceirizado: 'Terceirizado' };
    texto += `*Tipo:* ${tiposTransporte[t.tipo] || t.tipo}\n`;
    if (t.nomeTransportadora) texto += `*Transportadora:* ${t.nomeTransportadora}\n`;
    if (t.dataPrevista) {
        const dataPrev = new Date(t.dataPrevista + 'T12:00:00').toLocaleDateString('pt-BR');
        texto += `*Data Prevista:* ${dataPrev}\n`;
    }
    if (t.observacoes) texto += `*Obs:* ${t.observacoes}\n`;
    texto += `\n`;

    if (blingSucesso && blingPedidoId) texto += `Pedido Bling #${blingPedidoId}\n`;
    if (nfeId && nfeEnviada) {
        texto += `NF-e #${nfeId} enviada para SEFAZ\n`;
    } else if (nfeId && !nfeEnviada) {
        texto += `NF-e #${nfeId} criada - enviar manualmente\n`;
    }
    texto += `\n`;

    texto += `_NXT Autopropelidos - Mobilidade Urbana_\n`;
    texto += `CNPJ: 55.099.827/0001-96\n`;
    texto += `Ni Hao Comércio e Serviços Ltda`;

    return texto;
}

// ============================================================
// WHATSAPP NF-e
// ============================================================

function _gerarMensagemWhatsAppNFe(venda, blingPedidoId, nfeId) {
    const e = venda.empresa;
    const t = venda.transporte;

    let msg = '';
    msg += `Ola ${e.responsavel},\n\n`;
    msg += `Segue a confirmacao do seu pedido:\n\n`;
    msg += `━━━━━━━━━━━━━━━━━\n`;
    msg += `*PEDIDO DE VENDA PJ - NXT AUTOPROPELIDOS*\n`;
    msg += `━━━━━━━━━━━━━━━━━\n\n`;
    msg += `*Empresa:* ${e.razaoSocial}\n`;
    msg += `*CNPJ:* ${e.cnpj}\n`;
    if (blingPedidoId) msg += `*Pedido Bling:* #${blingPedidoId}\n`;
    if (nfeId) msg += `*NF-e:* #${nfeId}\n`;
    msg += `\n`;

    msg += `*PRODUTOS*\n`;
    venda.produtos.forEach(p => {
        msg += `- ${p.modelo} ${p.cor} x${p.quantidade} = R$ ${formatarValorMonetario(p.subtotal)}\n`;
    });
    msg += `\n`;
    msg += `*TOTAL: R$ ${formatarValorMonetario(venda.total)}*\n\n`;

    msg += `*TRANSPORTE*\n`;
    const tiposTransporte = { proprio: 'Transporte Próprio', transportadora: 'Transportadora', terceirizado: 'Terceirizado' };
    msg += `${tiposTransporte[t.tipo] || t.tipo}`;
    if (t.nomeTransportadora) msg += ` - ${t.nomeTransportadora}`;
    msg += `\n`;
    if (t.dataPrevista) {
        const dataPrev = new Date(t.dataPrevista + 'T12:00:00').toLocaleDateString('pt-BR');
        msg += `Previsão: ${dataPrev}\n`;
    }
    msg += `\n`;

    msg += `*GARANTIA DO FABRICANTE*\n`;
    msg += `• Quadro: 2 anos contra defeitos de fabricação\n`;
    msg += `• Motor: 2 anos contra defeitos de fabricação\n`;
    msg += `• Bateria: 6 meses contra defeitos de fabricação\n\n`;

    msg += `_NXT Autopropelidos - Mobilidade Urbana_\n`;
    msg += `CNPJ: 55.099.827/0001-96\n`;
    msg += `www.nxt.eco.br`;

    return msg;
}

function enviarNFeWhatsApp() {
    const venda = ultimaVendaRegistrada;
    const resultado = ultimoResultadoBling;

    if (!venda) {
        mostrarFeedback('Nenhuma venda registrada para enviar.', 'erro');
        return;
    }

    if (!resultado.nfeId) {
        mostrarFeedback('Nenhuma NF-e gerada para esta venda.', 'erro');
        return;
    }

    const mensagem = _gerarMensagemWhatsAppNFe(venda, resultado.blingPedidoId, resultado.nfeId);
    const telefoneRaw = (venda.empresa.telefone || '').replace(/\D/g, '');
    const telefone = telefoneRaw.startsWith('55') ? telefoneRaw : `55${telefoneRaw}`;
    const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
}

// ============================================================
// COPIAR RESUMO
// ============================================================

async function copiarResumoVenda() {
    const textarea = document.getElementById('wizardResumoTexto');
    const btn = document.getElementById('btnCopiarResumo');
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

// ============================================================
// FATURA PJ
// ============================================================

function gerarFaturaPJ() {
    const venda = ultimaVendaRegistrada;
    if (!venda) {
        mostrarFeedback('Nenhuma venda registrada para gerar fatura.', 'erro');
        return;
    }

    const resultado = ultimoResultadoBling;
    const dataFormatada = new Date(venda.dataVenda + 'T12:00:00').toLocaleDateString('pt-BR');
    const e = venda.empresa;
    const end = e.endereco || {};
    const pag = venda.pagamento;
    const t = venda.transporte;

    const endPartes = [];
    if (end.rua) endPartes.push(`${end.rua}${end.numero ? ', ' + end.numero : ''}`);
    if (end.complemento) endPartes.push(end.complemento);
    if (end.bairro) endPartes.push(end.bairro);
    const cidadeUf = [end.cidade, end.estado].filter(Boolean).join('/');
    if (cidadeUf) endPartes.push(cidadeUf);
    if (end.cep) endPartes.push(`CEP: ${end.cep}`);

    const nomesFormas = {
        pix: 'PIX', pos: 'PIX POS', dinheiro: 'Dinheiro',
        debito: 'Débito', credito: 'Crédito', prazo: 'A Prazo', outros: 'Outros'
    };

    const formasTexto = (pag.formas || []).map(f => {
        const nome = nomesFormas[f] || f;
        const val = pag.valores && pag.valores[f] ? ` R$ ${formatarValorMonetario(pag.valores[f])}` : '';
        return `<span class="fatura-tag">${nome}${val}</span>`;
    }).join(' ');

    const tiposTransporte = { proprio: 'Transporte Próprio', transportadora: 'Transportadora', terceirizado: 'Terceirizado' };
    const dataPrevistaFmt = t.dataPrevista ? new Date(t.dataPrevista + 'T12:00:00').toLocaleDateString('pt-BR') : null;

    let produtosHTML = venda.produtos.map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${_escaparHTML(p.modelo)}</td>
            <td>${_escaparHTML(p.cor)}</td>
            <td class="fatura-col-num">${p.quantidade}</td>
            <td class="fatura-col-num">R$ ${formatarValorMonetario(p.precoUnitario)}</td>
            <td class="fatura-col-num"><strong>R$ ${formatarValorMonetario(p.subtotal)}</strong></td>
        </tr>
    `).join('');

    let statusBling = '';
    if (resultado.blingSucesso && resultado.blingPedidoId) {
        statusBling += `<span class="fatura-status fatura-status--ok">Pedido Bling #${resultado.blingPedidoId}</span>`;
    }
    if (resultado.nfeId && resultado.nfeEnviada) {
        statusBling += `<span class="fatura-status fatura-status--ok">NF-e #${resultado.nfeId} enviada</span>`;
    } else if (resultado.nfeId) {
        statusBling += `<span class="fatura-status fatura-status--aviso">NF-e #${resultado.nfeId} (enviar manualmente)</span>`;
    }

    const html = `
        <div class="fatura-cabecalho">
            <div class="fatura-empresa-emitente">
                <strong>NXT AUTOPROPELIDOS</strong>
                <span>CNPJ: 55.099.827/0001-96</span>
                <span>www.nxt.eco.br</span>
            </div>
            <div class="fatura-meta">
                <div class="fatura-meta-label">FATURA DE VENDA PJ</div>
                <div class="fatura-meta-info">
                    <span><strong>Data:</strong> ${dataFormatada}</span>
                    <span><strong>Vendedor:</strong> ${_escaparHTML(venda.responsavelVenda)}</span>
                    ${venda.numeroPedidoOC ? `<span><strong>OC:</strong> ${_escaparHTML(venda.numeroPedidoOC)}</span>` : ''}
                    ${statusBling ? `<div class="fatura-status-row">${statusBling}</div>` : ''}
                </div>
            </div>
        </div>

        <div class="fatura-secao">
            <div class="fatura-secao-titulo">DADOS DO CLIENTE</div>
            <div class="fatura-cliente-grid">
                <div><strong>Razão Social:</strong> ${_escaparHTML(e.razaoSocial)}</div>
                <div><strong>CNPJ:</strong> ${_escaparHTML(e.cnpj)}</div>
                ${e.inscricaoEstadual ? `<div><strong>IE:</strong> ${_escaparHTML(e.inscricaoEstadual)}</div>` : ''}
                <div><strong>Responsável:</strong> ${_escaparHTML(e.responsavel)}</div>
                <div><strong>Telefone:</strong> ${_escaparHTML(e.telefone)}</div>
                ${e.email ? `<div><strong>E-mail:</strong> ${_escaparHTML(e.email)}</div>` : ''}
                ${endPartes.length ? `<div class="fatura-cliente-full"><strong>Endereço:</strong> ${_escaparHTML(endPartes.join(' - '))}</div>` : ''}
            </div>
        </div>

        <div class="fatura-secao">
            <div class="fatura-secao-titulo">PRODUTOS</div>
            <div class="fatura-tabela-wrapper">
                <table class="fatura-tabela">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Modelo</th>
                            <th>Cor</th>
                            <th class="fatura-col-num">Qtd</th>
                            <th class="fatura-col-num">Unit.</th>
                            <th class="fatura-col-num">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${produtosHTML}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="fatura-secao fatura-totais-secao">
            <div class="fatura-totais">
                ${venda.frete > 0 ? `
                    <div class="fatura-total-linha">
                        <span>Subtotal Produtos</span>
                        <span>R$ ${formatarValorMonetario(venda.total - venda.frete)}</span>
                    </div>
                    <div class="fatura-total-linha">
                        <span>Frete</span>
                        <span>R$ ${formatarValorMonetario(venda.frete)}</span>
                    </div>
                ` : ''}
                <div class="fatura-total-linha fatura-total-final">
                    <span>TOTAL</span>
                    <span>R$ ${formatarValorMonetario(venda.total)}</span>
                </div>
            </div>
        </div>

        <div class="fatura-secao">
            <div class="fatura-secao-titulo">PAGAMENTO</div>
            <div class="fatura-info-bloco">
                ${formasTexto ? `<div><strong>Formas:</strong> ${formasTexto}</div>` : ''}
                ${pag.condicaoPrazo ? `<div><strong>Condição:</strong> ${_escaparHTML(pag.condicaoPrazo)}</div>` : ''}
                ${pag.condicoesComerciais ? `<div><strong>Condições Comerciais:</strong> ${_escaparHTML(pag.condicoesComerciais)}</div>` : ''}
                ${pag.observacoes ? `<div><strong>Obs:</strong> ${_escaparHTML(pag.observacoes)}</div>` : ''}
            </div>
        </div>

        <div class="fatura-secao">
            <div class="fatura-secao-titulo">TRANSPORTE</div>
            <div class="fatura-info-bloco">
                <div><strong>Tipo:</strong> ${tiposTransporte[t.tipo] || t.tipo}</div>
                ${t.nomeTransportadora ? `<div><strong>Transportadora:</strong> ${_escaparHTML(t.nomeTransportadora)}</div>` : ''}
                ${dataPrevistaFmt ? `<div><strong>Previsão de Entrega:</strong> ${dataPrevistaFmt}</div>` : ''}
                ${t.observacoes ? `<div><strong>Obs:</strong> ${_escaparHTML(t.observacoes)}</div>` : ''}
            </div>
        </div>

        <div class="fatura-garantia">
            <div class="fatura-secao-titulo">GARANTIA</div>
            <ul>
                <li>Quadro: 2 anos contra defeitos de fabricação</li>
                <li>Motor: 2 anos contra defeitos de fabricação</li>
                <li>Bateria: 6 meses contra defeitos de fabricação</li>
            </ul>
        </div>

        <div class="fatura-rodape">
            <span>NXT Autopropelidos - Mobilidade Urbana</span>
            <span>Documento gerado em ${new Date().toLocaleString('pt-BR')}</span>
        </div>
    `;

    document.getElementById('faturaContent').innerHTML = html;
    document.getElementById('modalFatura').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function fecharModalFatura() {
    document.getElementById('modalFatura').style.display = 'none';
    document.body.style.overflow = '';
}

async function copiarFaturaPJ() {
    const venda = ultimaVendaRegistrada;
    if (!venda) return;

    const resultado = ultimoResultadoBling;
    const texto = gerarTextoResumoVendaPJ(venda, resultado.blingSucesso, resultado.blingPedidoId, resultado.nfeId, resultado.nfeEnviada);

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(texto);
        } else {
            const ta = document.createElement('textarea');
            ta.value = texto;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        mostrarFeedback('Fatura copiada!', 'sucesso');
    } catch {
        mostrarFeedback('Erro ao copiar. Tente manualmente.', 'erro');
    }
}

function enviarFaturaWhatsApp() {
    const venda = ultimaVendaRegistrada;
    if (!venda) {
        mostrarFeedback('Nenhuma venda registrada.', 'erro');
        return;
    }

    const resultado = ultimoResultadoBling;
    const mensagem = _gerarMensagemFaturaWhatsApp(venda, resultado);
    const telefoneRaw = (venda.empresa.telefone || '').replace(/\D/g, '');
    const telefone = telefoneRaw.startsWith('55') ? telefoneRaw : `55${telefoneRaw}`;
    const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
}

function _gerarMensagemFaturaWhatsApp(venda, resultado) {
    const dataFormatada = new Date(venda.dataVenda + 'T12:00:00').toLocaleDateString('pt-BR');
    const e = venda.empresa;

    let msg = `*FATURA DE VENDA PJ*\n`;
    msg += `*NXT Autopropelidos*\n\n`;
    msg += `*Data:* ${dataFormatada}\n`;
    if (venda.numeroPedidoOC) msg += `*OC:* ${venda.numeroPedidoOC}\n`;
    msg += `\n`;

    msg += `*Cliente:* ${e.razaoSocial}\n`;
    msg += `*CNPJ:* ${e.cnpj}\n\n`;

    msg += `*Produtos:*\n`;
    venda.produtos.forEach(p => {
        msg += `• ${p.modelo} ${p.cor} | Qtd: ${p.quantidade} | R$ ${formatarValorMonetario(p.subtotal)}\n`;
    });
    msg += `\n`;

    if (venda.frete > 0) msg += `*Frete:* R$ ${formatarValorMonetario(venda.frete)}\n`;
    msg += `*TOTAL: R$ ${formatarValorMonetario(venda.total)}*\n\n`;

    if (resultado.blingPedidoId) msg += `*Pedido Bling:* #${resultado.blingPedidoId}\n`;
    if (resultado.nfeId) msg += `*NF-e:* #${resultado.nfeId}\n`;
    msg += `\n`;

    msg += `*Garantia:*\n`;
    msg += `• Quadro: 2 anos\n`;
    msg += `• Motor: 2 anos\n`;
    msg += `• Bateria: 6 meses\n\n`;

    msg += `_NXT Autopropelidos - Mobilidade Urbana_\n`;
    msg += `CNPJ: 55.099.827/0001-96\n`;
    msg += `www.nxt.eco.br`;

    return msg;
}

// ============================================================
// LIMPAR FORMULÁRIO
// ============================================================

function limparFormulario(confirmar = true) {
    if (confirmar && !confirm('Limpar todos os campos do formulário?')) return;

    document.getElementById('vendaForm').reset();
    produtosDaVenda = [];
    vendaJaEnviada = false;

    atualizarListaProdutosUI();
    calcularTotal();
    atualizarProgressoVenda();
    selecionarParcelas(1);
    handlePagamentoChange();

    // Restaurar botão
    const btn = document.querySelector('.btn-registrar');
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Registrar Venda PJ';
    }

    // Resetar estados visuais de pagamento
    document.getElementById('valoresFormasPagamento').style.display = 'none';
    document.getElementById('parcelasGroup').style.display = 'none';
    document.getElementById('prazoGroup').style.display = 'none';
    document.getElementById('outrosPagamentoGroup').style.display = 'none';
    document.getElementById('pixInfoCard').style.display = 'none';
    document.getElementById('dinheiroInfoCard').style.display = 'none';

    // Resetar CEP
    document.getElementById('cepStatus').textContent = '';
    document.getElementById('cepStatus').className = 'cep-status';

    // Resetar Bling status
    limparStatusBling();

    // Resetar IE Isento
    const ieInput = document.getElementById('inscricaoEstadual');
    if (ieInput) {
        ieInput.disabled = false;
        ieInput.style.opacity = '';
    }

    // Resetar transporte
    document.querySelectorAll('.entrega-card').forEach(c => c.classList.remove('active'));
    document.getElementById('tipoTransporte').value = '';
    document.getElementById('transportadoraGroup').style.display = 'none';
    const nomeTransp = document.getElementById('nomeTransportadora');
    if (nomeTransp) nomeTransp.required = false;

    // Resetar subtotal display
    const subtotalEl = document.getElementById('subtotalDisplay');
    if (subtotalEl) subtotalEl.textContent = 'R$ 0,00';

    // Resetar quantidade
    const qtdEl = document.getElementById('quantidadeProduto');
    if (qtdEl) qtdEl.value = '1';

    definirDataAtual();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// UTILITÁRIOS MONETÁRIOS
// ============================================================

function formatarValorMonetario(valor) {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function obterValorNumerico(id) {
    const input = document.getElementById(id);
    if (!input) return 0;
    return obterValorNumericoDeInput(input);
}

function obterValorNumericoDeInput(input) {
    const raw = input.value.replace(/[^\d,]/g, '').replace(',', '.');
    const val = parseFloat(raw);
    return isNaN(val) ? 0 : val;
}

function formatarMoeda(event) {
    let value = event.target.value.replace(/\D/g, '');
    if (value === '') {
        event.target.value = '';
        return;
    }
    const num = parseInt(value, 10) / 100;
    event.target.value = 'R$ ' + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function finalizarFormatacaoMoeda(event) {
    if (event.target.value === 'R$ ' || event.target.value === 'R$') {
        event.target.value = '';
    }
}

// ============================================================
// FEEDBACK TOAST
// ============================================================

function mostrarFeedback(mensagem, tipo) {
    document.querySelectorAll('.feedback-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `feedback-toast ${tipo}`;
    toast.innerHTML = `
        <span class="feedback-icon">${tipo === 'sucesso' ? '&#10003;' : '&#9888;'}</span>
        <span class="feedback-msg">${mensagem}</span>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
