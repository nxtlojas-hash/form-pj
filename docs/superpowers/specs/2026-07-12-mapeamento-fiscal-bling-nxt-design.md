# Mapeamento Fiscal form-pj → Bling NXT — Design

**Data:** 2026-07-12 · **Status:** aprovado (decisões via sessão Claude)
**Urgência:** alta — integração Bling parada + notas de revendedor rejeitadas pelo formato atual

## Contexto

- O form-pj (vendas B2B da fábrica) envia venda para **conta Bling da NXT** (indústria, destaca IPI).
  O formulário PF/lojas envia para conta **NIHAO** (revenda, sem IPI) — e já usa o formato correto.
- **Integração parada:** o Bling migrou a API de `www.bling.com.br/Api/v3` para
  `api.bling.com.br/Api/v3`; o backend (`cloud-functions/buscar-contato/index.js`, linha 5)
  ainda aponta pro domínio antigo. Nada chega ao Bling (nem auto-fill CNPJ, nem pedido).
- **Problema fiscal relatado pela emissora** (áudios/imagens/nota modelo em
  `Mapeamento fiscal\`): na conta NXT existe UM cadastro genérico de motor e UM de bateria,
  compartilhados entre modelos. Nota com 2+ modelos = mesmo código com preços diferentes →
  sistema do cliente revendedor rejeita a nota; contabilidade sofre.
- **Formato-alvo** (= NIHAO, validado na NF-e 004457 e na planilha do faturamento dela):
  cada moto sai em 3 linhas vinculadas a cadastros POR MODELO
  (ex.: HY001 parte principal / HY002 motor / HY003 bateria — Hyphen já criada por ela).

## A matemática (validada na NF 004457 — ex. Kay, preço 4.990)

| Parte | Split bruto | IPI | Valor no pedido | Ex. Kay |
|---|---|---|---|---|
| Principal (NCM 87120010, CFOP 6101) | 20% | 7,5% | 20% ÷ 1,075 | 998,00 → 928,37 ✓ |
| Motor (NCM 85013210, CFOP 6102) | 40% | 0% | 40% | 1.996,00 ✓ |
| Bateria (NCM 85072010, CFOP 6102) | 40% | 9,75% | 40% ÷ 1,0975, **por unidade 12V** (÷4/5/6) | 332,67 → 303,11 ✓ |

CST 200 nas três. Soma (valores líquidos × (1+IPI)) = preço de venda. Total da NF
(produtos + IPI destacado) fecha no preço combinado — dispensa a "planilhinha do faturamento".

## Decisões

1. **NF-e automática: REMOVIDA.** O backend passa a só criar o pedido de venda; a emissora
   confere e emite a NF-e (fluxo que ela mesma descreveu). Elimina risco de NF real errada.
2. **Cadastros: criados via API pelo Claude**, copiando a config fiscal exata dos
   HY001/002/003 que a emissora criou; lista apresentada à usuária ANTES de criar;
   emissora valida depois (ela se ofereceu para o teste).
3. **Códigos por modelo = os do gabarito NIHAO** (`nxt-app/app/dados/produtos-fiscal.json`,
   idêntico ao do dash): K001.., KI.., JA.., JU25.., JUS.., GA.., PA.., VE.., LU.., HY..,
   SH.., ZI26.., JAY.., V0.., AK.. — 15 modelos × 3 = 45 (Hyphen já existe → ~42 a criar).
4. **Payload da planilha (Make) intocado** — mudança é só no caminho Bling.

## Mudanças

| # | O quê | Onde |
|---|---|---|
| 1 | URL base → `https://api.bling.com.br/Api/v3` | `cloud-functions/buscar-contato/index.js:5` |
| 2 | Inspecionar config fiscal completa de HY001/002/003 via API | GET /produtos?codigo= |
| 3 | Criar ~42 cadastros por modelo (após aprovação da lista) | POST /produtos |
| 4 | `dados/produtos-fiscal.json` do form-pj → formato gabarito + fator IPI por item | form-pj |
| 5 | `registrarVenda`: vínculo por **código** (não nome), qtd = qtd_motos × qtd_fiscal, valor unitário líquido de IPI; remover bloco auto-NF-e (linhas ~429-469) | index.js |
| 6 | Redeploy `buscar-contato-bling` + `registrar-venda-bling` (projeto plataforma-nxt-99c15) | gcloud |
| 7 | Teste com a emissora: pedido de teste → ela valida 3 linhas/valores → (opcional) NF de homologação | com ela |

## Fora de escopo (fica para o "plano acessório", por último)

Ligação com Estoque Geral por chassi, conciliação, NF automática do Bling nas planilhas.

## Riscos

- Config fiscal dos cadastros deve replicar EXATAMENTE a da emissora (NCM/CST/IPI/origem) —
  mitigado copiando de HY001/002/003 e validando com ela no teste.
- Token Bling NXT pode ter expirado com a integração parada — validar cedo (etapa 2);
  se preciso, refazer OAuth (secrets no Secret Manager: bling-client-id/secret/refresh-token).
- Enquanto o pacote não fecha, status quo: venda PJ cai na planilha via Make; caminho Bling
  segue parado (como está hoje).
