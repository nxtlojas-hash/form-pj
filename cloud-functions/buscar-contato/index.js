const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const secretClient = new SecretManagerServiceClient();

const PROJECT_ID = 'plataforma-nxt-99c15';
const BLING_API_BASE = 'https://api.bling.com.br/Api/v3';

// Mapa fiscal NXT embutido (fonte única da verdade — ignora dadosFiscais do request).
// Split bruto 20/40/40 com IPI descontado por item (ver _info no JSON).
const FISCAL_NXT = require('./produtos-fiscal-nxt.json');

// Cache em memória (persiste entre invocações da mesma instância)
let cachedAccessToken = null;
let tokenExpiry = 0;

// ============================================================
// SECRET MANAGER
// ============================================================

async function getSecret(name) {
    const [version] = await secretClient.accessSecretVersion({
        name: `projects/${PROJECT_ID}/secrets/${name}/versions/latest`
    });
    return version.payload.data.toString('utf8');
}

async function saveSecret(name, value) {
    try {
        await secretClient.addSecretVersion({
            parent: `projects/${PROJECT_ID}/secrets/${name}`,
            payload: { data: Buffer.from(value, 'utf8') }
        });
    } catch (err) {
        console.error(`Erro ao salvar secret ${name}:`, err.message);
    }
}

// ============================================================
// BLING AUTH
// ============================================================

async function getAccessToken() {
    if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
        return cachedAccessToken;
    }

    const clientId = await getSecret('bling-client-id');
    const clientSecret = await getSecret('bling-client-secret');
    const refreshToken = await getSecret('bling-refresh-token');

    // Tentar usar access token salvo
    try {
        const savedToken = await getSecret('bling-access-token');
        if (savedToken) {
            const testRes = await fetch(`${BLING_API_BASE}/contatos?limite=1`, {
                headers: { 'Authorization': `Bearer ${savedToken}`, 'Accept': 'application/json' }
            });
            if (testRes.ok) {
                cachedAccessToken = savedToken;
                tokenExpiry = Date.now() + 3600000;
                return savedToken;
            }
        }
    } catch (e) {
        console.log('Access token salvo inválido, renovando...');
    }

    // Renovar token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(`${BLING_API_BASE}/oauth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Erro ao renovar token Bling: ${JSON.stringify(data)}`);
    }

    cachedAccessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);

    await Promise.all([
        saveSecret('bling-access-token', data.access_token),
        saveSecret('bling-refresh-token', data.refresh_token)
    ]);

    return data.access_token;
}

// ============================================================
// BLING API HELPER
// ============================================================

// Rate limit: max 3 req/s no Bling. Esperar 400ms entre chamadas.
let lastRequestTime = 0;

async function blingRequest(endpoint, method = 'GET', body = null) {
    // Throttle: garantir intervalo mínimo entre requisições
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < 400) {
        await new Promise(r => setTimeout(r, 400 - elapsed));
    }
    lastRequestTime = Date.now();

    const accessToken = await getAccessToken();

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };

    if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BLING_API_BASE}${endpoint}`, options);
    const data = await response.json();

    // Retry uma vez se for rate limit
    if (response.status === 429) {
        console.log('Rate limit atingido, aguardando 2s...');
        await new Promise(r => setTimeout(r, 2000));
        lastRequestTime = Date.now();
        const retryRes = await fetch(`${BLING_API_BASE}${endpoint}`, options);
        const retryData = await retryRes.json();
        if (!retryRes.ok) {
            throw new Error(`Bling API ${retryRes.status}: ${JSON.stringify(retryData)}`);
        }
        return retryData;
    }

    if (!response.ok) {
        throw new Error(`Bling API ${response.status}: ${JSON.stringify(data)}`);
    }

    return data;
}

// ============================================================
// BUSCAR CONTATO POR CNPJ
// ============================================================

async function buscarContatoPorCNPJ(cnpj) {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const contato = await localizarContatoPorCNPJ(cnpjLimpo);

    if (!contato) return null;

    const contatoId = contato.id;
    try {
        const detail = await blingRequest(`/contatos/${contatoId}`);
        return mapearContatoCompleto(detail.data);
    } catch (e) {
        return mapearContatoBasico(contato);
    }
}

function mapearContatoBasico(contato) {
    return {
        encontrado: true,
        id: contato.id,
        razaoSocial: contato.nome || '',
        nomeFantasia: contato.fantasia || '',
        telefone: contato.telefone || '',
        email: contato.email || ''
    };
}

function mapearContatoCompleto(contato) {
    const endereco = contato.endereco || {};
    return {
        encontrado: true,
        id: contato.id,
        razaoSocial: contato.nome || '',
        nomeFantasia: contato.fantasia || '',
        inscricaoEstadual: contato.ie || '',
        telefone: contato.telefone || contato.celular || '',
        email: contato.email || '',
        endereco: {
            cep: (endereco.geral?.cep || '').replace(/\D/g, ''),
            logradouro: endereco.geral?.endereco || '',
            numero: endereco.geral?.numero || '',
            bairro: endereco.geral?.bairro || '',
            cidade: endereco.geral?.municipio || '',
            uf: endereco.geral?.uf || ''
        }
    };
}

// ============================================================
// BUSCAR OU CRIAR CONTATO
// ============================================================

// Busca ampla de contato por CNPJ: numeroDocumento (digitos) e fallback via pesquisa
// (digitos e formatado) — contatos gravados com pontuacao escapam do filtro numeroDocumento.
async function localizarContatoPorCNPJ(cnpjLimpo) {
    if (!cnpjLimpo) return null;

    const porDocumento = await blingRequest(`/contatos?numeroDocumento=${cnpjLimpo}&limite=1`);
    if (porDocumento.data && porDocumento.data.length > 0) return porDocumento.data[0];

    const cnpjFormatado = cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    for (const termo of [cnpjLimpo, cnpjFormatado]) {
        try {
            const res = await blingRequest(`/contatos?pesquisa=${encodeURIComponent(termo)}&limite=5`);
            const hit = (res.data || []).find(c =>
                String(c.numeroDocumento || '').replace(/\D/g, '') === cnpjLimpo);
            if (hit) return hit;
        } catch (e) {
            console.log(`Busca pesquisa=${termo} falhou: ${e.message}`);
        }
    }
    return null;
}

async function buscarOuCriarContato(empresa) {
    const cnpjLimpo = (empresa.cnpj || '').replace(/\D/g, '');

    // Buscar por CNPJ (busca ampla)
    const existente = await localizarContatoPorCNPJ(cnpjLimpo);
    if (existente) {
        console.log(`Contato encontrado: ${existente.nome} (id ${existente.id})`);
        return existente.id;
    }

    // Criar novo contato PJ
    const novoContato = {
        nome: empresa.razaoSocial,
        fantasia: empresa.nomeFantasia || '',
        tipo: 'J',
        situacao: 'A',
        numeroDocumento: cnpjLimpo,
        ie: empresa.inscricaoEstadual || '',
        telefone: (empresa.telefone || '').replace(/\D/g, ''),
        celular: (empresa.telefone || '').replace(/\D/g, ''),
        email: empresa.email || '',
        endereco: {
            geral: {
                endereco: empresa.endereco?.rua || '',
                numero: empresa.endereco?.numero || '',
                bairro: empresa.endereco?.bairro || '',
                municipio: empresa.endereco?.cidade || '',
                uf: empresa.endereco?.estado || '',
                cep: (empresa.endereco?.cep || '').replace(/\D/g, '')
            }
        }
    };

    try {
        const resultado = await blingRequest('/contatos', 'POST', novoContato);
        return resultado.data.id;
    } catch (e) {
        // "CNPJ ja esta cadastrado no contato X" — o contato existe mas escapou da busca.
        // Tentar localizar de novo (busca ampla); se nem assim aparecer, esta na LIXEIRA do
        // Bling (bloqueia duplicata mas e invisivel a API) — erro claro para o operador.
        if (/j\S* est\S* cadastrado/i.test(e.message)) {
            console.log('CNPJ duplicado ao criar — relocalizando contato...');
            const achado = await localizarContatoPorCNPJ(cnpjLimpo);
            if (achado) {
                console.log(`Contato recuperado pos-duplicata: ${achado.nome} (id ${achado.id})`);
                return achado.id;
            }
            throw new Error(`CNPJ ${cnpjLimpo} pertence a um contato que nao aparece na busca ` +
                `(provavelmente na LIXEIRA do Bling). Restaure o contato no Bling ou use outro CNPJ.`);
        }
        throw e;
    }
}

// ============================================================
// CRIAR PEDIDO DE VENDA NO BLING
// ============================================================

async function criarPedidoVenda(venda) {
    // 1. Buscar ou criar contato
    const contatoId = await buscarOuCriarContato(venda.empresa);

    // 2. Detectar operacao interestadual (matriz em SC)
    const estadoCliente = (venda.empresa.endereco?.estado || '').toUpperCase();
    const isInterestadual = estadoCliente && estadoCliente !== 'SC';
    const cfopSugerido = isInterestadual ? '6102' : '5102';
    console.log(`Estado cliente: ${estadoCliente}, Interestadual: ${isInterestadual}, CFOP: ${cfopSugerido}`);

    // 3. Montar itens do pedido — formato fiscal NXT (3 linhas por moto, IPI descontado)
    // Padrao da emissora (validado na NF-e 004457): cadastro POR MODELO (ex. HY001/HY002/HY003),
    // split bruto 20% principal / 40% motor / 40% bateria, valor liquido = bruto / (1 + IPI),
    // bateria em unidades individuais (qtd_motos x 4/5/6).
    const itensPedido = [];

    // Cache de lookup por codigo (evita repetir GET /produtos por codigo na mesma venda)
    const cacheProduto = {};
    const buscarProdutoPorCodigo = async (codigo) => {
        if (cacheProduto[codigo] !== undefined) return cacheProduto[codigo];
        try {
            const busca = await blingRequest(`/produtos?codigo=${encodeURIComponent(codigo)}`);
            cacheProduto[codigo] = (busca.data && busca.data.length > 0) ? busca.data[0] : null;
        } catch (e) {
            cacheProduto[codigo] = null;
        }
        return cacheProduto[codigo];
    };

    for (let i = 0; i < venda.produtos.length; i++) {
        const produto = venda.produtos[i];
        const precoUnit = produto.precoUnitario || produto.preco || 0;
        const qtdMotos = produto.quantidade || 1;
        const dadoFiscal = FISCAL_NXT[produto.modelo];

        if (dadoFiscal && dadoFiscal.itens && dadoFiscal.itens.length > 0) {
            console.log(`Fiscal NXT ${produto.modelo}: ${dadoFiscal.itens.length} linhas, ${qtdMotos} un a R$${precoUnit}`);

            for (const itemFiscal of dadoFiscal.itens) {
                const ipi = itemFiscal.ipi || 0;
                // Valor por UNIDADE fiscal (bateria ja e por unidade no mapa), liquido de IPI
                const valorLiquido = Math.round((precoUnit * itemFiscal.percentual / (1 + ipi)) * 100) / 100;

                const item = {
                    codigo: itemFiscal.codigo,
                    descricao: itemFiscal.descricao,
                    unidade: itemFiscal.unidade || 'UN',
                    quantidade: qtdMotos * (itemFiscal.quantidade || 1),
                    valor: valorLiquido
                };

                // Vincular ao cadastro do Bling pelo CODIGO (nao por nome)
                const prodBling = await buscarProdutoPorCodigo(itemFiscal.codigo);
                if (prodBling) {
                    item.produto = { id: prodBling.id };
                    item.descricao = prodBling.nome; // descricao oficial do cadastro
                    console.log(`Vinculado: ${itemFiscal.codigo} -> ID ${prodBling.id}`);
                } else {
                    console.log(`Cadastro ausente no Bling: ${itemFiscal.codigo} (${produto.modelo} ${itemFiscal.tipo}) — item vai por descricao`);
                }

                itensPedido.push(item);
            }
        } else if (produto.modelo === 'Capacete') {
            // Capacete vendido como produto proprio (sem desdobramento)
            itensPedido.push({
                descricao: 'CAPACETE DE PLASTICO PVC',
                unidade: 'UN',
                quantidade: qtdMotos,
                valor: precoUnit
            });
        } else {
            // Sem desdobramento fiscal: enviar como item unico
            const descricao = `NXT Autopropelido ${produto.modelo} ${produto.cor}`;
            const item = {
                descricao: descricao,
                unidade: 'UN',
                quantidade: produto.quantidade || 1,
                valor: precoUnit
            };

            try {
                const busca = await blingRequest(`/produtos?nome=${encodeURIComponent(descricao)}`);
                if (busca.data && busca.data.length > 0) {
                    item.produto = { id: busca.data[0].id };
                }
            } catch (e) {
                // Produto nao encontrado — envia sem vinculo
            }

            itensPedido.push(item);
        }
    }

    // 4. Frete como item (se houver)
    if (venda.frete > 0) {
        itensPedido.push({
            codigo: 'FRETE',
            descricao: 'Frete',
            unidade: 'UN',
            quantidade: 1,
            valor: venda.frete
        });
    }

    // 5. Mapear forma de pagamento
    const mapeamentoPagamento = {
        'dinheiro': 1, 'pix': 17, 'pos': 17, 'debito': 4,
        'credito': 3, 'prazo': 15, 'boleto': 15, 'outros': 99
    };
    const primeiraForma = (venda.pagamento?.formas || [])[0] || 'outros';
    const formaPagamentoId = mapeamentoPagamento[primeiraForma] || 99;

    // 6. Montar parcelas — o Bling exige soma das parcelas = soma dos ITENS do pedido
    // (que sao liquidos de IPI). O total cobrado (com IPI) vai nas observacoes; o IPI e
    // acrescentado pelo Bling na emissao da NF-e, fechando no preco de venda.
    const totalPedido = Math.round(itensPedido.reduce(
        (s, it) => s + Math.round(it.quantidade * it.valor * 100) / 100 * 1, 0) * 100) / 100;

    const parcelas = [];
    const condicaoPrazo = venda.pagamento?.condicaoPrazo || '';

    if (primeiraForma === 'prazo' && condicaoPrazo) {
        const diasParcelas = condicaoPrazo === '30 dias' ? [30]
            : condicaoPrazo === '30/60 dias' ? [30, 60]
            : condicaoPrazo === '30/60/90 dias' ? [30, 60, 90]
            : [30];

        const dataBase = new Date(venda.dataVenda + 'T12:00:00');
        let acumulado = 0;

        diasParcelas.forEach((dias, idx) => {
            const dataVenc = new Date(dataBase);
            dataVenc.setDate(dataVenc.getDate() + dias);
            // Ultima parcela absorve o arredondamento para fechar exato
            const valor = (idx === diasParcelas.length - 1)
                ? Math.round((totalPedido - acumulado) * 100) / 100
                : Math.round(totalPedido / diasParcelas.length * 100) / 100;
            acumulado = Math.round((acumulado + valor) * 100) / 100;
            parcelas.push({
                dataVencimento: dataVenc.toISOString().split('T')[0],
                valor: valor
            });
        });
    } else {
        parcelas.push({
            dataVencimento: venda.dataVenda,
            valor: totalPedido
        });
    }

    // 7. Transporte
    const tipoFrete = venda.transporte?.tipo === 'proprio' ? 0
        : venda.transporte?.tipo === 'transportadora' ? 1
        : venda.transporte?.tipo === 'terceirizado' ? 2
        : 9;

    const transporte = {
        fretePorConta: tipoFrete,
        valorFrete: venda.frete || 0
    };

    if (venda.transporte?.nomeTransportadora) {
        transporte.transportador = {
            nome: venda.transporte.nomeTransportadora
        };
    }

    // 8. Observacoes — formato identico ao app
    let infoProdutos = '';
    venda.produtos.forEach((p, index) => {
        infoProdutos += `\nModelo: ${p.modelo}
Cor: ${p.cor}
Qtd: ${p.quantidade || 1}`;
        if (index < venda.produtos.length - 1) infoProdutos += '\n---';
    });

    const anoAtual = new Date().getFullYear();
    const observacoes = `O uso de equipamentos de seguranca e obrigatorio.
Fabricante NXT${infoProdutos}
Ano ${anoAtual}

Informacoes de Garantia do Fabricante:
Quadro: Garantia de 2 (dois) anos contra defeitos de fabricacao, contados a partir da data da nota fiscal.
Motor: Garantia de 2 (dois) anos contra defeitos de fabricacao, contados a partir da data da nota fiscal.
Bateria: Garantia de 6 (seis) meses contra defeitos de fabricacao, contados a partir da data da nota fiscal.

Observacao: As garantias acima referem-se exclusivamente a defeitos de fabricacao. Danos causados por uso inadequado, acidentes ou desgaste natural nao estao cobertos.

Empresa: ${venda.empresa.razaoSocial}
CNPJ: ${venda.empresa.cnpj}
Responsavel Compra: ${venda.empresa.responsavel || ''}
Vendedor: ${venda.responsavelVenda}
Total da venda (com IPI): R$ ${Number(venda.total || 0).toFixed(2).replace('.', ',')} — itens do pedido sao liquidos de IPI; a NF-e fecha neste total.
${venda.empresa.email ? 'E-mail: ' + venda.empresa.email : ''}
${venda.numeroPedidoOC ? 'OC: ' + venda.numeroPedidoOC : ''}
${venda.pagamento?.observacoes ? 'Obs: ' + venda.pagamento.observacoes : ''}`.trim();

    // 9. Montar pedido — igual ao app
    const pedido = {
        contato: { id: contatoId },
        data: venda.dataVenda,
        numero: venda.id.replace('VNDA-PJ-', ''),
        numeroLoja: venda.id,
        vendedor: { nome: venda.responsavelVenda },
        naturezaOperacao: { id: 15105967674 },
        itens: itensPedido,
        parcelas: parcelas,
        transporte: transporte,
        observacoes: observacoes
    };

    // 9. Criar pedido — NF-e NAO e gerada automaticamente (decisao 2026-07-12):
    // a emissora confere o pedido (3 linhas por moto, valores liquidos de IPI) e emite a NF-e ela mesma.
    const resultado = await blingRequest('/pedidos/vendas', 'POST', pedido);
    const pedidoId = resultado.data.id;

    return {
        sucesso: true,
        pedidoId,
        numero: resultado.data.numero
    };
}

// ============================================================
// ENTRY POINTS (Cloud Functions)
// ============================================================

function setCORS(res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
}

// Entry point: buscar contato
exports.buscarContato = async (req, res) => {
    setCORS(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');

    const cnpj = req.query.cnpj || req.body?.cnpj;
    if (!cnpj) return res.status(400).json({ error: 'Parâmetro cnpj é obrigatório' });

    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });

    try {
        const contato = await buscarContatoPorCNPJ(cnpjLimpo);
        return res.status(200).json(contato || { encontrado: false });
    } catch (error) {
        console.error('Erro ao buscar contato:', error);
        return res.status(500).json({ error: 'Erro ao buscar contato no Bling', details: error.message });
    }
};

// Entry point: registrar venda (cria contato + pedido no Bling)
exports.registrarVenda = async (req, res) => {
    setCORS(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    const venda = req.body;
    if (!venda || !venda.empresa || !venda.produtos || venda.produtos.length === 0) {
        return res.status(400).json({ error: 'Dados da venda incompletos' });
    }

    try {
        const resultado = await criarPedidoVenda(venda);
        return res.status(200).json(resultado);
    } catch (error) {
        console.error('Erro ao registrar venda no Bling:', error);
        return res.status(500).json({ error: 'Erro ao criar pedido no Bling', details: error.message });
    }
};
