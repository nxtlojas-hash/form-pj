// ============================================================
// NXT LOJAS — FORM PJ — SCRIPT
// Build: 2026-03-21-pj-v1
// ============================================================

const WEBHOOK_URL = 'https://hook.us2.make.com/ku3pkl5io6mnh7k8tq275vhowhkcwxxo';

// ---- Estado Global ----
let dadosLojas = {};
let dadosProdutos = {};
let dadosMatriculas = {};
let produtosDaVenda = [];
let vendaJaEnviada = false;

// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await carregarDadosIniciais();
    definirDataAtual();
    aplicarMascaras();
    configurarFormulario();
    configurarPagamentoCards();
    configurarBuscaVendedor();
    atualizarProgressoVenda();
});

async function carregarDadosIniciais() {
    try {
        const [lojasRes, produtosRes, vendedoresRes] = await Promise.all([
            fetch('dados/lojas.json'),
            fetch('dados/produtos.json'),
            fetch('dados/vendedores_json.json')
        ]);

        if (!lojasRes.ok) throw new Error('Erro ao carregar lojas.json');
        dadosLojas = await lojasRes.json();

        if (!produtosRes.ok) throw new Error('Erro ao carregar produtos.json');
        dadosProdutos = await produtosRes.json();

        if (!vendedoresRes.ok) throw new Error('Erro ao carregar vendedores_json.json');
        const vendedoresData = await vendedoresRes.json();
        dadosMatriculas = vendedoresData.matriculas || {};

        preencherDropdowns();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        mostrarFeedback('Erro ao carregar dados de configuração: ' + error.message, 'erro');
    }
}

function preencherDropdowns() {
    const lojaVendaSelect = document.getElementById('lojaVenda');
    const lojaSaidaSelect = document.getElementById('lojaSaida');
    const modeloProdutoSelect = document.getElementById('modeloProduto');
    const corProdutoSelect = document.getElementById('corProduto');

    // Lojas
    for (const id in dadosLojas) {
        if (dadosLojas[id].tipo === 'loja') {
            const opt = new Option(dadosLojas[id].nome, id);
            lojaVendaSelect.add(opt.cloneNode(true));
            lojaSaidaSelect.add(new Option(dadosLojas[id].nome, id));
        }
    }

    // Modelos
    if (dadosProdutos.modelos) {
        dadosProdutos.modelos.forEach(m => modeloProdutoSelect.add(new Option(m, m)));
    }

    // Cores
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

    document.querySelectorAll('.valor-forma-pagamento').forEach(input => {
        input.addEventListener('input', calcularTotalFormasPagamento);
    });

    document.querySelectorAll('.currency-input').forEach(input => {
        input.addEventListener('input', formatarMoeda);
        input.addEventListener('blur', finalizarFormatacaoMoeda);
    });

    document.getElementById('precoProduto').addEventListener('input', calcularTotal);
    document.getElementById('valorFrete').addEventListener('input', calcularTotal);

    document.getElementById('origemProduto').addEventListener('change', () => {
        const origem = document.getElementById('origemProduto').value;
        const lojaSaidaGroup = document.getElementById('lojaSaidaGroup');
        if (lojaSaidaGroup) {
            lojaSaidaGroup.style.display = origem === 'outro_lugar' ? 'block' : 'none';
        }
    });

    // Atualizar progresso ao preencher campos-chave
    ['lojaVenda', 'vendedor', 'cnpjEmpresa', 'responsavelCompra', 'telefoneEmpresa'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', atualizarProgressoVenda);
            el.addEventListener('change', atualizarProgressoVenda);
        }
    });
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
// BUSCA DE VENDEDOR (AUTOCOMPLETE)
// ============================================================

function configurarBuscaVendedor() {
    const vendedorInput = document.getElementById('vendedor');
    const matriculaInput = document.getElementById('matriculaVendedor');
    const suggestionsDiv = document.getElementById('vendedorSuggestions');
    let highlightedIndex = -1;

    if (!vendedorInput || !suggestionsDiv) return;

    // Preenche nome ao digitar matrícula
    matriculaInput.addEventListener('input', function () {
        const mat = this.value.trim();
        if (mat.length === 4 && dadosMatriculas[mat]) {
            const entry = dadosMatriculas[mat];
            const nome = Array.isArray(entry) ? entry[0].nome : entry.nome;
            vendedorInput.value = nome;
            atualizarProgressoVenda();
        }
    });

    vendedorInput.addEventListener('input', function () {
        const query = this.value.trim().toLowerCase();
        suggestionsDiv.innerHTML = '';
        highlightedIndex = -1;

        if (query.length < 2) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        const resultados = [];

        for (const mat in dadosMatriculas) {
            const entry = dadosMatriculas[mat];
            const items = Array.isArray(entry) ? entry : [entry];
            items.forEach(item => {
                if (
                    item.nome.toLowerCase().includes(query) ||
                    mat.includes(query)
                ) {
                    resultados.push({ matricula: mat, nome: item.nome, loja: item.loja });
                }
            });
        }

        if (resultados.length === 0) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        resultados.slice(0, 8).forEach((r, idx) => {
            const div = document.createElement('div');
            div.className = 'vendedor-suggestion';
            div.innerHTML = `<strong>${r.matricula}</strong> — ${r.nome} <span style="font-size:0.75rem;color:#666;">(${r.loja})</span>`;
            div.addEventListener('mousedown', () => {
                vendedorInput.value = r.nome;
                matriculaInput.value = r.matricula;
                suggestionsDiv.classList.remove('show');
                atualizarProgressoVenda();
            });
            suggestionsDiv.appendChild(div);
        });

        suggestionsDiv.classList.add('show');
    });

    vendedorInput.addEventListener('keydown', function (e) {
        const items = suggestionsDiv.querySelectorAll('.vendedor-suggestion');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, -1);
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault();
            items[highlightedIndex].dispatchEvent(new Event('mousedown'));
            return;
        } else if (e.key === 'Escape') {
            suggestionsDiv.classList.remove('show');
            return;
        }
        items.forEach((item, i) => item.classList.toggle('highlighted', i === highlightedIndex));
    });

    vendedorInput.addEventListener('blur', () => {
        setTimeout(() => suggestionsDiv.classList.remove('show'), 150);
    });
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

function adicionarProduto() {
    const modelo = document.getElementById('modeloProduto').value;
    const cor = document.getElementById('corProduto').value;
    const preco = obterValorNumerico('precoProduto');

    if (!modelo || !cor || preco <= 0) {
        mostrarFeedback('Selecione modelo, cor e informe um preço válido', 'erro');
        return;
    }

    produtosDaVenda.push({
        id: Date.now(),
        modelo,
        cor,
        chassi: document.getElementById('chassiProduto').value.trim(),
        motor: document.getElementById('motorProduto').value.trim(),
        preco,
        capacete: document.getElementById('acompanhaCapacete').value,
        corCapacete: document.getElementById('corCapacete').value.trim()
    });

    atualizarListaProdutosUI();
    calcularTotal();
    limparCamposProduto();
    mostrarFeedback(`${modelo} adicionado à venda!`, 'sucesso');
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
        const capaceteInfo = p.capacete === 'sim' ? ` · Capacete ${p.corCapacete || ''}`.trimEnd() : '';
        const extras = [p.chassi ? `Chassi: ${p.chassi}` : '', p.motor ? `Motor: ${p.motor}` : '', capaceteInfo]
            .filter(Boolean).join(' · ');
        div.innerHTML = `
            <div class="produto-info">
                <div class="produto-modelo">${p.modelo} — ${p.cor}</div>
                ${extras ? `<div class="produto-detalhes">${extras}</div>` : ''}
            </div>
            <div class="produto-preco">R$ ${formatarValorMonetario(p.preco)}</div>
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
    document.getElementById('chassiProduto').value = '';
    document.getElementById('motorProduto').value = '';
    document.getElementById('acompanhaCapaceteCheck').checked = false;
    document.getElementById('acompanhaCapacete').value = 'nao';
    document.getElementById('corCapacete').value = '';
    document.getElementById('corCapaceteContainer').style.display = 'none';
}

function toggleCapaceteVisual() {
    const check = document.getElementById('acompanhaCapaceteCheck');
    const container = document.getElementById('corCapaceteContainer');
    const hidden = document.getElementById('acompanhaCapacete');
    container.style.display = check.checked ? 'block' : 'none';
    hidden.value = check.checked ? 'sim' : 'nao';
    if (!check.checked) document.getElementById('corCapacete').value = '';
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

    const formas = ['pix', 'pos', 'dinheiro', 'debito', 'credito', 'outros'];
    formas.forEach(forma => {
        const group = document.getElementById(`${forma}ValorGroup`);
        if (group) group.style.display = selecionadas.includes(forma) ? 'flex' : 'none';
    });

    valoresSection.style.display = selecionadas.length > 0 ? 'block' : 'none';
    parcelasGroup.style.display = selecionadas.includes('credito') ? 'block' : 'none';
    outrosGroup.style.display = selecionadas.includes('outros') ? 'block' : 'none';
}

function selecionarParcelas(parcelas) {
    document.querySelectorAll('.parcela-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.parcelas === String(parcelas));
    });
    document.getElementById('parcelasCredito').value = parcelas;
}

function obterValoresFormasPagamento() {
    const valores = {};
    const formas = ['pix', 'pos', 'dinheiro', 'debito', 'credito', 'outros'];
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
    // Apenas recalcula total (sem validação aqui, feita no submit)
    calcularTotal();
}

// ============================================================
// ENTREGA
// ============================================================

function selecionarTipoEntrega(tipo) {
    document.querySelectorAll('.entrega-card').forEach(card => {
        card.classList.toggle('active', card.dataset.tipo === tipo);
    });
    document.getElementById('tipoEntrega').value = tipo;
}

// ============================================================
// TOTAL
// ============================================================

function calcularTotal() {
    const totalProdutos = produtosDaVenda.reduce((acc, p) => acc + p.preco, 0);
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

    const loja = document.getElementById('lojaVenda')?.value;
    const vendedor = document.getElementById('vendedor')?.value;
    steps[0].classList.toggle('completed', !!(loja && vendedor));

    const cnpj = document.getElementById('cnpjEmpresa')?.value;
    const responsavel = document.getElementById('responsavelCompra')?.value;
    const tel = document.getElementById('telefoneEmpresa')?.value;
    steps[1].classList.toggle('completed', !!(cnpj && responsavel && tel));

    steps[2].classList.toggle('completed', produtosDaVenda.length > 0);

    const pagSelecionado = document.querySelectorAll('input[name="pagamento"]:checked').length > 0;
    steps[3].classList.toggle('completed', pagSelecionado);

    const prazo = document.getElementById('prazoEntrega')?.value;
    steps[4].classList.toggle('completed', !!prazo);

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
        const lojaId = document.getElementById('lojaVenda').value;
        const nomeLoja = dadosLojas[lojaId]?.nome || lojaId;

        const venda = {
            tipo: 'PJ',
            id: `VNDA-PJ-${Date.now()}`,
            loja: nomeLoja,
            vendedor: document.getElementById('vendedor').value.trim(),
            matriculaVendedor: document.getElementById('matriculaVendedor').value.trim(),
            dataVenda: document.getElementById('dataVenda').value,

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

            produtos: produtosDaVenda,

            pagamento: {
                formas: Array.from(formasSelecionadas).map(cb => cb.value),
                valores: obterValoresFormasPagamento(),
                parcelas: document.getElementById('parcelasCredito').value,
                observacoes: document.getElementById('observacoesPagamento').value.trim()
            },

            entrega: {
                tipo: document.getElementById('tipoEntrega').value,
                prazo: document.getElementById('prazoEntrega').value,
                valorFrete: obterValorNumerico('valorFrete'),
                origem: document.getElementById('origemProduto').value,
                localSaida: document.getElementById('origemProduto').value === 'propria_loja'
                    ? lojaId
                    : document.getElementById('lojaSaida').value
            },

            total: produtosDaVenda.reduce((acc, p) => acc + p.preco, 0) + obterValorNumerico('valorFrete')
        };

        // Enviar ao webhook Make.com
        let webhookSucesso = false;
        try {
            const res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(venda)
            });
            webhookSucesso = res.ok;
        } catch (err) {
            console.warn('Webhook indisponível:', err);
        }

        // Salvar localmente
        const vendasSalvas = JSON.parse(localStorage.getItem('vendas_pj') || '[]');
        vendasSalvas.push(venda);
        localStorage.setItem('vendas_pj', JSON.stringify(vendasSalvas));

        vendaJaEnviada = true;
        btnRegistrar.textContent = 'Venda Enviada';

        // Mostrar modal de sucesso
        exibirModalSucesso(venda, webhookSucesso);

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

function exibirModalSucesso(venda, webhookSucesso) {
    const modal = document.getElementById('modalSucesso');
    const msg = document.getElementById('sucessoMsg');
    const detalhes = document.getElementById('sucessoDetalhes');

    msg.textContent = webhookSucesso
        ? 'Venda registrada e enviada para o sistema com sucesso.'
        : 'Venda salva localmente. O envio automático será tentado novamente.';

    const dataFormatada = new Date(venda.dataVenda + 'T12:00:00').toLocaleDateString('pt-BR');
    detalhes.innerHTML = `
        <strong>Empresa:</strong> ${venda.empresa.razaoSocial}<br>
        <strong>CNPJ:</strong> ${venda.empresa.cnpj}<br>
        <strong>Vendedor:</strong> ${venda.vendedor}<br>
        <strong>Data:</strong> ${dataFormatada}<br>
        <strong>Produtos:</strong> ${venda.produtos.length} item(s)<br>
        <strong>Total:</strong> R$ ${formatarValorMonetario(venda.total)}
    `;

    modal.style.display = 'flex';
}

function fecharModalSucesso() {
    document.getElementById('modalSucesso').style.display = 'none';
    limparFormulario(false);
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

    // Resetar toggles e estados visuais
    document.getElementById('acompanhaCapacete').value = 'nao';
    document.getElementById('corCapaceteContainer').style.display = 'none';
    document.getElementById('valoresFormasPagamento').style.display = 'none';
    document.getElementById('parcelasGroup').style.display = 'none';
    document.getElementById('outrosPagamentoGroup').style.display = 'none';
    document.getElementById('pixInfoCard').style.display = 'none';
    document.getElementById('dinheiroInfoCard').style.display = 'none';
    document.getElementById('cepStatus').textContent = '';
    document.getElementById('cepStatus').className = 'cep-status';
    document.getElementById('lojaSaidaGroup').style.display = 'none';

    // Resetar IE Isento
    const ieInput = document.getElementById('inscricaoEstadual');
    if (ieInput) {
        ieInput.disabled = false;
        ieInput.style.opacity = '';
    }

    // Resetar entrega
    selecionarTipoEntrega('retirada');

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
