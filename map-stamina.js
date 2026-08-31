(function () {
  const MAX_STAMINA = 6;
  const RECOVERY_INTERVAL_MS = 20 * 60 * 1000;

  function loadSaveData() {
    return JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  }

  function saveState(saveData, state) {
    saveData.mapStamina = state;
    localStorage.setItem("rhythmGame", JSON.stringify(saveData));
  }

  function sync(now = Date.now()) {
    const saveData = loadSaveData();
    const saved = saveData.mapStamina;
    const state = {
      value: Number.isFinite(Number(saved?.value))
        ? Math.max(0, Math.min(MAX_STAMINA, Math.floor(Number(saved.value))))
        : MAX_STAMINA,
      updatedAt: Number.isFinite(Number(saved?.updatedAt))
        ? Number(saved.updatedAt)
        : now
    };

    if (state.value < MAX_STAMINA) {
      const recovered = Math.floor(Math.max(0, now - state.updatedAt) / RECOVERY_INTERVAL_MS);
      if (recovered > 0) {
        state.value = Math.min(MAX_STAMINA, state.value + recovered);
        state.updatedAt += recovered * RECOVERY_INTERVAL_MS;
        if (state.value === MAX_STAMINA) state.updatedAt = now;
      }
    } else {
      state.updatedAt = now;
    }

    saveState(saveData, state);
    return { ...state };
  }

  function consume() {
    const now = Date.now();
    const state = sync(now);
    if (state.value <= 0) return false;

    const saveData = loadSaveData();
    const wasFull = state.value === MAX_STAMINA;
    state.value--;
    if (wasFull) state.updatedAt = now;
    saveState(saveData, state);
    return true;
  }

  function refill() {
    const saveData = loadSaveData();
    const state = { value: MAX_STAMINA, updatedAt: Date.now() };
    saveState(saveData, state);
    window.dispatchEvent(new CustomEvent("mapstaminachange", { detail: { ...state } }));
    return { ...state };
  }

  window.MapStamina = {
    max: MAX_STAMINA,
    recoveryIntervalMs: RECOVERY_INTERVAL_MS,
    getState: sync,
    consume,
    refill
  };

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      refill();
    }
  }, true);
})();
