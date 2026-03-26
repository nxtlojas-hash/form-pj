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

    // 2. Montar itens do pedido (com fracionamento fiscal se disponivel)
    const itensPedido = [];
    const fiscal = venda.dadosFiscais || {};

    for (let i = 0; i < venda.produtos.length; i++) {
        const produto = venda.produtos[i];
        const precoTotal = (produto.precoUnitario || produto.preco || 0) * (produto.quantidade || 1);
        const dadoFiscal = fiscal[produto.modelo];

        if (dadoFiscal && dadoFiscal.itens && dadoFiscal.itens.length > 0) {
            // Fracionamento: dividir produto em componentes fiscais
            for (let j = 0; j < dadoFiscal.itens.length; j++) {
                const itemFiscal = dadoFiscal.itens[j];
                const valorComponente = Math.round(precoTotal * itemFiscal.percentual * 100) / 100;
                const descBase = itemFiscal.descricao;
                const desc = itemFiscal.tipo === 'quadro'
                    ? `${descBase} - ${produto.cor}`
                    : descBase;

                const item = {
                    descricao: desc,
                    unidade: itemFiscal.unidade || 'UN',
                    quantidade: produto.quantidade || 1,
                    valor: Math.round(valorComponente / (produto.quantidade || 1) * 100) / 100
                };

                // Tentar vincular ao produto cadastrado no Bling
                try {
                    const busca = await blingRequest(`/produtos?nome=${encodeURIComponent(itemFiscal.descricao.substring(0, 40))}`);
                    if (busca.data && busca.data.length > 0) {
                        item.produto = { id: busca.data[0].id };
                    }
                } catch (e) {
                    // Produto nao encontrado — envia sem vinculo
                }

                itensPedido.push(item);
            }
        } else {
            // Sem dados fiscais: enviar como item unico
            const descricao = `NXT Autopropelido ${produto.modelo} ${produto.cor}`;
            const item = {
                descricao: descricao,
                unidade: 'UN',
                quantidade: produto.quantidade || 1,
                valor: produto.precoUnitario || produto.preco || 0
            };

            try {
                const busca = await blingRequest(`/produtos?nome=${encodeURIComponent(produto.modelo)}`);
                if (busca.data && busca.data.length > 0) {
                    item.produto = { id: busca.data[0].id };
                }
            } catch (e) {
                // Produto nao encontrado — envia sem vinculo
            }

            itensPedido.push(item);
        }
    }

    // 3. Frete como item (se houver)
    if (venda.frete > 0) {
        itensPedido.push({
            descricao: 'Frete',
            unidade: 'UN',
            quantidade: 1,
            valor: venda.frete
        });
    }

    // 4. Mapear forma de pagamento
    const mapeamentoPagamento = {
        'dinheiro': 1, 'pix': 17, 'pos': 17, 'debito': 4,
        'credito': 3, 'prazo': 15, 'boleto': 15, 'outros': 99
    };
    const primeiraForma = (venda.pagamento?.formas || [])[0] || 'outros';
    const formaPagamentoId = mapeamentoPagamento[primeiraForma] || 99;

    // 5. Montar parcelas
    const parcelas = [];
    const condicaoPrazo = venda.pagamento?.condicaoPrazo || '';

    if (primeiraForma === 'prazo' && condicaoPrazo) {
        // Gerar parcelas baseado na condição
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

    // 6. Transporte
    const tipoFrete = venda.transporte?.tipo === 'proprio' ? 0
        : venda.transporte?.tipo === 'transportadora' ? 1
        : venda.transporte?.tipo === 'terceirizado' ? 2
        : 9; // Sem frete

    const transporte = {
        fretePorConta: tipoFrete,
        valorFrete: venda.frete || 0
    };

    if (venda.transporte?.nomeTransportadora) {
        transporte.transportador = {
            nome: venda.transporte.nomeTransportadora
        };
    }

    // 7. Observações
    let infoProdutos = '';
    venda.produtos.forEach((p, i) => {
        infoProdutos += `\nModelo: ${p.modelo} | Cor: ${p.cor} | Qtd: ${p.quantidade || 1}`;
        if (i < venda.produtos.length - 1) infoProdutos += '\n---';
    });

    const anoAtual = new Date().getFullYear();
    const observacoes = `VENDA PJ — NXT Autopropelidos
${infoProdutos}
Ano ${anoAtual}

Empresa: ${venda.empresa.razaoSocial}
CNPJ: ${venda.empresa.cnpj}
Responsável Compra: ${venda.empresa.responsavel}
Responsável Venda: ${venda.responsavelVenda}
${venda.numeroPedidoOC ? 'OC: ' + venda.numeroPedidoOC : ''}
${venda.transporte?.observacoes ? 'Transporte: ' + venda.transporte.observacoes : ''}
${venda.pagamento?.condicoesComerciais ? 'Condições: ' + venda.pagamento.condicoesComerciais : ''}
${venda.observacoesGerais ? 'Obs: ' + venda.observacoesGerais : ''}

Garantia do Fabricante:
Quadro: 2 anos contra defeitos de fabricação.
Motor: 2 anos contra defeitos de fabricação.
Bateria: 6 meses contra defeitos de fabricação.`.trim();

    // 8. Montar pedido
    const pedido = {
        contato: { id: contatoId },
        data: venda.dataVenda,
        numero: venda.id.replace('VNDA-PJ-', ''),
        numeroLoja: venda.id,
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
        // Tentar endpoint direto de geracao de NF-e a partir do pedido
        let nfeResult;
        try {
            nfeResult = await blingRequest(`/nfe`, 'POST', {
                tipo: 1,
                numero: '',
                pedidoVenda: { id: pedidoId }
            });
        } catch (e1) {
            // Fallback: endpoint alternativo
            nfeResult = await blingRequest(`/pedidos/vendas/${pedidoId}/gerar-nfe`, 'POST');
        }
        nfeId = nfeResult.data?.id || null;

        // 11. Enviar NF-e para SEFAZ
        if (nfeId) {
            try {
                await blingRequest(`/nfe/${nfeId}/enviar`, 'POST');
                nfeEnviada = true;
            } catch (envioErr) {
                console.warn('NF-e criada mas nao enviada para SEFAZ:', envioErr.message);
            }
        }
    } catch (nfeErr) {
        console.warn('Erro ao gerar NF-e:', nfeErr.message);
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
