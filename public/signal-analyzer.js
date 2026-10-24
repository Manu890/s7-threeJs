(function () {
  const palette = [
    "#56d69a",
    "#62b6ff",
    "#f5c66a",
    "#e58bff",
    "#ff8a65",
    "#a6a1ff",
    "#f06b9a",
    "#8bd3c7",
    "#c3d86d",
    "#f5a9d5",
  ];
  const signals = [];
  const SIGNAL_STORAGE_KEY = "s7-threejs-signal-analyzer-signals-v1";
  function saveCustomSignals() {
    try {
      localStorage.setItem(
        SIGNAL_STORAGE_KEY,
        JSON.stringify(
          signals
            .filter(function (s) {
              return !s.builtin;
            })
            .map(function (s) {
              return {
                key: s.key,
                label: s.label,
                address: s.address,
                type: s.type || "B",
                precision:
                  s.precision === undefined
                    ? 2
                    : Math.min(20, Math.max(0, Number(s.precision) || 0)),
                visible: s.visible,
                symbolName: s.symbolName || "",
                operand: s.operand || s.address || "",
                dataType: s.dataType || s.type || "",
                comment: s.comment || "",
              };
            })
        )
      );
    } catch (e) {
      console.warn("Could not save signal configuration in this browser.", e);
    }
  }
  function restoreCustomSignals() {
    try {
      const saved = JSON.parse(localStorage.getItem(SIGNAL_STORAGE_KEY) || "[]");
      if (!Array.isArray(saved)) return;
      saved.forEach(function (s) {
        if (
          !s ||
          typeof s.key !== "string" ||
          typeof s.label !== "string" ||
          signals.some(function (existing) {
            return existing.key.toLowerCase() === s.key.toLowerCase();
          })
        )
          return;
        if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,39}$/.test(s.key)) return;
        const savedAddress = typeof s.address === "string" ? s.address : "";
        signals.push({
          key: s.key,
          label: s.label,
          address: savedAddress.indexOf("WebSocket key: ") === 0 ? "" : savedAddress,
          type: typeof s.type === "string" ? s.type : "B",
          precision:
            s.precision === undefined ? 2 : Math.min(20, Math.max(0, Number(s.precision) || 0)),
          symbolName: typeof s.symbolName === "string" ? s.symbolName : "",
          operand: typeof s.operand === "string" ? s.operand : savedAddress,
          dataType: typeof s.dataType === "string" ? s.dataType : "",
          comment: typeof s.comment === "string" ? s.comment : "",
          color: palette[signals.length % palette.length],
          builtin: false,
          visible: s.visible !== false,
        });
      });
    } catch (e) {
      console.warn("Could not restore saved signal configuration.", e);
    }
  }
  restoreCustomSignals();
  const history = [];
  const maxSamples = 5000;
  let recording = false;
  let recordingStartedAt = 0;
  let chartFrozen = false;
  let frozenTimestamp = 0;
  let recorded = [];
  let recordedSampleCount = 0;
  let recordingEndedAt = 0;
  let lastTimestamp = 0;
  let historicalMode = false;
  let historicalSamples = [];
  let historicalOldestTimestamp = null;
  let historicalLatestTimestamp = null;
  let historyLoadRequest = 0;
  let socket = null;
  let hoverTime = null;
  let inspectionViewTime = null;
  let inspectionScrollDirection = 0;
  let inspectionDragging = false;
  let inspectionDragStartX = 0;
  let inspectionDragStartViewTime = 0;
  const traces = document.getElementById("traces");
  function getAvailableSamples() {
    return (historicalMode ? historicalSamples : history.concat(recorded)).filter(function (sample) {
      return Number.isFinite(sample.timestamp);
    });
  }
  function convertStoredSamples(samples) {
    return (samples || []).map(function (storedSample) {
      const sample = { timestamp: Number(storedSample.timestamp) || 0 };
      signals.forEach(function (signal) {
        const raw = storedSample.data ? storedSample.data[signal.key] : undefined;
        if (raw === undefined || raw === null || raw === "") sample[signal.key] = null;
        else if (typeof raw === "number") sample[signal.key] = Number.isFinite(raw) ? raw : null;
        else if (typeof raw === "boolean") sample[signal.key] = raw ? 1 : 0;
        else if (typeof raw === "string") {
          const numeric = Number(raw);
          sample[signal.key] = raw.trim() !== "" && Number.isFinite(numeric) ? numeric : raw;
        } else sample[signal.key] = String(raw);
      });
      return sample;
    }).filter(function (sample) { return sample.timestamp > 0; });
  }
  async function loadHistoricalRange(latest) {
    const requestId = ++historyLoadRequest;
    const seconds = Number(document.getElementById("windowSelect").value) || 300;
    const canvas = document.querySelector(".trace-canvas");
    const pixels = canvas ? Math.floor(canvas.getBoundingClientRect().width) : 1200;
    const params = new URLSearchParams({ seconds: String(seconds), pixels: String(Math.max(300, pixels)) });
    const loadingFirstWindow = latest || inspectionViewTime === null;
    if (loadingFirstWindow) params.set("oldest", "1");
    else {
      params.set("from", String(inspectionViewTime - seconds * 1000));
      params.set("to", String(inspectionViewTime));
    }
    document.getElementById("sampleStatus").textContent = "Loading selected time range from MongoDB…";
    const response = await fetch("http://127.0.0.1:3002/api/plot?" + params.toString(), { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "History query failed");
    if (requestId !== historyLoadRequest) return;
    historicalSamples = convertStoredSamples(result.samples);
    historicalMode = true;
    historicalOldestTimestamp = Number.isFinite(Number(result.oldest)) ? Number(result.oldest) : null;
    historicalLatestTimestamp = Number.isFinite(Number(result.latest)) ? Number(result.latest) : null;
    if (result.from && loadingFirstWindow)
      inspectionViewTime = Number(result.from) + seconds * 1000;
    else if (result.to && inspectionViewTime === null)
      inspectionViewTime = Number(result.to);
    hoverTime = null;
    document.getElementById("loadStoredBtn").textContent = "Return to live";
    const configuredValues = historicalSamples.reduce(function (count, sample) {
      return count + signals.filter(function (signal) {
        return signal.visible && typeof sample[signal.key] === "number" && Number.isFinite(sample[signal.key]);
      }).length;
    }, 0);
    document.getElementById("sampleStatus").textContent = !historicalSamples.length
      ? "No stored samples found in the selected time range."
      : !signals.length
        ? "History loaded, but no signals are configured. Add the signal(s) you want to plot."
        : !configuredValues
          ? "History loaded, but stored samples contain no numeric values for the configured trace signals. Check that recording saved the configured signal keys."
          : "Historical view · " + configuredValues.toLocaleString() + " configured signal values from " +
            Number(result.scanned || historicalSamples.length).toLocaleString() + " stored samples.";
    drawAll();
  }
  function safeId(key) {
    return key.replace(/[^a-zA-Z0-9_-]/g, "_");
  }
  function reorderSignals(draggedKey, targetKey) {
    if (!draggedKey || !targetKey || draggedKey === targetKey) return;
    const from = signals.findIndex(function (s) {
      return s.key === draggedKey;
    });
    const to = signals.findIndex(function (s) {
      return s.key === targetKey;
    });
    if (from < 0 || to < 0) return;
    const moved = signals.splice(from, 1)[0];
    signals.splice(to, 0, moved);
    signals.forEach(function (signal) {
      const row = traces.querySelector('[data-signal="' + CSS.escape(signal.key) + '"]');
      if (row) traces.appendChild(row);
    });
    saveCustomSignals();
    renderAllControls();
    drawAll();
  }
  function addTrace(s) {
    const row = document.createElement("div");
    row.className = "trace-row";
    row.dataset.signal = s.key;
    row.draggable = true;
    row.style.cursor = "grab";
    row.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", s.key);
      e.dataTransfer.effectAllowed = "move";
      row.style.opacity = ".45";
    });
    row.addEventListener("dragend", function () {
      row.style.opacity = "";
    });
    row.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", function (e) {
      e.preventDefault();
      reorderSignals(e.dataTransfer.getData("text/plain"), s.key);
    });
    const label = document.createElement("div");
    label.className = "trace-label";
    const title = document.createElement("strong");
    title.style.color = s.color;
    title.textContent = s.label;
    const address = document.createElement("small");
    address.textContent = s.operand || s.address || "key: " + s.key;
    const value = document.createElement("em");
    value.id = "value-" + safeId(s.key);
    value.textContent = "—";
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "trace-settings-button";
    settingsButton.textContent = "⚙ Settings";
    settingsButton.setAttribute("aria-label", "Configure " + s.label);
    settingsButton.addEventListener("click", function () {
      const popup = window.open(
        "signal-settings.html?key=" + encodeURIComponent(s.key),
        "signalSettings",
        "popup=yes,width=460,height=440,resizable=yes,scrollbars=yes"
      );
      if (!popup) {
        document.getElementById("sampleStatus").textContent =
          "Settings popup was blocked. Allow popups for this local analyzer and try again.";
      }
    });
    const symbolTooltip = (s.dataType || "—") + " · " + (s.comment || "—");
    label.title = symbolTooltip;
    label.append(title, address, value, settingsButton);
    const wrap = document.createElement("div");
    wrap.className = "canvas-wrap";
    const canvas = document.createElement("canvas");
    canvas.className = "trace-canvas";
    canvas.id = "canvas-" + safeId(s.key);
    canvas.setAttribute("aria-label", s.label + " signal trace");
    wrap.appendChild(canvas);
    row.append(label, wrap);
    traces.appendChild(row);
    canvas.addEventListener("mousedown", function (e) {
      if (recording) return;
      e.preventDefault();
      if (inspectionViewTime === null)
        inspectionViewTime = chartFrozen
          ? frozenTimestamp || lastTimestamp || Date.now()
          : lastTimestamp || Date.now();
      inspectionDragging = true;
      inspectionDragStartX = e.clientX;
      inspectionDragStartViewTime = inspectionViewTime;
      inspectionScrollDirection = 0;
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("mousemove", function (e) {
      const rect = canvas.getBoundingClientRect(),
        x = e.clientX - rect.left;
      const span = Number(document.getElementById("windowSelect").value) * 1000;
      if (recording) {
        inspectionScrollDirection = 0;
        inspectionViewTime = null;
        const displayNow = lastTimestamp || Date.now();
        const firstLiveSample = history.length ? history[0].timestamp : displayNow;
        const visibleFrom = Math.max(firstLiveSample, displayNow - span);
        hoverTime = visibleFrom + (x / Math.max(1, rect.width)) * span;
      } else {
        if (inspectionDragging) {
          const available = getAvailableSamples().map(function (p) { return p.timestamp; });
          const earliest = available.length ? Math.min.apply(null, available) : 0;
          const latest = available.length ? Math.max.apply(null, available) : lastTimestamp || Date.now();
          inspectionViewTime =
            inspectionDragStartViewTime -
            ((e.clientX - inspectionDragStartX) / Math.max(1, rect.width)) * span;
          if (!historicalMode) {
            inspectionViewTime =
              latest - earliest >= span
                ? Math.max(earliest + span, Math.min(latest, inspectionViewTime))
                : latest;
          }
          inspectionScrollDirection = 0;
        } else if (
          x <= Math.max(8, rect.width * 0.015) ||
          x >= rect.width - Math.max(8, rect.width * 0.015)
        ) {
          if (inspectionViewTime === null)
            inspectionViewTime = chartFrozen
              ? frozenTimestamp || lastTimestamp || Date.now()
              : lastTimestamp || Date.now();
          inspectionScrollDirection = x <= Math.max(8, rect.width * 0.015) ? -1 : 1;
        } else {
          inspectionScrollDirection = 0;
          if (inspectionViewTime === null)
            inspectionViewTime = chartFrozen
              ? frozenTimestamp || lastTimestamp || Date.now()
              : lastTimestamp || Date.now();
        }
        const displayNow =
          inspectionViewTime === null
            ? chartFrozen
              ? frozenTimestamp || lastTimestamp || Date.now()
              : lastTimestamp || Date.now()
            : inspectionViewTime;
        const firstLiveSample = !historicalMode && history.length
          ? history[0].timestamp
          : displayNow;
        const visibleFrom = historicalMode
          ? displayNow - span
          : Math.max(firstLiveSample, displayNow - span);
        hoverTime = visibleFrom + (x / Math.max(1, rect.width)) * span;
      }
      drawAll();
    });
    canvas.addEventListener("mouseleave", function () {
      if (!inspectionDragging) {
        inspectionScrollDirection = 0;
        hoverTime = null;
        drawAll();
      }
    });
  }
  function renderSignalList() {
    const list = document.getElementById("signalList");
    list.replaceChildren();
    signals.forEach(function (s) {
      const row = document.createElement("div");
      row.className = "signal-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = s.visible;
      checkbox.setAttribute("aria-label", "Show " + s.label);
      checkbox.addEventListener("change", function () {
        s.visible = checkbox.checked;
        saveCustomSignals();
        drawAll();
      });
      const details = document.createElement("span");
      details.style.minWidth = "0";
      details.style.flex = "1";
      const name = document.createElement("div");
      name.className = "signal-name";
      name.textContent = s.label;
      const address = document.createElement("div");
      address.className = "signal-address";
      address.textContent = s.address || "key: " + s.key;
      details.append(name, address);
      const current = document.createElement("span");
      current.className = "signal-current";
      current.id = "list-" + safeId(s.key);
      current.textContent = "—";
      row.append(checkbox, details, current);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + s.label);
      remove.addEventListener("click", function () {
        removeSignal(s.key);
      });
      row.appendChild(remove);
      list.appendChild(row);
    });
    document.getElementById("signalCount").textContent =
      signals.length + " signal" + (signals.length === 1 ? "" : "s");
  }
  function renderAllControls() {
    renderSignalList();
  }
  function normalizeSignalAddress(address) {
    return String(address || "")
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[,.:/]/g, "_");
  }
  function isDuplicateSignal(key, address) {
    const normalizedKey = String(key || "").toLowerCase();
    const normalizedAddress = normalizeSignalAddress(address);
    return signals.some(function (s) {
      return (
        s.key.toLowerCase() === normalizedKey ||
        (normalizedAddress && s.address && normalizeSignalAddress(s.address) === normalizedAddress)
      );
    });
  }
  function addSignal(config) {
    if (isDuplicateSignal(config.key, config.address)) return false;
    const s = {
      key: config.key,
      label: config.label,
      address: config.address || "",
      type: config.type || "B",
      symbolName: config.symbolName || config.label || "",
      operand: config.operand || config.address || "",
      dataType: config.dataType || config.type || "",
      comment: config.comment || "",
      color: palette[signals.length % palette.length],
      builtin: false,
      visible: true,
    };
    signals.push(s);
    addTrace(s);
    saveCustomSignals();
    renderAllControls();
    if (s.address && socket && socket.readyState === WebSocket.OPEN)
      socket.send(
        JSON.stringify({ type: "addSignal", key: s.key, plcType: s.type, address: s.address })
      );
    const last = history.length ? history[history.length - 1] : null;
    if (last && last[s.key] !== undefined) updateSignalValue(s, last[s.key]);
    drawAll();
    return true;
  }
  function removeSignal(key) {
    const idx = signals.findIndex(function (s) {
      return s.key === key;
    });
    if (idx < 0) return;
    signals.splice(idx, 1);
    const row = traces.querySelector('[data-signal="' + CSS.escape(key) + '"]');
    if (row) row.remove();
    history.forEach(function (sample) {
      delete sample[key];
    });
    recorded.forEach(function (sample) {
      delete sample[key];
    });
    saveCustomSignals();
    renderAllControls();
    drawAll();
  }
  function removeAllSignals() {
    signals.splice(0, signals.length);
    traces.replaceChildren();
    history.forEach(function (sample) {
      Object.keys(sample).forEach(function (key) {
        if (key !== "timestamp") delete sample[key];
      });
    });
    recorded.forEach(function (sample) {
      Object.keys(sample).forEach(function (key) {
        if (key !== "timestamp") delete sample[key];
      });
    });
    saveCustomSignals();
    renderAllControls();
    drawAll();
    document.getElementById("sampleStatus").textContent =
      "All signals removed. Add signals using the form.";
  }
  function handlePlcReadErrors(errors) {
    if (!Array.isArray(errors)) return;
    const byKey = new Map();
    errors.forEach(function (error) {
      if (error && typeof error.key === "string") byKey.set(error.key, error);
    });
    signals.forEach(function (s) {
      if (!s.address) return;
      const error = byKey.get(s.key);
      if (error) {
        setSignalReadStatus(
          s,
          false,
          "PLC read failed for " +
            (error.address || s.address) +
            ": " +
            (error.reason || "bad quality")
        );
      } else if (s.readError) {
        setSignalReadStatus(s, true);
      }
    });
  }
  function setSignalReadStatus(s, readable, reason) {
    if (!s || !s.address) return;
    const label = traces.querySelector(`[data-signal="${CSS.escape(s.key)}"] .trace-label`);
    if (!label) return;
    if (readable) {
      label.classList.remove("signal-unreadable");
      label.removeAttribute("data-error");
      label.removeAttribute("title");
      s.lastReadAt = Date.now();
      s.readError = false;
      return;
    }
    const message =
      reason ||
      "PLC read failed for " +
        s.address +
        ". Check its address, data type, and PLC access settings.";
    label.classList.add("signal-unreadable");
    label.dataset.error = message;
    label.title = message;
    s.readError = true;
  }
  function updateSignalValue(s, value) {
    let shown = "—";
    if (value !== null && value !== undefined) {
      const isReal = s.type === "R" || s.type === "REAL";
      const digits = Math.min(20, Math.max(0, Number(s.precision) || 0));
      shown =
        isReal && typeof value === "number" && Number.isFinite(value)
          ? value.toFixed(digits)
          : String(value);
    }
    const listValue = document.getElementById("list-" + safeId(s.key));
    const traceValue = document.getElementById("value-" + safeId(s.key));
    if (listValue) listValue.textContent = shown;
    if (traceValue) traceValue.textContent = shown;
  }
  window.addEventListener("message", function (event) {
    if (
      event.origin !== window.location.origin ||
      !event.data ||
      event.data.type !== "signalSettingsUpdated"
    )
      return;
    const data = event.data;
    const signal = signals.find(function (s) {
      return s.key === data.key;
    });
    if (!signal) return;
    const previousType = signal.type;
    signal.type = String(data.plcType || signal.type || "B");
    signal.dataType = signal.type;
    signal.precision = Math.min(20, Math.max(0, Number(data.precision) || 0));
    saveCustomSignals();
    const typeChanged = previousType !== signal.type;
    if (typeChanged) {
      // Re-decode existing numeric samples immediately when the selected type changes.
      // DWORD <-> REAL needs bit reinterpretation, not a numeric cast.
      function decodeForType(value, fromType, toType) {
        if (value === null || value === undefined || value === "") return value;
        const from = String(fromType || "").toUpperCase(),
          to = String(toType || "").toUpperCase();
        const isReal = function (t) {
          return ["R", "REAL", "RR", "RREAL"].includes(t);
        };
        const isDword = function (t) {
          return ["D", "DW", "DWORD", "RD", "RDW", "RDWORD"].includes(t);
        };
        const isDbDoubleWord = /^DB\d+\s*[,.:/]\s*DBD\s*\d+$/i.test(signal.address || "");
        if (
          typeof value === "number" &&
          Number.isFinite(value) &&
          isReal(from) !== isReal(to) &&
          (isReal(from) || isReal(to)) &&
          (isDword(from) || isDword(to) || isDbDoubleWord)
        ) {
          const buffer = new ArrayBuffer(4),
            view = new DataView(buffer);
          if (isReal(from)) {
            view.setFloat32(0, value, false);
            return view.getUint32(0, false);
          }
          // DBD addresses are 32-bit PLC values. Their original UI type may be
          // unset/incorrect (for example "I"), while the bridge returns a DWORD.
          view.setUint32(0, value >>> 0, false);
          return view.getFloat32(0, false);
        }
        if (typeof value !== "number" || !Number.isFinite(value)) return value;
        switch (to) {
          case "X":
            return value ? 1 : 0;
          case "B":
            return value & 0xff;
          case "I":
            return (value << 16) >> 16;
          case "DI":
            return value | 0;
          case "W":
            return value & 0xffff;
          case "D":
          case "DW":
          case "DWORD":
            return value >>> 0;
          case "R":
          case "REAL":
          case "RR":
          case "RREAL":
            return Math.fround(value);
          default:
            return value;
        }
      }
      history.forEach(function (sample) {
        if (Object.prototype.hasOwnProperty.call(sample, signal.key))
          sample[signal.key] = decodeForType(sample[signal.key], previousType, signal.type);
      });
      recorded.forEach(function (sample) {
        if (Object.prototype.hasOwnProperty.call(sample, signal.key))
          sample[signal.key] = decodeForType(sample[signal.key], previousType, signal.type);
      });
      const lastSamples = recording ? recorded : history;
      const last = lastSamples.length ? lastSamples[lastSamples.length - 1] : null;
      updateSignalValue(signal, last && last[signal.key] !== undefined ? last[signal.key] : null);
      if (signal.address && socket && socket.readyState === WebSocket.OPEN)
        socket.send(
          JSON.stringify({
            type: "addSignal",
            key: signal.key,
            plcType: signal.type,
            address: signal.address,
          })
        );
    } else {
      const last = history.length ? history[history.length - 1] : null;
      if (last && last[signal.key] !== undefined) updateSignalValue(signal, last[signal.key]);
    }
    drawAll();
    document.getElementById("sampleStatus").textContent = typeChanged
      ? "Type updated for " +
        signal.label +
        ". " +
        (recording
          ? "Waiting for a fresh PLC sample."
          : "Start recording to read this signal using the new type.")
      : "Settings updated for " + signal.label + ".";
  });
  function setConnection(ok, text) {
    document.getElementById("connectionDot").className = "dot " + (ok ? "online" : "offline");
    document.getElementById("connectionText").textContent = text;
  }
  function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(
      protocol + "//" + (location.hostname || "localhost") + ":8080?client=analyzer"
    );
    socket.onopen = function () {
      setConnection(true, "Connected · " + socket.url);
      signals
        .filter(function (s) {
          return !s.builtin && s.address;
        })
        .forEach(function (s) {
          socket.send(
            JSON.stringify({ type: "addSignal", key: s.key, plcType: s.type, address: s.address })
          );
        });
      if (recording)
        socket.send(
          JSON.stringify({
            type: "startRecording",
            keys: signals.map(function (s) {
              return s.key;
            }),
          })
        );
    };
    socket.onmessage = function (event) {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (!msg.data || typeof msg.data !== "object") return;
      const timestamp = Number(msg.timestamp) || Date.now();
      lastTimestamp = timestamp;
      const readErrors = Array.isArray(msg.errors) ? msg.errors : [];
      const failedKeys = new Set(
        readErrors
          .map(function (error) {
            return error && error.key;
          })
          .filter(Boolean)
      );
      handlePlcReadErrors(readErrors);
      const sample = { timestamp: timestamp };
      signals.forEach(function (s) {
        const raw = msg.data[s.key];
        let value = null;
        if (!failedKeys.has(s.key) && raw !== null && raw !== undefined && raw !== "") {
          if (typeof raw === "number") value = Number.isFinite(raw) ? raw : null;
          else if (typeof raw === "boolean") value = raw ? 1 : 0;
          else if (typeof raw === "string") {
            const numeric = Number(raw);
            value = raw.trim() !== "" && Number.isFinite(numeric) ? numeric : raw;
          }
        }
        sample[s.key] = value;
        updateSignalValue(s, value === null ? "—" : value);
      });
      if (recording && !chartFrozen) {
        history.push(sample);
        if (history.length > maxSamples) history.shift();
      }
      if (recording) {
        recorded.push(Object.assign({}, sample));
        // Keep the browser memory bounded; MongoDB is the long-term recording store.
        if (recorded.length > maxSamples) recorded.shift();
        recordedSampleCount++;
      }
      document.getElementById("sampleStatus").textContent =
        "Samples buffered: " +
        history.length +
        " · Last update: " +
        new Date(timestamp).toLocaleTimeString();
      drawAll();
    };
    socket.onclose = function () {
      setConnection(false, "Disconnected · reconnecting…");
      setTimeout(connect, 2000);
    };
    socket.onerror = function () {
      setConnection(false, "WebSocket connection error");
    };
  }
  function drawAll() {
    const liveNow = chartFrozen
      ? frozenTimestamp || lastTimestamp || Date.now()
      : lastTimestamp || Date.now();
    const viewNow = inspectionViewTime === null ? liveNow : inspectionViewTime,
      span = Number(document.getElementById("windowSelect").value) * 1000,
      plotData = historicalMode ? historicalSamples : history,
      firstLiveSample = !historicalMode && plotData.length ? plotData[0].timestamp : viewNow,
      requestedFrom = historicalMode ? viewNow - span : Math.max(firstLiveSample, viewNow - span),
      from = requestedFrom,
      now = viewNow,
      plotSpan = span;
    signals.forEach(function (s) {
      const row = traces.querySelector('[data-signal="' + CSS.escape(s.key) + '"]');
      if (!row) return;
      row.style.display = s.visible ? "grid" : "none";
      const canvas = document.getElementById("canvas-" + safeId(s.key));
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect(),
        dpr = window.devicePixelRatio || 1,
        w = Math.max(1, Math.floor(rect.width * dpr)),
        h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cw = rect.width,
        ch = rect.height;
      ctx.clearRect(0, 0, cw, ch);
      ctx.strokeStyle = "#d1d5db";
      ctx.lineWidth = 1;
      for (let y = 0; y <= 4; y++) {
        const yy = 8 + ((ch - 16) * y) / 4;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(cw, yy);
        ctx.stroke();
      }
      for (let x = 0; x <= 6; x++) {
        const xx = (cw * x) / 6;
        ctx.beginPath();
        ctx.moveTo(xx, 0);
        ctx.lineTo(xx, ch);
        ctx.stroke();
      }
      if (!s.visible) return;
      const points = plotData
        .filter(function (p) {
          return (
            p.timestamp >= from &&
            p.timestamp <= now &&
            typeof p[s.key] === "number" &&
            Number.isFinite(p[s.key])
          );
        })
        .sort(function (a, b) {
          return a.timestamp - b.timestamp;
        });
      if (!points.length) return;
      const values = points.map(function (p) {
          return p[s.key];
        }),
        min = Math.min.apply(null, values),
        max = Math.max.apply(null, values),
        range = max - min || 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.7;
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach(function (p, i) {
        const x = ((p.timestamp - from) / plotSpan) * cw,
          y = ch - 8 - ((p[s.key] - min) / range) * (ch - 16);
        if (i === 0) ctx.moveTo(x, y);
        else {
          const prev = points[i - 1],
            prevY = ch - 8 - ((prev[s.key] - min) / range) * (ch - 16);
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      if (hoverTime !== null && hoverTime >= from && hoverTime <= now) {
        const x = ((hoverTime - from) / plotSpan) * cw;
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, ch);
        ctx.stroke();
        let nearest = points[0];
        points.forEach(function (p) {
          if (Math.abs(p.timestamp - hoverTime) < Math.abs(nearest.timestamp - hoverTime))
            nearest = p;
        });
        ctx.font = "11px Segoe UI,Arial,sans-serif";
        const cursorDate = new Date(nearest.timestamp);
        const cursorTime =
          String(cursorDate.getHours()).padStart(2, "0") + ":" +
          String(cursorDate.getMinutes()).padStart(2, "0") + ":" +
          String(cursorDate.getSeconds()).padStart(2, "0") + "." +
          String(cursorDate.getMilliseconds()).padStart(3, "0");
        const valueLabel = String(nearest[s.key]);
        const valueX = Math.max(4, Math.min(cw - ctx.measureText(valueLabel).width - 4, x + 5));
        ctx.fillStyle = s.color;
        ctx.fillText(valueLabel, valueX, 10);
      }
    });
    const ticks = document.getElementById("axisTicks"),
      seconds = Number(document.getElementById("windowSelect").value);
    ticks.replaceChildren();
    for (let i = 0; i <= 4; i++) {
      const spanEl = document.createElement("span");
      const tickTime = new Date(from + (now - from) * (i / 4));
      const hh = String(tickTime.getHours()).padStart(2, "0"),
        mm = String(tickTime.getMinutes()).padStart(2, "0"),
        ss = String(tickTime.getSeconds()).padStart(2, "0"),
        ms = String(tickTime.getMilliseconds()).padStart(3, "0");
      spanEl.textContent = hh + ":" + mm + ":" + ss + "." + ms;
      ticks.appendChild(spanEl);
    }
    if (hoverTime !== null && hoverTime >= from && hoverTime <= now) {
      const cursorDate = new Date(hoverTime);
      const cursorTime =
        String(cursorDate.getHours()).padStart(2, "0") + ":" +
        String(cursorDate.getMinutes()).padStart(2, "0") + ":" +
        String(cursorDate.getSeconds()).padStart(2, "0") + "." +
        String(cursorDate.getMilliseconds()).padStart(3, "0");
      const cursorLabel = document.createElement("span");
      cursorLabel.className = "axis-cursor-time";
      cursorLabel.textContent = cursorTime;
      cursorLabel.style.left = ((hoverTime - from) / (now - from)) * 100 + "%";
      ticks.appendChild(cursorLabel);
    }
  }
  // STEP 7 V5 project symbol discovery. Folder access stays in this browser tab.
  const symbolSearchInput = document.getElementById("symbolSearchInput");
  const symbolProjectStatus = document.getElementById("symbolProjectStatus");
  const symbolResults = document.getElementById("symbolResults");
  let projectSymbols = [];
  function normalizeSymbolType(value) {
    const t = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    const aliases = {
      BOOL: "X",
      BIT: "X",
      X: "X",
      BYTE: "B",
      CHAR: "C",
      STRING: "S",
      INT: "I",
      DINT: "DI",
      WORD: "W",
      DWORD: "DW",
      REAL: "R",
      RINT: "RI",
      RDINT: "RDI",
      RWORD: "RW",
      RDWORD: "RDW",
      RREAL: "RR",
      LREAL: "LR",
      TIMER: "TMR",
      COUNTER: "CTR",
      DATEANDTIME: "DT",
      DT: "DT",
      DTZ: "DTZ",
      DTL: "DTL",
      DTLZ: "DTLZ",
    };
    return aliases[t] || "I";
  }
  function splitSymbolRecord(line) {
    const text = String(line || "")
      .replace(/^\uFEFF/, "")
      .trim();
    if (!text || /^(symbol|name)[,;\t]/i.test(text) || /^\s*#/.test(text)) return null;
    // STEP 7 ASC: length,symbol. address datatype comment
    const asc = text.match(
      /^\s*\d+\s*,\s*([^,]+?)\s+((?:DB\d+\s*[,.:/]\s*)?[A-Z]+\s*\d+(?:\.\d+){0,2}|(?:PI|PQ|PE|PA|M|I|E|Q|A|T|C)[A-Z]*\s*\d+(?:\.\d+){0,2})\s+([A-Z][A-Z0-9_]*)?(?:\s+(.*))?$/i
    );
    if (asc)
      return {
        name: asc[1].replace(/[.\s]+$/, "").trim(),
        address: asc[2].trim(),
        type: asc[3] || "",
        comment: asc[4] || "",
        symbolName: asc[1].replace(/[.\s]+$/, "").trim(),
        operand: asc[2].trim(),
        dataType: asc[3] || "",
      };
    // CSV/TSV exports: symbol, address, data type, comment (quoted or unquoted)
    let cells = [];
    if (text.includes("\t")) cells = text.split("\t");
    else if (text.includes(",")) {
      let current = "",
        quoted = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
          if (quoted && text[i + 1] === '"') {
            current += '"';
            i++;
          } else quoted = !quoted;
        } else if (ch === "," && !quoted) {
          cells.push(current.trim());
          current = "";
        } else current += ch;
      }
      cells.push(current.trim());
    } else return null;
    cells = cells.map((v) =>
      v
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .trim()
    );
    if (cells.length < 2) return null;
    const addressIndex = cells.findIndex((v) =>
      /^(?:DB\d+\s*[,.:/]\s*[A-Z]+\s*\d+(?:\.\d+){0,2}|(?:PI|PQ|PE|PA|M|I|E|Q|A|T|C)[A-Z]*\s*\d+(?:\.\d+){0,2})$/i.test(
        v
      )
    );
    if (addressIndex < 0) return null;
    const name = cells.find(
      (v, i) =>
        i !== addressIndex &&
        v &&
        !/^(BOOL|BYTE|CHAR|STRING|INT|DINT|WORD|DWORD|REAL|RINT|RDINT|RWORD|RDWORD|RREAL|LREAL|TIMER|COUNTER|DT|DTZ|DTL|DTLZ)$/i.test(
          v
        )
    );
    if (!name) return null;
    const type =
      cells.find(
        (v, i) =>
          i !== addressIndex &&
          /^(BOOL|BYTE|CHAR|STRING|INT|DINT|WORD|DWORD|REAL|RINT|RDINT|RWORD|RDWORD|RREAL|LREAL|TIMER|COUNTER|DT|DTZ|DTL|DTLZ|X|B|C|S|I|DI|W|DW|R|RI|RDI|RW|RDW|RR|LR)$/i.test(
            v
          )
      ) || "";
    return {
      name: name,
      address: cells[addressIndex],
      type: type,
      comment: cells
        .slice(addressIndex + 1)
        .filter(Boolean)
        .join(" "),
      symbolName: name,
      operand: cells[addressIndex],
      dataType: type,
    };
  }
  function normalizeStep7Address(value) {
    let address = String(value || "")
      .toUpperCase()
      .replace(/[\t\r\n]+/g, " ")
      .trim();
    address = address.replace(
      /^DB\s*(\d+)\s*[,.:/]\s*(DBX|DBB|DBW|DBD)\s*(\d+(?:\.\d+){0,2})$/,
      "DB$1,$2$3"
    );
    address = address.replace(
      /^DB\s*(\d+)\s+(DBX|DBB|DBW|DBD)\s*(\d+(?:\.\d+){0,2})$/,
      "DB$1,$2$3"
    );
    // nodeS7 expects compact operands such as M79.0 and I8.7.
    // dBASE records may contain padding (e.g. "M       79.0"); symbol search
    // compares addresses without whitespace, while this canonical value is used
    // when registering a live PLC signal with the backend.
    const area = address.match(/^(PI|PQ|PE|PA|M|I|E|Q|A|T|C)([A-Z]*)\s*(\d+(?:\.\d+){0,2})$/);
    if (area) return area[1] + area[2] + area[3];
    const db = address.match(/^(DB\s*\d+)\s*[,.:/]?\s*(DBX|DBB|DBW|DBD)\s*(\d+(?:\.\d+){0,2})$/);
    if (db) return db[1].replace(/\s+/g, "") + "," + db[2] + db[3];
    return address.replace(/\s+/g, " ").trim();
  }
  function step7DbfType(value) {
    const raw = String(value || "")
      .trim()
      .toUpperCase();
    const numeric = {
      1: "BOOL",
      2: "BYTE",
      3: "WORD",
      4: "INT",
      5: "DWORD",
      6: "REAL",
      7: "STRING",
      8: "DINT",
      9: "CHAR",
      10: "ARRAY",
      11: "STRUCT",
      12: "DATE_AND_TIME",
      13: "S5TIME",
      14: "TIME",
      15: "COUNTER",
      16: "TIMER",
    };
    return numeric[raw] || raw;
  }
  async function parseDbfSymbolFile(file) {
    const buffer = await file.arrayBuffer(),
      view = new DataView(buffer),
      bytes = new Uint8Array(buffer);
    if (bytes.length < 33) return [];
    const recordCount = view.getUint32(4, true),
      headerLength = view.getUint16(8, true),
      recordLength = view.getUint16(10, true);
    if (headerLength < 33 || recordLength < 2 || headerLength > bytes.length) return [];
    const fields = [];
    let pos = 32;
    while (pos < headerLength - 1 && bytes[pos] !== 0x0d) {
      if (pos + 32 > bytes.length) break;
      let end = pos;
      while (end < pos + 11 && bytes[end] !== 0 && bytes[end] !== 0x20) end++;
      const name = new TextDecoder("latin1").decode(bytes.slice(pos, end)).trim().toUpperCase();
      const length = bytes[pos + 16];
      if (!name || !length) break;
      fields.push({ name: name, length: length });
      pos += 32;
    }
    if (!fields.length) return [];
    let offset = 1;
    fields.forEach((f) => {
      f.offset = offset;
      offset += f.length;
    });
    const findField = (exact, terms = []) =>
      fields.find((f) => exact.includes(f.name)) ||
      fields.find((f) => terms.some((t) => f.name.includes(t)));
    // STEP 7 V5's native SYMLIST.DBF schema uses these exact field names.
    const nameField = findField(
      ["_SKZ"],
      ["SYMBOL", "SYMNAME", "SYM_NAME", "NAME", "MNEMONIC", "IDENT"]
    );
    const addressField = findField(
      ["_OPIEC", "_OPHIST"],
      ["ADDRESS", "OPERAND", "ADDR", "OPND", "OPIEC", "OPHIST", "ABSADR"]
    );
    const typeField = findField(
      ["_DATATYP", "_TYP"],
      ["DATATYP", "DATATYPE", "DATA_TYPE", "TYPE", "VAR_TYPE"]
    );
    const commentField = findField(["_COMMENT"], ["COMMENT", "COMM", "REMARK", "NOTE"]);
    if (!nameField || !addressField) return [];
    const rows = [],
      count = Math.min(recordCount, 100000),
      decoder = new TextDecoder("windows-1252");
    for (let i = 0; i < count; i++) {
      const base = headerLength + i * recordLength;
      if (base + recordLength > bytes.length) break;
      if (bytes[base] === 0x2a) continue;
      const get = (f) =>
        f
          ? decoder
              .decode(bytes.slice(base + f.offset, base + f.offset + f.length))
              .replace(/\\0/g, "")
              .trim()
          : "";
      const name = get(nameField),
        address = normalizeStep7Address(get(addressField));
      if (!name || !address) continue;
      const type = step7DbfType(get(typeField));
      rows.push({
        name: name.replace(/\\0/g, "").trim(),
        address: address,
        type: type,
        comment: get(commentField),
        symbolName: name.replace(/\\0/g, "").trim(),
        operand: get(addressField),
        dataType: get(typeField),
      });
    }
    return rows;
  }

  function resolveProjectAddress(address) {
    const target = normalizeStep7Address(address)
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/,BYTE(\d+)/, ",DBB$1");
    const direct = projectSymbols.find(function (s) {
      return (
        normalizeStep7Address(s.address)
          .toUpperCase()
          .replace(/\s+/g, "")
          .replace(/,BYTE(\d+)/, ",DBB$1") === target
      );
    });
    if (direct) return direct;
    const m = target.match(/^DB(\d+),(?:DBB|DBW|DBD)(\d+)$/);
    if (!m) return null;
    return (
      projectSymbols.find(function (s) {
        return s._dbStructure && s.address.toUpperCase() === "DB" + m[1] + ",DBB" + m[2];
      }) || null
    );
  }
  function parseStep7DbStructure(text, filename) {
    const src = String(text || "");
    const m =
      src.match(/(?:DATA_BLOCK\s+)?DB\s*(\d+)\b/i) ||
      String(filename || "").match(/\bDB\s*(\d+)\b/i);
    if (!m) return [];
    const db = Number(m[1]),
      out = [];
    let inStruct = false,
      offset = 0,
      bit = -1;
    const sizes = {
      BOOL: 0,
      BYTE: 1,
      CHAR: 1,
      SINT: 1,
      USINT: 1,
      WORD: 2,
      INT: 2,
      UINT: 2,
      S5TIME: 2,
      DATE: 2,
      DWORD: 4,
      DINT: 4,
      UDINT: 4,
      REAL: 4,
      TIME: 4,
      TIME_OF_DAY: 4,
      LREAL: 8,
      LINT: 8,
      ULINT: 8,
      LTIME: 8,
      DATE_AND_TIME: 8,
      DT: 8,
      DTL: 12,
    };
    src.split(/\r?\n/).forEach(function (raw) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      if (!line) return;
      if (/\bSTRUCT\b/i.test(line)) {
        inStruct = true;
        return;
      }
      if (/\bEND_STRUCT\b/i.test(line)) {
        inStruct = false;
        return;
      }
      if (!inStruct || /^(DATA_BLOCK|TITLE|VERSION|BEGIN|END_DATA_BLOCK)\b/i.test(line)) return;
      const f = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*;?$/);
      if (!f) return;
      const name = f[1],
        type = f[2].replace(/;$/, "").trim().toUpperCase();
      let size = sizes[type];
      const arr = type.match(/^ARRAY\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*OF\s*(\w+)$/);
      if (arr && sizes[arr[3]] !== undefined)
        size = (Number(arr[2]) - Number(arr[1]) + 1) * Math.max(1, sizes[arr[3]]);
      const str = type.match(/^STRING(?:\s*\[\s*(\d+)\s*\])?$/);
      if (str) size = 2 + Number(str[1] || 254);
      if (size === undefined) return;
      if (type === "BOOL") {
        if (bit < 0 || bit > 7) {
          offset = Math.ceil(offset);
          bit = 0;
        }
        const addr = "DB" + db + ",DBX" + offset + "." + bit;
        out.push({
          name: name,
          address: addr,
          type: "BOOL",
          comment: "DB structure field",
          symbolName: name,
          operand: addr,
          dataType: "BOOL",
          _dbStructure: true,
        });
        bit++;
        if (bit > 7) {
          offset++;
          bit = -1;
        }
        return;
      }
      if (bit >= 0) {
        offset++;
        bit = -1;
      }
      if (size >= 2 && offset % 2) offset++;
      const prefix = size === 1 ? "DBB" : size === 2 ? "DBW" : size === 4 ? "DBD" : "DBB",
        addr = "DB" + db + "," + prefix + offset;
      out.push({
        name: name,
        address: addr,
        type: type,
        comment: "DB structure field · offset " + offset + " · " + type,
        symbolName: name,
        operand: addr,
        dataType: type,
        _dbStructure: true,
      });
      offset += size;
    });
    return out;
  }
  async function readStep7DbtMemo(dbtBytes, blockNumber) {
    if (!dbtBytes || !Number.isInteger(blockNumber) || blockNumber <= 0) return "";
    const start = blockNumber * 512;
    if (start >= dbtBytes.length) return "";
    const bytes = dbtBytes.slice(start, Math.min(dbtBytes.length, start + 512));
    let payload = bytes;
    if (
      bytes.length >= 8 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xff &&
      bytes[2] === 0x08 &&
      bytes[3] === 0x00
    ) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const length = [view.getUint32(4, true), view.getUint32(4, false)].find(
        (n) => n > 0 && n <= bytes.length - 8
      );
      if (length) payload = bytes.slice(8, 8 + length);
    } else {
      let stop = -1;
      for (let i = 0; i < bytes.length - 1; i++) {
        if (bytes[i] === 0x1a && bytes[i + 1] === 0x1a) {
          stop = i;
          break;
        }
      }
      if (stop > 0) payload = bytes.slice(0, stop);
    }
    const text = new TextDecoder("windows-1252").decode(payload);
    const printable = (text.match(/[\t\r\n\x20-\x7E\u00A0-\u00FF]/g) || []).length;
    return text.length && printable / text.length > 0.82 ? text : "";
  }
  async function parseStep7SubblkDbf(file, dbtFile) {
    const buffer = await file.arrayBuffer(),
      view = new DataView(buffer),
      bytes = new Uint8Array(buffer);
    if (bytes.length < 33) return { rows: [], memoCount: 0 };
    const recordCount = view.getUint32(4, true),
      headerLength = view.getUint16(8, true),
      recordLength = view.getUint16(10, true);
    if (headerLength < 33 || recordLength < 2 || headerLength > bytes.length)
      return { rows: [], memoCount: 0 };
    const fields = [];
    let pos = 32;
    while (pos < headerLength - 1 && bytes[pos] !== 0x0d) {
      if (pos + 32 > bytes.length) break;
      let fieldEnd = pos;
      while (fieldEnd < pos + 11 && bytes[fieldEnd] !== 0 && bytes[fieldEnd] !== 0x20) fieldEnd++;
      const name = new TextDecoder("latin1")
        .decode(bytes.slice(pos, fieldEnd))
        .trim()
        .toUpperCase();
      const type = String.fromCharCode(bytes[pos + 11] || 0).toUpperCase(),
        length = bytes[pos + 16];
      if (!name || !length) break;
      fields.push({ name, type, length });
      pos += 32;
    }
    if (!fields.length) return { rows: [], memoCount: 0 };
    let offset = 1;
    fields.forEach((f) => {
      f.offset = offset;
      offset += f.length;
    });
    let dbtBytes = null;
    if (dbtFile) {
      try {
        dbtBytes = new Uint8Array(await (await dbtFile.getFile()).arrayBuffer());
      } catch (e) {
        console.warn("Could not read companion DBT", e);
      }
    }
    const rows = [],
      count = Math.min(recordCount, 100000),
      decoder = new TextDecoder("windows-1252");
    let memoCount = 0;
    for (let i = 0; i < count; i++) {
      const base = headerLength + i * recordLength;
      if (base + recordLength > bytes.length) break;
      if (bytes[base] === 0x2a) continue;
      const row = {};
      for (const f of fields) {
        const raw = decoder
          .decode(bytes.slice(base + f.offset, base + f.offset + f.length))
          .replace(/\0/g, "")
          .trim();
        row[f.name] = raw;
        if ((f.type === "M" || /^(MC5CODE|UDA|ADDINFO|SSBPART)$/i.test(f.name)) && dbtBytes) {
          const pointer = Number(raw);
          if (Number.isFinite(pointer) && pointer > 0) {
            const memo = await readStep7DbtMemo(dbtBytes, pointer);
            if (memo) {
              row[f.name + "_TEXT"] = memo;
              memoCount++;
            }
          }
        }
      }
      rows.push(row);
    }
    return { rows: rows, memoCount: memoCount, fields: fields.map((f) => f.name) };
  }
  async function walkStep7Folder(root) {
    const found = [],
      files = [],
      maxFiles = 12000;
    let visited = 0;
    async function walk(dir, depth, relativePath) {
      if (depth > 12 || visited >= maxFiles) return;
      for await (const entry of dir.values()) {
        if (visited >= maxFiles) break;
        if (entry.name.startsWith(".") || /^(node_modules|cache|temp|tmp)$/i.test(entry.name))
          continue;
        const path = relativePath ? relativePath + "/" + entry.name : entry.name;
        if (entry.kind === "directory") {
          await walk(entry, depth + 1, path);
          continue;
        }
        visited++;
        const ext = entry.name.split(".").pop().toLowerCase();
        if (
          [
            "asc",
            "sdf",
            "seq",
            "dif",
            "csv",
            "txt",
            "dbf",
            "dbt",
            "ydb",
            "cdb",
            "idb",
            "awl",
            "scl",
            "db",
            "udt",
          ].includes(ext)
        )
          files.push({ entry: entry, path: path });
      }
    }
    await walk(root, 0, "");
    const binaryCandidates = [],
      subblkFiles = [];
    for (const item of files) {
      const entry = item.entry,
        upper = entry.name.toUpperCase(),
        ext = upper.split(".").pop();
      if (upper === "SUBBLK.DBF") subblkFiles.push(item);
      const likelySymbol =
        ext === "ASC" ||
        ext === "SDF" ||
        ext === "SEQ" ||
        ext === "DIF" ||
        /SYM_TAB\.DBF$/.test(upper) ||
        /^SYM[_-]?\d*\.DBF$/.test(upper) ||
        /SYMBOL.*\.DBF$/.test(upper) ||
        /SYMLIST\.DBF$/.test(upper);
      const likelyStructure = ["AWL", "SCL", "DB", "UDT"].includes(ext);
      if (!likelySymbol && !likelyStructure && upper !== "SUBBLK.DBF") continue;
      try {
        const file = await entry.getFile();
        if (likelyStructure) {
          if (file.size > 15 * 1024 * 1024) continue;
          found.push(...parseStep7DbStructure(await file.text(), entry.name));
        } else if (ext === "DBF") {
          const rows = await parseDbfSymbolFile(file);
          if (rows.length) found.push(...rows);
          else if (likelySymbol)
            binaryCandidates.push(item.path + " (DBF found, symbol layout not recognized)");
        } else {
          if (file.size > 15 * 1024 * 1024) continue;
          const content = await file.text();
          content.split(/\r?\n/).forEach((line) => {
            const row = splitSymbolRecord(line);
            if (row && row.name && row.address) found.push(row);
          });
        }
      } catch (err) {
        console.warn("Could not inspect STEP 7 symbol file", item.path, err);
      }
    }
    let subblkRows = 0,
      subblkMemos = 0,
      subblkStructures = 0;
    for (const item of subblkFiles) {
      try {
        const directory = item.path.includes("/")
          ? item.path.slice(0, item.path.lastIndexOf("/") + 1)
          : "";
        const companion = files.find(
          (f) => f.path.toUpperCase() === (directory + "SUBBLK.DBT").toUpperCase()
        );
        const parsed = await parseStep7SubblkDbf(
          await item.entry.getFile(),
          companion && companion.entry
        );
        subblkRows += parsed.rows.length;
        subblkMemos += parsed.memoCount;
        for (const row of parsed.rows) {
          const blockValue = row.BLKNUMBER || row.BLKNR || row.NUMBER || row.BLOCKNR || "";
          const blockName = row.BLKNAME || row.NAME || row.BLOCKNAME || "";
          const match =
            String(blockName + " " + blockValue).match(/\bDB\s*0*(\d+)\b/i) ||
            String(blockValue).match(/^\s*0*(\d+)\s*$/);
          if (!match) continue;
          const dbNumber = Number(match[1]);
          const body = Object.keys(row)
            .filter((k) => /_TEXT$/.test(k))
            .map((k) => row[k])
            .join("\n");
          if (!body || !/STRUCT/i.test(body)) continue;
          const fields = parseStep7DbStructure(body, "DB" + dbNumber + ".DB");
          if (fields.length) {
            found.push(...fields);
            subblkStructures++;
          }
        }
      } catch (err) {
        binaryCandidates.push(item.path + " (SUBBLK parse error: " + err.message + ")");
      }
    }
    const dedup = new Map();
    found.forEach((s) => {
      s.name = String(s.name || "").trim();
      s.address = String(s.address || "").trim();
      if (!s.name || !s.address) return;
      const id = normalizeSignalAddress(s.address);
      if (!dedup.has(id)) dedup.set(id, s);
    });
    return {
      symbols: Array.from(dedup.values()),
      files: files.length,
      binaryCandidates: binaryCandidates,
      visited: visited,
      subblkFiles: subblkFiles.length,
      subblkRows: subblkRows,
      subblkMemos: subblkMemos,
      subblkStructures: subblkStructures,
    };
  }
  function renderProjectSymbols() {
    const query = symbolSearchInput.value.trim().toLowerCase(),
      addressQuery = query.toUpperCase().replace(/\s+/g, "");
    symbolResults.replaceChildren();

    // A trailing dot after a DB symbol (for example db_visu_add.) means
    // "show every parsed field belonging to that data block".
    const dbSymbolQuery = query.match(/^(.+)\.$/);
    const directDbQuery = query.match(/^db\s*0*(\d+)\.$/i);
    const dbRoot = dbSymbolQuery && !directDbQuery
      ? projectSymbols.find(function (s) {
          const name = String(s.name || "").trim().toLowerCase();
          const symbolName = String(s.symbolName || "").trim().toLowerCase();
          return name === dbSymbolQuery[1].trim() || symbolName === dbSymbolQuery[1].trim();
        })
      : null;
    const dbAddress = dbRoot
      ? String(dbRoot.address || dbRoot.operand || "").match(/^DB\s*0*(\d+)(?:$|[,.:/])/i)
      : null;
    const requestedDb = directDbQuery
      ? Number(directDbQuery[1])
      : dbAddress
        ? Number(dbAddress[1])
        : null;
    const dbMode = Number.isInteger(requestedDb);
    const matchingSymbols = dbMode
      ? projectSymbols.filter(function (s) {
          const address = normalizeStep7Address(s.address || s.operand || "")
            .toUpperCase()
            .replace(/\s+/g, "");
          return new RegExp("^DB0*" + requestedDb + "(?:[,.:/]|$)").test(address);
        })
      : projectSymbols.filter(
          (s) =>
            !query ||
            (s.name + " " + s.address + " " + s.type + " " + s.comment)
              .toLowerCase()
              .includes(query) ||
            normalizeStep7Address(s.address).replace(/\s+/g, "").includes(addressQuery)
        );
    const matches = dbMode ? matchingSymbols : matchingSymbols.slice(0, 150);
    matches.forEach((s) => {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;gap:6px;align-items:center;padding:6px;background:#0b131e;border:1px solid #263447;border-radius:6px";
      const info = document.createElement("span");
      info.style.cssText = "min-width:0;flex:1;overflow-wrap:anywhere";
      const name = document.createElement("strong");
      name.style.cssText = "display:block;font-size:12px";
      name.textContent = s.name;
      const meta = document.createElement("small");
      meta.style.cssText =
        "display:block;color:var(--muted);font:10px ui-monospace,Consolas,monospace";
      meta.textContent = s.address + (s.type ? " · " + s.type : "");
      info.append(name, meta);
      row.appendChild(info);
      const add = document.createElement("button");
      add.type = "button";
      add.textContent = "Add";
      add.style.cssText = "padding:4px 8px;flex-shrink:0";
      add.addEventListener("click", function () {
        const address = normalizeStep7Address(s.address),
          key = address
            .toUpperCase()
            .replace(/\s+/g, "")
            .replace(/[,.:/]/g, "_");
        if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,39}$/.test(key)) {
          symbolProjectStatus.textContent =
            "Cannot create a WebSocket key from address " +
            address +
            ". This address format needs backend support.";
          return;
        }
        if (isDuplicateSignal(key, address)) {
          symbolProjectStatus.textContent = "Already monitored: " + s.name + " (" + address + ").";
          return;
        }
        const ok = addSignal({
          key: key,
          label: s.name,
          address: address,
          type: normalizeSymbolType(s.dataType || s.type),
          symbolName: s.symbolName || s.name,
          operand: s.operand || s.address || address,
          dataType: s.dataType || s.type || "",
          comment: s.comment || "",
        });
        symbolProjectStatus.textContent = ok
          ? "Added " + s.name + " (" + address + ")."
          : "This signal is already in the chart.";
      });
      row.appendChild(add);
      symbolResults.appendChild(row);
    });
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "help-text";
      empty.textContent = query
        ? "No matching symbols."
        : "No readable symbols found in this project.";
      symbolResults.appendChild(empty);
    }
    if (matches.length > 0 && matches.length >= 150) {
      const note = document.createElement("div");
      note.className = "help-text";
      note.textContent = "Showing first 150 matches. Search to narrow the list.";
      symbolResults.appendChild(note);
    }
  }
  document.getElementById("openStep7FolderBtn").addEventListener("click", async function () {
    if (!window.showDirectoryPicker) {
      symbolProjectStatus.textContent =
        "Folder access is supported in current Chrome or Edge. Open this page in a recent Chrome/Edge browser and use localhost.";
      return;
    }
    const button = this;
    button.disabled = true;
    button.textContent = "Scanning project…";
    symbolProjectStatus.textContent = "Select the root folder of the extracted STEP 7 V5 project.";
    try {
      const root = await window.showDirectoryPicker({ mode: "read" });
      symbolProjectStatus.textContent = "Scanning " + root.name + " for symbol tables…";
      const result = await walkStep7Folder(root);
      projectSymbols = result.symbols;
      fillSignalNameFromProjectAddress();
      symbolSearchInput.disabled = false;
      renderProjectSymbols();
      let status =
        "Project: " +
        root.name +
        " · " +
        projectSymbols.length +
        " unique symbols parsed · " +
        result.files +
        " candidate files scanned · SUBBLK.DBF: " +
        result.subblkFiles +
        " file(s), " +
        result.subblkRows +
        " rows, " +
        result.subblkMemos +
        " readable memo(s), " +
        result.subblkStructures +
        " text structure(s) decoded.";
      if (result.binaryCandidates.length)
        status +=
          " Some DBF files were not recognized: " +
          result.binaryCandidates.slice(0, 4).join(", ") +
          (result.binaryCandidates.length > 4 ? "…" : "") +
          ".";
      if (!projectSymbols.length)
        status +=
          " No supported symbol records were readable. Check that the selected folder contains the extracted project and its hrs\\YDBs folders.";
      symbolProjectStatus.textContent = status;
    } catch (err) {
      if (err && err.name === "AbortError") {
        symbolProjectStatus.textContent = "Folder selection cancelled.";
        return;
      }
      symbolProjectStatus.textContent =
        "Could not scan project folder: " + (err && err.message ? err.message : String(err));
    } finally {
      button.disabled = false;
      button.textContent = "📂 Open STEP 7 V5 project folder";
    }
  });
  function fillSignalNameFromProjectAddress() {
    const nameInput = document.getElementById("signalNameInput");
    const keyInput = document.getElementById("signalKeyInput");
    const candidate = keyInput.value.trim();
    if (!candidate) return;
    const resolved = resolveProjectAddress(candidate);
    if (resolved) nameInput.value = resolved.name || "";
  }
  document
    .getElementById("signalKeyInput")
    .addEventListener("change", fillSignalNameFromProjectAddress);
  document
    .getElementById("signalKeyInput")
    .addEventListener("blur", fillSignalNameFromProjectAddress);
  function fillSignalAddressFromProjectName() {
    const nameInput = document.getElementById("signalNameInput");
    const keyInput = document.getElementById("signalKeyInput");
    const candidate = nameInput.value.trim().toLowerCase();
    if (!candidate || !projectSymbols.length) return;

    const symbolName = function (symbol) {
      return String(symbol.name || "").trim().toLowerCase();
    };
    const symbolAlias = function (symbol) {
      return String(symbol.symbolName || "").trim().toLowerCase();
    };
    let resolved = projectSymbols.find(function (symbol) {
      return symbolName(symbol) === candidate || symbolAlias(symbol) === candidate;
    });

    // STEP 7 DB structure parsers may expose a field as "temp_wt" while the
    // symbol table names the containing DB "db_visu_add". Resolve the qualified
    // form "db_visu_add.temp_wt" by finding the DB number first, then the field
    // with a matching name in that same DB.
    if (!resolved && candidate.includes(".")) {
      const separator = candidate.lastIndexOf(".");
      const rootName = candidate.slice(0, separator);
      const fieldName = candidate.slice(separator + 1);
      const root = projectSymbols.find(function (symbol) {
        return symbolName(symbol) === rootName || symbolAlias(symbol) === rootName;
      });
      const rootAddress = root && String(root.address || root.operand || "");
      const dbMatch = rootAddress && rootAddress.match(/^DB\\s*0*(\\d+)(?:$|[,.:/])/i);
      if (dbMatch) {
        const dbPrefix = "DB" + Number(dbMatch[1]) + ",";
        resolved = projectSymbols.find(function (symbol) {
          const address = normalizeStep7Address(symbol.address || symbol.operand || "")
            .toUpperCase()
            .replace(/\\s+/g, "");
          return (
            (symbolName(symbol) === fieldName || symbolAlias(symbol) === fieldName) &&
            address.startsWith(dbPrefix)
          );
        });
      }
      if (!resolved) {
        resolved = projectSymbols.find(function (symbol) {
          return symbolName(symbol) === fieldName || symbolAlias(symbol) === fieldName;
        });
      }
    }

    if (resolved && resolved.address) {
      keyInput.value = normalizeStep7Address(resolved.address);
      const error = document.getElementById("signalFormError");
      if (error) error.textContent = "";
    }
  }
  document
    .getElementById("signalNameInput")
    .addEventListener("input", fillSignalAddressFromProjectName);
  document
    .getElementById("signalNameInput")
    .addEventListener("change", fillSignalAddressFromProjectName);
  document
    .getElementById("signalNameInput")
    .addEventListener("blur", fillSignalAddressFromProjectName);
  symbolSearchInput.addEventListener("input", renderProjectSymbols);
  document.getElementById("addSignalForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const error = document.getElementById("signalFormError");
    let label = document.getElementById("signalNameInput").value.trim();
    let key = document.getElementById("signalKeyInput").value.trim();
    let address = "";
    let selectedType = "I";
    const plcAddressPattern =
      /^(?:DB\d+\s*[,.:/]\s*[A-Z]+\s*\d+(?:\.\d+){0,2}|(?:PI|PQ|PE|PA|M|I|E|Q|A|T|C)[A-Z]*\s*\d+(?:\.\d+){0,2})$/i;
    if (plcAddressPattern.test(key)) {
      address = normalizeStep7Address(key);
      const resolved = resolveProjectAddress(address);
      if (resolved) {
        label = label || resolved.name;
        document.getElementById("signalNameInput").value = label;
      }
      key = address
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/[,.:/]/g, "_");
      if (!label) label = address;
    }
    if (!key) {
      error.textContent =
        "Enter a WebSocket data key (such as motorSpeed) or a PLC address (such as DB1,INT6).";
      return;
    }
    if (!label) label = key;
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,39}$/.test(key)) {
      error.textContent =
        "Data key must start with a letter or underscore and use only letters, numbers, _ or -.";
      return;
    }
    if (isDuplicateSignal(key, address)) {
      error.textContent =
        "This signal is already in the chart. Each data key or PLC address can only be added once.";
      return;
    }
    if (address) {
      const dbType = address.match(/^DB\d+\s*[,.:/]\s*([A-Z]+)\s*\d+/i);
      if (dbType) {
        const aliases = {
          BOOL: "X",
          X: "X",
          BYTE: "B",
          B: "B",
          CHAR: "C",
          C: "C",
          STRING: "S",
          S: "S",
          INT: "I",
          I: "I",
          DINT: "DI",
          DI: "DI",
          WORD: "W",
          W: "W",
          DWORD: "DW",
          DW: "DW",
          REAL: "R",
          R: "R",
          RINT: "RI",
          RI: "RI",
          RDINT: "RDI",
          RDI: "RDI",
          RWORD: "RW",
          RW: "RW",
          RDWORD: "RDW",
          RDW: "RDW",
          RD: "RD",
          D: "D",
          RREAL: "RR",
          RR: "RR",
          LREAL: "LR",
          LR: "LR",
          DT: "DT",
          DTZ: "DTZ",
          DTL: "DTL",
          DTLZ: "DTLZ",
        };
        if (aliases[dbType[1].toUpperCase()]) selectedType = aliases[dbType[1].toUpperCase()];
      } else if (/^[A-Z]+\s*\d+\.\d+$/i.test(address)) selectedType = "X";
      else if (/^T\d+/i.test(address)) selectedType = "TMR";
      else if (/^C\d+/i.test(address)) selectedType = "CTR";
      else if (/^PI[WB]/i.test(address)) selectedType = /^PIB/i.test(address) ? "B" : "I";
      else if (/^PID/i.test(address)) selectedType = "DI";
    }
    const ok = addSignal({ key: key, label: label, address: address, type: selectedType });
    if (ok) {
      document.getElementById("signalNameInput").value = "";
      document.getElementById("signalKeyInput").value = "";
      error.textContent = "Signal added.";
    } else {
      error.textContent =
        "This signal is already in the chart. Each data key or PLC address can only be added once.";
    }
  });
  document.getElementById("removeAllSignalsBtn").addEventListener("click", function () {
    if (!signals.length) return;
    removeAllSignals();
  });
  const signalKeyInput = document.getElementById("signalKeyInput");
  function updateSignalKeyPlaceholder() {
    signalKeyInput.placeholder = "WebSocket key or PLC address (e.g. motorSpeed or DB1,INT6)";
  }
  updateSignalKeyPlaceholder();
  const windowSelect = document.getElementById("windowSelect"),
    timeZoom = document.getElementById("timeZoom"),
    timeZoomValue = document.getElementById("timeZoomValue");
  function setTimeWindow(value) {
    value = Math.max(1, Math.min(259200, Math.round(Number(value) || 30)));
    const valueText =
      value >= 86400 ? (value / 86400).toFixed(2) + " days" :
      value >= 3600 ? (value / 3600).toFixed(2) + " hours" :
      value >= 60 ? (value / 60).toFixed(2) + " min" :
      value + " second" + (value === 1 ? "" : "s");
    let option = Array.from(windowSelect.options).find(function (item) {
      return Number(item.value) === value;
    });
    const customOption = windowSelect.querySelector("option[data-zoom-custom]");
    if (customOption) customOption.remove();
    if (!option) {
      option = document.createElement("option");
      option.value = String(value);
      option.dataset.zoomCustom = "true";
      option.textContent = valueText;
      windowSelect.appendChild(option);
    }
    windowSelect.value = String(value);
    timeZoom.value = String(Math.log2(value));
    timeZoomValue.textContent =
      value >= 86400 ? (value / 86400).toFixed(2) + " days" :
      value >= 3600 ? (value / 3600).toFixed(2) + " hours" :
      value >= 60 ? (value / 60).toFixed(2) + " min" : value + " s";
    hoverTime = null;
    if (historicalMode) {
      // A changed scale is a new request for the most recent stored window.
      // Do not derive its bounds from samples returned for the previous scale.
      inspectionViewTime = null;
      loadHistoricalRange(true).catch(function (error) {
        document.getElementById("sampleStatus").textContent =
          "Could not load plot range: " + error.message;
      });
    } else {
      drawAll();
    }
  }
  windowSelect.addEventListener("change", function () { setTimeWindow(Number(this.value)); });
  timeZoom.addEventListener("input", function () { setTimeWindow(Math.pow(2, Number(this.value))); });
  document.getElementById("recordBtn").addEventListener("click", async function () {
    const button = this;
    button.disabled = true;
    const nextRecording = !recording;
    try {
      // Starting a new recording always begins with an empty MongoDB collection.
      // Stop persistence first because the clear endpoint refuses to delete while recording.
      if (nextRecording) {
        const stopResponse = await fetch("http://127.0.0.1:3002/api/recording", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
        const stopResult = await stopResponse.json();
        if (!stopResponse.ok)
          throw new Error(stopResult.error || "Could not pause MongoDB recording before clearing history.");

        const clearResponse = await fetch("http://127.0.0.1:3002/api/clear-recordings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: "DELETE_ALL_RECORDINGS" }),
        });
        const clearResult = await clearResponse.json();
        if (!clearResponse.ok)
          throw new Error(clearResult.error || "Could not clear previous stored samples.");

        history.length = 0;
        recorded = [];
        recordedSampleCount = 0;
        historicalSamples = [];
        historicalMode = false;
        historicalOldestTimestamp = null;
        historicalLatestTimestamp = null;
        historyLoadRequest++;
        inspectionViewTime = null;
        inspectionScrollDirection = 0;
        hoverTime = null;
        chartFrozen = false;
        frozenTimestamp = 0;
        recordingEndedAt = 0;
        document.getElementById("loadStoredBtn").textContent = "Load stored history";
        document.getElementById("sampleStatus").textContent =
          "Previous recordings cleared (" + Number(clearResult.deletedCount || 0).toLocaleString() + " samples deleted).";
      }

      const response = await fetch("http://127.0.0.1:3002/api/recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextRecording }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not change MongoDB recording state.");
      recording = nextRecording;
      if (recording) {
        recordingStartedAt = Date.now();
        signals.forEach(function (s) {
          if (s.address) {
            s.lastReadAt = recordingStartedAt;
            s.readError = false;
            const label = traces.querySelector(`[data-signal="${CSS.escape(s.key)}"] .trace-label`);
            if (label) {
              label.classList.remove("signal-unreadable");
              label.removeAttribute("data-error");
            }
          }
        });
        if (socket && socket.readyState === WebSocket.OPEN)
          socket.send(
            JSON.stringify({
              type: "startRecording",
              keys: signals.map(function (s) {
                return s.key;
              }),
            })
          );
        chartFrozen = false;
        frozenTimestamp = 0;
        hoverTime = null;
        recorded = [];
        recordedSampleCount = 0;
        recordingEndedAt = 0;
        history.length = 0;
        button.textContent = "■ Stop recording";
        button.classList.add("danger");
        document.getElementById("recordStatus").innerHTML =
          '<span class="record-indicator">RECORDING</span> · 0 samples';
      } else {
        if (socket && socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: "stopRecording" }));
        chartFrozen = true;
        frozenTimestamp = lastTimestamp || Date.now();
        hoverTime = null;
        button.textContent = "● Start recording";
        button.classList.remove("danger");
        recordingEndedAt = Date.now();
        document.getElementById("recordStatus").textContent =
          "Recording stopped · " + recordedSampleCount.toLocaleString() + " samples captured · chart frozen";
      }
      drawAll();
    } catch (error) {
      document.getElementById("recordStatus").textContent =
        "Could not change recording state: " + error.message;
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("exportBtn").addEventListener("click", function () {
    // Export all stored MongoDB samples so the CSV starts at the same oldest
    // sample as the stored-history chart, regardless of the current UI session.
    const url = "http://127.0.0.1:3002/api/export.csv";
    const link = document.createElement("a");
    link.href = url;
    link.download = "plc-recording.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
  function exportCSV(rows, filename) {
    if (!rows.length) {
      document.getElementById("sampleStatus").textContent = "No samples available to export yet.";
      return;
    }
    const keys = signals.map(function (s) {
      return s.key;
    });
    const lines = [["timestamp", "datetime"].concat(keys).join(",")];
    rows.forEach(function (p) {
      lines.push(
        [p.timestamp, new Date(p.timestamp).toISOString()]
          .concat(
            keys.map(function (key) {
              return p[key] === undefined || p[key] === null ? "" : p[key];
            })
          )
          .join(",")
      );
    });
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  async function checkPersistence() {
    const status = document.getElementById("persistenceStatus");
    try {
      const response = await fetch("http://127.0.0.1:3002/api/health", { cache: "no-store" });
      const health = await response.json();
      if (health.mongoConnected && health.plcConnected) {
        status.textContent = health.recordingEnabled
          ? "MongoDB: recording · buffered " + health.bufferedSamples
          : "MongoDB: recording stopped";
        status.style.color = "var(--green)";
      } else {
        status.textContent =
          "MongoDB: " +
          (health.mongoConnected ? "connected" : "offline") +
          " · PLC stream: " +
          (health.plcConnected ? "connected" : "offline");
        status.style.color = "var(--amber)";
      }
      status.title =
        health.lastError || "Stored samples since service start: " + health.totalStored;
    } catch (e) {
      status.textContent = "MongoDB persistence: service not running";
      status.style.color = "var(--red)";
      status.title = "Start the backend with npm run persist:plc. " + e.message;
    }
  }
  document.getElementById("loadStoredBtn").addEventListener("click", async function () {
    const button = this;
    if (historicalMode) {
      historyLoadRequest++;
      historicalMode = false;
      historicalSamples = [];
      inspectionViewTime = null;
      hoverTime = null;
      button.textContent = "Load stored history";
      document.getElementById("sampleStatus").textContent = "Returned to live PLC view.";
      drawAll();
      return;
    }
    button.disabled = true;
    button.textContent = "Loading stored…";
    try {
      await loadHistoricalRange(true);
    } catch (error) {
      document.getElementById("sampleStatus").textContent = "Could not load stored history: " + error.message;
    } finally {
      button.disabled = false;
      button.textContent = historicalMode ? "Return to live" : "Load stored history";
      checkPersistence();
    }
  });
  window.addEventListener("mouseup", function () {
    const reloadHistorical = historicalMode && (inspectionDragging || inspectionScrollDirection !== 0);
    inspectionDragging = false;
    inspectionScrollDirection = 0;
    document.querySelectorAll(".trace-canvas").forEach(function (canvas) { canvas.style.cursor = ""; });
    if (reloadHistorical) loadHistoricalRange(false).catch(function (error) {
      document.getElementById("sampleStatus").textContent = "Could not load plot range: " + error.message;
    });
  });
  window.addEventListener("resize", drawAll);
  setInterval(function () {
    if (
      recording ||
      inspectionDragging ||
      inspectionScrollDirection === 0 ||
      inspectionViewTime === null
    )
      return;
    const span = Number(document.getElementById("windowSelect").value) * 1000;
    const available = getAvailableSamples().map(function (p) { return p.timestamp; });
    const earliest = available.length ? Math.min.apply(null, available) : 0;
    const latest = available.length ? Math.max.apply(null, available) : lastTimestamp || Date.now();
    inspectionViewTime += inspectionScrollDirection * 50;
    if (historicalMode) {
      const firstWindowEnd = (historicalOldestTimestamp ?? earliest) + span;
      const lastWindowEnd = historicalLatestTimestamp ?? latest;
      inspectionViewTime = Math.max(firstWindowEnd, Math.min(lastWindowEnd, inspectionViewTime));
    } else {
      inspectionViewTime = Math.max(earliest + span, Math.min(latest, inspectionViewTime));
    }
    hoverTime = inspectionScrollDirection < 0 ? inspectionViewTime - span : inspectionViewTime;
    drawAll();
  }, 50);
  setInterval(checkPersistence, 3000);
  checkPersistence();
  setInterval(function () {
    if (recording)
      document.getElementById("recordStatus").innerHTML =
        '<span class="record-indicator">RECORDING</span> · ' +
        recordedSampleCount.toLocaleString() +
        " samples";
  }, 500);
  renderAllControls();
  signals.forEach(addTrace);
  connect();
  drawAll();
})();
