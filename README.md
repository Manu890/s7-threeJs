# 🏭 S7 PLC WebSocket Bridge

Real-time visualization of Siemens S7 PLC data using Node.js, WebSockets, and Three.js.

## 🚀 Features

- 📡 **Real-time PLC Communication** - Connect to Siemens S7-300/400/1200/1500 controllers
- 🌐 **WebSocket Bridge** - Stream PLC data to multiple clients
- 🎨 **Multiple Visualizations**:
  - **2D Canvas** - Fast, lightweight rendering
  - **WebGL 3D** - Classic Three.js rendering
  - **WebGPU 3D** - Modern rendering with TSL shaders
- 🔄 **Bidirectional** - Read from and write to PLC
- 🌍 **Network Access** - Access from any device on local network
- ⚡ **High Performance** - 50ms polling, 60 FPS rendering

---

## 📦 Installation

```bash
# Install dependencies
pnpm install
# or
npm install
```

---

## ⚙️ Configuration

### 1. PLC Setup (TIA Portal)

Create data blocks:

**DB1001 (Read):**
```
DB1001.DBB0 (BYTE) - status   // System status
DB1001.DBB1 (BYTE) - clock    // Clock counter
DB1001.DBB2 (BYTE) - pos      // Position (0-255) - controls animations
```

**DB1002 (Write):**
```
DB1002.DBB0 (BYTE) - read     // Writable value from browser
```

**Controller Settings:**
- ✅ Enable **PUT/GET** communication
- ✅ Disable **"Optimize block access"** for DB1001 and DB1002
- ✅ Set PLC IP address (default: `192.168.0.10`)

### 2. Project Configuration

Update `src/shared/constants.js` if needed:

```javascript
export const DEFAULT_PLC_CONFIG = {
    host: '192.168.0.10',  // Your PLC IP
    port: 102,             // S7 default port
    rack: 0,
    slot: 1
};
```

---

## 🧪 Run Without a Physical PLC (Mock PLC)

You can run the visualizations without a Siemens PLC or PLCSIM Advanced. The mock PLC uses the same WebSocket data envelope as the real server and generates changing `status`, `clock`, and `pos` BYTE values. It also accepts simulated writes to the `read` variable.

Open two terminals in the project directory:

```bash
# Terminal 1: start the simulated PLC/WebSocket server
npm run mock:plc

# Terminal 2: serve the frontend
npm run serve
```

Then open [http://localhost:3001/public/](http://localhost:3001/public/). Keep the mock server running while testing. Stop it with Ctrl+C. The mock server uses port `8080`, just like the real WebSocket server; don't run `npm start` at the same time unless you change the mock port.

Optional environment variables: `MOCK_PLC_PORT` (default `8080`) and `MOCK_PLC_INTERVAL_MS` (default `50`).

## 🚀 Quick Start

### Run Server (WebSocket + PLC):

```bash
pnpm start
```

This starts:
- WebSocket server on port `8080`
- PLC connection to `192.168.0.10`
- Data polling every 50ms

### Run HTTP Server (for clients):

```bash
pnpm run serve
```

This starts HTTP server on port `3001`

### Open in Browser:

```
http://localhost:3001/public/
```

---

## 🧪 Testing

### Test PLC Connection:

```bash
pnpm run test:plc
```

Checks connection and reads all variables.

### Test PLC Write:

```bash
pnpm run test:write
```

Tests writing values to DB1002.BYTE0.

---

## 🌐 Network Access

### Access from Another Device:

1. **Find your IP address:**
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```
   Example: `192.168.0.98`

2. **Start servers:**
   ```bash
   pnpm start       # Terminal 1
   pnpm run serve   # Terminal 2
   ```

3. **Open on other device:**
   ```
   http://192.168.0.98:3001/public/
   ```

See [NETWORK_ACCESS.md](./NETWORK_ACCESS.md) for details.

---

## 🎮 Cube Control

The 3D cube position is controlled by **DB1001.BYTE2 (pos)**:

```
pos = 0     →  Cube at left   (X = -15)
pos = 127   →  Cube at center (X = 0)
pos = 255   →  Cube at right  (X = +15)
```

See [CUBE_CONTROL.md](./CUBE_CONTROL.md) for details.

---

## 📁 Project Structure

```
node_s7/
├── src/
│   ├── server/              # Backend (PLC + WebSocket)
│   │   ├── plc/            # PLC connection & polling
│   │   └── websocket/      # WebSocket server & handlers
│   ├── client/              # Frontend
│   │   ├── shared/         # Shared UI & WebSocket client
│   │   ├── 2d/             # 2D Canvas renderer
│   │   ├── webgl/          # WebGL 3D renderer
│   │   └── webgpu/         # WebGPU 3D renderer
│   └── shared/              # Shared constants & types
├── public/                  # Static files
│   ├── 2d/                 # 2D Canvas app
│   ├── webgl/              # WebGL 3D app
│   ├── webgpu/             # WebGPU 3D app
│   └── styles/             # CSS
├── test-plc.js             # PLC connection test
├── test-write.js           # PLC write test
└── package.json
```

---

## 📊 Data Flow

```
PLC (S7-1200)
    ↓ (nodes7)
Node.js Server
    ↓ (WebSocket)
Browser Clients (2D/WebGL/WebGPU)
```

**Read (DB1001):**
- Server polls PLC every 50ms
- Data broadcast to all connected clients via WebSocket
- Clients update visualizations in real-time (60 FPS)

**Write (DB1002):**
- Client sends value via WebSocket
- Server writes to PLC
- PLC value updated immediately

---

## 🎨 Visualizations

### 2D Canvas
- Fast rendering with HTML5 Canvas
- Position indicator (horizontal line)
- Speed indicator (circle)
- Minimal CPU usage

### WebGL 3D (Classic)
- Three.js with WebGLRenderer
- 3D cube controlled by PLC position
- Animated sphere orbiting cube
- Interactive camera controls

### WebGPU 3D (Modern)
- Three.js with WebGPURenderer
- TSL (Three Shading Language) procedural shaders
- Advanced visual effects
- Requires Chrome 113+ or Edge 113+

---

## 🔧 Scripts

```bash
pnpm start          # Start Node.js server (WebSocket + PLC)
pnpm run dev        # Start with hot reload
pnpm run serve      # Start HTTP server for clients
pnpm run test:plc   # Test PLC connection
pnpm run test:write # Test PLC write operation
```

---

## 📚 Documentation

- [CHANGES.md](./CHANGES.md) - Recent changes and updates
- [CUBE_CONTROL.md](./CUBE_CONTROL.md) - How to control the 3D cube
- [NETWORK_ACCESS.md](./NETWORK_ACCESS.md) - Access from other devices
- [RUN_SERVER.md](./RUN_SERVER.md) - Server setup and troubleshooting
- [TEST_WRITE.md](./TEST_WRITE.md) - Writing data to PLC

---

## 🛠️ Technologies

- **Backend**: Node.js (ES6 modules)
- **PLC Communication**: nodes7
- **WebSocket**: ws
- **Frontend**: Vanilla JS (ES6 modules)
- **3D Graphics**: Three.js (WebGL + WebGPU)
- **Shaders**: GLSL + TSL (Three Shading Language)

---

## 📝 Requirements

- Node.js 18+
- Siemens S7 PLC (S7-300/400/1200/1500)
- Network connection to PLC
- Modern browser (Chrome 113+ for WebGPU)

---

## ⚠️ Troubleshooting

### PLC Connection Issues

1. Check PLC IP address in `src/shared/constants.js`
2. Verify PUT/GET is enabled on PLC
3. Ensure "Optimize block access" is OFF for DB1001/DB1002
4. Run `pnpm run test:plc` to diagnose

### WebSocket Connection Issues

1. Ensure Node.js server is running (`pnpm start`)
2. Check firewall settings
3. For remote access, use server IP instead of localhost

### Write Not Working

1. Verify DB1002 exists in TIA Portal
2. Check DB1002.DBB0 variable "read" exists
3. Run `pnpm run test:write` to verify
4. See [TEST_WRITE.md](./TEST_WRITE.md) for detailed guide

---

## 📄 License

MIT

---

## 🎉 Quick Start (Complete Flow)

```bash
# 1. Install
pnpm install

# 2. Test PLC connection
pnpm run test:plc

# 3. Start servers (2 terminals)
pnpm start          # Terminal 1
pnpm run serve      # Terminal 2

# 4. Open browser
open http://localhost:3001/public/
```

**Enjoy real-time PLC visualization!** 🎊
