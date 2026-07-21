# Spec — Orçamento PJ que vira venda (form-pj)

> **Data:** 21/07/2026 · **Status:** spec aprovada pela Claudia (21/07), sem código escrito
> **Conta Google:** `nxt.lojas@gmail.com` · **Numeração:** `ORC-2026-NNN`
> **Repo:** `C:\dev\NXT\ativos\form-pj` (branch `master`, deploy Cloud Run)
> **Padrão de origem:** o sistema de orçamento do SAC (`sac-pecas/google-apps-script.js`),
> que funcionou por muito tempo — espelhamos o **padrão**, não a instância.

---

## 1. O que é, em uma frase

O orçamento é **o form-pj de hoje sem apertar o gatilho**: captura empresa, produtos e
condições, gera um PDF de proposta — mas **não dispara nada** no sistema. Quando o cliente
aprova, você recarrega, edita se precisar, e **converte** — aí sim o fluxo de venda que já
existe roda inteiro.

## 2. Princípio — os dois relógios (herdado de ARQUITETURA §"dois relógios")

| Ação | Dispara Bling / planilha de vendas / estoque / NF? |
|---|---|
| **Criar / editar orçamento** | **NÃO** — só grava na planilha de orçamentos + gera PDF |
| **Converter em venda** | **SIM** — o fluxo atual de venda, sem alteração |

Um orçamento não é evento financeiro nem fiscal. É uma proposta de preço. Só a conversão
realiza a venda.

## 3. Onde mora (decisão da Claudia, 21/07)

Pasta nova **`J:\Meu Drive\PJ\`** na raiz do Drive — **separada do SAC**, para não misturar.
Dentro dela:

```
J:\Meu Drive\PJ\
  Orcamentos PJ.gsheet        ← a planilha (uma linha por orçamento)
  PDFs\                        ← os PDFs gerados (um por orçamento)
```

Backend: um **Apps Script (Web App)** ligado a essa planilha — a mesma forma de chamada que o
form-pj já faz para o Bling (um `fetch` POST). Sem base nova, sem SDK, sem Firestore.

**Conta Google (decisão da Claudia, 21/07):** `nxt.lojas@gmail.com` — a mesma que já é dona
das planilhas de treinamentos e outros recursos NXT. A pasta `PJ`, a planilha, o Apps Script e
os PDFs vivem todos sob essa conta.

## 4. Estrutura da planilha (espelha o SAC, adaptada a motos B2B)

Uma aba `Orçamentos`, uma linha por orçamento:

| Coluna | Conteúdo |
|---|---|
| Número | `ORC-2026-NNN` sequencial automático |
| Data | criação |
| Validade | data-limite da proposta |
| **Status** | `pendente` · `convertido` · `cancelado` |
| Data conversão | preenchida ao converter |
| Empresa | CNPJ, razão social, contato (os campos do form) |
| Vendedor | responsável |
| Itens | JSON dos produtos (modelo, cor, qtd, preço unit., subtotal) |
| Total | soma |
| Condições | pagamento + transporte + observações |
| PDF | link do PDF no Drive |
| Nº do pedido (pós-conversão) | referência da venda gerada, para rastrear |

## 5. Fluxo de tela (o que muda no form-pj)

O form-pj hoje tem um botão que finaliza a venda. Passa a ter **dois caminhos**:

```
  Preenche o form (empresa, produtos, condições)
        ├─ [ Salvar como orçamento ]  → grava (status pendente) + gera PDF
        │                               NÃO dispara venda
        └─ [ Finalizar venda ]         → fluxo atual, sem mudança

  Nova aba "Meus orçamentos"
        lista os pendentes (número, empresa, total, validade)
        └─ clica num → recarrega o form preenchido
              └─ edita livremente (preço, qtd, condições — negociação B2B)
                    └─ [ Converter em venda ] → roda o fluxo de venda atual
                          → ao dar certo: marca status=convertido,
                            grava data e nº do pedido na planilha
```

**Editável é requisito** (Claudia): o orçamento recarregado é o form normal, 100% editável.
Converter usa os **valores finais na tela**, não os originais.

## 6. O que a conversão dispara (fluxo existente, nada novo)

Ao converter, roda exatamente o que o "Finalizar venda" já faz hoje:
- webhook Make (`script.js:6`) → planilha de vendas
- pedido no Bling (`BLING_VENDA_URL`)
- baixa de estoque (`estoque-baixa-venda` Cloud Run)
- NF-e
- fatura WhatsApp

O orçamento **não** toca em nenhum deles até aqui. É o mesmo código de venda, só adiado.

## 7. Enviar ao cliente

Ao salvar o orçamento, o PDF é gerado (Google Drive, como o SAC faz) e fica disponível para
enviar — o form-pj já tem envio por WhatsApp (`enviarFaturaWhatsApp`), reaproveitado para
mandar a proposta em vez da fatura.

## 8. Fora do escopo (YAGNI — "o mais simples que funcione")

- **Consertar o orçamento do SAC** — tarefa separada (próximo pedido). Está todo no código;
  o "não está 100%" é provável falha silenciosa, precisa de teste ao vivo ou do sintoma.
- Estados de aprovação além de pendente/convertido/cancelado (sem "enviado", "em negociação").
- Métricas de funil (quantos viram venda) — dá para extrair da planilha depois, se quiser.
- Reserva de estoque no orçamento — B2B de fábrica não precisa; e os dois relógios dizem que
  orçamento não mexe em estoque.
- Edição do orçamento por outra pessoa que não criou — v1 é simples; sem controle de dono.

## 9. Casos de borda

| Situação | Comportamento |
|---|---|
| Converter um orçamento já convertido | bloquear — status já é `convertido` |
| Orçamento vencido (passou a validade) | permite converter, mas avisa "proposta vencida" |
| Falha ao gerar PDF | salva o orçamento mesmo assim; PDF pode ser regerado |
| Conversão falha no meio (Bling cai) | orçamento continua `pendente` — nunca marca convertido sem a venda ter dado certo |

## 10. Critérios de aceite

1. "Salvar como orçamento" grava na planilha e **não** cria nada no Bling, estoque ou planilha
   de vendas (verificar: nenhum pedido Bling novo após salvar orçamento)
2. "Meus orçamentos" lista os pendentes e recarrega um ao clicar, com os campos editáveis
3. Editar o orçamento recarregado e converter usa os **valores da tela**, não os salvos
4. Converter roda o fluxo de venda atual e, só em caso de sucesso, marca `convertido`
5. Os dados moram em `J:\Meu Drive\PJ\`, **fora** de qualquer pasta do SAC
6. Numeração sequencial sem furos nem repetição (`ORC-2026-001`, `002`...)

## 11. Onde mexer

| Arquivo | Mudança |
|---|---|
| (novo) Apps Script + `Orçamentos PJ.gsheet` em `J:\Meu Drive\PJ\` | backend do orçamento (espelha o do SAC) |
| `index.html` | botão "Salvar como orçamento" + aba "Meus orçamentos" |
| `script.js` | salvar/listar/carregar/converter orçamento; o submit atual vira "Finalizar/Converter" |
| `orcamento.js` (novo, opcional) | isolar a lógica de orçamento (o SAC tem um `orcamento.js` próprio) |

Deploy: editar em `C:\dev\NXT\ativos\form-pj` → commit + push → deploy Cloud Run. Nunca no ar
direto (o Cloud Run builda da pasta local).
