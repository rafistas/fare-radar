import { scanBatch } from './serpapi.mjs';
import { getCurrentLowestFare, getCursor, setCursor, saveFares } from './store.mjs';
import { sendTelegramMessage } from './telegram.mjs';

const ORIGIN = process.env.ORIGIN_IATA || 'CGB';
const DESTINATION = process.env.DESTINATION_IATA || 'JPA';
const DEPARTURE_FROM = process.env.DEPARTURE_FROM || '2026-11-01';
const DEPARTURE_TO = process.env.DEPARTURE_TO || '2026-11-30';
const MIN_DURATION = Number(process.env.MIN_DURATION || 5);
const MAX_DURATION = Number(process.env.MAX_DURATION || 8);
const CURRENCY = process.env.CURRENCY || 'BRL';
const TARGET_PRICE = process.env.TARGET_PRICE ? Number(process.env.TARGET_PRICE) : null;
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

  const previousBest = await getCurrentLowestFare();
  await saveFares(results);
  const currentBest = await getCurrentLowestFare();

  const cheapestInBatch = results.reduce((min, r) => (r.price < min.price ? r : min));
  const isNewLow = !previousBest || (currentBest && currentBest.price < previousBest.price);
  const hitTarget = TARGET_PRICE !== null && cheapestInBatch.price <= TARGET_PRICE;

  if (isNewLow && currentBest) {
    await sendTelegramMessage(
      `✈️ <b>Novo menor preço vigente encontrado!</b>\n` +
        `${ORIGIN} → ${DESTINATION}\n` +
        `Ida: ${currentBest.departureDate}\n` +
        `Volta: ${currentBest.returnDate}\n` +
        `Preço: ${currentBest.price} ${currentBest.currency || ''}\n` +
        (previousBest && previousBest.price !== currentBest.price
          ? `Preço anterior: ${previousBest.price} ${previousBest.currency || ''}\n\n`
          : `\n`) +
        `Preço vindo do Google Flights via SerpApi — confirme antes de comprar.`
    );
  } else if (hitTarget && (!previousBest || cheapestInBatch.price < previousBest.price)) {
    await sendTelegramMessage(
      `🎯 <b>Preço abaixo da meta (≤ R$ ${TARGET_PRICE}) encontrado!</b>\n` +
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
    currentLowest: currentBest,
    previousLowest: previousBest,
    isNewLow,
  };
}
