# ✅ Project Changes Log

## 📋 Latest Update

### 1. **Connection Status Moved to Navigation**
   - Status now displayed **left of navigation buttons**
   - Removed from main content header/overlay
   - Applied to all pages: 2D, WebGL, WebGPU

### 2. **New PLC Variables**

#### Reading from DB1001:
- `DB1001.BYTE0` → `status` (System byte) — displayed in table
- `DB1001.BYTE1` → `clock` (Clock byte) — displayed in table
- `DB1001.BYTE2` → `pos` (Position) — **used for all animations**

#### Writing to DB1002:
- `DB1002.BYTE0` → `read` — editable field (0-255)

### 3. **Animations Now Depend on `pos` (BYTE2)**
   - **BEFORE**: Animations depended on `clock` (BYTE1)
   - **AFTER**: All animations now tied to `pos` (BYTE2)
   - Applied to all visualizations:
     - 2D Canvas: line position, circle size
     - WebGL: **cube position on X axis (-15 to +15)**, rotation, sphere scale
     - WebGPU: **cube position on X axis (-15 to +15)**, TSL uniform `plcSpeedUniform`
   - **Scale**: `scalePos = 15`
   - **Center**: pos=127 → X=0
   - **Range**: pos=0 → X=-15, pos=127 → X=0, pos=255 → X=+15

### 4. **Field for Writing to PLC**
   - Added to all applications (2D, WebGL, WebGPU)
   - Input with range 0-255
   - "Write" / "Send" button
   - Sends value to `DB1002.BYTE0`

---

## 🎮 Cube Control

### In WebGL and WebGPU:
Cube now **moves along X axis** depending on `pos` (DB1001.BYTE2):

```
DB1001.DBB2 = 0     →  Cube at left   (X = -15)
DB1001.DBB2 = 127   →  Cube at center (X = 0)
DB1001.DBB2 = 255   →  Cube at right  (X = +15)
```

See **[CUBE_CONTROL.md](./CUBE_CONTROL.md)** for details.

---

## 📂 Modified Files

### Shared:
- `src/shared/constants.js` — added `pos`, added `WRITE_VARIABLES`
- `src/shared/types.js` — no changes

### Server:
- `src/index.js` — merged `DEFAULT_VARIABLES` and `WRITE_VARIABLES`
- `src/server/plc/connection.js` — added `read()` method, fixed `write()` API
- `src/server/websocket/handlers.js` — no changes (write support already existed)
- `src/server/websocket/server.js` — added `host: '0.0.0.0'` for network access

### Client Shared:
- `src/client/shared/ui.js` — added `setupWriteInput()` method
- `src/client/shared/websocket.js` — auto-detect WebSocket URL from hostname

### Client 2D:
- `public/2d/index.html` — connection status in navigation, added write field
- `src/client/2d/index.js` — added `pos`, `writeInput`, `writeButton`
- `src/client/2d/renderer.js` — animation now uses `pos` instead of `clock`

### Client WebGL:
- `public/webgl/index.html` — connection status in navigation, added write field
- `src/client/webgl/index.js` — added `pos`, `writeInput`, `writeButton`
- `src/client/webgl/scene.js` — animation uses `pos` instead of `clock`, cube position from `rawPos`

### Client WebGPU:
- `public/webgpu/index.html` — connection status in navigation, added write field
- `src/client/webgpu/index.js` — added `pos`, `writeInput`, `writeButton`
- `src/client/webgpu/scene.js` — TSL uniforms now use `pos` instead of `clock`, cube position from `rawPos`

### Styles:
- `public/styles/navigation.css` — added styles for `.connection-status-nav`

---

## 🎯 How It Works

### Reading data (DB1001):
```javascript
// Server reads every 50ms:
{
  status: 4,      // DB1001.BYTE0 (0-255)
  clock: 68,      // DB1001.BYTE1 (0-255)
  pos: 127        // DB1001.BYTE2 (0-255) ← for animations!
}
```

### Writing data (DB1002):
```javascript
// Client sends:
wsClient.write('read', 123);

// Server writes:
DB1002.BYTE0 = 123
```

---

## 🚀 Testing

### 1. Start server:
```bash
pnpm start
```

### 2. Start HTTP server:
```bash
pnpm run serve
```

### 3. Open browser:
```
http://localhost:3001/public/
```

### 4. Verify:
- ✅ Connection status left of navigation (green = connected)
- ✅ Table shows: Status, Clock, Position
- ✅ Animations change when you modify **Position (BYTE2)** in TIA Portal
- ✅ Write field: enter 0-255 → click "Write" → value sent to DB1002.BYTE0

---

## 📝 What to Do in PLC (TIA Portal)

### DB1001 (read):
```
DB1001.DBB0  (BYTE) - status   [existing]
DB1001.DBB1  (BYTE) - clock    [existing]
DB1001.DBB2  (BYTE) - pos      [NEW! add this field]
```

### DB1002 (write):
```
DB1002.DBB0  (BYTE) - read     [NEW! create DB1002]
```

### Settings:
- ✅ PUT/GET enabled
- ✅ Optimize block access = OFF

---

## 🎨 Visual Changes

### Before:
```
┌─────────────────────────────────┐
│  Connecting...  🏠  🎯  🎨  ⚡   │  ← status in header
└─────────────────────────────────┘
```

### After:
```
┌─────────────────────────────────┐
│  ● Connecting...  🏠  🎯  🎨  ⚡ │  ← status on left
└─────────────────────────────────┘
```

---

## 🧹 Project Cleanup

### Deleted (24 files):
- Old HTML files: client.html, client-threejs.html, client-webgpu.html
- Old server files: server.js, server-advanced.js, config.js, examples.js
- Redundant docs: 17 markdown/text files

### Kept:
- ✅ Essential files: package.json, .gitignore, .env.example
- ✅ Test files: test-plc.js, test-write.js
- ✅ Useful docs: README.md + 5 reference guides
- ✅ Source code: src/ (organized structure)
- ✅ Client files: public/ (HTML, CSS)

---

## 🌍 Translation

All code and UI text translated to English:
- ✅ All comments in source files
- ✅ All alert messages
- ✅ All button labels
- ✅ All documentation files

---

**All changes ready for testing!** 🎉
