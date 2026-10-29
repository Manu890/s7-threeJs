(function () {
  // Owns signal collection operations and the signal-list controls.
  function formatAddressForDisplay(address) {
    return String(address || "").replace(/(DB[0-9]+)[ ]*,[ ]*/gi, "$1.");
  }
  function create(getState, actions) {
    function reorderSignals(draggedKey, targetKey) {
      const state = getState();
      if (!draggedKey || !targetKey || draggedKey === targetKey) return;
      const from = state.signals.findIndex(function (signal) {
        return signal.key === draggedKey;
      });
      const to = state.signals.findIndex(function (signal) {
        return signal.key === targetKey;
      });
      if (from < 0 || to < 0) return;
      const moved = state.signals.splice(from, 1)[0];
      state.signals.splice(to, 0, moved);
      state.signals.forEach(function (signal) {
        const row = state.traces.querySelector('[data-signal="' + CSS.escape(signal.key) + '"]');
        if (row) state.traces.appendChild(row);
      });
      actions.save();
      renderAllControls();
      actions.draw();
    }

    function renderSignalList() {
      const state = getState();
      const list = document.getElementById("signalList");
      list.replaceChildren();
      state.signals.forEach(function (signal) {
        const row = document.createElement("div");
        row.className = "signal-item";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = signal.visible;
        checkbox.setAttribute("aria-label", "Show " + signal.label);
        checkbox.addEventListener("change", function () {
          signal.visible = checkbox.checked;
          actions.save();
          actions.draw();
        });
        const details = document.createElement("span");
        details.style.minWidth = "0";
        details.style.flex = "1";
        const name = document.createElement("div");
        name.className = "signal-name";
        name.textContent = signal.label;
        const address = document.createElement("div");
        address.className = "signal-address";
        address.textContent = formatAddressForDisplay(signal.address || "key: " + signal.key);
        details.append(name, address);
        const current = document.createElement("span");
        current.className = "signal-current";
        current.id = "list-" + actions.safeId(signal.key);
        current.textContent = "—";
        row.append(checkbox, details, current);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove " + signal.label);
        remove.addEventListener("click", function () {
          removeSignal(signal.key);
        });
        row.appendChild(remove);
        list.appendChild(row);
      });
      document.getElementById("signalCount").textContent =
        state.signals.length + " signal" + (state.signals.length === 1 ? "" : "s");
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
      const state = getState();
      const normalizedKey = String(key || "").toLowerCase();
      const normalizedAddress = normalizeSignalAddress(address);
      return state.signals.some(function (signal) {
        return (
          signal.key.toLowerCase() === normalizedKey ||
          (normalizedAddress &&
            signal.address &&
            normalizeSignalAddress(signal.address) === normalizedAddress)
        );
      });
    }

    function addSignal(config) {
      const state = getState();
      if (isDuplicateSignal(config.key, config.address)) return false;
      const signal = {
        key: config.key,
        label: config.label,
        address: config.address || "",
        type: config.type || "B",
        symbolName: config.symbolName || config.label || "",
        operand: config.operand || config.address || "",
        dataType: config.dataType || config.type || "",
        comment: config.comment || "",
        color: state.palette[state.signals.length % state.palette.length],
        builtin: false,
        visible: true,
      };
      state.signals.push(signal);
      actions.addTrace(signal);
      actions.save();
      renderAllControls();
      if (signal.address) actions.sendSignal(signal);
      const last = state.history.length ? state.history[state.history.length - 1] : null;
      if (last && last[signal.key] !== undefined)
        actions.updateSignalValue(signal, last[signal.key]);
      actions.draw();
      return true;
    }

    function removeSignal(key) {
      const state = getState();
      const index = state.signals.findIndex(function (signal) {
        return signal.key === key;
      });
      if (index < 0) return;
      state.signals.splice(index, 1);
      const row = state.traces.querySelector('[data-signal="' + CSS.escape(key) + '"]');
      if (row) row.remove();
      state.history.forEach(function (sample) {
        delete sample[key];
      });
      state.recorded.forEach(function (sample) {
        delete sample[key];
      });
      actions.save();
      renderAllControls();
      actions.draw();
    }

    function removeAllSignals() {
      const state = getState();
      state.signals.splice(0, state.signals.length);
      state.traces.replaceChildren();
      [state.history, state.recorded].forEach(function (samples) {
        samples.forEach(function (sample) {
          Object.keys(sample).forEach(function (key) {
            if (key !== "timestamp") delete sample[key];
          });
        });
      });
      actions.save();
      renderAllControls();
      actions.draw();
      document.getElementById("sampleStatus").textContent =
        "All signals removed. Add signals using the form.";
    }

    return {
      reorderSignals,
      renderSignalList,
      renderAllControls,
      isDuplicateSignal,
      addSignal,
      removeSignal,
      removeAllSignals,
    };
  }
  window.SignalAnalyzerSignals = { create };
})();
