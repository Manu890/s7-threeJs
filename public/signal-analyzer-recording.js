(function () {
  // Coordinates recording lifecycle with the local persistence service.
  function create(getState, actions) {
    const apiBase = "http://127.0.0.1:3002/api";

    async function post(path, body, fallbackMessage) {
      const response = await fetch(apiBase + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || fallbackMessage);
      return result;
    }

    async function toggle(button) {
      button.disabled = true;
      const nextRecording = !getState().recording;
      try {
        let clearResult = null;
        if (nextRecording) {
          // Pause persistence before clearing: the endpoint rejects deletion while recording.
          await post(
            "/recording",
            { enabled: false },
            "Could not pause MongoDB recording before clearing history."
          );
          clearResult = await post(
            "/clear-recordings",
            { confirm: "DELETE_ALL_RECORDINGS" },
            "Could not clear previous stored samples."
          );
          actions.clearLocalRecording(clearResult);
        }

        await post(
          "/recording",
          { enabled: nextRecording },
          "Could not change MongoDB recording state."
        );
        if (nextRecording) actions.startLocalRecording();
        else actions.stopLocalRecording();
        actions.draw();
      } catch (error) {
        actions.showError(error);
      } finally {
        button.disabled = false;
      }
    }

    async function getHealth() {
      const response = await fetch(apiBase + "/health", { cache: "no-store" });
      return response.json();
    }

    async function loadPlot(params) {
      const response = await fetch(apiBase + "/plot?" + params.toString(), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "History query failed");
      return result;
    }

    function exportUrl() {
      return apiBase + "/export.csv";
    }

    return { toggle, getHealth, loadPlot, exportUrl };
  }

  window.SignalAnalyzerRecording = { create };
})();
