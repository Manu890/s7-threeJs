# 🚀 HTTP Server - Ready to Use!

## ✅ Current Status

**HTTP server running on port 3001**

---

## 🌐 Open in Browser

### **Main page:**
```
http://localhost:3001/public/
```

### **Applications:**
```
http://localhost:3001/public/2d/          # 2D Canvas
http://localhost:3001/public/webgl/       # WebGL 3D
http://localhost:3001/public/webgpu/      # WebGPU 3D
```

---

## ⚡ Quick Start

### From project terminal:
```bash
pnpm run serve
```

### Manually:
```bash
npx http-server . -p 3001 -c-1
```

---

## 📊 Navigation in Applications

Each application (2D/WebGL/WebGPU) has buttons in the top right:

```
┌─────────────────────────────────────────┐
│  🏠 Home  │  🎯 2D  │  🎨 WebGL  │  ⚡ WebGPU  │
└─────────────────────────────────────────┘
```

They allow you to:
- **🏠 Home** — return to main selection page
- **🎯 2D / 🎨 WebGL / ⚡ WebGPU** — switch between visualizations

---

## 🔧 Full Setup (for PLC work)

You need **2 terminals**:

### **Terminal 1 — WebSocket server:**
```bash
pnpm start
```
→ Connects to PLC `192.168.0.10`  
→ Reads `DB1001.BYTE0` (status), `DB1001.BYTE1` (clock), `DB1001.BYTE2` (pos)  
→ Sends data via WebSocket on port `8080`

### **Terminal 2 — HTTP server:**
```bash
pnpm run serve
```
→ Serves static files on port `3001`

---

## 📋 What Will Work

1. ✅ **HTTP server** at `http://localhost:3001`
2. ✅ **WebSocket** connection to `ws://localhost:8080`
3. ✅ **PLC data** updates every 50ms
4. ✅ **Visualization** in real-time (60 FPS)
5. ✅ **Navigation** between applications

---

## 🎯 Next Step

**Open in browser:**

```
http://localhost:3001/public/
```

You'll see 3 beautiful cards for selecting visualization! 🎉

---

## 💡 Tips

- **Without PLC**: Application will show "Disconnected" and wait for connection
- **With PLC**: Run `pnpm start` in separate terminal to connect
- **Test PLC**: `pnpm run test:plc` — check controller connection
- **Ports**: 
  - `3001` — HTTP (frontend)
  - `8080` — WebSocket (PLC data)
  - `102` — S7 protocol (PLC)

---

**Ready! Server running on port 3001 🚀**
