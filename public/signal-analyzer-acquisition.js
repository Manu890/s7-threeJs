(function () {
  // Owns the analyzer WebSocket and converts incoming PLC messages into samples.
  // UI state and recording buffers remain owned by the main analyzer.
  function create(getState, actions) {
    let socket = null;
    let reconnectTimer = null;

    function send(message) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    }

    function connect() {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(protocol + "//" + (location.hostname || "localhost") + ":8080?client=analyzer");
      socket.onopen = function () {
        actions.setConnection(true, "Connected · " + socket.url);
        const state = getState();
        state.signals.filter(function (signal) {
          return !signal.builtin && signal.address;
        }).forEach(function (signal) {
          send({ type: "addSignal", key: signal.key, plcType: signal.type, address: signal.address });
        });
        if (state.recording) send({
          type: "startRecording",
          keys: state.signals.map(function (signal) { return signal.key; })
        });
      };

      socket.onmessage = function (event) {
        let message;
        try { message = JSON.parse(event.data); } catch (error) { return; }
        if (!message.data || typeof message.data !== "object") return;
        const state = getState();
        const timestamp = Number(message.timestamp) || Date.now();
        state.lastTimestamp = timestamp;
        const readErrors = Array.isArray(message.errors) ? message.errors : [];
        const failedKeys = new Set(readErrors.map(function (error) {
          return error && error.key;
        }).filter(Boolean));
        actions.handlePlcReadErrors(readErrors);
        const sample = { timestamp: timestamp };
        state.signals.forEach(function (signal) {
          const raw = message.data[signal.key];
          let value = null;
          if (!failedKeys.has(signal.key) && raw !== null && raw !== undefined && raw !== "") {
            if (typeof raw === "number") value = Number.isFinite(raw) ? raw : null;
            else if (typeof raw === "boolean") value = raw ? 1 : 0;
            else if (typeof raw === "string") {
              const numeric = Number(raw);
              value = raw.trim() !== "" && Number.isFinite(numeric) ? numeric : raw;
            }
          }
          sample[signal.key] = value;
          actions.updateSignalValue(signal, value === null ? "—" : value);
        });
        if (state.recording && !state.chartFrozen) {
          state.history.push(sample);
          if (state.history.length > state.maxSamples) state.history.shift();
        }
        if (state.recording) {
          state.recorded.push(Object.assign({}, sample));
          if (state.recorded.length > state.maxSamples) state.recorded.shift();
          state.recordedSampleCount++;
        }
        document.getElementById("sampleStatus").textContent =
          "Samples buffered: " + state.history.length + " · Last update: " +
          new Date(timestamp).toLocaleTimeString();
        actions.draw();
      };

      socket.onclose = function () {
        actions.setConnection(false, "Disconnected · reconnecting…");
        if (reconnectTimer !== null) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          connect();
        }, 2000);
      };
      socket.onerror = function () {
        actions.setConnection(false, "WebSocket connection error");
      };
    }

    return { connect, send, isOpen: function () { return !!socket && socket.readyState === WebSocket.OPEN; } };
  }

  window.SignalAnalyzerAcquisition = { create };
})();
