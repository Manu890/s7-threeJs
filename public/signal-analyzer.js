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
  const { saveCustomSignals, restoreCustomSignals } = window.SignalAnalyzerSignalConfig.create(
    signals,
    palette
  );
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
  let hoverTime = null;
  let inspectionViewTime = null;
  let inspectionScrollDirection = 0;
  let inspectionDragging = false;
  let inspectionDragStartX = 0;
  let inspectionDragStartViewTime = 0;
  const traces = document.getElementById("traces");
  function getAvailableSamples() {
    return (historicalMode ? historicalSamples : history.concat(recorded)).filter(
      function (sample) {
        return Number.isFinite(sample.timestamp);
      }
    );
  }
  const timeNavigation = window.SignalAnalyzerTimeNavigation.create(
    function () {
      return {
        recording,
        get inspectionViewTime() {
          return inspectionViewTime;
        },
        set inspectionViewTime(value) {
          inspectionViewTime = value;
        },
        chartFrozen,
        frozenTimestamp,
        lastTimestamp,
        get inspectionDragging() {
          return inspectionDragging;
        },
        set inspectionDragging(value) {
          inspectionDragging = value;
        },
        get inspectionDragStartX() {
          return inspectionDragStartX;
        },
        set inspectionDragStartX(value) {
          inspectionDragStartX = value;
        },
        get inspectionDragStartViewTime() {
          return inspectionDragStartViewTime;
        },
        set inspectionDragStartViewTime(value) {
          inspectionDragStartViewTime = value;
        },
        get inspectionScrollDirection() {
          return inspectionScrollDirection;
        },
        set inspectionScrollDirection(value) {
          inspectionScrollDirection = value;
        },
        get hoverTime() {
          return hoverTime;
        },
        set hoverTime(value) {
          hoverTime = value;
        },
        historicalMode,
        history,
        historicalSamples,
        historicalOldestTimestamp,
        historicalLatestTimestamp,
      };
    },
    {
      getAvailableSamples,
      draw: drawAll,
      loadHistoricalRange,
    }
  );

  function convertStoredSamples(samples) {
    return (samples || [])
      .map(function (storedSample) {
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
      })
      .filter(function (sample) {
        return sample.timestamp > 0;
      });
  }
  async function loadHistoricalRange(latest) {
    const requestId = ++historyLoadRequest;
    const seconds = Number(document.getElementById("windowSelect").value) || 300;
    const canvas = document.querySelector(".trace-canvas");
    const pixels = canvas ? Math.floor(canvas.getBoundingClientRect().width) : 1200;
    const params = new URLSearchParams({
      seconds: String(seconds),
      pixels: String(Math.max(300, pixels)),
    });
    const loadingFirstWindow = latest || inspectionViewTime === null;
    if (loadingFirstWindow) params.set("oldest", "1");
    else {
      params.set("from", String(inspectionViewTime - seconds * 1000));
      params.set("to", String(inspectionViewTime));
    }
    document.getElementById("sampleStatus").textContent =
      "Loading selected time range from MongoDB…";
    const result = await recordingController.loadPlot(params);
    if (requestId !== historyLoadRequest) return;
    historicalSamples = convertStoredSamples(result.samples);
    historicalMode = true;
    historicalOldestTimestamp = Number.isFinite(Number(result.oldest))
      ? Number(result.oldest)
      : null;
    historicalLatestTimestamp = Number.isFinite(Number(result.latest))
      ? Number(result.latest)
      : null;
    if (loadingFirstWindow) {
      const lastLoadedSample = historicalSamples.length
        ? historicalSamples[historicalSamples.length - 1].timestamp
        : 0;
      if (lastLoadedSample) inspectionViewTime = lastLoadedSample;
      else if (result.from) inspectionViewTime = Number(result.from) + seconds * 1000;
      else if (result.to) inspectionViewTime = Number(result.to);
    } else if (result.to && inspectionViewTime === null) inspectionViewTime = Number(result.to);
    hoverTime = null;
    document.getElementById("loadStoredBtn").textContent = "Return to live";
    const configuredValues = historicalSamples.reduce(function (count, sample) {
      return (
        count +
        signals.filter(function (signal) {
          return (
            signal.visible &&
            typeof sample[signal.key] === "number" &&
            Number.isFinite(sample[signal.key])
          );
        }).length
      );
    }, 0);
    document.getElementById("sampleStatus").textContent = !historicalSamples.length
      ? "No stored samples found in the selected time range."
      : !signals.length
        ? "History loaded, but no signals are configured. Add the signal(s) you want to plot."
        : !configuredValues
          ? "History loaded, but stored samples contain no numeric values for the configured trace signals. Check that recording saved the configured signal keys."
          : "Historical view · " +
            configuredValues.toLocaleString() +
            " configured signal values from " +
            Number(result.scanned || historicalSamples.length).toLocaleString() +
            " stored samples.";
    drawAll();
  }
  function safeId(key) {
    return key.replace(/[^a-zA-Z0-9_-]/g, "_");
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
      signalManager.reorderSignals(e.dataTransfer.getData("text/plain"), s.key);
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
    timeNavigation.attachCanvas(canvas);
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
      if (signal.address)
        acquisition.send({
          type: "addSignal",
          key: signal.key,
          plcType: signal.type,
          address: signal.address,
        });
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
  const acquisition = window.SignalAnalyzerAcquisition.create(
    function () {
      return {
        signals,
        recording,
        chartFrozen,
        history,
        recorded,
        recordedSampleCount,
        lastTimestamp,
        maxSamples,
      };
    },
    {
      setConnection,
      handlePlcReadErrors,
      updateSignalValue,
      draw: drawAll,
    }
  );
  const recordingController = window.SignalAnalyzerRecording.create(
    function () {
      return { recording };
    },
    {
      clearLocalRecording: function (clearResult) {
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
          "Previous recordings cleared (" +
          Number(clearResult.deletedCount || 0).toLocaleString() +
          " samples deleted).";
      },
      startLocalRecording: function () {
        recording = true;
        recordingStartedAt = Date.now();
        signals.forEach(function (s) {
          if (!s.address) return;
          s.lastReadAt = recordingStartedAt;
          s.readError = false;
          const label = traces.querySelector(`[data-signal="${CSS.escape(s.key)}"] .trace-label`);
          if (label) {
            label.classList.remove("signal-unreadable");
            label.removeAttribute("data-error");
          }
        });
        acquisition.send({
          type: "startRecording",
          keys: signals.map(function (s) {
            return s.key;
          }),
        });
        chartFrozen = false;
        frozenTimestamp = 0;
        hoverTime = null;
        recorded = [];
        recordedSampleCount = 0;
        recordingEndedAt = 0;
        history.length = 0;
        const button = document.getElementById("recordBtn");
        button.textContent = "■ Stop recording";
        button.classList.add("danger");
        document.getElementById("recordStatus").innerHTML =
          '<span class="record-indicator">RECORDING</span> · 0 samples';
      },
      stopLocalRecording: function () {
        recording = false;
        acquisition.send({ type: "stopRecording" });
        chartFrozen = true;
        frozenTimestamp = lastTimestamp || Date.now();
        hoverTime = null;
        const button = document.getElementById("recordBtn");
        button.textContent = "● Start recording";
        button.classList.remove("danger");
        recordingEndedAt = Date.now();
        document.getElementById("recordStatus").textContent =
          "Recording stopped · " +
          recordedSampleCount.toLocaleString() +
          " samples captured · chart frozen";
      },
      draw: drawAll,
      showError: function (error) {
        document.getElementById("recordStatus").textContent =
          "Could not change recording state: " + error.message;
      },
    }
  );

  const chartRenderer = window.SignalAnalyzerChart.create(function () {
    return {
      signals,
      traces,
      chartFrozen,
      frozenTimestamp,
      lastTimestamp,
      inspectionViewTime,
      historicalMode,
      historicalSamples,
      history,
      hoverTime,
    };
  }, safeId);
  function drawAll() {
    chartRenderer.draw();
  }

  const signalManager = window.SignalAnalyzerSignals.create(
    function () {
      return { signals, palette, traces, history, recorded };
    },
    {
      safeId,
      save: saveCustomSignals,
      addTrace,
      draw: drawAll,
      updateSignalValue,
      sendSignal: function (signal) {
        acquisition.send({
          type: "addSignal",
          key: signal.key,
          plcType: signal.type,
          address: signal.address,
        });
      },
    }
  );

  // STEP 7 parsing lives in signal-analyzer-step7.js; UI rendering stays here.
  const Step7Symbols = window.SignalAnalyzerStep7;
  const {
    normalizeSymbolType,
    splitSymbolRecord,
    normalizeStep7Address,
    step7DbfType,
    parseDbfSymbolFile,
    resolveProjectAddress,
    parseStep7DbStructure,
    readStep7DbtMemo,
    parseStep7SubblkDbf,
    walkStep7Folder,
  } = Step7Symbols;
  const symbolSearchInput = document.getElementById("symbolSearchInput");
  const symbolProjectStatus = document.getElementById("symbolProjectStatus");
  const symbolResults = document.getElementById("symbolResults");
  let projectSymbols = [];
  function renderProjectSymbols() {
    const query = symbolSearchInput.value.trim().toLowerCase(),
      addressQuery = query.toUpperCase().replace(/\s+/g, "");
    symbolResults.replaceChildren();

    // A trailing dot after a DB symbol (for example db_visu_add.) means
    // "show every parsed field belonging to that data block".
    const dbSymbolQuery = query.match(/^(.+)\.$/);
    const directDbQuery = query.match(/^db\s*0*(\d+)\.$/i);
    const dbRoot =
      dbSymbolQuery && !directDbQuery
        ? projectSymbols.find(function (s) {
            const name = String(s.name || "")
              .trim()
              .toLowerCase();
            const symbolName = String(s.symbolName || "")
              .trim()
              .toLowerCase();
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
        const ok = signalManager.addSignal({
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
      return String(symbol.name || "")
        .trim()
        .toLowerCase();
    };
    const symbolAlias = function (symbol) {
      return String(symbol.symbolName || "")
        .trim()
        .toLowerCase();
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
    const ok = signalManager.addSignal({
      key: key,
      label: label,
      address: address,
      type: selectedType,
    });
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
    signalManager.removeAllSignals();
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
      value >= 86400
        ? (value / 86400).toFixed(2) + " days"
        : value >= 3600
          ? (value / 3600).toFixed(2) + " hours"
          : value >= 60
            ? (value / 60).toFixed(2) + " min"
            : value + " second" + (value === 1 ? "" : "s");
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
      value >= 86400
        ? (value / 86400).toFixed(2) + " days"
        : value >= 3600
          ? (value / 3600).toFixed(2) + " hours"
          : value >= 60
            ? (value / 60).toFixed(2) + " min"
            : value + " s";
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
  windowSelect.addEventListener("change", function () {
    setTimeWindow(Number(this.value));
  });
  timeZoom.addEventListener("input", function () {
    setTimeWindow(Math.pow(2, Number(this.value)));
  });
  document.getElementById("recordBtn").addEventListener("click", function () {
    recordingController.toggle(this);
  });
  document.getElementById("exportBtn").addEventListener("click", function () {
    // Export all stored MongoDB samples so the CSV starts at the same oldest
    // sample as the stored-history chart, regardless of the current UI session.
    const url = recordingController.exportUrl();
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
      const health = await recordingController.getHealth();
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
      document.getElementById("sampleStatus").textContent =
        "Could not load stored history: " + error.message;
    } finally {
      button.disabled = false;
      button.textContent = historicalMode ? "Return to live" : "Load stored history";
      checkPersistence();
    }
  });
  window.addEventListener("mouseup", function () {
    timeNavigation.onMouseUp();
  });
  window.addEventListener("resize", drawAll);
  setInterval(function () {
    timeNavigation.tick();
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
  signalManager.renderAllControls();
  signals.forEach(addTrace);
  acquisition.connect();
  drawAll();
})();
