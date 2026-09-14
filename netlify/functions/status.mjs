import { getLowestKnown, getCursor, getAllFares } from './lib/store.mjs';

const ORIGIN = process.env.ORIGIN_IATA || 'CGB';
const DESTINATION = process.env.DESTINATION_IATA || 'JPA';
const DEPARTURE_FROM = process.env.DEPARTURE_FROM || '2026-11-01';
const DEPARTURE_TO = process.env.DEPARTURE_TO || '2026-11-30';
const MIN_DURATION = Number(process.env.MIN_DURATION || 5);
const MAX_DURATION = Number(process.env.MAX_DURATION || 8);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 2);

export const handler = async () => {
  const lowest = await getLowestKnown();
  const cursor = await getCursor();
  const faresMap = await getAllFares();

  let allFares = Object.values(faresMap);

  if (lowest && !allFares.some(f => f.departureDate === lowest.departureDate && f.returnDate === lowest.returnDate)) {
    allFares.push(lowest);
  }

  allFares.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

  const start = new Date(`${DEPARTURE_FROM}T00:00:00Z`);
  const end = new Date(`${DEPARTURE_TO}T00:00:00Z`);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const durationsCount = Math.max(1, MAX_DURATION - MIN_DURATION + 1);
  const totalCombos = Math.max(1, days * durationsCount);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lowest,
      cursor,
      totalCombos,
      ranking: allFares.slice(0, 10),
      totalTracked: allFares.length,
      config: {
        origin: ORIGIN,
        destination: DESTINATION,
        departureFrom: DEPARTURE_FROM,
        departureTo: DEPARTURE_TO,
        minDuration: MIN_DURATION,
        maxDuration: MAX_DURATION,
        batchSize: BATCH_SIZE,
      },
    }),
  };
};

