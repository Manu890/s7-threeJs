(function () {
  // Pointer interactions and time-window navigation for the signal chart.
  // State stays owned by the analyzer; this controller only coordinates navigation.
  function create(getState, actions) {
    function attachCanvas(canvas) {
      canvas.addEventListener("mousedown", function (event) {
        const state = getState();
        if (state.recording) return;
        event.preventDefault();
        if (state.inspectionViewTime === null) {
          state.inspectionViewTime = state.chartFrozen
            ? state.frozenTimestamp || state.lastTimestamp || Date.now()
            : state.lastTimestamp || Date.now();
        }
        state.inspectionDragging = true;
        state.inspectionDragStartX = event.clientX;
        state.inspectionDragStartViewTime = state.inspectionViewTime;
        state.inspectionScrollDirection = 0;
        canvas.style.cursor = "grabbing";
      });

      canvas.addEventListener("mousemove", function (event) {
        const state = getState();
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const span = Number(document.getElementById("windowSelect").value) * 1000;
        if (state.recording) {
          state.inspectionScrollDirection = 0;
          state.inspectionViewTime = null;
          const displayNow = state.lastTimestamp || Date.now();
          const firstLiveSample = state.history.length ? state.history[0].timestamp : displayNow;
          const visibleFrom = Math.max(firstLiveSample, displayNow - span);
          state.hoverTime = visibleFrom + (x / Math.max(1, rect.width)) * span;
        } else {
          if (state.inspectionDragging) {
            const available = actions.getAvailableSamples().map(function (sample) {
              return sample.timestamp;
            });
            const earliest = available.length ? Math.min.apply(null, available) : 0;
            const latest = available.length
              ? Math.max.apply(null, available)
              : state.lastTimestamp || Date.now();
            state.inspectionViewTime =
              state.inspectionDragStartViewTime -
              ((event.clientX - state.inspectionDragStartX) / Math.max(1, rect.width)) * span;
            if (!state.historicalMode) {
              state.inspectionViewTime =
                latest - earliest >= span
                  ? Math.max(earliest + span, Math.min(latest, state.inspectionViewTime))
                  : latest;
            }
            state.inspectionScrollDirection = 0;
          } else if (
            x <= Math.max(8, rect.width * 0.015) ||
            x >= rect.width - Math.max(8, rect.width * 0.015)
          ) {
            if (state.inspectionViewTime === null) {
              state.inspectionViewTime = state.chartFrozen
                ? state.frozenTimestamp || state.lastTimestamp || Date.now()
                : state.lastTimestamp || Date.now();
            }
            state.inspectionScrollDirection = x <= Math.max(8, rect.width * 0.015) ? -1 : 1;
          } else {
            state.inspectionScrollDirection = 0;
            if (state.inspectionViewTime === null) {
              state.inspectionViewTime = state.chartFrozen
                ? state.frozenTimestamp || state.lastTimestamp || Date.now()
                : state.lastTimestamp || Date.now();
            }
          }
          const displayNow =
            state.inspectionViewTime === null
              ? state.chartFrozen
                ? state.frozenTimestamp || state.lastTimestamp || Date.now()
                : state.lastTimestamp || Date.now()
              : state.inspectionViewTime;
          const firstLiveSample =
            !state.historicalMode && state.history.length ? state.history[0].timestamp : displayNow;
          const visibleFrom = state.historicalMode
            ? displayNow - span
            : Math.max(firstLiveSample, displayNow - span);
          state.hoverTime = visibleFrom + (x / Math.max(1, rect.width)) * span;
        }
        actions.draw();
      });

      canvas.addEventListener("mouseleave", function () {
        const state = getState();
        if (!state.inspectionDragging) {
          state.inspectionScrollDirection = 0;
          state.hoverTime = null;
          actions.draw();
        }
      });
    }

    function onMouseUp() {
      const state = getState();
      const reloadHistorical =
        state.historicalMode && (state.inspectionDragging || state.inspectionScrollDirection !== 0);
      state.inspectionDragging = false;
      state.inspectionScrollDirection = 0;
      document.querySelectorAll(".trace-canvas").forEach(function (canvas) {
        canvas.style.cursor = "";
      });
      if (reloadHistorical) {
        actions.loadHistoricalRange(false).catch(function (error) {
          document.getElementById("sampleStatus").textContent =
            "Could not load plot range: " + error.message;
        });
      }
    }

    function tick() {
      const state = getState();
      if (
        state.recording ||
        state.inspectionDragging ||
        state.inspectionScrollDirection === 0 ||
        state.inspectionViewTime === null
      )
        return;
      const span = Number(document.getElementById("windowSelect").value) * 1000;
      const available = actions.getAvailableSamples().map(function (sample) {
        return sample.timestamp;
      });
      const earliest = available.length ? Math.min.apply(null, available) : 0;
      const latest = available.length
        ? Math.max.apply(null, available)
        : state.lastTimestamp || Date.now();
      state.inspectionViewTime += state.inspectionScrollDirection * 50;
      if (state.historicalMode) {
        const firstWindowEnd = (state.historicalOldestTimestamp ?? earliest) + span;
        const lastWindowEnd = state.historicalLatestTimestamp ?? latest;
        state.inspectionViewTime = Math.max(
          firstWindowEnd,
          Math.min(lastWindowEnd, state.inspectionViewTime)
        );
      } else {
        state.inspectionViewTime = Math.max(
          earliest + span,
          Math.min(latest, state.inspectionViewTime)
        );
      }
      state.hoverTime =
        state.inspectionScrollDirection < 0
          ? state.inspectionViewTime - span
          : state.inspectionViewTime;
      actions.draw();
    }

    return { attachCanvas, onMouseUp, tick };
  }

  window.SignalAnalyzerTimeNavigation = { create };
})();
