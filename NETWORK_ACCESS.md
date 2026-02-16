# 🌐 Access from Another Device (Laptop)

## 📋 Problem

WebSocket client tries to connect to `ws://localhost:8080`, which only works on the same computer.

## ✅ What Was Fixed

1. **WebSocket client** now automatically uses server's IP address
2. **WebSocket server** listens on all network interfaces (`0.0.0.0`)

---

## 🚀 How to Use

### 1. Find IP Address of Computer with Server

**On Mac/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**On Windows:**
```bash
ipconfig
```

Look for address like `192.168.x.x` or `10.x.x.x`

**Example output:**
```
inet 192.168.0.98 netmask 0xffffff00 broadcast 192.168.0.255
```
→ IP address: **192.168.0.98**

---

### 2. Start Servers on Main Computer

**Terminal 1 — Node.js server (WebSocket + PLC):**
```bash
pnpm start
```

You should see:
```
🚀 WebSocket server listening on 0.0.0.0:8080
   Accessible from other devices at: ws://<your-ip>:8080
```

**Terminal 2 — HTTP server (static files):**
```bash
pnpm run serve
```

You should see:
```
Starting up http-server, serving .
Available on:
  http://127.0.0.1:3001
  http://192.168.0.98:3001    ← use this address!
```

---

### 3. Open on Second Laptop

Use main computer's IP address:

```
http://192.168.0.98:3001/public/
```

**Replace `192.168.0.98` with your IP address!**

---

## 🔍 How It Works

### Automatic Address Detection

Client now determines WebSocket URL automatically:

```javascript
const hostname = window.location.hostname; // Gets from browser URL
const url = `ws://${hostname}:8080`;
```

**Examples:**
- If opened `http://192.168.0.98:3001/public/` → WebSocket connects to `ws://192.168.0.98:8080`
- If opened `http://localhost:3001/public/` → WebSocket connects to `ws://localhost:8080`

---

## 🧪 Connection Check

### 1. Open DevTools (F12) in browser

In **Console** tab you should see:

```
🌐 WebSocket will connect to: ws://192.168.0.98:8080
✅ WebSocket connected
```

### 2. Check connection status

Navigation should show **green indicator** with status "Connected to PLC"

### 3. Check data

Table should update with values:
- Status
- Clock  
- Position

---

## 🔥 Firewall (if not connecting)

### On Mac:

1. Open **System Settings** → **Network** → **Firewall**
2. Allow incoming connections for Node.js
3. Or temporarily disable Firewall for testing

### On Windows:

1. Open **Windows Defender Firewall**
2. **Allow an app through firewall**
3. Find Node.js and allow for **Private** network

### On Linux:

```bash
sudo ufw allow 8080/tcp
sudo ufw allow 3001/tcp
```

---

## 📱 Access from Phone/Tablet

Same scheme! Open in browser:

```
http://192.168.0.98:3001/public/
```

**Important**: All devices must be on **same local network** (connected to same Wi-Fi router).

---

## 🌍 Internet Access (Optional)

If you need access via internet, use:

1. **ngrok** (easiest way):
   ```bash
   npm install -g ngrok
   ngrok http 3001
   ```

2. **Port forwarding setup** on router:
   - Forward ports 3001 and 8080 to your computer's IP
   - Use router's external IP

---

## 🎯 Quick Instructions

1. **Find IP**: `ifconfig` → `192.168.0.98`
2. **Start servers**: `pnpm start` + `pnpm run serve`
3. **On second device**: open `http://192.168.0.98:3001/public/`
4. **Verify**: indicator should be green, data updating

---

## 🐛 Troubleshooting

### WebSocket not connecting

**Problem**: `WebSocket connection to 'ws://192.168.0.98:8080/' failed`

**Solution**:
1. Check that server is running: `pnpm start`
2. Check Firewall (see above)
3. Check that both devices on same network
4. Try `telnet 192.168.0.98 8080` from second laptop

### HTTP not opening

**Problem**: `ERR_CONNECTION_REFUSED` when opening `http://192.168.0.98:3001`

**Solution**:
1. Check that HTTP server is running: `pnpm run serve`
2. Check Firewall
3. Try `curl http://192.168.0.98:3001` from second laptop

### Connects but no data

**Problem**: WebSocket connected (green indicator), but no data coming

**Solution**:
1. Check PLC connection: logs in server terminal
2. Check in DevTools → Network → WS → view messages

---

**Now you can open application from any device on local network!** 🎉
