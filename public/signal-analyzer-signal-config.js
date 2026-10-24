// Browser-local persistence for custom signal definitions.
(function () {
  function create(signals, palette) {
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
    return { saveCustomSignals, restoreCustomSignals };
  }
  window.SignalAnalyzerSignalConfig = { create };
})();
