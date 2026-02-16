# 🧪 Test PLC Write (DB1002.BYTE0)

## 📋 Problem

Write to controller not working. Variable is named **"read"** in DB1002.BYTE0.

---

## ✅ What Was Fixed

1. **Variable renamed**: `write1` → `read`
2. **All clients updated**: now use name `read`
3. **Test created**: `test-write.js` to verify write operation

---

## 🔍 Check Settings in TIA Portal

### 1. Ensure DB1002 exists:

```
DB1002 (Data Block)
├── DBB0 (BYTE) - variable "read"  ← must exist!
```

### 2. DB1002 Settings:

- ✅ **Optimize block access** = **OFF** (required!)
- ✅ **Accessible from HMI/OPC UA** = enabled (if available)

### 3. Controller Settings:

- ✅ **PUT/GET** enabled (Connection resources → Enable...)

---

## 🧪 Run Write Test

### Option 1: Quick Test

```bash
pnpm run test:write
```

This script:
1. Connects to PLC
2. Reads current value of DB1002.BYTE0
3. Writes value **123**
4. Reads again to verify
5. Writes value **50**
6. Shows result

### Expected Output:

```
🔧 Testing PLC Write Operation
================================
PLC: 192.168.0.10:102
Variables: { status: 'DB1001,BYTE0', clock: 'DB1001,BYTE1', pos: 'DB1001,BYTE2', read: 'DB1002,BYTE0' }
================================

🔌 Connecting to PLC...
✅ Connected to PLC

📊 Current PLC Data:
  status: 4
  clock: 68
  pos: 127
  read (DB1002.BYTE0): 0

✍️  Writing value 123 to DB1002.BYTE0 (variable: "read")...
✅ Write successful!

⏳ Waiting 500ms...
📖 Reading back to verify...
📊 Verification - read (DB1002.BYTE0): 123
✅ SUCCESS! Value was written and verified!

✍️  Writing value 50 to DB1002.BYTE0...
✅ Write successful!

🎉 All tests completed!
```

---

## 🔧 If Test Fails

### Error: "Variable read not found"

**Cause**: Variable `read` not added to PLC variables list.

**Solution**: Restart server:
```bash
# Stop current server (Ctrl+C)
pnpm start
```

### Error: "PLC not connected"

**Cause**: Connection issue with PLC.

**Solution**: 
1. Check IP address: `192.168.0.10`
2. Check that PLC is running
3. Check PUT/GET are enabled

### Error: Write error or timeout

**Cause**: DB1002 doesn't exist or configured incorrectly.

**Solution in TIA Portal**:
1. Create DB1002 (if doesn't exist)
2. Add variable `DBB0` type `BYTE`, name it `read`
3. **IMPORTANT**: Disable **"Optimize block access"** for DB1002
4. Download program to PLC

---

## 🌐 Test via Browser

After successful test via `test-write.js`:

1. **Start servers**:
   ```bash
   # Terminal 1
   pnpm start
   
   # Terminal 2
   pnpm run serve
   ```

2. **Open browser**:
   ```
   http://localhost:3001/public/2d/
   ```

3. **Test write**:
   - Enter value in field (0-255)
   - Click "Write"
   - In browser console (F12) should see:
     ```
     ✅ Sent to PLC: read = 123
     ```
   - In server console should see:
     ```
     ✅ Written read = 123
     ```

4. **Check in TIA Portal**:
   - Open Watch Table
   - Add `DB1002.DBB0` (or `DB1002.read`)
   - Value should change!

---

## 📊 Final Variable Structure

### Reading (DB1001):
```
DB1001.DBB0 (status)  → table display
DB1001.DBB1 (clock)   → table display
DB1001.DBB2 (pos)     → animations (cube position)
```

### Writing (DB1002):
```
DB1002.DBB0 (read)    → editable field in browser
```

---

## 💡 Additional Debugging

### Check server logs:

Server should output:
```
✅ Written read = 123
```

If you see error:
```
❌ Write error: ...
```

Then there's a problem with PLC or DB1002 configuration.

### Check browser console (F12):

Should see:
```
✅ Sent to PLC: read = 123
```

If you see:
```
alert: No connection to server
```

Then WebSocket is not connected to server.

---

## 🎯 Troubleshooting Checklist

- [ ] DB1002 exists in TIA Portal
- [ ] DB1002.DBB0 variable `read` exists (type BYTE)
- [ ] **"Optimize block access" disabled** for DB1002
- [ ] PUT/GET enabled on controller
- [ ] Program downloaded to PLC
- [ ] Server restarted: `pnpm start`
- [ ] Test `pnpm run test:write` executed successfully
- [ ] Value change visible in TIA Portal Watch Table

---

**After completing all steps, write should work!** 🎉
