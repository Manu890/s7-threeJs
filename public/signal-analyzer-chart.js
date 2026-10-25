(function () {
  // Owns canvas drawing and the shared time axis. The analyzer supplies live state
  // through getState(), keeping rendering independent from acquisition and controls.
  function create(getState, safeId) {
    function draw() {
      const state = getState();
      const liveNow = state.chartFrozen
        ? state.frozenTimestamp || state.lastTimestamp || Date.now()
        : state.lastTimestamp || Date.now();
      const viewNow = state.inspectionViewTime === null ? liveNow : state.inspectionViewTime,
        span = Number(document.getElementById("windowSelect").value) * 1000,
        plotData = state.historicalMode ? state.historicalSamples : state.history,
        isLiveRecording = state.recording && !state.chartFrozen && !state.historicalMode,
        keepSweepWindow = !state.historicalMode && (isLiveRecording || state.chartFrozen) && state.recordingStartedAt > 0,
        sweepOrigin = state.recordingStartedAt || (state.history.length ? state.history[0].timestamp : liveNow),
        // Keep the same full-width sweep window after Stop is pressed. If the
        // frozen view is re-anchored to the last sample, the trace jumps to
        // the right edge instead of remaining where it was during recording.
        from = keepSweepWindow
          ? sweepOrigin + Math.floor(Math.max(0, viewNow - sweepOrigin) / span) * span
          : viewNow - span,
        now = keepSweepWindow ? from + span : viewNow,
        plotSpan = span;
      state.signals.forEach(function (s) {
        const row = state.traces.querySelector('[data-signal="' + CSS.escape(s.key) + '"]');
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
        if (!points.length) {
          if (state.hoverTime !== null && state.hoverTime >= from && state.hoverTime <= now) {
            const x = ((state.hoverTime - from) / plotSpan) * cw;
            ctx.strokeStyle = "#16a34a";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(Math.round(x) + 0.5, 0);
            ctx.lineTo(Math.round(x) + 0.5, ch);
            ctx.stroke();
          }
          return;
        }
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
          if (i === 0) {
            // Extend the first captured value to the plot's left boundary.
            // At 1–2 second scales, even one PLC polling interval is a visible
            // gap when the first timestamp is slightly later than sweep start.
            ctx.moveTo(0, y);
            if (x > 0) ctx.lineTo(x, y);
          } else {
            const prev = points[i - 1],
              prevY = ch - 8 - ((prev[s.key] - min) / range) * (ch - 16);
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        if (state.hoverTime !== null && state.hoverTime >= from && state.hoverTime <= now) {
          const x = ((state.hoverTime - from) / plotSpan) * cw;
          ctx.strokeStyle = "#16a34a";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, 0);
          ctx.lineTo(Math.round(x) + 0.5, ch);
          ctx.stroke();
          let nearest = points[0];
          points.forEach(function (p) {
            if (
              Math.abs(p.timestamp - state.hoverTime) <
              Math.abs(nearest.timestamp - state.hoverTime)
            )
              nearest = p;
          });
          ctx.font = "11px Segoe UI,Arial,sans-serif";
          const cursorDate = new Date(nearest.timestamp);
          const cursorTime =
            String(cursorDate.getHours()).padStart(2, "0") +
            ":" +
            String(cursorDate.getMinutes()).padStart(2, "0") +
            ":" +
            String(cursorDate.getSeconds()).padStart(2, "0") +
            "." +
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
      if (state.hoverTime !== null && state.hoverTime >= from && state.hoverTime <= now) {
        const cursorDate = new Date(state.hoverTime);
        const cursorTime =
          String(cursorDate.getHours()).padStart(2, "0") +
          ":" +
          String(cursorDate.getMinutes()).padStart(2, "0") +
          ":" +
          String(cursorDate.getSeconds()).padStart(2, "0") +
          "." +
          String(cursorDate.getMilliseconds()).padStart(3, "0");
        const cursorLabel = document.createElement("span");
        cursorLabel.className = "axis-cursor-time";
        cursorLabel.textContent = cursorTime;
        cursorLabel.style.left = ((state.hoverTime - from) / (now - from)) * 100 + "%";
        ticks.appendChild(cursorLabel);
      }
    }
    return { draw };
  }
  window.SignalAnalyzerChart = { create };
})();
