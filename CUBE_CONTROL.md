# 🎮 Controlling Cube from PLC

## 📊 How It Works

### Control Variable: **DB1001.BYTE2 (pos)**

In TIA Portal, change value of `DB1001.DBB2` from **0 to 255**, and cube will move:

```
DB1001.DBB2 = 0     →  Cube on left   (X = -15)
DB1001.DBB2 = 127   →  Cube at center (X = 0)
DB1001.DBB2 = 255   →  Cube on right  (X = +15)
```

---

## 🎯 Conversion Formula

### In `updateData()`:
```javascript
const rawPos = data.pos; // Store original (0-255)

this.plcData = {
  position: ...,     // for other uses
  speed: rawPos / 25.5,  // for rotation (0-10)
  rawPos: rawPos     // for cube position calculation
};
```

### In `render()`:
```javascript
const scalePos = 15; // position scale on scene
const rawPos = this.plcData.rawPos; // Original value (0-255)

if (rawPos <= 127) {
    // From 0 to 127: from -15 to 0
    cubeX = -scalePos + (rawPos / 127) * scalePos;
} else {
    // From 127 to 255: from 0 to +15
    cubeX = ((rawPos - 127) / 128) * scalePos;
}
```

### Examples:
| **pos (0-255)** | **cubeX**    | **speed (0-10)** | **Position**       |
|-----------------|--------------|------------------|-------------------|
| 0               | -15.0        | 0.0              | Far left          |
| 64              | -7.5         | 2.5              | Left of center    |
| 127             | 0.0          | 5.0              | Center            |
| 191             | +7.5         | 7.5              | Right of center   |
| 255             | +15.0        | 10.0             | Far right         |

---

## ⚙️ What Changes with `pos`:

1. **Cube position on X axis** (from -15 to +15)
2. **Cube rotation speed** (rotation.y)
3. **Sphere size** (scale)
4. **Light intensity** (point light)

---

## 🎚️ Adjusting Scale

To change movement range, simply modify the `scalePos` constant:

```javascript
const scalePos = 15;  // ±15 units
const scalePos = 30;  // ±30 units
const scalePos = 100; // ±100 units
```

---

## 🧪 Test in TIA Portal

### Simple cycle for testing:

```scl
// In Main (OB1) or cyclic block

// Option 1: Smooth back-and-forth movement
DB1001.DBB2 := REAL_TO_BYTE((SIN(TIME_TO_REAL(#CurrentTime) * 0.001) + 1.0) * 127.5);

// Option 2: Linear counter
IF DB1001.DBB2 < 255 THEN
    DB1001.DBB2 := DB1001.DBB2 + 1;
ELSE
    DB1001.DBB2 := 0;
END_IF;
```

### Manual control:

Simply change value in Watch Table:
```
DB1001.DBB2 = 0      // Cube on left (-15)
DB1001.DBB2 = 127    // Cube at center (0)
DB1001.DBB2 = 255    // Cube on right (+15)
```

---

## 🎨 Visualizations

### WebGL (Classic):
- Cube moves smoothly (lerp with factor 0.1)
- Rotation depends on pos
- Sphere rotates around cube
- Sphere size changes

### WebGPU (Advanced):
- Same logic + TSL effects
- Procedural materials via TSL
- WebGPU renderer (modern)

---

## 📋 Data Structure

### Reading (DB1001):
```
DB1001.DBB0  (BYTE) - status   → displayed in table
DB1001.DBB1  (BYTE) - clock    → displayed in table
DB1001.DBB2  (BYTE) - pos      → controls ALL animations! ⭐
```

### Writing (DB1002):
```
DB1002.DBB0  (BYTE) - read     → for writing from browser
```

---

## 🚀 Quick Start

1. **In TIA Portal:**
   ```
   DB1001.DBB2 = 0 to 255
   ```

2. **Start server:**
   ```bash
   pnpm start
   pnpm run serve
   ```

3. **Open browser:**
   ```
   http://localhost:3001/public/webgl/
   or
   http://localhost:3001/public/webgpu/
   ```

4. **Change DB1001.DBB2 in TIA Portal** → cube moves in real-time!

---

## 💡 Tips

- **Smooth movement**: Change pos in small steps (±1-5)
- **Fast movement**: Change pos in large steps (±50-100)
- **Stop**: Set fixed value (e.g., 127)
- **Cyclic**: Use counter 0→255→0

---

**Now cube is fully controlled from PLC via DB1001.BYTE2!** 🎉
