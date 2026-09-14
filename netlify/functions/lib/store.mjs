import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

const STORE_NAME = process.env.STORE_NAME || 'fare-radar';
const LOWEST_KEY = 'lowest-price';
const CURSOR_KEY = 'scan-cursor';
const LOCAL_STORE_FILE = path.resolve('.netlify', 'local-store.json');

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
    return null;
  }
}

export async function getLowestKnown() {
  const store = getBlobsStore();
  if (store) {
    try {
      const raw = await store.get(LOWEST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      // Em caso de erro com Blobs, usa fallback local
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
      // Em caso de erro com Blobs, usa fallback local
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
      return raw ? Number(raw) : 0;
    } catch (e) {
      // Em caso de erro com Blobs, usa fallback local
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
      // Em caso de erro com Blobs, usa fallback local
    }
  }
  const local = getLocalStore();
  local[CURSOR_KEY] = Number(value);
  setLocalStore(local);
}

const FARES_KEY = 'known-fares-map';

export async function getAllFares() {
  const store = getBlobsStore();
  if (store) {
    try {
      const raw = await store.get(FARES_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
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
    } catch (e) {}
  }
  const local = getLocalStore();
  local[FARES_KEY] = currentFares;
  setLocalStore(local);
}


