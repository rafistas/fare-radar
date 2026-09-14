import { initStore } from './lib/store.mjs';
import { runCheck } from './lib/check.mjs';

export const handler = async (event) => {
  initStore(event);

  try {
    const result = await runCheck();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error('Erro na busca manual:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
