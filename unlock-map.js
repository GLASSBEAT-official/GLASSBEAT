// ── ピースのクリア条件（map/maps/*.json の書き方）────────────────────
// "conditions": {
//   clear 条件は現在未使用です。クリア失敗の扱いを実装するときに追加します。
//   "minRank": "A",        // 指定ランク以上。F,D,C,B,B+,A,A+,S,S+,S++,SS
//   "minScore": 950000,     // 指定スコア以上
//   "fullCombo": true,      // FULL COMBO
//   "allPerfect": true,     // ALL PERFECT
//   "maxMisses": 3,         // MISS数が指定値以下
//   "maxCombo": 500         // プレイ中の最大コンボが指定値以上
// }
// 7項目はそれぞれ省略可能。指定された条件はすべて満たす必要があります。
// conditionsを省略するか {} にした場合は、追加目標のない通常条件として扱います。
// 条件が1つでも有効なら、typeの指定にかかわらずミッション扱いです。
// 追加目標のないピースを通常マスにする場合は "type": "normal" と記述します。

// 選曲制限なしにする場合:
// "songSelection": { "mode": "choice", "songs": "all" }
// この指定では、実装済みの全楽曲・全難易度を選択できます。
// 個別に制限する場合は songs に songId と difficulties の配列を記述します。
// difficultiesを省略した楽曲は、その楽曲に実装されている全難易度を選択できます。
// 全難易度を許可する楽曲だけを並べる場合は、短縮形も使用できます:
// "songSelection": { "mode": "choice", "songs": ["song6", "song12"] }
// 同じ楽曲ボタンを複数並べる場合は、songIdを配列にして重複を含めます:
// "songSelection": { "mode": "choice", "songs": [{ "songId": ["song5", "song5", "song5"] }] }
// "mode": "random", "songs": "all" の場合は、START時にプレイ可能な全楽曲から1曲を抽選します。
// "mode": "random", "songs": ["song1", "song12"] の場合は、指定した楽曲だけから抽選します。
// 個別指定したランダム候補は未解禁曲もプレイできますが、通常の解禁状態は変更されません。
//
// ── マップ完成度報酬（map/maps/*.json の書き方）────────────────────
// "completionRewards": [
//   { "percent": 25, "type": "title", "id": "map:first-title" },
//   { "percent": 50, "type": "background", "file": "map1_bg.png" },
//   { "percent": 100, "type": "song", "id": "song25" }
// ]
// percent は1～100。到達率がこの値以上になると一度だけ自動獲得します。
// title の詳細（name等）は titles.json の mapTitles に同じidで記述します。
// background は画像ファイル名、title と song はIDを指定します。
const requestedMapId = new URLSearchParams(window.location.search).get("map") || "map01";
const safeMapId = /^[a-zA-Z0-9_-]+$/.test(requestedMapId) ? requestedMapId : "map01";
const MAP_DATA_PATH = `map/maps/${safeMapId}.json`;
const restoredPieceId = new URLSearchParams(window.location.search).get("restored") || "";
const failedPieceId = new URLSearchParams(window.location.search).get("failed") || "";
const mapBgm = new Audio("sounds/map.wav");
mapBgm.loop = true;
mapBgm.volume = 0.45;
let activeMapData = null;
let mapTitleDefinitions = [];
let specialTitleDefinitions = [];
let backgroundDefinitions = [];
let selectedMapPiece = null;
let mapTransitioning = false;
let mapRewardPreviewPlaying = false;
let mapRewardInteractionLocked = false;

function setMapRewardInteractionLocked(locked) {
  mapRewardInteractionLocked = Boolean(locked);
  document.body.classList.toggle("mapRewardInteractionLocked", mapRewardInteractionLocked);
}

function playMapBgm() {
  mapBgm.play().catch(() => {
    document.addEventListener("pointerdown", () => {
      mapBgm.play().catch(() => {});
    }, { once: true });
  });
}

function navigateFromMap(url) {
  if (mapTransitioning) return;
  mapTransitioning = true;
  const overlay = document.getElementById("mapTransitionOverlay");
  overlay?.classList.remove("ready");
  overlay?.classList.add("leaving");
  setTimeout(() => { location.href = url; }, 560);
}

function getCurrentStamina() {
  return window.MapStamina?.getState().value ?? 0;
}

function updateMapSongButtonState() {
  const songButton = document.getElementById("selectMapSongButton");
  if (!songButton || !selectedMapPiece) return;
  const acquired = isPieceCleared(selectedMapPiece.id);
  const staminaEmpty = getCurrentStamina() <= 0;
  songButton.classList.toggle("staminaShortage", !acquired && staminaEmpty);
  songButton.textContent = acquired
    ? (selectedMapPiece.songSelection ? "楽曲を選ぶ　→" : "イベントを見る　→")
    : staminaEmpty
      ? "スタミナが不足しています"
      : (selectedMapPiece.songSelection ? "楽曲を選ぶ　→" : "イベントを見る　→");
  songButton.disabled = acquired || staminaEmpty;
}

function renderMapStamina() {
  const hearts = document.getElementById("mapStaminaHearts");
  if (!hearts) return;
  const stamina = getCurrentStamina();
  hearts.innerHTML = "";
  for (let index = 0; index < window.MapStamina.max; index++) {
    const heart = document.createElement("span");
    heart.className = `mapStaminaHeart${index < stamina ? "" : " empty"}`;
    heart.textContent = "♥";
    hearts.appendChild(heart);
  }
  hearts.setAttribute("aria-label", `スタミナ ${stamina} / ${window.MapStamina.max}`);
  renderMapRecoveryTimer();
  updateMapSongButtonState();
}

function renderMapRecoveryTimer() {
  const timer = document.getElementById("mapStaminaRecoveryTimer");
  if (!timer || !window.MapStamina) return;
  const saved = JSON.parse(localStorage.getItem("rhythmGame") || "{}").mapStamina;
  const value = Number(saved?.value ?? window.MapStamina.max);
  if (value >= window.MapStamina.max) {
    timer.textContent = "";
    return;
  }

  const elapsed = Math.max(0, Date.now() - Number(saved?.updatedAt || Date.now()));
  if (elapsed >= window.MapStamina.recoveryIntervalMs) {
    renderMapStamina();
    return;
  }
  const remainingSeconds = Math.ceil((window.MapStamina.recoveryIntervalMs - elapsed) / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");
  timer.textContent = `次の回復まで ${minutes}:${seconds}`;
}

function getMapProgress(mapId) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  return saveData.mapProgress?.[mapId] || { clearedPieces: [], failedPieces: {}, shards: 0 };
}

function getCompletionRewardKey(reward) {
  const value = reward.type === "background" ? reward.file : reward.id;
  return `${Number(reward.percent)}:${reward.type}:${value}`;
}

function claimMapCompletionRewards(mapData, completion) {
  const rewards = Array.isArray(mapData.completionRewards) ? mapData.completionRewards : [];

  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (!saveData.mapProgress) saveData.mapProgress = {};
  if (!saveData.mapProgress[mapData.id]) {
    saveData.mapProgress[mapData.id] = { clearedPieces: [], failedPieces: {}, shards: 0 };
  }
  const progress = saveData.mapProgress[mapData.id];
  if (!Array.isArray(progress.claimedCompletionRewards)) progress.claimedCompletionRewards = [];
  const claimed = new Set(progress.claimedCompletionRewards);
  let changed = false;
  const newlyClaimed = [];

  for (const reward of rewards) {
    const percent = Number(reward?.percent);
    const type = String(reward?.type || "");
    const value = type === "background" ? String(reward?.file || "").trim() : String(reward?.id || "").trim();
    if (!Number.isFinite(percent) || percent < 1 || percent > 100 || !["title", "background", "song"].includes(type) || !value) continue;
    if (completion < percent) continue;

    const key = getCompletionRewardKey(reward);
    if (claimed.has(key)) continue;

    if (type === "title") {
      const definition = mapTitleDefinitions.find(title => title?.id === value);
      if (!definition) {
        console.warn(`[Map Reward] titles.json の mapTitles に ${value} がありません。`);
        continue;
      }
      if (!saveData.unlockedTitles) saveData.unlockedTitles = {};
      saveData.unlockedTitles[value] = {
        name: definition.name,
        category: "map",
        background: definition.background || "blue",
        mapId: mapData.id,
        requiredPercent: percent,
        acquisitionText: definition.acquisitionText || `${mapData.title}を${percent}%完成`,
        unlockedAt: Number(saveData.unlockedTitles[value]?.unlockedAt || Date.now())
      };
    } else if (type === "background") {
      if (!saveData.unlockedSelectBackgrounds) saveData.unlockedSelectBackgrounds = {};
      saveData.unlockedSelectBackgrounds[value] = true;
    } else {
      if (!saveData.mapRewardUnlockedSongs) saveData.mapRewardUnlockedSongs = {};
      saveData.mapRewardUnlockedSongs[value] = true;
    }

    claimed.add(key);
    newlyClaimed.push({ ...reward, value });
    changed = true;
  }

  const legacyCompleteTitleId = "map:any-map-complete";
  const completeTitleId = "special:map-complete";
  const completeTitleDefinition = specialTitleDefinitions.find(title => title?.id === completeTitleId);
  if (completion >= 100 && completeTitleDefinition && !saveData.unlockedTitles?.[completeTitleId]) {
    if (!saveData.unlockedTitles) saveData.unlockedTitles = {};
    delete saveData.unlockedTitles[legacyCompleteTitleId];
    if (saveData.viewedTitles) delete saveData.viewedTitles[legacyCompleteTitleId];
    if (saveData.notifiedTitles) delete saveData.notifiedTitles[legacyCompleteTitleId];
    saveData.unlockedTitles[completeTitleId] = {
      name: completeTitleDefinition.name,
      category: "special",
      background: completeTitleDefinition.background || "blue",
      condition: completeTitleDefinition.condition || "anyMapComplete",
      mapId: mapData.id,
      requiredPercent: 100,
      acquisitionText: completeTitleDefinition.acquisitionText || "任意のマップを1つ完走",
      unlockedAt: Date.now()
    };
    changed = true;
  }

  if (changed) {
    progress.claimedCompletionRewards = [...claimed];
    localStorage.setItem("rhythmGame", JSON.stringify(saveData));
  }
  return newlyClaimed;
}

async function getRewardUnlockPresentation(reward) {
  const type = String(reward.type || "");
  const value = String(reward.value || (type === "background" ? reward.file : reward.id) || "");
  if (type === "title") {
    const definition = [...mapTitleDefinitions, ...specialTitleDefinitions].find(title => title?.id === value);
    return { type, label: "TITLE UNLOCKED", name: definition?.name || value, titleBackground: definition?.background || "blue" };
  }
  if (type === "background") {
    const definition = backgroundDefinitions.find(background => background?.file === value);
    return { type, label: "BACKGROUND UNLOCKED", name: definition?.name || value, image: `assets/bg/${value}` };
  }
  let songName = value;
  try {
    const response = await fetch(`songs/${encodeURIComponent(value)}/info.json`, { cache: "no-store" });
    if (response.ok) songName = (await response.json())?.title || songName;
  } catch (_) {}
  return { type: "song", label: "SONG UNLOCKED", name: songName, image: `songs/${encodeURIComponent(value)}/jacket.png` };
}

async function beginMapBackgroundCompletionCinematic() {
  const board = document.getElementById("mapBoard");
  if (!board || !activeMapData) return null;
  document.body.classList.add("mapCompletionCinematicPreparing");
  board.classList.add("completionPreparing");
  await new Promise(resolve => {
    const finish = () => {
      clearTimeout(fallback);
      board.removeEventListener("transitionend", onTransitionEnd);
      resolve();
    };
    const onTransitionEnd = event => {
      if (event.target === board && event.propertyName === "transform") finish();
    };
    const fallback = setTimeout(finish, 2750);
    board.addEventListener("transitionend", onTransitionEnd);
  });
  board.classList.add("completionContracted");
  await new Promise(resolve => setTimeout(resolve, 370));

  const rect = board.getBoundingClientRect();
  const cinematic = document.createElement("div");
  cinematic.id = "mapCompletionCinematic";
  cinematic.style.left = `${rect.left}px`;
  cinematic.style.top = `${rect.top}px`;
  cinematic.style.width = `${rect.width}px`;
  cinematic.style.height = `${rect.height}px`;
  cinematic.style.backgroundImage = `url("${activeMapData.completedImage}")`;
  document.body.appendChild(cinematic);
  document.body.classList.remove("mapCompletionCinematicPreparing");
  document.body.classList.add("mapCompletionCinematicPlaying");
  cinematic.getBoundingClientRect();
  cinematic.classList.add("active");
  await new Promise(resolve => setTimeout(resolve, 700));
  return cinematic;
}

async function endMapBackgroundCompletionCinematic(cinematic) {
  if (!cinematic) return;
  cinematic.classList.add("closing");
  const board = document.getElementById("mapBoard");
  board?.classList.add("completionResetting");
  board?.classList.remove("completionPreparing", "completionContracted");
  document.body.classList.remove("mapCompletionCinematicPlaying");
  document.body.classList.remove("mapCompletionCinematicPreparing");
  requestAnimationFrame(() => requestAnimationFrame(() => board?.classList.remove("completionResetting")));
  await new Promise(resolve => setTimeout(resolve, 750));
  cinematic.remove();
}

async function showMapCompletionRewardUnlocks(rewards) {
  if (!Array.isArray(rewards) || rewards.length === 0) {
    setMapRewardInteractionLocked(false);
    return;
  }
  setMapRewardInteractionLocked(true);
  const overlay = document.getElementById("mapRewardUnlockOverlay");
  const visual = document.getElementById("mapRewardUnlockVisual");
  const label = document.getElementById("mapRewardUnlockLabel");
  const name = document.getElementById("mapRewardUnlockName");
  try {
    for (const reward of rewards) {
    const presentation = await getRewardUnlockPresentation(reward);
    const useCompletionCinematic = presentation.type === "background" && Number(reward.percent) >= 100;
    const cinematic = useCompletionCinematic ? await beginMapBackgroundCompletionCinematic() : null;
    visual.className = presentation.type;
    visual.innerHTML = presentation.type === "title"
      ? `<div id="mapRewardUnlockTitleBadge" class="titleBackground-${presentation.titleBackground}"></div>`
      : `<img alt="">`;
    if (presentation.type === "title") {
      document.getElementById("mapRewardUnlockTitleBadge").textContent = presentation.name;
    } else {
      const image = visual.querySelector("img");
      image.src = presentation.image;
      image.alt = presentation.name;
    }
    const visualRect = visual.getBoundingClientRect();
    const acquiredRect = visual.firstElementChild?.getBoundingClientRect();
    if (acquiredRect) {
      visual.style.setProperty("--reward-center-x", `${acquiredRect.left - visualRect.left + acquiredRect.width / 2}px`);
      visual.style.setProperty("--reward-center-y", `${acquiredRect.top - visualRect.top + acquiredRect.height / 2}px`);
    }
    label.textContent = presentation.label;
    name.textContent = presentation.name;
    overlay.classList.toggle("completionBackground", useCompletionCinematic);
    overlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => overlay.classList.add("active"));

    await new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        overlay.removeEventListener("click", finish);
        resolve();
      };
      const timer = setTimeout(finish, 6000);
      overlay.addEventListener("click", finish);
    });
    overlay.classList.remove("active");
    await new Promise(resolve => setTimeout(resolve, 520));
    overlay.classList.remove("completionBackground");
      await endMapBackgroundCompletionCinematic(cinematic);
    }
  } finally {
    overlay.classList.remove("active", "completionBackground");
    overlay.setAttribute("aria-hidden", "true");
    setMapRewardInteractionLocked(false);
  }
}

function getRemainingPieceCountForReward(mapData, clearedPieceIds, targetPercent) {
  const totalPieces = mapData.pieces.length;
  let requiredPieces = 0;
  while (requiredPieces <= totalPieces && Math.round(requiredPieces / totalPieces * 100) < targetPercent) {
    requiredPieces++;
  }
  return Math.max(0, requiredPieces - clearedPieceIds.size);
}

let completionRewardView = null;

function renderNextCompletionReward(mapData, completion, clearedPieceIds, requestedIndex = null) {
  const card = document.getElementById("mapNextReward");
  const percentElement = document.getElementById("mapNextRewardPercent");
  const preview = document.getElementById("mapNextRewardPreview");
  const icon = document.getElementById("mapNextRewardIcon");
  const typeElement = document.getElementById("mapNextRewardType");
  const nameElement = document.getElementById("mapNextRewardName");
  const remainingElement = document.getElementById("mapNextRewardRemaining");
  const fill = document.getElementById("mapNextRewardFill");
  const rewards = (Array.isArray(mapData.completionRewards) ? mapData.completionRewards : [])
    .filter(reward => Number.isFinite(Number(reward?.percent)))
    .sort((a, b) => Number(a.percent) - Number(b.percent));
  const progress = getMapProgress(mapData.id);
  const claimedRewards = new Set(progress.claimedCompletionRewards || []);
  let rewardIndex = requestedIndex;
  if (rewardIndex === null) {
    rewardIndex = rewards.findIndex(reward => !claimedRewards.has(getCompletionRewardKey(reward)));
    if (rewardIndex < 0) rewardIndex = Math.max(0, rewards.length - 1);
  } else if (rewards.length > 0) {
    rewardIndex = Math.min(rewards.length - 1, Math.max(0, rewardIndex));
  }
  document.getElementById("mapRewardPrev").disabled = rewards.length <= 1 || rewardIndex === 0;
  document.getElementById("mapRewardNext").disabled = rewards.length <= 1 || rewardIndex === rewards.length - 1;
  const nextReward = rewards[rewardIndex];
  completionRewardView = { mapData, completion, clearedPieceIds, rewardIndex };

  preview.style.backgroundImage = "";
  icon.style.display = "";
  remainingElement.classList.remove("acquired");
  card.classList.toggle("allAcquired", !nextReward);

  if (!nextReward) {
    percentElement.textContent = "--%";
    typeElement.textContent = "REWARD";
    nameElement.textContent = "完成度報酬はありません";
    remainingElement.textContent = "";
    fill.style.width = "0%";
    return;
  }

  const percent = Number(nextReward.percent);
  const type = String(nextReward.type || "");
  const value = type === "background" ? String(nextReward.file || "") : String(nextReward.id || "");
  const remainingPieces = getRemainingPieceCountForReward(mapData, clearedPieceIds, percent);
  const rewardKey = getCompletionRewardKey(nextReward);
  const acquired = claimedRewards.has(rewardKey);
  card.dataset.rewardKey = rewardKey;
  percentElement.textContent = `${percent}%`;
  typeElement.textContent = ({ title: "TITLE", song: "SONG UNLOCK", background: "BACKGROUND" })[type] || "REWARD";
  remainingElement.textContent = acquired ? "獲得済みです！" : `獲得まで　あと${remainingPieces}ピース`;
  remainingElement.classList.toggle("acquired", acquired);
  fill.style.width = `${Math.min(100, Math.max(0, completion / percent * 100))}%`;

  if (type === "title") {
    const definition = mapTitleDefinitions.find(title => title?.id === value);
    icon.textContent = "称";
    nameElement.textContent = definition?.name || value;
  } else if (type === "background") {
    icon.style.display = "none";
    preview.style.backgroundImage = `url("assets/bg/${encodeURIComponent(value)}")`;
    const definition = backgroundDefinitions.find(background => background?.file === value);
    nameElement.textContent = `背景:${definition?.name || value.replace(/\.[^.]+$/, "")}`;
  } else if (type === "song") {
    icon.style.display = "none";
    preview.style.backgroundImage = `url("songs/${encodeURIComponent(value)}/jacket.png")`;
    nameElement.textContent = "楽曲を解禁";
    fetch(`songs/${encodeURIComponent(value)}/info.json`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(info => {
        if (info?.title && card.dataset.rewardKey === rewardKey) nameElement.textContent = info.title;
      })
      .catch(() => {});
  }
}

function saveSelectedPiece(pieceId) {
  if (!activeMapData?.id || !pieceId) return;
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (!saveData.mapProgress) saveData.mapProgress = {};
  if (!saveData.mapProgress[activeMapData.id]) {
    saveData.mapProgress[activeMapData.id] = { clearedPieces: [], failedPieces: {}, shards: 0 };
  }
  saveData.mapProgress[activeMapData.id].selectedPieceId = pieceId;
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
}

function isPieceCleared(pieceId) {
  if (!activeMapData) return false;
  return getMapProgress(activeMapData.id).clearedPieces?.includes(pieceId) === true;
}

function clearPieceSelection() {
  selectedMapPiece = null;
  document.querySelectorAll(".mapPiece.selected").forEach(element => element.classList.remove("selected"));
  document.querySelectorAll(".jigsawPieceShape.selected").forEach(element => element.classList.remove("selected"));
  const detailPanel = document.getElementById("mapPieceDetail");
  detailPanel.classList.remove("acquired");
  detailPanel.classList.add("hidden");
}

const typePresentation = {
  normal: { label: "通常マス", icon: "", rule: "楽曲をプレイしてピースを復元しよう", target: "" },
  mission: { label: "ミッション", icon: "！", rule: "指定された条件を達成しよう", target: "" },
  random: { label: "ランダム", icon: "⤨", rule: "選ばれた楽曲をクリアしよう", target: "" },
  songRestriction: { label: "楽曲制限", icon: "♫", rule: "指定された楽曲と難易度で挑戦しよう", target: "目標：CLEAR" },
  bonus: { label: "ボーナス", icon: "♬", rule: "楽曲をプレイしてピースを復元しよう", target: "" }
};

function warnMap(mapId, pieceId, message) {
  console.warn(`[Map Validation] ${mapId} / ${pieceId}: ${message}`);
}

function hasMissionCondition(piece) {
  const conditions = piece.conditions || {};
  return conditions.minRank !== undefined
    || conditions.minScore !== undefined
    || conditions.fullCombo === true
    || conditions.allPerfect === true
    || conditions.maxMisses !== undefined
    || conditions.maxCombo !== undefined;
}

function getPiecePresentation(piece) {
  if (hasMissionCondition(piece)) return typePresentation.mission;
  return typePresentation[piece.type] || typePresentation.normal;
}

function getConditionLabels(piece) {
  const conditions = piece.conditions || {};
  const labels = [];
  if (conditions.minRank !== undefined) labels.push(`RANK ${String(conditions.minRank).toUpperCase()}以上`);
  if (conditions.minScore !== undefined) labels.push(`SCORE ${Number(conditions.minScore).toLocaleString()}以上`);
  if (conditions.fullCombo === true) labels.push("FULL COMBO");
  if (conditions.allPerfect === true) labels.push("ALL PERFECT");
  if (conditions.maxMisses !== undefined) labels.push(`MISS ${Number(conditions.maxMisses)}以下`);
  if (conditions.maxCombo !== undefined) labels.push(`MAX COMBO ${Number(conditions.maxCombo)}以上`);
  return labels;
}

function validateMapData(mapData) {
  const gridSize = Number(mapData.gridSize);
  const maxCell = gridSize * gridSize;
  const occupiedCells = new Set();

  if (mapData.completionRewards !== undefined && !Array.isArray(mapData.completionRewards)) {
    warnMap(mapData.id, "completionRewards", "completionRewardsは配列で指定してください。");
  }
  const completionRewards = Array.isArray(mapData.completionRewards) ? mapData.completionRewards : [];
  for (const [index, reward] of completionRewards.entries()) {
    const percent = Number(reward?.percent);
    const type = String(reward?.type || "");
    const value = type === "background" ? reward?.file : reward?.id;
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
      warnMap(mapData.id, `completionRewards[${index}]`, "percentは1～100で指定してください。");
    }
    if (!["title", "background", "song"].includes(type)) {
      warnMap(mapData.id, `completionRewards[${index}]`, "typeはtitle / background / songのいずれかを指定してください。");
    }
    if (!String(value || "").trim()) {
      warnMap(mapData.id, `completionRewards[${index}]`, type === "background" ? "fileが指定されていません。" : "idが指定されていません。");
    }
  }

  for (const piece of mapData.pieces || []) {
    const cells = piece.cells || [];
    if (cells.length === 0) {
      warnMap(mapData.id, piece.id, "cellsが指定されていません。");
      continue;
    }

    const rows = new Set(cells.map(cell => Math.floor((cell - 1) / gridSize)));
    if (rows.size > 1) {
      warnMap(mapData.id, piece.id, `cells [${cells.join(", ")}] は行をまたいでいるため、1つのピースにはできません。`);
    }

    for (let index = 0; index < cells.length; index++) {
      const cell = Number(cells[index]);
      if (!Number.isInteger(cell) || cell < 1 || cell > maxCell) {
        warnMap(mapData.id, piece.id, `セル番号 ${cell} は1～${maxCell}の範囲外です。`);
      }
      if (index > 0 && cell !== Number(cells[index - 1]) + 1) {
        warnMap(mapData.id, piece.id, `cells [${cells.join(", ")}] は連続していません。`);
      }
      if (occupiedCells.has(cell)) {
        warnMap(mapData.id, piece.id, `セル番号 ${cell} が重複しています。`);
      }
      occupiedCells.add(cell);
    }

    const conditions = piece.conditions || {};
    const validRanks = ["F", "D", "C", "B", "B+", "A", "A+", "S", "S+", "S++", "SS"];
    if (conditions.minRank !== undefined && !validRanks.includes(String(conditions.minRank).toUpperCase())) {
      warnMap(mapData.id, piece.id, `minRank "${conditions.minRank}" は有効なランクではありません。`);
    }
    for (const conditionName of ["minScore", "maxMisses", "maxCombo"]) {
      if (conditions[conditionName] !== undefined && (!Number.isFinite(Number(conditions[conditionName])) || Number(conditions[conditionName]) < 0)) {
        warnMap(mapData.id, piece.id, `${conditionName} には0以上の数値を指定してください。`);
      }
    }
  }

  for (let cell = 1; cell <= maxCell; cell++) {
    if (!occupiedCells.has(cell)) console.warn(`[Map Validation] ${mapData.id}: セル番号 ${cell} がどのピースにも割り当てられていません。`);
  }
}

function selectPiece(piece, button) {
  const acquired = isPieceCleared(piece.id);
  selectedMapPiece = piece;
  saveSelectedPiece(piece.id);
  document.querySelectorAll(".mapPiece.selected").forEach(element => element.classList.remove("selected"));
  document.querySelectorAll(".jigsawPieceShape.selected").forEach(element => element.classList.remove("selected"));
  button.classList.add("selected");
  document.querySelector(`.jigsawPieceShape[data-piece-id="${piece.id}"]`)?.classList.add("selected");
  const detailPanel = document.getElementById("mapPieceDetail");
  detailPanel.classList.remove("hidden");
  detailPanel.classList.toggle("acquired", acquired);
  const presentation = getPiecePresentation(piece);
  document.getElementById("selectedPieceIconSymbol").textContent = presentation.icon;
  document.getElementById("selectedPieceType").textContent = presentation.label;
  document.getElementById("selectedPieceRule").textContent = presentation.rule;
  const conditionLabels = getConditionLabels(piece);
  const targetElement = document.getElementById("selectedPieceTarget");
  targetElement.textContent = conditionLabels.length > 0 ? `目標：${conditionLabels.join(" / ")}` : "";
  targetElement.style.display = conditionLabels.length > 0 ? "" : "none";
  const failureCount = Math.min(2, Number(getMapProgress(activeMapData.id).failedPieces?.[piece.id] || 0));
  const crackProgress = acquired ? 3 : failureCount;
  document.getElementById("pieceCrackProgressCount").textContent = `${crackProgress} / 3`;
  document.getElementById("pieceCrackProgressFill").style.width = `${crackProgress <= 1 ? 0 : crackProgress === 2 ? 50 : 100}%`;
  document.querySelectorAll(".pieceCrackProgressNode").forEach((node, index) => {
    node.classList.toggle("active", index < crackProgress);
    node.textContent = index < crackProgress ? "◆" : "◇";
  });
  const rewardElement = document.getElementById("selectedPieceReward");
  const rewardRows = [];
  const hasShardReward = Object.prototype.hasOwnProperty.call(piece.reward || {}, "shards");
  const shardReward = Number(piece.reward?.shards || 0);
  if (hasShardReward && shardReward >= 0) {
    rewardRows.push(`<div class="selectedRewardRow"><span class="mapPointIcon"></span><span>シャード</span><strong>+${shardReward}</strong></div>`);
  }
  const hasStaminaReward = Object.prototype.hasOwnProperty.call(piece.reward || {}, "stamina");
  const staminaReward = Number(piece.reward?.stamina || 0);
  if (hasStaminaReward && staminaReward >= 0) {
    rewardRows.push(`<div class="selectedRewardRow"><span class="staminaRewardHeart">❤</span><span>スタミナ</span><strong>+${staminaReward}</strong></div>`);
  }
  rewardElement.innerHTML = rewardRows.join("");
  const songButton = document.getElementById("selectMapSongButton");
  songButton.textContent = piece.songSelection ? "楽曲を選ぶ　→" : "イベントを見る　→";
  songButton.disabled = acquired;
  updateMapSongButtonState();
}

function edgeCurve(startX, startY, endX, endY, normalX, normalY, direction) {
  const dx = endX - startX;
  const dy = endY - startY;
  const amplitude = 0.14 * direction;
  const point = (progress, normal = 0) => [
    startX + dx * progress + normalX * normal,
    startY + dy * progress + normalY * normal
  ];
  const p35 = point(0.35);
  const p40 = point(0.4);
  const p38Out = point(0.38, amplitude);
  const p50Out = point(0.5, amplitude);
  const p62Out = point(0.62, amplitude);
  const p60 = point(0.6);
  const p65 = point(0.65);
  return [
    `L ${p35[0]} ${p35[1]}`,
    `C ${p40[0]} ${p40[1]} ${p38Out[0]} ${p38Out[1]} ${p50Out[0]} ${p50Out[1]}`,
    `C ${p62Out[0]} ${p62Out[1]} ${p60[0]} ${p60[1]} ${p65[0]} ${p65[1]}`,
    `L ${endX} ${endY}`
  ].join(" ");
}

function boundaryDirection(primaryIndex, secondaryIndex) {
  return (primaryIndex + secondaryIndex) % 2 === 0 ? 1 : -1;
}

function createJigsawPath(piece, gridSize) {
  const firstCell = piece.cells[0];
  const row = Math.floor((firstCell - 1) / gridSize);
  const startColumn = (firstCell - 1) % gridSize;
  const span = piece.cells.length;
  const endColumn = startColumn + span;
  let path = `M ${startColumn} ${row}`;

  for (let column = startColumn; column < endColumn; column++) {
    if (row === 0) {
      path += ` L ${column + 1} ${row}`;
    } else {
      const direction = -boundaryDirection(row - 1, column);
      path += ` ${edgeCurve(column, row, column + 1, row, 0, -1, direction)}`;
    }
  }

  if (endColumn === gridSize) {
    path += ` L ${endColumn} ${row + 1}`;
  } else {
    const direction = boundaryDirection(row, endColumn - 1);
    path += ` ${edgeCurve(endColumn, row, endColumn, row + 1, 1, 0, direction)}`;
  }

  for (let column = endColumn; column > startColumn; column--) {
    if (row + 1 === gridSize) {
      path += ` L ${column - 1} ${row + 1}`;
    } else {
      const direction = boundaryDirection(row, column - 1);
      path += ` ${edgeCurve(column, row + 1, column - 1, row + 1, 0, 1, direction)}`;
    }
  }

  if (startColumn === 0) {
    path += ` L ${startColumn} ${row}`;
  } else {
    const direction = -boundaryDirection(row, startColumn - 1);
    path += ` ${edgeCurve(startColumn, row + 1, startColumn, row, -1, 0, direction)}`;
  }

  return `${path} Z`;
}

function createJigsawLayer(mapData) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.classList.add("jigsawLayer");
  svg.setAttribute("viewBox", `0 0 ${mapData.gridSize} ${mapData.gridSize}`);
  svg.setAttribute("aria-hidden", "true");

  const junctions = new Set();
  for (const piece of mapData.pieces) {
    const path = document.createElementNS(svgNamespace, "path");
    path.classList.add("jigsawPieceShape");
    path.dataset.pieceId = piece.id;
    path.setAttribute("d", createJigsawPath(piece, mapData.gridSize));
    svg.appendChild(path);

    const firstCell = piece.cells[0];
    const row = Math.floor((firstCell - 1) / mapData.gridSize);
    const startColumn = (firstCell - 1) % mapData.gridSize;
    const endColumn = startColumn + piece.cells.length;
    junctions.add(`${startColumn},${row}`);
    junctions.add(`${endColumn},${row}`);
    junctions.add(`${startColumn},${row + 1}`);
    junctions.add(`${endColumn},${row + 1}`);
  }

  const junctionLayer = document.createElementNS(svgNamespace, "g");
  junctionLayer.classList.add("jigsawJunctionLayer");
  for (const junction of junctions) {
    const [x, y] = junction.split(",").map(Number);
    const createSparklePath = (radius, waist) => [
      `M ${x} ${y - radius}`,
      `L ${x + waist} ${y - waist}`,
      `L ${x + radius} ${y}`,
      `L ${x + waist} ${y + waist}`,
      `L ${x} ${y + radius}`,
      `L ${x - waist} ${y + waist}`,
      `L ${x - radius} ${y}`,
      `L ${x - waist} ${y - waist}`,
      "Z"
    ].join(" ");

    const halo = document.createElementNS(svgNamespace, "path");
    halo.classList.add("jigsawJunctionSparkle", "jigsawJunctionSparkleHalo");
    halo.setAttribute("d", createSparklePath(0.072, 0.012));
    junctionLayer.appendChild(halo);

    const core = document.createElementNS(svgNamespace, "path");
    core.classList.add("jigsawJunctionSparkle", "jigsawJunctionSparkleCore");
    core.setAttribute("d", createSparklePath(0.052, 0.006));
    junctionLayer.appendChild(core);
  }
  svg.appendChild(junctionLayer);

  return svg;
}

function renderMap(mapData) {
  activeMapData = mapData;
  const currentSaveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  currentSaveData.lastPlayedMapId = mapData.id;
  localStorage.setItem("rhythmGame", JSON.stringify(currentSaveData));
  document.getElementById("mapNumber").textContent = mapData.id.toUpperCase().replace("MAP", "MAP ");
  document.getElementById("mapTitle").textContent = mapData.title;
  const mapIdentityIconImage = document.getElementById("mapIdentityIconImage");
  mapIdentityIconImage.src = mapData.iconImage || mapData.completedImage || "";
  mapIdentityIconImage.alt = mapData.title || mapData.id;
  const board = document.getElementById("mapBoard");
  board.style.gridTemplateColumns = `repeat(${mapData.gridSize}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${mapData.gridSize}, 1fr)`;
  board.style.backgroundImage = `url("${mapData.completedImage}")`;
  board.innerHTML = "";
  board.appendChild(createJigsawLayer(mapData));

  const progress = getMapProgress(mapData.id);
  const clearedPieceIds = new Set(progress.clearedPieces || []);
  const failedPieces = progress.failedPieces || {};
  const completion = Math.round(clearedPieceIds.size / mapData.pieces.length * 100);
  const newlyClaimedCompletionRewards = claimMapCompletionRewards(mapData, completion);
  renderNextCompletionReward(mapData, completion, clearedPieceIds);
  document.getElementById("mapCompletionValue").textContent = `${completion}%`;
  document.getElementById("mapCompletionFill").style.width = `${completion}%`;
  document.getElementById("mapRestoredPiecesValue").textContent = `${clearedPieceIds.size} / ${mapData.pieces.length}`;
  document.getElementById("mapEarnedPoints").lastChild.textContent = String(Number(progress.shards || 0));
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const totalShards = Number(saveData.playShards || 0) + Object.values(saveData.mapProgress || {}).reduce(
    (total, mapProgress) => total + Number(mapProgress?.shards || 0),
    0
  );
  document.getElementById("mapPointValue").textContent = String(totalShards);

  let firstUnclearedPiece = null;
  let firstUnclearedButton = null;
  let firstPiece = null;
  let firstPieceButton = null;
  let failedPiece = null;
  let failedPieceButton = null;
  let savedPiece = null;
  let savedPieceButton = null;
  const preferredPieceId = failedPieceId || restoredPieceId || progress.selectedPieceId || "";

  mapData.pieces.forEach((piece) => {
    const firstCell = piece.cells[0];
    const row = Math.floor((firstCell - 1) / mapData.gridSize) + 1;
    const column = ((firstCell - 1) % mapData.gridSize) + 1;
    const presentation = getPiecePresentation(piece);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mapPiece";
    button.style.gridRow = `${row}`;
    button.style.gridColumn = `${column} / span ${piece.cells.length}`;
    button.setAttribute("aria-label", presentation.label);
    if (!firstPiece) {
      firstPiece = piece;
      firstPieceButton = button;
    }
    if (piece.id === preferredPieceId) {
      savedPiece = piece;
      savedPieceButton = button;
    }
    if (clearedPieceIds.has(piece.id)) {
      button.classList.add("cleared");
      button.setAttribute("aria-disabled", "true");
      const pieceShape = document.querySelector(`.jigsawPieceShape[data-piece-id="${piece.id}"]`);
      pieceShape?.classList.add("cleared");
      if (piece.id === restoredPieceId) {
        pieceShape?.classList.add("restoring");
      }
    } else if (!firstUnclearedPiece) {
      firstUnclearedPiece = piece;
      firstUnclearedButton = button;
    }
    button.innerHTML = !hasMissionCondition(piece) && piece.type === "normal"
      ? ""
      : `<span class="mapPieceTypeIcon">${presentation.icon}</span><span class="mapPieceTypeName">${presentation.label}</span>`;
    if (!clearedPieceIds.has(piece.id)) {
      const failureCount = Math.min(2, Number(failedPieces[piece.id] || 0));
      for (let crackIndex = 1; crackIndex <= failureCount; crackIndex++) {
        const crack = document.createElement("span");
        crack.className = `pieceCrack pieceCrack${crackIndex}`;
        crack.innerHTML = `
          <svg viewBox="0 0 46 100" aria-hidden="true">
            <polyline points="23,0 31,12 17,25 30,38 14,52 28,65 12,79 24,100"></polyline>
            <polyline points="18,25 6,31 1,43"></polyline>
            <polyline points="27,65 40,72 45,84"></polyline>
            <polyline points="15,52 5,59 2,69"></polyline>
          </svg>`;
        if (piece.id === failedPieceId && crackIndex === failureCount) crack.classList.add("newCrack");
        button.appendChild(crack);
      }
      if (piece.id === failedPieceId) {
        failedPiece = piece;
        failedPieceButton = button;
      }
    }
    button.addEventListener("mouseenter", () => {
      document.querySelector(`.jigsawPieceShape[data-piece-id="${piece.id}"]`)?.classList.add("hovered");
    });
    button.addEventListener("mouseleave", () => {
      document.querySelector(`.jigsawPieceShape[data-piece-id="${piece.id}"]`)?.classList.remove("hovered");
    });
    button.addEventListener("click", () => {
      if (mapRewardInteractionLocked) return;
      selectPiece(piece, button);
    });
    board.appendChild(button);
  });

  if (failedPiece) {
    selectPiece(failedPiece, failedPieceButton);
    const crackSound = new Audio("sounds/crack.mp3");
    crackSound.volume = 0.85;
    crackSound.play().catch(() => {});
  } else if (savedPiece) {
    selectPiece(savedPiece, savedPieceButton);
  } else if (firstUnclearedPiece) {
    selectPiece(firstUnclearedPiece, firstUnclearedButton);
  } else if (firstPiece) {
    selectPiece(firstPiece, firstPieceButton);
  } else {
    clearPieceSelection();
  }

  if (restoredPieceId) {
    const pieceSound = new Audio("sounds/piece.mp3");
    pieceSound.play().catch(() => {});
    setTimeout(() => {
      document.querySelector(`.jigsawPieceShape[data-piece-id="${restoredPieceId}"]`)?.classList.remove("restoring");
    }, 1800);
    if (newlyClaimedCompletionRewards.length > 0) {
      setMapRewardInteractionLocked(true);
      setTimeout(() => showMapCompletionRewardUnlocks(newlyClaimedCompletionRewards), 1950);
    }
  }
}

async function initializeMapScreen() {
  try {
    const [response, titlesResponse, backgroundsResponse] = await Promise.all([
      fetch(MAP_DATA_PATH, { cache: "no-store" }),
      fetch("titles.json", { cache: "no-store" }),
      fetch("assets/bg/info.json", { cache: "no-store" })
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const mapData = await response.json();
    if (titlesResponse.ok) {
      const titleData = await titlesResponse.json();
      mapTitleDefinitions = Array.isArray(titleData.mapTitles) ? titleData.mapTitles : [];
      specialTitleDefinitions = Array.isArray(titleData.specialTitles) ? titleData.specialTitles : [];
    } else {
      console.warn(`[Map Reward] titles.jsonを読み込めませんでした。HTTP ${titlesResponse.status}`);
    }
    if (backgroundsResponse.ok) {
      const backgroundData = await backgroundsResponse.json();
      backgroundDefinitions = Array.isArray(backgroundData.backgrounds) ? backgroundData.backgrounds : [];
    } else {
      console.warn(`[Map Reward] assets/bg/info.jsonを読み込めませんでした。HTTP ${backgroundsResponse.status}`);
    }
    validateMapData(mapData);
    renderMapStamina();
    renderMap(mapData);
    await waitForMapVisualAssets();
  } catch (error) {
    console.error("マップデータの読み込みに失敗しました。", error);
  } finally {
    hideMapLoadingScreen();
  }
}

async function waitForMapVisualAssets(timeoutMs = 12000) {
  const imagePromises = [...document.images]
    .filter(image => image.src && !image.complete)
    .map(image => typeof image.decode === "function"
      ? image.decode().catch(() => {})
      : new Promise(resolve => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }));
  const fontPromise = document.fonts?.ready || Promise.resolve();

  await Promise.race([
    Promise.all([fontPromise, ...imagePromises]),
    new Promise(resolve => setTimeout(resolve, timeoutMs))
  ]);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function hideMapLoadingScreen() {
  const loadingScreen = document.getElementById("mapLoadingScreen");
  if (!loadingScreen) return;
  loadingScreen.classList.add("loaded");
  setTimeout(() => loadingScreen.remove(), 450);
}

document.getElementById("storyBackButton").addEventListener("click", () => {
  if (mapRewardInteractionLocked) return;
  navigateFromMap("map-select.html");
});
document.getElementById("mapRewardPrev").addEventListener("click", () => {
  if (mapRewardInteractionLocked || !completionRewardView) return;
  const { mapData, completion, clearedPieceIds, rewardIndex } = completionRewardView;
  renderNextCompletionReward(mapData, completion, clearedPieceIds, rewardIndex - 1);
});
document.getElementById("mapRewardNext").addEventListener("click", () => {
  if (mapRewardInteractionLocked || !completionRewardView) return;
  const { mapData, completion, clearedPieceIds, rewardIndex } = completionRewardView;
  renderNextCompletionReward(mapData, completion, clearedPieceIds, rewardIndex + 1);
});
document.getElementById("selectMapSongButton").addEventListener("click", () => {
  if (mapRewardInteractionLocked || !activeMapData || !selectedMapPiece?.songSelection) return;
  if (isPieceCleared(selectedMapPiece.id)) return;
  if (getCurrentStamina() <= 0) {
    updateMapSongButtonState();
    return;
  }
  navigateFromMap(`select.html?mode=map&map=${encodeURIComponent(activeMapData.id)}&piece=${encodeURIComponent(selectedMapPiece.id)}`);
});

const mapBoardArea = document.getElementById("mapBoardArea");
const mapBoard = document.getElementById("mapBoard");
const mapBoardResizeObserver = new ResizeObserver(() => {
  const size = Math.floor(Math.min(mapBoardArea.clientWidth, mapBoardArea.clientHeight));
  mapBoard.style.width = `${size}px`;
  mapBoard.style.height = `${size}px`;
});
mapBoardResizeObserver.observe(mapBoardArea);

setInterval(renderMapStamina, 30000);
setInterval(renderMapRecoveryTimer, 1000);
window.addEventListener("focus", renderMapStamina);
window.addEventListener("mapstaminachange", renderMapStamina);

window.addEventListener("keydown", async (event) => {
  if (event.code !== "KeyR" || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || event.repeat) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
  event.preventDefault();
  event.stopPropagation();
  if (!activeMapData || mapTransitioning || mapRewardPreviewPlaying || mapRewardInteractionLocked) return;
  const backgroundReward = (activeMapData.completionRewards || []).find(reward =>
    reward?.type === "background" && Number(reward?.percent) >= 100 && String(reward?.file || "").trim()
  );
  if (!backgroundReward) {
    console.warn("[Map Reward Preview] 100%の背景報酬が設定されていません。");
    return;
  }
  mapRewardPreviewPlaying = true;
  try {
    await showMapCompletionRewardUnlocks([{ ...backgroundReward, value: String(backgroundReward.file).trim() }]);
  } finally {
    mapRewardPreviewPlaying = false;
  }
}, true);

initializeMapScreen();
playMapBgm();
requestAnimationFrame(() => {
  requestAnimationFrame(() => document.getElementById("mapTransitionOverlay")?.classList.add("ready"));
});
