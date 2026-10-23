import http from "node:http";
import { MongoClient } from "mongodb";
import WebSocket from "ws";

const HTTP_HOST = process.env.PLC_PERSIST_HOST || "127.0.0.1";
const HTTP_PORT = Number(process.env.PLC_PERSIST_PORT || 3002);
const WS_URL = process.env.PLC_WS_URL || "ws://127.0.0.1:8080";
const MONGO_URL = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DATABASE || "plc_signal_analyzer";
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || "samples";
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
let recordingEnabled = false;
let flushing = false;
const pending = [];

function json(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://localhost:3001",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "cache-control": "no-store",
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
      await new Promise((resolve) => setTimeout(resolve, 5000));
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
    console.error("MongoDB batch write failed; queued samples retained for retry:", error.message);
    try {
      await client?.close();
    } catch {}
    client = null;
    collection = null;
    void connectMongo();
  } finally {
    flushing = false;
  }
}

function connectPLCStream() {
  const socket = new WebSocket(WS_URL);
  socket.on("open", () => {
    plcConnected = true;
    lastError = null;
    console.log(`📡 Receiving PLC samples from ${WS_URL}`);
  });
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (!message.data || typeof message.data !== "object" || Array.isArray(message.data)) return;
      if (!recordingEnabled) return;
      const timestampMs = Number(message.timestamp) || Date.now();
      pending.push({
        timestampMs,
        timestamp: new Date(timestampMs),
        data: message.data,
        source: "websocket",
      });
      if (pending.length > MAX_BUFFERED) {
        pending.shift();
        lastError = `Persistence buffer reached ${MAX_BUFFERED} samples; oldest pending sample dropped. Check MongoDB.`;
      }
    } catch (error) {
      lastError = `Invalid WebSocket sample: ${error.message}`;
    }
  });
  socket.on("close", () => {
    plcConnected = false;
    console.warn("PLC WebSocket disconnected; reconnecting in 2 seconds.");
    setTimeout(connectPLCStream, 2000);
  });
  socket.on("error", (error) => {
    plcConnected = false;
    lastError = error.message;
    console.warn("PLC WebSocket error:", error.message);
    socket.close();
  });
}

const api = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "http://localhost:3001",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
    });
    return res.end();
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, {
      ok: mongoConnected && plcConnected,
      mongoConnected,
      plcConnected,
      bufferedSamples: pending.length,
      totalStored,
      recordingEnabled,
      lastPersistedAt,
      lastError,
    });
  }
  if (req.method === "POST" && url.pathname === "/api/recording") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) req.destroy();
    });
    req.on("end", async () => {
      try {
        const input = JSON.parse(body || "{}");
        if (typeof input.enabled !== "boolean")
          return json(res, 400, { error: "enabled must be a boolean." });
        if (input.enabled) {
          recordingEnabled = true;
          console.log("⏺ MongoDB sample recording enabled.");
        } else {
          recordingEnabled = false;
          // Drain queued samples before acknowledging Stop so the end of a long recording is saved.
          while (flushing) await new Promise((resolve) => setTimeout(resolve, 10));
          while (pending.length > 0 && mongoConnected) {
            await flushBatch();
            if (flushing) await new Promise((resolve) => setTimeout(resolve, 10));
          }
          console.log("⏹ MongoDB sample recording stopped; queued samples flushed.");
        }
        return json(res, 200, { ok: true, recordingEnabled, bufferedSamples: pending.length });
      } catch {
        return json(res, 400, { error: "Invalid JSON body." });
      }
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/export.csv") {
    if (!mongoConnected || !collection)
      return json(res, 503, { error: "MongoDB is not connected yet." });
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    const filter = {};
    if (Number.isFinite(from) && from > 0)
      filter.timestampMs = { ...(filter.timestampMs || {}), $gte: from };
    if (Number.isFinite(to) && to > 0)
      filter.timestampMs = { ...(filter.timestampMs || {}), $lte: to };
    try {
      const first = await collection.find(filter).sort({ timestampMs: 1 }).limit(1).next();
      if (!first) {
        res.writeHead(200, {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="plc-recording.csv"',
          "access-control-allow-origin": "http://localhost:3001",
          "cache-control": "no-store",
        });
        return res.end("timestampMs,datetime,data\r\n");
      }
      const keyDocs = await collection.find(filter, { projection: { data: 1 } }).limit(1000).toArray();
      const keys = Array.from(new Set(keyDocs.flatMap((sample) => Object.keys(sample.data || {}))));
      const csvCell = (value) => {
        const text = value === null || value === undefined ? "" : String(value);
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      };
      const formatLocalDateTime = (timestampMs) => {
        const date = new Date(timestampMs);
        const pad = (value, width = 2) => String(value).padStart(width, "0");
        return (
          date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
          "T" + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" +
          pad(date.getSeconds()) + "." + pad(date.getMilliseconds(), 3)
        );
      };
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="plc-recording.csv"',
        "access-control-allow-origin": "http://localhost:3001",
        "cache-control": "no-store",
      });
      res.write(["timestampMs", "datetime", ...keys].map(csvCell).join(",") + "\r\n");
      const cursor = collection.find(filter).sort({ timestampMs: 1 });
      for await (const sample of cursor) {
        const row = [
          sample.timestampMs,
          formatLocalDateTime(sample.timestampMs),
          ...keys.map((key) => sample.data?.[key]),
        ];
        if (!res.write(row.map(csvCell).join(",") + "\r\n"))
          await new Promise((resolve) => res.once("drain", resolve));
      }
      res.end();
    } catch (error) {
      lastError = error.message;
      if (!res.headersSent) return json(res, 500, { error: "Could not export stored samples." });
      res.destroy(error);
    }
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/plot") {
    if (!mongoConnected || !collection)
      return json(res, 503, { error: "MongoDB is not connected yet." });
    try {
      let from = Number(url.searchParams.get("from"));
      let to = Number(url.searchParams.get("to"));
      const seconds = Math.max(1, Math.min(259200, Number(url.searchParams.get("seconds")) || 300));
      const requestedPixels = Math.max(100, Math.min(3000, Number(url.searchParams.get("pixels")) || 1200));
      const maxBuckets = Math.max(50, Math.min(1500, Math.floor(requestedPixels / 2)));
      if (url.searchParams.get("latest") === "1" || !Number.isFinite(to) || to <= 0) {
        const latest = await collection.find({}).sort({ timestampMs: -1 }).limit(1).next();
        if (!latest) return json(res, 200, { count: 0, from: null, to: null, samples: [] });
        to = latest.timestampMs;
        if (!Number.isFinite(from) || from <= 0) from = to - seconds * 1000;
      }
      if (!Number.isFinite(from) || from <= 0) from = to - seconds * 1000;
      if (from > to) [from, to] = [to, from];
      const filter = { timestampMs: { $gte: from, $lte: to } };
      const first = await collection.find(filter).sort({ timestampMs: 1 }).limit(1).next();
      if (!first) return json(res, 200, { count: 0, from, to, samples: [] });
      const last = await collection.find(filter).sort({ timestampMs: -1 }).limit(1).next();
      const duration = Math.max(1, to - from);
      const bucketMs = Math.max(1, duration / maxBuckets);
      const buckets = new Map();
      let scanned = 0;
      const cursor = collection.find(filter, { projection: { _id: 0, timestampMs: 1, data: 1 } })
        .sort({ timestampMs: 1 });
      for await (const sample of cursor) {
        scanned++;
        const bucketIndex = Math.min(maxBuckets - 1, Math.floor((sample.timestampMs - from) / bucketMs));
        let bucket = buckets.get(bucketIndex);
        if (!bucket) {
          bucket = { first: sample, last: sample, candidates: new Map() };
          buckets.set(bucketIndex, bucket);
        }
        bucket.last = sample;
        for (const [key, value] of Object.entries(sample.data || {})) {
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          const candidate = bucket.candidates.get(key);
          if (!candidate) bucket.candidates.set(key, { min: sample, max: sample, minValue: value, maxValue: value });
          else {
            if (value < candidate.minValue) {
              candidate.min = sample;
              candidate.minValue = value;
            }
            if (value > candidate.maxValue) {
              candidate.max = sample;
              candidate.maxValue = value;
            }
          }
        }
      }
      const selected = new Map();
      for (const bucket of buckets.values()) {
        for (const sample of [bucket.first, bucket.last]) selected.set(sample.timestampMs, sample);
        for (const candidate of bucket.candidates.values()) {
          selected.set(candidate.min.timestampMs, candidate.min);
          selected.set(candidate.max.timestampMs, candidate.max);
        }
      }
      const samples = Array.from(selected.values())
        .sort((a, b) => a.timestampMs - b.timestampMs)
        .map((sample) => ({ timestamp: sample.timestampMs, data: sample.data }));
      return json(res, 200, {
        count: samples.length,
        scanned,
        from: first.timestampMs,
        to: last.timestampMs,
        samples,
      });
    } catch (error) {
      lastError = error.message;
      return json(res, 500, { error: "Could not load plot history." });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/samples") {
    if (!mongoConnected || !collection)
      return json(res, 503, { error: "MongoDB is not connected yet." });
    const filter = {};
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    if (Number.isFinite(from) && from > 0)
      filter.timestampMs = { ...(filter.timestampMs || {}), $gte: from };
    if (Number.isFinite(to) && to > 0)
      filter.timestampMs = { ...(filter.timestampMs || {}), $lte: to };
    const requestedLimit = Number(url.searchParams.get("limit") || 1000);
    const limit = Math.min(
      10000,
      Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 1000)
    );
    try {
      const samples = await collection
        .find(filter)
        .sort({ timestampMs: -1 })
        .limit(limit)
        .toArray();
      samples.reverse();
      return json(res, 200, {
        count: samples.length,
        samples: samples.map((s) => ({
          timestamp: s.timestampMs,
          data: s.data,
        })),
      });
    } catch (error) {
      lastError = error.message;
      return json(res, 500, { error: "Could not query stored samples." });
    }
  }
  return json(res, 404, {
    error: "Not found. Available routes: GET /api/health, GET /api/samples",
  });
});

api.listen(HTTP_PORT, HTTP_HOST, () => {
  console.log(`🗄️ PLC MongoDB persistence API: http://${HTTP_HOST}:${HTTP_PORT}`);
  console.log(`   MongoDB: ${MONGO_URL}/${DB_NAME}`);
  console.log(`   Source: ${WS_URL}`);
  console.log("   MongoDB recording starts OFF; use the analyzer Start/Stop Recording button.");
});

setInterval(() => {
  void flushBatch();
}, FLUSH_MS);
void connectMongo();
connectPLCStream();

async function shutdown() {
  console.log("Stopping persistence service...");
  api.close();
  try {
    await flushBatch();
  } catch {}
  try {
    await client?.close();
  } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
