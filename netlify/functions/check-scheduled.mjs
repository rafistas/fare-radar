import { schedule } from '@netlify/functions';
import { initStore } from './lib/store.mjs';
import { runCheck } from './lib/check.mjs';

// Cron em UTC. "0 */6 * * *" = a cada 6 horas (00h, 06h, 12h, 18h UTC).
// Ajuste a expressão em https://crontab.guru se quiser outra cadência.
export const handler = schedule('0 */6 * * *', async (event) => {
  initStore(event);

  try {
    const result = await runCheck();
    console.log('Verificação agendada concluída:', JSON.stringify(result));
  } catch (err) {
    console.error('Erro na verificação agendada:', err);
  }

  return { statusCode: 200 };
});
