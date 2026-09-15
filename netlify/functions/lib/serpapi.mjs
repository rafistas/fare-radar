// Cliente mínimo pro Google Flights via SerpApi (serpapi.com).
// Substitui a Duffel, que exige verificar a conta (KYC) até pra ver preço real
// de busca — sem isso, o modo de teste só devolve preço fictício.
//
// A SerpApi também não tem endpoint de "faixa de datas" — cada combinação de
// ida/volta é uma chamada separada. Por isso o scanBatch() varre só um LOTE por
// execução, guardando um cursor entre execuções (mesma lógica de antes).
//
// Free tier: 250 buscas/mês. Com BATCH_SIZE=2 e cron a cada 6h (4x/dia), dá 8
// buscas/dia = ~240/mês, dentro da cota. Ajuste com cuidado se subir a frequência.
const SERPAPI_BASE = 'https://serpapi.com/search.json';

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function searchOneCombo({ origin, destination, departureDate, returnDate, currency }) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error('Falta a variável de ambiente SERPAPI_API_KEY no Netlify.');
  }

  const params = new URLSearchParams({
    engine: 'google_flights',
    departure_id: origin,
    arrival_id: destination,
    outbound_date: departureDate,
    return_date: returnDate,
    type: '1', // 1 = ida e volta
    currency,
    hl: 'pt-br',
    api_key: apiKey,
  });

  const res = await fetch(`${SERPAPI_BASE}?${params}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpApi respondeu ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(`SerpApi retornou erro: ${json.error}`);
  }

  const flights = [...(json.best_flights || []), ...(json.other_flights || [])];
  if (flights.length === 0) return null;

  const cheapest = flights.reduce((min, f) =>
    (f.price ?? Infinity) < (min.price ?? Infinity) ? f : min
  );

  if (cheapest.price == null) return null;

  return {
    departureDate,
    returnDate,
    price: cheapest.price,
    currency,
  };
}

/**
 * Monta todas as combinações (data de ida x duração da viagem) e processa só um
 * lote de `batchSize`, começando em `cursor`. Devolve o próximo cursor pra
 * function seguinte continuar de onde parou (roda em círculo).
 */
export async function scanBatch({
  origin,
  destination,
  departureFrom,
  departureTo,
  minDuration,
  maxDuration,
  currency,
  cursor,
  batchSize,
}) {
  const dates = [];
  for (let d = departureFrom; d <= departureTo; d = addDays(d, 1)) {
    dates.push(d);
  }

  const durations = [];
  for (let n = minDuration; n <= maxDuration; n++) durations.push(n);

  const combos = [];
  for (const date of dates) {
    for (const dur of durations) {
      combos.push({ departureDate: date, returnDate: addDays(date, dur) });
    }
  }

  const start = combos.length ? cursor % combos.length : 0;
  const batch = [];
  for (let i = 0; i < batchSize && i < combos.length; i++) {
    batch.push(combos[(start + i) % combos.length]);
  }

  const results = [];
  for (const combo of batch) {
    try {
      const fare = await searchOneCombo({ origin, destination, currency, ...combo });
      if (fare) results.push(fare);
    } catch (err) {
      console.error('Falha ao buscar combinação', combo, err.message);
    }
  }

  const nextCursor = combos.length ? (start + batchSize) % combos.length : 0;

  return { results, nextCursor, totalCombos: combos.length };
}
