(function () {
  const STORAGE_KEY = "s7-threejs-signal-analyzer-signals-v1";
  function formatAddressForDisplay(address) {
    return String(address || "").replace(/(DB[0-9]+)[ ]*,[ ]*/gi, "$1.");
  }
  const params = new URLSearchParams(location.search);
  const key = params.get("key");
  const typeOptions = [
    ["X", "BOOL / bit"],
    ["B", "BYTE"],
    ["C", "CHAR"],
    ["S", "STRING"],
    ["I", "INT"],
    ["DI", "DINT"],
    ["W", "WORD"],
    ["D", "DWORD (legacy)"],
    ["DW", "DWORD"],
    ["R", "REAL / float"],
    ["RI", "RINT"],
    ["RDI", "RDINT"],
    ["RW", "RWORD"],
    ["RD", "RDWORD (legacy)"],
    ["RDW", "RDWORD"],
    ["RR", "RREAL"],
    ["TMR", "TIMER"],
    ["CTR", "COUNTER"],
    ["LR", "LREAL"],
    ["DT", "DATE_TIME"],
    ["DTZ", "DATE_TIME UTC"],
    ["DTL", "DATE_AND_TIME_LONG"],
    ["DTLZ", "DATE_AND_TIME_LONG UTC"],
  ];
  const type = document.getElementById("type"),
    precision = document.getElementById("precision"),
    status = document.getElementById("status");
  typeOptions.forEach(function (item) {
    const o = document.createElement("option");
    o.value = item[0];
    o.textContent = item[1];
    type.appendChild(o);
  });
  for (let digits = 0; digits <= 20; digits++) {
    const o = document.createElement("option");
    o.value = String(digits);
    o.textContent = digits + " decimal place" + (digits === 1 ? "" : "s");
    precision.appendChild(o);
  }
  let savedSignals;
  try {
    savedSignals = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    savedSignals = [];
  }
  if (!Array.isArray(savedSignals)) savedSignals = [];
  const signal = savedSignals.find(function (s) {
    return s && s.key === key;
  });
  if (!signal) {
    document.getElementById("signalName").textContent =
      "Signal not found in this browser's saved configuration.";
    document.getElementById("save").disabled = true;
    status.textContent = "Return to the analyzer and reopen settings for a signal.";
    return;
  }
  document.getElementById("signalName").textContent =
    signal.label + " · " + formatAddressForDisplay(signal.address || "key: " + signal.key);
  type.value = signal.type || "B";
  precision.value = String(
    Math.min(20, Math.max(0, signal.precision === undefined ? 2 : Number(signal.precision) || 0))
  );
  document.getElementById("save").addEventListener("click", function () {
    signal.type = type.value;
    signal.dataType = type.value;
    signal.precision = Number(precision.value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSignals));
    } catch (e) {
      status.textContent = "Could not save settings in this browser.";
      return;
    }
    status.textContent = "Settings saved.";
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(
          {
            type: "signalSettingsUpdated",
            key: signal.key,
            plcType: signal.type,
            precision: signal.precision,
          },
          location.origin
        );
        window.close();
      } catch (e) {
        status.textContent = "Settings saved. Close this window and return to the analyzer.";
      }
    } else {
      const back = document.createElement("a");
      back.href = "signal-analyzer.html";
      back.textContent = " Return to analyzer";
      back.style.marginLeft = "10px";
      document.querySelector(".actions").appendChild(back);
    }
  });
})();
