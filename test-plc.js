#!/usr/bin/env node
import { PLCConnection } from "./src/server/plc/connection.js";
import { DEFAULT_PLC_CONFIG } from "./src/shared/constants.js";

/**
 * Test script to check connection to PLC
 */

console.log("🔍 Test connection to S7 PLC");
console.log("================================");
console.log(`IP: ${DEFAULT_PLC_CONFIG.ip}`);
console.log(`Rack: ${DEFAULT_PLC_CONFIG.rack}`);
console.log(`Slot: ${DEFAULT_PLC_CONFIG.slot}`);
console.log("================================\n");

// Create connection
const plc = new PLCConnection(DEFAULT_PLC_CONFIG);

// Test variables for your DB1001
// MB1 (system_byte) → DB1001.status (DBB0)
// MB0 (clock_byte)  → DB1001.clock (DBB1)
const testVariables = {
  status: "DB1001,BYTE0", // System byte (0-255)
  clock: "DB1001,BYTE1", // Clock byte (0-255)
};

console.log("📋 Variables to read:", Object.keys(testVariables));
console.log("");

plc.setVariables(testVariables);

// Обработчики событий
plc.onConnect(() => {
  console.log("✅ Connected to PLC!");
  console.log("");
});

plc.onError((error) => {
  console.error("❌ PLC error:", error.message);
});

// Подключаемся
async function test() {
  try {
    console.log("🔌 Connecting to PLC...");
    await plc.connect();

    console.log("📖 Reading data...");
    const data = await plc.readAll();

    console.log("");
    console.log("═══════════════════════════════════════");
    console.log("📊 RESULT:");
    console.log("═══════════════════════════════════════");
    console.log(JSON.stringify(data, null, 2));
    console.log("═══════════════════════════════════════");
    console.log("");
    console.log("✅ Test successful!");

    // Отключаемся
    await plc.disconnect();
    console.log("👋 Disconnected from PLC");
  } catch (error) {
    console.error("");
    console.error("═══════════════════════════════════════");
    console.error("❌ ERROR:");
    console.error("═══════════════════════════════════════");
    console.error(error.message);
    console.error("═══════════════════════════════════════");
    console.error("");

    // Частые ошибки:
    console.error("💡 Possible reasons:");
    console.error(
      "   1. IP address is not accessible (check ping 192.168.0.10)"
    );
    console.error("   2. PUT/GET is not enabled in TIA Portal");
    console.error("   3. Wrong rack/slot");
    console.error("   4. Firewall blocks port 102");
    console.error("   5. DB1001 does not exist or is not accessible");
    console.error("   6. Wrong variable address format");
    console.error("");

    process.exit(1);
  }
}

test();
