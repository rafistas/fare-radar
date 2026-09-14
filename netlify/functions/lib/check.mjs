import { scanBatch } from './serpapi.mjs';
import { getLowestKnown, setLowestKnown, getCursor, setCursor, saveFares } from './store.mjs';
import { sendTelegramMessage } from './telegram.mjs';

const ORIGIN = process.env.ORIGIN_IATA || 'CGB';
const DESTINATION = process.env.DESTINATION_IATA || 'JPA';
const DEPARTURE_FROM = process.env.DEPARTURE_FROM || '2026-11-01';
const DEPARTURE_TO = process.env.DEPARTURE_TO || '2026-11-30';
const MIN_DURATION = Number(process.env.MIN_DURATION || 5);
const MAX_DURATION = Number(process.env.MAX_DURATION || 8);
const CURRENCY = process.env.CURRENCY || 'BRL';
// Free tier da SerpApi = 250 buscas/mês. Com cron a cada 6h (4x/dia) e
// BATCH_SIZE=2, dá ~240 buscas/mês — dentro da cota mesmo somando alguns
// cliques manuais no botão. Suba com cuidado se tiver plano pago.
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 2);

export async function runCheck() {
  const cursor = await getCursor();

  const { results, nextCursor, totalCombos } = await scanBatch({
    origin: ORIGIN,
    destination: DESTINATION,
    departureFrom: DEPARTURE_FROM,
    departureTo: DEPARTURE_TO,
    minDuration: MIN_DURATION,
    maxDuration: MAX_DURATION,
    currency: CURRENCY,
    cursor,
    batchSize: BATCH_SIZE,
  });

  await setCursor(nextCursor);

  if (results.length === 0) {
    return {
      checked: 0,
      totalCombos,
      progress: `${nextCursor}/${totalCombos}`,
      message: 'Nenhuma tarifa retornada nesse lote. O próximo lote continua de onde parou.',
    };
  }

  await saveFares(results);

  const cheapestInBatch = results.reduce((min, r) => (r.price < min.price ? r : min));
  const previous = await getLowestKnown();
  const isNewLow = !previous || cheapestInBatch.price < previous.price;

  if (isNewLow) {
    await setLowestKnown({ ...cheapestInBatch, foundAt: new Date().toISOString() });

    await sendTelegramMessage(
      `✈️ <b>Novo preço mais baixo encontrado!</b>\n` +
        `${ORIGIN} → ${DESTINATION}\n` +
        `Ida: ${cheapestInBatch.departureDate}\n` +
        `Volta: ${cheapestInBatch.returnDate}\n` +
        `Preço: ${cheapestInBatch.price} ${cheapestInBatch.currency || ''}\n\n` +
        `Preço vindo do Google Flights via SerpApi — confirme antes de comprar.`
    );
  }

  return {
    checked: results.length,
    totalCombos,
    progress: `${nextCursor}/${totalCombos}`,
    cheapestNow: cheapestInBatch,
    previousLowest: previous,
    isNewLow,
  };
}
