import { connectLambda, getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

const STORE_NAME = process.env.STORE_NAME || 'fare-radar';
const LOWEST_KEY = 'lowest-price';
const CURSOR_KEY = 'scan-cursor';
const FARES_KEY = 'known-fares-map';

// Em ambiente AWS Lambda (Netlify), apenas /tmp é gravável caso haja fallback local
const LOCAL_STORE_FILE = process.env.AWS_LAMBDA_FUNCTION_NAME
  ? path.join('/tmp', 'local-store.json')
  : path.resolve('.netlify', 'local-store.json');

export function initStore(event) {
  if (event) {
    try {
      connectLambda(event);
    } catch (err) {
      // Ignora erro se já conectado ou em ambiente local
    }
  }
}

function getLocalStore() {
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Não foi possível ler local-store.json:', e.message);
  }
  return {};
}

function setLocalStore(data) {
  try {
    const dir = path.dirname(LOCAL_STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Não foi possível gravar local-store.json:', e.message);
  }
}

function getBlobsStore() {
  try {
    return getStore(STORE_NAME);
  } catch (err) {
    console.warn('Aviso ao inicializar Netlify Blobs:', err.message);
    return null;
  }
}

export async function getLowestKnown() {
  const store = getBlobsStore();
  if (store) {
    try {
      const raw = await store.get(LOWEST_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Aviso: erro ao ler do Netlify Blobs:', e.message);
    }
  }
  const local = getLocalStore();
  return local[LOWEST_KEY] || null;
}

export async function setLowestKnown(data) {
  const store = getBlobsStore();
  if (store) {
    try {
      await store.set(LOWEST_KEY, JSON.stringify(data));
      return;
    } catch (e) {
      console.warn('Aviso: erro ao gravar no Netlify Blobs:', e.message);
    }
  }
  const local = getLocalStore();
  local[LOWEST_KEY] = data;
  setLocalStore(local);
}

export async function getCursor() {
  const store = getBlobsStore();
  if (store) {
    try {
      const raw = await store.get(CURSOR_KEY);
      if (raw !== null && raw !== undefined) return Number(raw);
    } catch (e) {
      console.warn('Aviso: erro ao ler cursor no Netlify Blobs:', e.message);
    }
  }
  const local = getLocalStore();
  return typeof local[CURSOR_KEY] === 'number' ? local[CURSOR_KEY] : 0;
}

export async function setCursor(value) {
  const store = getBlobsStore();
  if (store) {
    try {
      await store.set(CURSOR_KEY, String(value));
      return;
    } catch (e) {
      console.warn('Aviso: erro ao gravar cursor no Netlify Blobs:', e.message);
    }
  }
  const local = getLocalStore();
  local[CURSOR_KEY] = Number(value);
  setLocalStore(local);
}

export async function getAllFares() {
  const store = getBlobsStore();
  if (store) {
    try {
      const raw = await store.get(FARES_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Aviso: erro ao ler fares no Netlify Blobs:', e.message);
    }
  }
  const local = getLocalStore();
  return local[FARES_KEY] || {};
}

export async function saveFares(newFares) {
  if (!Array.isArray(newFares) || newFares.length === 0) return;
  const currentFares = await getAllFares();
  const now = new Date().toISOString();

  for (const fare of newFares) {
    if (!fare || !fare.departureDate || !fare.returnDate || fare.price == null) continue;
    const key = `${fare.departureDate}_${fare.returnDate}`;
    currentFares[key] = {
      departureDate: fare.departureDate,
      returnDate: fare.returnDate,
      price: fare.price,
      currency: fare.currency || 'BRL',
      updatedAt: now,
    };
  }

  const store = getBlobsStore();
  if (store) {
    try {
      await store.set(FARES_KEY, JSON.stringify(currentFares));
    } catch (e) {
      console.warn('Aviso: erro ao salvar fares no Netlify Blobs:', e.message);
    }
  }
  const local = getLocalStore();
  local[FARES_KEY] = currentFares;
  setLocalStore(local);

  // Mantém o recorde histórico atualizado se encontrarmos um novo menor valor absoluto
  try {
    const historical = await getLowestKnown();
    let bestNew = null;
    for (const fare of newFares) {
      if (fare && fare.price != null) {
        if (!bestNew || fare.price < bestNew.price) {
          bestNew = fare;
        }
      }
    }
    if (bestNew && (!historical || bestNew.price < historical.price)) {
      await setLowestKnown({
        departureDate: bestNew.departureDate,
        returnDate: bestNew.returnDate,
        price: bestNew.price,
        currency: bestNew.currency || 'BRL',
        foundAt: now,
      });
    }
  } catch (err) {
    console.warn('Aviso ao sincronizar recorde histórico:', err.message);
  }
}

/**
 * Retorna a menor tarifa atualmente válida no mapa de tarifas ativas.
 * Caso não haja nenhuma no mapa, faz fallback para a última conhecida.
 */
export async function getCurrentLowestFare() {
  const faresMap = await getAllFares();
  const todayStr = new Date().toISOString().slice(0, 10);

  const activeFares = Object.values(faresMap).filter(f =>
    f &&
    f.price != null &&
    (!f.departureDate || f.departureDate >= todayStr)
  );

  if (activeFares.length === 0) {
    return await getLowestKnown();
  }

  return activeFares.reduce((min, f) => (f.price < min.price ? f : min));
}

export const getHistoricalLowest = getLowestKnown;
export const setHistoricalLowest = setLowestKnown;

