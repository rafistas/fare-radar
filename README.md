# FareRadar · Monitor Inteligente de Passagens (CGB → JPA)

App simples pra rodar no Netlify: busca automaticamente, em lotes, o menor
preço de ida e volta entre Cuiabá e João Pessoa em novembro e dezembro, com viagens de
5 a 8 dias, e avisa no Telegram quando aparece um preço mais baixo que o
último registrado.

> **Histórico de versões:** este projeto já passou por duas fontes de dados
> que não deram certo pra um monitor pessoal:
> - **Amadeus** — a própria Amadeus descontinuou o portal Self-Service em
>   17/07/2026. Não é mais possível criar conta.
> - **Duffel** — cadastro funciona, mas em modo de teste os preços são
>   fictícios. Pra ver preço real você precisa "ativar a conta"
>   (verificação KYC pensada pra quem vai vender passagem, não pra quem só
>   quer espiar preço).
>
> A versão atual usa a **SerpApi**, que expõe os resultados do Google
> Flights via API, sem exigir verificação de negócio.

## O que ele faz

- `netlify/functions/check-scheduled.mjs` — roda sozinho a cada 6h (cron)
- `netlify/functions/check-now.mjs` — busca na hora, chamado pelo botão da página
- `netlify/functions/status.mjs` — devolve o menor preço já registrado, sem gastar uma nova busca
- Guarda o histórico e o progresso da varredura com **Netlify Blobs** (não precisa de banco de dados separado)
- Fonte de preços: **SerpApi** (engine `google_flights`)
- Aviso: bot do **Telegram**

## Como a varredura funciona (importante entender)

A SerpApi também não tem um endpoint de "faixa de datas" — cada combinação
de data de ida + duração da viagem é uma chamada separada. Além disso, o
**free tier da SerpApi é de 250 buscas por mês**, bem mais apertado que os
limites da Amadeus/Duffel.

Por isso o padrão aqui é conservador: `BATCH_SIZE=2` combinações por
execução, cron a cada 6h (4x/dia) = ~8 buscas/dia = ~240/mês, com folga
pequena pra alguns cliques manuais no botão. Com ~61 dias (novembro e dezembro) × 4
durações (5 a 8 dias) = 244 combinações, uma volta completa leva cerca de
30 a 31 dias (aproximadamente um mês a 8 buscas/dia) — o que permite realizar
voltas completas dentro da cota mensal antes da viagem.

Se quiser mais velocidade, os limites a considerar são:
- **Cota da SerpApi**: sobe de plano (a partir de US$50/mês pra 5.000
  buscas) se quiser varrer mais rápido sem estourar
- **`BATCH_SIZE`**: pode subir se tiver cota sobrando, mas cada busca extra
  no lote soma no tempo de execução da function

## Passo a passo

### 1. Conta na SerpApi

1. Crie uma conta grátis em https://serpapi.com/users/sign_up
2. Depois de confirmar o e-mail, sua **API key** já aparece no painel
   (Dashboard → Api Key) — não tem etapa de verificação de negócio
3. O free tier dá 250 buscas/mês, sem precisar de cartão pra começar

### 2. Bot do Telegram

1. No Telegram, procure **@BotFather** e mande `/newbot`
2. Siga as instruções e guarde o **token** que ele te der
3. Mande qualquer mensagem pro seu bot novo (pra ele "conhecer" seu chat)
4. Acesse no navegador:
   `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates`
5. Procure o campo `"chat":{"id": ...}` — esse número é o seu `TELEGRAM_CHAT_ID`

### 3. Deploy no Netlify

Pela CLI (mais rápido):

```bash
cd fare-radar
npm install
npx netlify-cli deploy --prod
```

Ou conectando um repositório Git normalmente pelo painel do Netlify.

### 4. Variáveis de ambiente

No painel do Netlify → **Site settings → Environment variables**, adicione:

| Variável              | Obrigatória | Exemplo         |
|-----------------------|-------------|-----------------|
| `SERPAPI_API_KEY`     | sim         | —               |
| `TELEGRAM_BOT_TOKEN`  | sim         | —               |
| `TELEGRAM_CHAT_ID`    | sim         | —               |
| `ORIGIN_IATA`         | não         | `CGB` (padrão)  |
| `DESTINATION_IATA`    | não         | `JPA` (padrão)  |
| `DEPARTURE_FROM`      | não         | `2026-11-01`    |
| `DEPARTURE_TO`        | não         | `2026-12-31`    |
| `MIN_DURATION`        | não         | `5`             |
| `MAX_DURATION`        | não         | `8`             |
| `CURRENCY`            | não         | `BRL` (padrão)  |
| `BATCH_SIZE`          | não         | `2` (padrão)    |
| `TARGET_PRICE`        | não         | opcional (ex: `1200`) |

Depois de adicionar as variáveis, faça um novo deploy pra elas entrarem em vigor.

### 5. Testar

Abra o site → clique em **"Buscar agora"**. Se der certo, você vê o preço
do lote na tela e recebe a primeira mensagem no Telegram (a primeira busca
sempre conta como "novo menor preço", já que não havia nada registrado antes).

## Se algo der errado

- **Erro da SerpApi sobre cota**: você provavelmente estourou as 250
  buscas/mês do free tier. Confira o uso no painel deles.
- **Netlify Blobs reclamando de ambiente não configurado**: normalmente só
  acontece em modo de compatibilidade Lambda; funções normais do Netlify já
  vêm configuradas automaticamente.
- **Quer mudar a cadência do cron**: edite a expressão em
  `check-scheduled.mjs` (formato cron padrão, ex. `0 */6 * * *`). Planos
  gratuitos podem ter um piso de cadência mínima — confira a documentação
  atual do Netlify se quiser algo mais frequente. Lembre de recalcular
  `BATCH_SIZE` pra não estourar a cota da SerpApi se mudar a cadência.
