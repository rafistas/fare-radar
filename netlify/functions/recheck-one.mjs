import { initStore, saveFares, getCurrentLowestFare, getHistoricalLowest } from './lib/store.mjs';
import { searchOneCombo } from './lib/serpapi.mjs';

const ORIGIN = process.env.ORIGIN_IATA || 'CGB';
const DESTINATION = process.env.DESTINATION_IATA || 'JPA';
const CURRENCY = process.env.CURRENCY || 'BRL';

export const handler = async (event) => {
  initStore(event);

  let departureDate;
  let returnDate;

  if (event.httpMethod === 'POST' && event.body) {
    try {
      const parsed = JSON.parse(event.body);
      departureDate = parsed.departureDate || parsed.dep;
      returnDate = parsed.returnDate || parsed.ret;
    } catch (e) {
      // Ignora erro de JSON e tenta query params
    }
  }

  if (!departureDate || !returnDate) {
    const q = event.queryStringParameters || {};
    departureDate = q.departureDate || q.dep;
    returnDate = q.returnDate || q.ret;
  }

  if (!departureDate || !returnDate) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Parâmetros departureDate e returnDate (ou dep e ret) são obrigatórios.',
      }),
    };
  }

  try {
    const fare = await searchOneCombo({
      origin: ORIGIN,
      destination: DESTINATION,
      departureDate,
      returnDate,
      currency: CURRENCY,
    });

    if (!fare) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          message: 'Nenhum voo retornado pelo Google Flights para essas datas.',
        }),
      };
    }

    await saveFares([fare]);
    const currentLowest = await getCurrentLowestFare();
    const historicalLowest = await getHistoricalLowest();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        fare: {
          ...fare,
          updatedAt: new Date().toISOString(),
        },
        currentLowest,
        historicalLowest,
      }),
    };
  } catch (err) {
    console.error('Erro na rechecagem unitária:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
