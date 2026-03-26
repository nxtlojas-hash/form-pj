const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const secretClient = new SecretManagerServiceClient();

const PROJECT_ID = 'plataforma-nxt-99c15';
const BLING_API_BASE = 'https://www.bling.com.br/Api/v3';

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
    const result = await blingRequest(`/contatos?numeroDocumento=${cnpjLimpo}&limite=1`);
    const contatos = result.data || [];

    if (contatos.length === 0) return null;

    const contatoId = contatos[0].id;
    try {
        const detail = await blingRequest(`/contatos/${contatoId}`);
        return mapearContatoCompleto(detail.data);
    } catch (e) {
        return mapearContatoBasico(contatos[0]);
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

async function buscarOuCriarContato(empresa) {
    const cnpjLimpo = (empresa.cnpj || '').replace(/\D/g, '');

    // Buscar por CNPJ
    if (cnpjLimpo) {
        const result = await blingRequest(`/contatos?numeroDocumento=${cnpjLimpo}&limite=1`);
        if (result.data && result.data.length > 0) {
            return result.data[0].id;
        }
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

    const resultado = await blingRequest('/contatos', 'POST', novoContato);
    return resultado.data.id;
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

    // 3. Montar itens do pedido — desdobramento fiscal igual ao app
    const itensPedido = [];
    const fiscal = venda.dadosFiscais || {};

    for (let i = 0; i < venda.produtos.length; i++) {
        const produto = venda.produtos[i];
        const precoUnit = produto.precoUnitario || produto.preco || 0;
        const dadoFiscal = fiscal[produto.modelo];

        if (dadoFiscal && dadoFiscal.itens && dadoFiscal.itens.length > 0) {
            // Desdobramento fiscal: 1 moto vira multiplos itens na NF-e
            console.log(`Desdobramento fiscal para ${produto.modelo}: ${dadoFiscal.itens.length} itens`);

            for (const itemFiscal of dadoFiscal.itens) {
                const descricao = itemFiscal.tipo === 'quadro'
                    ? `${itemFiscal.descricao} ${produto.cor}`
                    : itemFiscal.descricao;

                const valorComponente = Math.round(precoUnit * itemFiscal.percentual * 100) / 100;

                const item = {
                    descricao: descricao,
                    unidade: itemFiscal.unidade || 'UN',
                    quantidade: produto.quantidade || 1,
                    valor: valorComponente
                };

                // Tentar vincular ao produto cadastrado no Bling (sem codigo para evitar conflito)
                try {
                    const busca = await blingRequest(`/produtos?nome=${encodeURIComponent(descricao)}`);
                    if (busca.data && busca.data.length > 0) {
                        item.produto = { id: busca.data[0].id };
                        console.log(`Vinculado ao Bling: ${descricao} -> ID ${busca.data[0].id}`);
                    }
                } catch (e) {
                    // Produto nao encontrado — envia sem vinculo
                }

                itensPedido.push(item);
            }
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

    // 6. Montar parcelas
    const parcelas = [];
    const condicaoPrazo = venda.pagamento?.condicaoPrazo || '';

    if (primeiraForma === 'prazo' && condicaoPrazo) {
        const diasParcelas = condicaoPrazo === '30 dias' ? [30]
            : condicaoPrazo === '30/60 dias' ? [30, 60]
            : condicaoPrazo === '30/60/90 dias' ? [30, 60, 90]
            : [30];

        const valorParcela = venda.total / diasParcelas.length;
        const dataBase = new Date(venda.dataVenda + 'T12:00:00');

        diasParcelas.forEach(dias => {
            const dataVenc = new Date(dataBase);
            dataVenc.setDate(dataVenc.getDate() + dias);
            parcelas.push({
                dataVencimento: dataVenc.toISOString().split('T')[0],
                valor: Math.round(valorParcela * 100) / 100
            });
        });
    } else {
        parcelas.push({
            dataVencimento: venda.dataVenda,
            valor: venda.total
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

    // 9. Criar pedido
    const resultado = await blingRequest('/pedidos/vendas', 'POST', pedido);
    const pedidoId = resultado.data.id;

    // 10. Gerar NF-e a partir do pedido
    let nfeId = null;
    let nfeEnviada = false;
    try {
        console.log(`[NF-e] Gerando NF-e para pedido ${pedidoId}...`);

        // Tentar gerar NF-e via endpoint de pedido de venda
        let nfeResult;
        try {
            nfeResult = await blingRequest(`/pedidos/vendas/${pedidoId}/gerar-nfe`, 'POST');
            console.log(`[NF-e] Resultado gerar-nfe:`, JSON.stringify(nfeResult));
        } catch (e1) {
            console.error(`[NF-e] Erro endpoint gerar-nfe: ${e1.message}`);
            // Fallback: criar NF-e diretamente referenciando o pedido
            try {
                nfeResult = await blingRequest(`/nfe`, 'POST', {
                    tipo: 1,
                    pedidoVenda: { id: pedidoId }
                });
                console.log(`[NF-e] Resultado POST /nfe:`, JSON.stringify(nfeResult));
            } catch (e2) {
                console.error(`[NF-e] Erro endpoint POST /nfe: ${e2.message}`);
                throw e2;
            }
        }
        nfeId = nfeResult.data?.idNotaFiscal || nfeResult.data?.id || null;
        console.log(`[NF-e] nfeId: ${nfeId}`);

        // 11. Enviar NF-e para SEFAZ
        if (nfeId) {
            try {
                await blingRequest(`/nfe/${nfeId}/enviar`, 'POST');
                nfeEnviada = true;
                console.log(`[NF-e] Enviada para SEFAZ com sucesso`);
            } catch (envioErr) {
                console.error(`[NF-e] Criada mas nao enviada para SEFAZ: ${envioErr.message}`);
            }
        }
    } catch (nfeErr) {
        console.error(`[NF-e] Erro ao gerar NF-e: ${nfeErr.message}`);
    }

    return {
        sucesso: true,
        pedidoId,
        numero: resultado.data.numero,
        nfeId,
        nfeEnviada
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
