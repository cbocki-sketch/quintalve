# QUINTAL ALERTA

Avisa no iPhone quando os ingressos do [Quintal Butiá](https://quintalbutia.com.br/) forem liberados.
Custo zero: Netlify (grátis) + Netlify Blobs (estado, incluso) + cron-job.org (grátis).

## Como funciona

```
cron-job.org (a cada 5 min) ──► /api/check (Netlify Function)
                                   │ lê /categoria/agenda/ e cada página de evento
                                   │ detecta compra REAL (estoque + botão), não só publicação
                                   │ compara com o estado salvo (Netlify Blobs)
                                   └─► Web Push ──► iPhone
```

- A verificação roda **no servidor**: funciona com o app fechado e o celular bloqueado.
- O site é WooCommerce (renderizado no servidor). A disponibilidade vem do JSON de variações
  (`is_in_stock` / `is_purchasable`), com a API pública da loja como reserva.
- **Avisa quando:** um evento passa de indisponível para disponível, abre um novo lote
  (ex.: LOTE 9 → LOTE 10) ou um evento novo já nasce com venda aberta.
- **Não avisa quando:** o evento só foi publicado, o site caiu, a página veio incompleta ou
  bloqueada. Em falhas o último estado é mantido. Antes de avisar, a página é relida para confirmar.
- Mesmo evento + mesmo lote: um único aviso (reaviso só se esgotar e reabrir, ou trocar o lote).
- Na primeira execução o estado atual é só registrado (sem push), para não avisar o que já estava à venda.
  O que já está à venda aparece na tela.
- Reserva: o Netlify também verifica a cada 15 min (Scheduled Function), caso o cron externo falhe.

## 1. Publicar no Netlify

1. Suba esta pasta para um repositório no GitHub.
2. Netlify → **Add new site → Import an existing project** → escolha o repositório.
   O `netlify.toml` já define build (`npm run build`), pasta `dist` e `netlify/functions`.
3. Gere as chaves: `npm install && npm run vapid`. Copie as 4 linhas.
4. Netlify → **Site configuration → Environment variables**, crie:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (use `mailto:` com seu e-mail real),
   `CRON_SECRET`.
5. **Deploys → Trigger deploy** para aplicar as variáveis.

## 2. Agendador a cada 5 minutos (cron-job.org)

1. Crie conta grátis em https://cron-job.org → **Create cronjob**.
2. URL: `https://SEU-SITE.netlify.app/api/check`
3. Schedule: **Every 5 minutes**.
4. Em **Advanced → Headers**, adicione `x-cron-key` = valor do `CRON_SECRET`
   (ou use a URL `.../api/check?key=SEU_SEGREDO`).
5. Ative **Save responses** e clique **Test run**: deve retornar `{"ok":true,...}`.

## 3. iPhone (iOS 16.4 ou superior)

1. Abra o site no **Safari** (não no Chrome).
2. Toque em **Compartilhar → Adicionar à Tela de Início → Adicionar**.
3. Abra o **Quintal Alerta pelo ícone da tela de início** (obrigatório no iOS).
4. Toque em **ATIVAR MONITORAMENTO** e permita as notificações.
   Chega uma notificação de boas-vindas confirmando que está funcionando.
5. Se negou por engano: Ajustes → Notificações → Quintal Alerta.

O botão ATIVAR/DESATIVAR vale para o aparelho em uso. O servidor continua verificando.

## 4. Conferir se está lendo o site direito

- Abra o app e toque em **VERIFICAR AGORA**: os eventos da agenda devem aparecer
  e os que têm venda aberta ficam em destaque.
- `https://SEU-SITE.netlify.app/api/status` mostra o estado de cada evento (JSON).
- Se aparecer "Site indisponível" ou "bloqueada" sempre, o site pode estar bloqueando IPs de nuvem.
  Nesse caso nenhum alerta falso é enviado, mas também não há monitoramento até liberar.

## Desenvolvimento

```
npm install
npm test          # parser + lógica de alertas (dedupe, falhas, lotes)
npm run build
npx netlify dev   # com Netlify CLI, roda front + functions localmente
```

## Estrutura

```
netlify/functions/  status, refresh, check, scheduled, subscribe, unsubscribe
netlify/lib/        parser (HTML), monitor (regras de alerta), runtime (fetch, Blobs, push)
src/                tela única (React + TypeScript)
public/             manifest, service worker (push), ícones
test/               testes automatizados
```

O app nunca compra nada: só abre a página oficial do evento.
