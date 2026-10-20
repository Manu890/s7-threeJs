import http from 'node:http';
import { MongoClient } from 'mongodb';
import WebSocket from 'ws';

const HTTP_HOST = process.env.PLC_PERSIST_HOST || '127.0.0.1';
const HTTP_PORT = Number(process.env.PLC_PERSIST_PORT || 3002);
const WS_URL = process.env.PLC_WS_URL || 'ws://127.0.0.1:8080';
const MONGO_URL = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'plc_signal_analyzer';
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || 'samples';
const BATCH_SIZE = Math.max(1, Number(process.env.PLC_PERSIST_BATCH_SIZE || 1000));
const FLUSH_MS = Math.max(100, Number(process.env.PLC_PERSIST_FLUSH_MS || 1000));
const MAX_BUFFERED = Math.max(BATCH_SIZE, Number(process.env.PLC_PERSIST_MAX_BUFFERED || 100000));

let client;
let collection;
let mongoConnected = false;
let plcConnected = false;
let lastPersistedAt = null;
let lastError = null;
let totalStored = 0;
let flushing = false;
const pending = [];

function json(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': 'http://localhost:3001',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(value));
}

async function connectMongo() {
  while (true) {
    try {
      const nextClient = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 3000 });
      await nextClient.connect();
      const nextCollection = nextClient.db(DB_NAME).collection(COLLECTION_NAME);
      await nextCollection.createIndex({ timestampMs: -1 });
      await nextCollection.createIndex({ timestamp: -1 });
      client = nextClient;
      collection = nextCollection;
      mongoConnected = true;
      lastError = null;
      console.log(`🗄️ MongoDB connected: ${DB_NAME}.${COLLECTION_NAME}`);
      break;
    } catch (error) {
      mongoConnected = false;
      lastError = error.message;
      console.error(`MongoDB unavailable; retrying in 5 seconds: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function flushBatch() {
  if (flushing || !mongoConnected || !collection || pending.length === 0) return;
  flushing = true;
  const batch = pending.splice(0, BATCH_SIZE);
  try {
    await collection.insertMany(batch, { ordered: false });
    totalStored += batch.length;
    lastPersistedAt = new Date().toISOString();
    lastError = null;
  } catch (error) {
    pending.unshift(...batch);
    lastError = error.message;
    mongoConnected = false;
    console.error('MongoDB batch write failed; queued samples retained for retry:', error.message);
    try { await client?.close(); } catch {}
    client = null;
    collection = null;
    void connectMongo();
  } finally {
    flushing = false;
  }
}

function connectPLCStream() {
  const socket = new WebSocket(WS_URL);
  socket.on('open', () => {
    plcConnected = true;
    lastError = null;
    console.log(`📡 Receiving PLC samples from ${WS_URL}`);
  });
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (!message.data || typeof message.data !== 'object' || Array.isArray(message.data)) return;
      const timestampMs = Number(message.timestamp) || Date.now();
      pending.push({
        timestampMs,
        timestamp: new Date(timestampMs),
        data: message.data,
        source: 'websocket'
      });
      if (pending.length > MAX_BUFFERED) {
        pending.shift();
        lastError = `Persistence buffer reached ${MAX_BUFFERED} samples; oldest pending sample dropped. Check MongoDB.`;
      }
    } catch (error) {
      lastError = `Invalid WebSocket sample: ${error.message}`;
    }
  });
  socket.on('close', () => {
    plcConnected = false;
    console.warn('PLC WebSocket disconnected; reconnecting in 2 seconds.');
    setTimeout(connectPLCStream, 2000);
  });
  socket.on('error', error => {
    plcConnected = false;
    lastError = error.message;
    console.warn('PLC WebSocket error:', error.message);
    socket.close();
  });
}

const api = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': 'http://localhost:3001',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'Content-Type'
    });
    return res.end();
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, {
      ok: mongoConnected && plcConnected,
      mongoConnected,
      plcConnected,
      bufferedSamples: pending.length,
      totalStored,
      lastPersistedAt,
      lastError
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/samples') {
    if (!mongoConnected || !collection) return json(res, 503, { error: 'MongoDB is not connected yet.' });
    const filter = {};
    const from = Number(url.searchParams.get('from'));
    const to = Number(url.searchParams.get('to'));
    if (Number.isFinite(from) && from > 0) filter.timestampMs = { ...(filter.timestampMs || {}), $gte: from };
    if (Number.isFinite(to) && to > 0) filter.timestampMs = { ...(filter.timestampMs || {}), $lte: to };
    const requestedLimit = Number(url.searchParams.get('limit') || 1000);
    const limit = Math.min(10000, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 1000));
    try {
      const samples = await collection.find(filter).sort({ timestampMs: -1 }).limit(limit).toArray();
      samples.reverse();
      return json(res, 200, { count: samples.length, samples: samples.map(s => ({
        timestamp: s.timestampMs,
        data: s.data
      })) });
    } catch (error) {
      lastError = error.message;
      return json(res, 500, { error: 'Could not query stored samples.' });
    }
  }
  return json(res, 404, { error: 'Not found. Available routes: GET /api/health, GET /api/samples' });
});

api.listen(HTTP_PORT, HTTP_HOST, () => {
  console.log(`🗄️ PLC MongoDB persistence API: http://${HTTP_HOST}:${HTTP_PORT}`);
  console.log(`   MongoDB: ${MONGO_URL}/${DB_NAME}`);
  console.log(`   Source: ${WS_URL}`);
  console.log('   Stores every incoming WebSocket sample; Ctrl+C stops the service.');
});

setInterval(() => { void flushBatch(); }, FLUSH_MS);
void connectMongo();
connectPLCStream();

async function shutdown() {
  console.log('Stopping persistence service...');
  api.close();
  try { await flushBatch(); } catch {}
  try { await client?.close(); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
