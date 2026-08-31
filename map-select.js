const MAP_INDEX_PATH = "map/maps/index.json";

function loadMapSelectSave() {
  try {
    return JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  } catch (error) {
    console.warn("[MAP SELECT] セーブデータを読み込めませんでした。", error);
    return {};
  }
}

function getOwnedShardCount(saveData) {
  const mapShards = Object.values(saveData.mapProgress || {}).reduce(
    (sum, progress) => sum + Number(progress?.shards || 0), 0
  );
  return Number(saveData.playShards || 0) + mapShards;
}

function getMapCompletion(mapData, saveData) {
  const cleared = new Set(saveData.mapProgress?.[mapData.id]?.clearedPieces || []);
  const total = Array.isArray(mapData.pieces) ? mapData.pieces.length : 0;
  return total > 0 ? Math.round(cleared.size / total * 100) : 0;
}

function saveLastPlayedMapId(mapId) {
  const saveData = loadMapSelectSave();
  saveData.lastPlayedMapId = mapId;
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
}

function getMapNumber(entry, mapData = null) {
  if (entry.number) return String(entry.number).padStart(2, "0");
  const matched = String(mapData?.id || entry.id || "").match(/(\d+)$/);
  return matched ? matched[1].padStart(2, "0") : "--";
}

function navigateMapSelect(url) {
  const fade = document.getElementById("mapSelectFade");
  fade?.classList.remove("visible");
  fade?.classList.add("leaving");
  setTimeout(() => { location.href = url; }, 650);
}

let mapEnterTransitionRunning = false;

function enterMapWithStartTransition(mapData) {
  if (mapEnterTransitionRunning) return;
  mapEnterTransitionRunning = true;
  saveLastPlayedMapId(mapData.id);

  const imageOverlay = document.getElementById("mapSelectImageOverlay");
  const blackOverlay = document.getElementById("mapSelectBlackOverlay");
  const imagePath = mapData.iconImage || mapData.completedImage || "";
  imageOverlay.style.backgroundImage = `url("${imagePath}")`;
  imageOverlay.classList.add("active");
  blackOverlay.classList.add("dark");

  const se = new Audio("sounds/startsound.mp3");
  se.volume = 0.8;
  se.play().catch(() => {});

  requestAnimationFrame(() => {
    requestAnimationFrame(() => imageOverlay.classList.add("expand"));
  });

  setTimeout(() => {
    location.href = `unlock-map.html?map=${encodeURIComponent(mapData.id)}`;
  }, 700);
}

function createPreparingCard(entry) {
  const card = document.createElement("article");
  card.className = "mapSelectCard preparing";
  card.dataset.mapId = entry.id || "";
  card.setAttribute("aria-disabled", "true");
  card.innerHTML = `
    <div class="mapOrbFrame">
      <div class="mapPreparingOrb"><span>?</span></div>
      <span class="mapOrbTopMark">◆</span>
    </div>
    <div class="mapCardNumber">${getMapNumber(entry)}</div>
    <h2>${entry.title || "準備中…"}</h2>
    <div class="mapCardProgress"><span></span></div>
    <div class="mapCardPercent">--%</div>
    <div class="mapCardReward disabled">
      <span class="rewardLabel">MAIN REWARD</span>
      <span class="preparingReward">?</span>
    </div>`;
  return card;
}

function createAvailableCard(entry, mapData, saveData, selected) {
  const completion = getMapCompletion(mapData, saveData);
  const mainSongReward = (mapData.completionRewards || []).find(reward => reward.type === "song");
  const mainSongId = mainSongReward?.id || "";
  const number = getMapNumber(entry, mapData);
  const card = document.createElement("article");
  card.className = `mapSelectCard${selected ? " selected" : ""}`;
  card.dataset.mapId = mapData.id;

  const orb = document.createElement("div");
  orb.className = "mapOrbFrame";
  orb.tabIndex = 0;
  orb.setAttribute("role", "button");
  orb.setAttribute("aria-label", `MAP ${number}へ進む`);
  orb.innerHTML = `
    <div class="mapOrbGlow"></div>
    <img class="mapOrbImage" src="${mapData.iconImage || mapData.completedImage || ""}" alt="">
    ${completion >= 100 ? `<div class="mapCompleteBand"><span>COMPLETE</span></div>` : ""}
    <span class="mapOrbTopMark">◆</span>`;

  const enterMap = () => enterMapWithStartTransition(mapData);
  orb.addEventListener("click", enterMap);
  orb.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    enterMap();
  });

  const details = document.createElement("div");
  details.className = "mapCardDetails";
  details.innerHTML = `
    <div class="mapCardNumber">${number}</div>
    <h2>${mapData.title || `MAP ${number}`}</h2>
    <div class="mapCardProgress"><span style="width:${completion}%"></span></div>
    <div class="mapCardPercent">${completion}%</div>
    <div class="mapCardReward">
      <span class="rewardLabel">MAIN REWARD</span>
      ${mainSongId
        ? `<span class="mainRewardVisual"><img class="mainRewardJacket" src="songs/${encodeURIComponent(mainSongId)}/jacket.png" alt="${mainSongId}"></span>`
        : `<span class="preparingReward">?</span>`}
    </div>`;
  card.append(orb, details);
  return card;
}

async function loadMapEntry(entry) {
  if (entry.status !== "available" || !entry.data) return { entry, mapData: null };
  const response = await fetch(entry.data, { cache: "no-store" });
  if (!response.ok) throw new Error(`${entry.data}: HTTP ${response.status}`);
  return { entry, mapData: await response.json() };
}

async function initializeMapSelect() {
  const saveData = loadMapSelectSave();
  document.getElementById("mapSelectShardValue").textContent = getOwnedShardCount(saveData).toLocaleString("ja-JP");

  try {
    const response = await fetch(MAP_INDEX_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const indexData = await response.json();
    const entries = Array.isArray(indexData.maps) ? indexData.maps : [];
    const loadedEntries = await Promise.all(entries.map(async entry => {
      try {
        return await loadMapEntry(entry);
      } catch (error) {
        console.error(`[MAP SELECT] ${entry.id || "unknown"} の読み込みに失敗しました。`, error);
        return { entry: { ...entry, status: "preparing", title: "読み込みエラー" }, mapData: null };
      }
    }));

    const list = document.getElementById("mapCardList");
    list.classList.toggle("scrollable", loadedEntries.length > 2);
    const availableMapIds = loadedEntries
      .filter(({ mapData }) => Boolean(mapData))
      .map(({ mapData }) => mapData.id);
    const highlightedMapId = availableMapIds.includes(saveData.lastPlayedMapId)
      ? saveData.lastPlayedMapId
      : availableMapIds[0];
    for (const { entry, mapData } of loadedEntries) {
      if (!mapData) {
        list.appendChild(createPreparingCard(entry));
      } else {
        list.appendChild(createAvailableCard(entry, mapData, saveData, mapData.id === highlightedMapId));
      }
    }
  } catch (error) {
    console.error("[MAP SELECT] マップ一覧の読み込みに失敗しました。", error);
  }

  document.getElementById("mapSelectBack")?.addEventListener("click", () => navigateMapSelect("select.html"));
  const mapCardList = document.getElementById("mapCardList");
  mapCardList?.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    mapCardList.scrollLeft += event.deltaY;
  }, { passive: false });
  requestAnimationFrame(() => document.getElementById("mapSelectFade")?.classList.add("visible"));
}

window.addEventListener("DOMContentLoaded", initializeMapSelect);
