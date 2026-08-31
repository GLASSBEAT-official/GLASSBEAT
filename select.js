let songList = [];
let folders = [];
let selectedFolderIndex = 0;
let selectedSongIndex = 0;
let selectedDifficulty = 0;
let songSortMode = 0;
const songSortLabels = ["デフォルト", "難易度順", "五十音順"];
const bossSongIds = new Set(["boss", "boss2", "boss3"]);
const japaneseTitleCollator = new Intl.Collator("ja", { sensitivity: "base", numeric: true });
const alphabetTitleCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const songTitleReadings = {
  "噓つきパラノイア": "うそつきぱらのいあ",
  "動き出す歯車": "うごきだすはぐるま",
  "今すぐ、逃げろ": "いますぐにげろ",
  "グラビティプレア": "ぐらびてぃぷれあ",
  "収束する青": "しゅうそくするあお",
  "背後霊による背後争奪戦": "はいごれいによるはいごそうだつせん",
  "星屑サラウンド": "ほしくずさらうんど",
  "メンタルヘルス": "めんたるへるす"
};
let previewAudio = null;
let previewSongId = null;
let canonGlowTimer = null;
let profileStatsDifficulty = "expert";
const selectParams = new URLSearchParams(window.location.search);
const mapSelectMode = selectParams.get("mode") === "map";
const selectedMapId = selectParams.get("map") || "";
const selectedMapPieceId = selectParams.get("piece") || "";
let selectedMapPiece = null;
let puzzleStartCommitted = false;
let recentlyShardUnlockedSongId = "";
const mapRewardSongIds = new Set();

function hasAllMapSongs() {
  return selectedMapPiece?.songSelection?.songs === "all";
}

function isRandomMapSelection() {
  return mapSelectMode && selectedMapPiece?.songSelection?.mode === "random";
}

function bypassUnlocksForConfiguredRandomSongs() {
  return isRandomMapSelection() && !hasAllMapSongs();
}

function isSongHidden(songId) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (songId === "song19") {
    return saveData.song19Unlocked !== true && saveData.boss3Unlocked !== true;
  }
  if (songId === "song26") {
    return saveData.song26Unlocked !== true && saveData.storyFlags?.chapter3CreditsSeen !== true;
  }
  return false;
}

function getSong19MaxClearedDifficulty() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const savedMaximum = Number(saveData.song19MaxClearedDifficulty);
  if (Number.isInteger(savedMaximum)) return Math.max(-1, Math.min(2, savedMaximum));

  // 旧セーブでは、チャレンジクリア時に保存されていた選択難易度を引き継ぐ。
  if (saveData.boss3UnlockChallengeCleared === true) {
    return Math.max(0, Math.min(2, Number(saveData.boss3UnlockChallengeDifficulty) || 0));
  }
  return -1;
}

function isBoss3SequenceDifficultyLocked(songId, difficultyIndex) {
  if (songId !== "song19" && songId !== "boss3") return false;
  return difficultyIndex > getSong19MaxClearedDifficulty();
}

function getRandomMapCandidates(difficultyIndex = selectedDifficulty) {
  // songs:"all"だけは従来どおり、解禁済み全曲（song1を除く）が候補。
  // 個別リストは指定順・重複を維持し、未解禁状態に関係なく候補へ含める。
  const candidates = hasAllMapSongs()
    ? songList.filter(song => song.id !== "song1" && !isSongHidden(song.id) && !isSongLocked(song.id))
    : getConfiguredMapSongIds()
        .map(songId => songList.find(song => song.id === songId))
        .filter(Boolean);

  return candidates.filter(song => {
    const chart = song.info.charts[difficultyIndex];
    if (!chart) return false;
    if (hasAllMapSongs()) return true;
    const setting = getMapSongSetting(song.id);
    if (!setting || setting.difficulties === undefined || setting.difficulties === "all") return true;
    return setting.difficulties.some(value =>
      String(value).toLowerCase() === String(chart.difficulty).toLowerCase()
    );
  });
}

async function loadMapSelectContext() {
  if (!mapSelectMode) return;
  if (!/^[a-zA-Z0-9_-]+$/.test(selectedMapId) || !selectedMapPieceId) {
    throw new Error("マップIDまたはピースIDが不正です。");
  }
  const response = await fetch(`map/maps/${selectedMapId}.json`);
  if (!response.ok) throw new Error(`マップデータを読み込めませんでした: HTTP ${response.status}`);
  const mapData = await response.json();
  selectedMapPiece = mapData.pieces?.find(piece => piece.id === selectedMapPieceId) || null;
  if (!selectedMapPiece?.songSelection) throw new Error(`ピース ${selectedMapPieceId} に選択可能な楽曲がありません。`);
  document.body.classList.add("mapSelectMode");
  document.body.classList.toggle("mapAllSongs", hasAllMapSongs() && !isRandomMapSelection());
  document.body.classList.toggle("randomMapSelection", isRandomMapSelection());
}

async function loadMapRewardSongCatalog() {
  let mapDataPaths = ["map/maps/map01.json"];
  try {
    const indexResponse = await fetch("map/maps/index.json", { cache: "no-store" });
    if (!indexResponse.ok) throw new Error(`HTTP ${indexResponse.status}`);
    const indexData = await indexResponse.json();
    mapDataPaths = (Array.isArray(indexData.maps) ? indexData.maps : [])
      .filter(entry => entry?.status === "available" && entry?.data)
      .map(entry => String(entry.data));
  } catch (error) {
    console.warn("[Map Reward] マップ一覧を読み込めないため、MAP 01のみ確認します。", error);
  }

  const results = await Promise.allSettled(mapDataPaths.map(async path => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }));

  for (const result of results) {
    if (result.status !== "fulfilled") {
      console.warn("[Map Reward] マップ報酬データを読み込めませんでした。", result.reason);
      continue;
    }
    for (const reward of result.value.completionRewards || []) {
      if (reward?.type === "song" && reward.id) mapRewardSongIds.add(String(reward.id));
    }
  }
}

function getMapSongSetting(songId) {
  if (hasAllMapSongs()) return { songId, difficulties: "all" };
  const setting = selectedMapPiece?.songSelection?.songs?.find(song =>
    typeof song === "string"
      ? song === songId
      : Array.isArray(song?.songId)
        ? song.songId.includes(songId)
        : song?.songId === songId
  );
  return typeof setting === "string"
    ? { songId: setting, difficulties: "all" }
    : setting || null;
}

function getConfiguredMapSongIds() {
  const settings = selectedMapPiece?.songSelection?.songs;
  if (!Array.isArray(settings)) return [];
  return settings.flatMap(setting => {
    if (typeof setting === "string") return [setting];
    if (Array.isArray(setting?.songId)) return setting.songId;
    return setting?.songId ? [setting.songId] : [];
  }).map(String).filter(Boolean);
}

function isMapDifficultyAllowed(songId, difficulty) {
  if (!mapSelectMode) return true;
  if (isRandomMapSelection()) return true;
  const setting = getMapSongSetting(songId);
  // difficulties省略時は、その楽曲に実装されている全難易度を許可する。
  if (setting && (setting.difficulties === undefined || setting.difficulties === "all")) return true;
  return setting?.difficulties?.some(value => String(value).toLowerCase() === String(difficulty).toLowerCase()) === true;
}

function getDisplayedChartLevel(level) {
  return Math.trunc(Number(level) || 0);
}

function preloadImageAssets(urls, timeoutMs = 12000) {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (uniqueUrls.length === 0) return Promise.resolve();

  const imagePromises = uniqueUrls.map(url => new Promise(resolve => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = url;
    if (image.complete) resolve();
  }));

  return Promise.race([
    Promise.all(imagePromises),
    new Promise(resolve => setTimeout(resolve, timeoutMs))
  ]);
}

function hideAssetLoadingScreen() {
  const loadingScreen = document.getElementById("assetLoadingScreen");
  if (!loadingScreen) return;

  loadingScreen.classList.add("loaded");
  setTimeout(() => loadingScreen.remove(), 400);
}

function loadUserOffset(songId) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  return saveData.userOffsets?.[songId] || 0;
}

function saveUserOffset(songId, value) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (!saveData.userOffsets) saveData.userOffsets = {};
  saveData.userOffsets[songId] = value;
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
}

function updateOffsetUI(songId) {
  const offset = loadUserOffset(songId);
  document.getElementById("userOffsetInput").value = offset;
}

document.getElementById("userOffsetMinus").addEventListener("click", () => {
  const song = getVisibleSongs()[selectedSongIndex];
  const input = document.getElementById("userOffsetInput");
  const val = Math.max(-99, Number(input.value) - 5);
  input.value = val;
  saveUserOffset(song.id, val);
});

document.getElementById("userOffsetPlus").addEventListener("click", () => {
  const song = getVisibleSongs()[selectedSongIndex];
  const input = document.getElementById("userOffsetInput");
  const val = Math.min(99, Number(input.value) + 5);
  input.value = val;
  saveUserOffset(song.id, val);
});

document.getElementById("userOffsetInput").addEventListener("change", () => {
  const song = getVisibleSongs()[selectedSongIndex];
  const input = document.getElementById("userOffsetInput");
  let val = Number(input.value);
  val = Math.min(99, Math.max(-99, val));
  input.value = val;
  saveUserOffset(song.id, val);
});

function isSongPrerequisiteLocked(songId) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");

  if (mapRewardSongIds.has(songId) && saveData.mapRewardUnlockedSongs?.[songId] !== true) {
    return true;
  }

  if (songId === "song3") {
    return saveData.storyRead?.chapter1_episode5 !== true;
  }
  if (songId === "boss") {
    return saveData.secretBossUnlocked !== true;
  }
  if (songId === "song9") {
    return saveData.song9Unlocked !== true;
  }
  if (songId === "song11") {
    return saveData.storyRead?.chapter2_episode6 !== true;
  }
  if (songId === "boss2") {
    return saveData.boss2Unlocked !== true;
  }
  if (songId === "boss3") {
    return saveData.boss3Unlocked !== true;
  }
  if (songId === "song18") {
    return saveData.song18Unlocked !== true && saveData.storyRead?.chapter3_episode12 !== true;
  }
  if (songId === "song26") {
    return saveData.song26Unlocked !== true && saveData.storyFlags?.chapter3CreditsSeen !== true;
  }
  return false;
}

function getSongShardUnlockCost(songId) {
  return Math.max(0, Number(songList.find(song => song.id === songId)?.info?.shardUnlockCost || 0));
}

function isSongShardLocked(songId) {
  const cost = getSongShardUnlockCost(songId);
  if (cost <= 0) return false;
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (
    songId === "song26" &&
    (saveData.song26Unlocked === true || saveData.storyFlags?.chapter3CreditsSeen === true)
  ) {
    return false;
  }
  return saveData.shardUnlockedSongs?.[songId] !== true;
}

function isSongLocked(songId) {
  return isSongPrerequisiteLocked(songId) || isSongShardLocked(songId);
}

function isBoss2ConditionRevealed() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  return saveData.storyRead?.chapter2_episode7 === true;
}

function getSongUnlockMessage(songId) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (mapRewardSongIds.has(songId) && saveData.mapRewardUnlockedSongs?.[songId] !== true) {
    return "この楽曲は、MAPでの解禁が必要です。";
  }
  if (songId === "song3") {
    return "この楽曲の解禁には、1-5の読了が必要です"; }
  if (songId === "boss") {
    return "この楽曲の解禁には、「Starlight Adventure」のクリアが必要です"; }
  if (songId === "song9") {
  return "この楽曲の解禁には、2-4の読了が必要です。";}
  if (songId === "song11") {
   return "この楽曲の解禁には、2-6の読了が必要です。";}
 if (songId === "boss2") {
    if (!isBoss2ConditionRevealed()) {
      return "この楽曲の解禁には、2-7の読了が必要です。";
    }
    return "新たな仲間とともに、再び歌に挑め";
  }
  if (songId === "song18") {
   return "この楽曲の解禁には、3-11の読了が必要です。";}
  if (songId === "boss3") {
    return "？？？";
  }

  return "";}

async function loadSongList() {
  await Promise.all([loadMapSelectContext(), loadMapRewardSongCatalog(), loadSelectBackgroundNames()]);
  const response = await fetch("songs/songlist.json");
  const data = await response.json();
  folders = data.folders;

  const allSongIds = folders.flatMap(f => f.songs);
  for (let songId of allSongIds) {
    const infoResponse = await fetch(`songs/${songId}/info.json`, { cache: "no-store" });
    const info = await infoResponse.json();
    songList.push({ id: songId, info: info });
  }
  await syncEarnedProfileTitles();

  const fadeOverlay = document.getElementById("selectFadeOverlay");
  setTimeout(() => {
    fadeOverlay.classList.add("fadeIn");
  }, 100);

  const initialSong = selectParams.get("song");
  const initialDifficulty = selectParams.get("difficulty");

  if (initialSong) {
    // URLパラメータがある場合（ゲームから戻ってきた場合など）
    const folderIndex = folders.findIndex(f => f.songs.includes(initialSong));
    if (folderIndex >= 0) selectedFolderIndex = folderIndex;
    selectedDifficulty = Number(initialDifficulty) || 0;
  } else {
    // URLパラメータがない場合は保存された選択を復元
    const saveData = getSaveData();
    const last = saveData.lastSelection;
    if (last) {
      selectedFolderIndex = last.folderIndex || 0;
      selectedDifficulty = last.difficulty || 0;
    }
  }

  // パズル状態ではFRACTUREを引き継がず、必ずEXPERTから選曲を始める。
  if (mapSelectMode && selectedDifficulty === 2) {
    selectedDifficulty = 1;
  }

  renderFolderButtons();
  renderSongList();

  const visibleSongs = getVisibleSongs();
  let initialIndex = 0;

  if (initialSong) {
    initialIndex = visibleSongs.findIndex(s => s.id === initialSong);
  } else {
    const saveData = getSaveData();
    const last = saveData.lastSelection;
    if (last?.songId) {
      initialIndex = visibleSongs.findIndex(song => song.id === last.songId);
    } else if (last && last.songIndex < visibleSongs.length) {
      initialIndex = last.songIndex;
    }
  }

  selectSong(initialIndex >= 0 ? initialIndex : 0);

  calculatePlayerRate(songList);
  loadProfilePanel();
  checkCanonPartnerEvent();

  await preloadImageAssets([
    ...folders.map(folder => folder.image),
    ...songList.map(song => `songs/${song.id}/jacket.png`),
    ...Array.from(document.images, image => image.currentSrc || image.src)
  ]);
  hideAssetLoadingScreen();
  showPendingTitleUnlockToasts();
}

function getVisibleSongs() {
  let visibleSongs;

  if (mapSelectMode && !hasAllMapSongs()) {
    // 指定順と重複数を保つ。同じIDを3回書けば、楽曲ボタンも3個並ぶ。
    visibleSongs = getConfiguredMapSongIds()
      .map(songId => songList.find(song => song.id === songId))
      .filter(Boolean);
  } else {
    const folder = folders[selectedFolderIndex];
    visibleSongs = folder
      ? songList.filter(s => folder.songs.includes(s.id))
      : [...songList];
  }

  if (mapSelectMode) {
    visibleSongs = visibleSongs.filter(song => song.id !== "song1");
  }

  visibleSongs = visibleSongs.filter(song => !isSongHidden(song.id));

  // デフォルト表示では、解禁されたsong19を必ずboss3の直前へ置く。
  if (songSortMode === 0 && !mapSelectMode) {
    const song19Index = visibleSongs.findIndex(song => song.id === "song19");
    const boss3Index = visibleSongs.findIndex(song => song.id === "boss3");
    if (song19Index >= 0 && boss3Index >= 0 && song19Index !== boss3Index - 1) {
      const [song19] = visibleSongs.splice(song19Index, 1);
      const updatedBoss3Index = visibleSongs.findIndex(song => song.id === "boss3");
      visibleSongs.splice(updatedBoss3Index, 0, song19);
    }
  }

  if (songSortMode === 1) {
    return visibleSongs.sort((a, b) => {
      const lockedBossOrder = compareLockedBossPosition(a, b);
      if (lockedBossOrder !== 0) return lockedBossOrder;
      const aLevel = Number(a.info.charts[selectedDifficulty]?.level ?? -Infinity);
      const bLevel = Number(b.info.charts[selectedDifficulty]?.level ?? -Infinity);
      return aLevel - bLevel;
    });
  }

  if (songSortMode === 2) {
    return visibleSongs.sort((a, b) => {
      const lockedBossOrder = compareLockedBossPosition(a, b);
      return lockedBossOrder !== 0
        ? lockedBossOrder
        : compareSongTitles(a.info.title, b.info.title);
    });
  }

  return visibleSongs;
}

function compareLockedBossPosition(a, b) {
  const aIsLockedBoss = bossSongIds.has(a.id) && isSongLocked(a.id);
  const bIsLockedBoss = bossSongIds.has(b.id) && isSongLocked(b.id);
  if (aIsLockedBoss === bIsLockedBoss) return 0;
  return aIsLockedBoss ? 1 : -1;
}

function getSongTitleGroup(title) {
  const firstCharacter = String(title || "").trim().charAt(0);
  if (/^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]$/u.test(firstCharacter)) return 0;
  if (/^[A-Za-z]$/.test(firstCharacter)) return 1;
  return 2;
}

function compareSongTitles(aTitle, bTitle) {
  const groupDifference = getSongTitleGroup(aTitle) - getSongTitleGroup(bTitle);
  if (groupDifference !== 0) return groupDifference;

  const collator = getSongTitleGroup(aTitle) === 1
    ? alphabetTitleCollator
    : japaneseTitleCollator;
  const aSortTitle = songTitleReadings[aTitle] || String(aTitle);
  const bSortTitle = songTitleReadings[bTitle] || String(bTitle);
  return collator.compare(aSortTitle, bSortTitle);
}

function renderFolderButtons() {
  const area = document.getElementById("folderButtons");
  area.innerHTML = "";

  folders.forEach((folder, index) => {
    const btn = document.createElement("button");
    btn.classList.add("folderButton");
    if (index === selectedFolderIndex) btn.classList.add("selected");
    btn.textContent = folder.name;

    if (folder.image) {
  btn.style.setProperty("--folder-bg", `url('${folder.image}')`);
  btn.classList.add("hasImage");
    }

    btn.addEventListener("click", () => {
      if (index === selectedFolderIndex) return;

      selectedFolderIndex = index;
      document.querySelectorAll(".folderButton").forEach((b, i) => {
        b.classList.toggle("selected", i === index);
      });
      renderSongList();
      selectSong(0);
      saveLastSelection(); // ← 追加
    });

    area.appendChild(btn);
  });
}

function renderSongList() {
  const listEl = document.getElementById("songList");
  listEl.innerHTML = "";

  const visibleSongs = getVisibleSongs(); // ← 追加
  const songsToRender = isRandomMapSelection()
    ? getRandomMapCandidates().slice(0, 1)
    : visibleSongs;
  listEl.classList.toggle("scrollable", songsToRender.length >= 8);

  for (let i = 0; i < songsToRender.length; i++) {
    const song = songsToRender[i]; // ← songList[i] から変更
    const bypassSongUnlock = bypassUnlocksForConfiguredRandomSongs();
    const isLocked = !bypassSongUnlock && isSongLocked(song.id);
    const isShardLocked = !bypassSongUnlock && isSongShardLocked(song.id) && !isSongPrerequisiteLocked(song.id);
    const shouldHideSongInfo =
  isRandomMapSelection() || ((song.id === "boss" || song.id === "boss2" || song.id === "boss3") && isLocked);
    const item = document.createElement("div");
    item.classList.add("songItem");
    if (song.id === recentlyShardUnlockedSongId) item.classList.add("shardJustUnlocked");
    if (i === selectedSongIndex) item.classList.add("selected");

    // ジャケット背景
    const bg = document.createElement("div");
    bg.classList.add("songItemBg");

    if (shouldHideSongInfo) {
  bg.style.backgroundImage = "";
  bg.style.backgroundColor = "#000";
  bg.classList.remove("lockedSongBg");
} else if (isLocked) {
  bg.style.backgroundImage = `url('songs/${song.id}/jacket.png')`;
  bg.style.backgroundColor = "";
  bg.classList.add("lockedSongBg");
  bg.classList.toggle("shardLockedSongBg", isShardLocked);
} else {
  bg.style.backgroundImage = `url('songs/${song.id}/jacket.png')`;
  bg.style.backgroundColor = "";
  bg.classList.remove("lockedSongBg");
}

    const text = document.createElement("div");
    text.classList.add("songItemText");

    const chart = song.info.charts[selectedDifficulty] || song.info.charts[0];
    const chartDifficultyLocked = isBoss3SequenceDifficultyLocked(song.id, selectedDifficulty);
    const diffClass = "diff-" + (chart.difficulty || "basic").toLowerCase();

    // FRACTURE未実装曲自身ではなく、現在の共通難易度から判定する。
    const currentDiffIsFracture = selectedDifficulty === 2;

    const hasFracture = song.info.charts.some(c => c.difficulty.toLowerCase() === "fracture");

    if (currentDiffIsFracture && !hasFracture) {
      text.innerHTML = `
        <div class="songItemTitle">${shouldHideSongInfo ? "???" : song.info.title}
          <span class="songItemLevel songItemLevelPlaceholder" aria-hidden="true">0</span>
        </div>
        <div class="songItemArtist">${shouldHideSongInfo ? "???" : song.info.artist}</div>
      `;
    } else {
      text.innerHTML = `
        <div class="songItemTitle">${shouldHideSongInfo ? "???" : song.info.title}
          <span class="songItemLevel ${diffClass}">${shouldHideSongInfo || chartDifficultyLocked ? "?" : getDisplayedChartLevel(chart.level)}</span>
        </div>
        <div class="songItemArtist">${shouldHideSongInfo ? "???" : song.info.artist}</div>
      `;
    }

    item.appendChild(bg);
    if (isShardLocked) {
      const shardLock = document.createElement("div");
      shardLock.className = "songItemShardLock whiteLockIcon";
      shardLock.setAttribute("aria-hidden", "true");
      item.appendChild(shardLock);
    }

    const lamp = document.createElement("div");
    lamp.classList.add("songItemLamp");

    if (isRandomMapSelection() || (currentDiffIsFracture && !hasFracture)) {
      lamp.style.display = "none";
    } else {
      const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
      const chartIndex = song.info.charts.findIndex(
        c => c.difficulty === (song.info.charts[selectedDifficulty] || song.info.charts[0]).difficulty
      );
      const songSave = saveData[song.id]?.[chartIndex] || {};

      if (songSave.ultimatePerfect) {
        lamp.classList.add("ultimatePerfect");
      } else if (songSave.allPerfect) {
        lamp.classList.add("allPerfect");
      } else if (songSave.fullCombo) {
        lamp.classList.add("fullCombo");
      } else if (songSave.cleared) {
        lamp.classList.add("cleared");
      }
    }

    item.appendChild(lamp);
    item.appendChild(text);
    item.addEventListener("click", () => selectSong(i));
    listEl.appendChild(item);
  }

  if (isRandomMapSelection()) {
    const randomNoticeRow = document.createElement("div");
    randomNoticeRow.className = "songSortRow randomSelectionRow";
    const randomNotice = document.createElement("span");
    randomNotice.className = "songRestrictionNotice";
    randomNotice.textContent = "※ランダム選曲※";
    randomNoticeRow.appendChild(randomNotice);
    listEl.appendChild(randomNoticeRow);
    return;
  }

  const sortRow = document.createElement("div");
  sortRow.className = "songSortRow";

  const sortButton = document.createElement("button");
  sortButton.id = "songSortButton";
  sortButton.type = "button";
  sortButton.innerHTML = `<span class="songSortIcon" aria-hidden="true">⥮</span><span>${songSortLabels[songSortMode]}</span>`;
  sortButton.addEventListener("click", () => {
    const selectedSongId = getVisibleSongs()[selectedSongIndex]?.id;
    songSortMode = (songSortMode + 1) % songSortLabels.length;

    const sortedSongs = getVisibleSongs();
    const sortedIndex = sortedSongs.findIndex(song => song.id === selectedSongId);
    selectedSongIndex = sortedIndex >= 0 ? sortedIndex : 0;
    renderSongList();
    selectSong(selectedSongIndex);
  });
  sortRow.appendChild(sortButton);

  if (mapSelectMode && !hasAllMapSongs()) {
    const restrictionNotice = document.createElement("span");
    restrictionNotice.className = "songRestrictionNotice";
    restrictionNotice.textContent = "※楽曲制限中※";
    sortRow.appendChild(restrictionNotice);
  }

  listEl.appendChild(sortRow);
}

function selectSong(index) {
  selectedSongIndex = index;
  const visibleSongs = getVisibleSongs();
  const song = isRandomMapSelection()
    ? getRandomMapCandidates()[0]
    : visibleSongs[index];
  if (!song) return;
  const bypassSongUnlock = bypassUnlocksForConfiguredRandomSongs();
  const prerequisiteLocked = !bypassSongUnlock && isSongPrerequisiteLocked(song.id);
  const isLocked = !bypassSongUnlock && isSongLocked(song.id);
  const isShardLocked = !bypassSongUnlock && isSongShardLocked(song.id) && !prerequisiteLocked;
  const shouldHideSongInfo =
  isRandomMapSelection() || ((song.id === "boss" || song.id === "boss2" || song.id === "boss3") && prerequisiteLocked);
  if (mapSelectMode) {
    const firstAllowedDifficulty = song.info.charts.findIndex(chart => isMapDifficultyAllowed(song.id, chart.difficulty));
    if (!isMapDifficultyAllowed(song.id, song.info.charts[selectedDifficulty]?.difficulty)) {
      selectedDifficulty = firstAllowedDifficulty >= 0 ? firstAllowedDifficulty : 0;
    }
  }
  if (selectedDifficulty >= song.info.charts.length) {
    selectedDifficulty = song.info.charts.length - 1;
  }
  const currentChart = song.info.charts[selectedDifficulty] || song.info.charts[0];
  const challengeDifficultyLocked =
    isBoss3SequenceDifficultyLocked(song.id, selectedDifficulty);
updateDifficultyColorPlate(currentChart);

  const items = document.querySelectorAll(".songItem");
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === index);
  });

  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");

  //ジャケット
if (shouldHideSongInfo) {
  document.getElementById("jacketImage").src = "assets/black.png";
  document.getElementById("jacketArea").classList.add("lockedJacket");
  document.getElementById("jacketArea").classList.remove("shardLockedJacket");
  document.getElementById("userOffsetArea").style.display = "none";
} else {
  document.getElementById("jacketImage").src = `songs/${song.id}/jacket.png`;
  document.getElementById("jacketArea").classList.toggle("shardLockedJacket", isShardLocked);

  if (isLocked) {
    document.getElementById("jacketArea").classList.add("lockedJacket");
    document.getElementById("userOffsetArea").style.display = "none";
  } else {
    document.getElementById("jacketArea").classList.remove("lockedJacket");
    document.getElementById("userOffsetArea").style.display = "flex";
    updateOffsetUI(song.id);
  }
}

//曲名＋アーティスト
document.getElementById("detailTitle").textContent =
  shouldHideSongInfo ? "???" : song.info.title;

document.getElementById("detailArtist").textContent =
  shouldHideSongInfo ? "???" : song.info.artist;

document.getElementById("detailBestScore").style.visibility =
  isRandomMapSelection() ? "hidden" : "visible";

// 難易度ボタンとスタートボタンの表示切り替え
const difficultyButtons = document.getElementById("difficultyButtons");
const startButton = document.getElementById("startButton");
const unlockSongButton = document.getElementById("unlockSongButton");
let unlockText = document.getElementById("unlockText");

if (!unlockText) {
  unlockText = document.createElement("div");
  unlockText.id = "unlockText";
  startButton.parentNode.insertBefore(unlockText, startButton);
}
unlockText.classList.remove("challengePrompt");

startButton.classList.remove("quickReveal");
unlockSongButton.classList.remove("unlocking");

if (prerequisiteLocked) {
  difficultyButtons.style.visibility = "hidden";
  startButton.style.visibility = "hidden";
  unlockSongButton.style.display = "none";

  // displayは消さない。場所を残すため。
  difficultyButtons.style.display = "flex";
  startButton.style.display = "block";

  unlockText.textContent = getSongUnlockMessage(song.id);
  unlockText.style.display = "block";
} else if (challengeDifficultyLocked) {
  difficultyButtons.style.visibility = "visible";
  difficultyButtons.style.display = "flex";
  startButton.style.visibility = "hidden";
  startButton.style.display = "block";
  unlockSongButton.style.display = "none";
  unlockText.textContent = "3-12から挑戦せよ";
  unlockText.classList.add("challengePrompt");
  unlockText.style.display = "block";
} else if (isShardLocked) {
  difficultyButtons.style.visibility = "visible";
  difficultyButtons.style.display = "flex";
  startButton.style.visibility = "hidden";
  startButton.style.display = "block";
  unlockSongButton.style.display = "flex";
  const shardCost = getSongShardUnlockCost(song.id);
  const shardShortage = getTotalShards() < shardCost;
  unlockSongButton.disabled = shardShortage;
  unlockSongButton.classList.remove("shardShortage");
  unlockSongButton.innerHTML =
    `<span>UNLOCK</span><span class="unlockShardIcon"></span><span id="unlockSongCost">${shardCost}</span>`;
  unlockText.style.display = "none";
} else {
  difficultyButtons.style.visibility = "visible";
  startButton.style.visibility = "visible";
  unlockSongButton.style.display = "none";
  unlockSongButton.classList.remove("shardShortage");

  difficultyButtons.style.display = "flex";
  startButton.style.display = "block";

  unlockText.style.display = "none";
}

  // 難易度ボタン
  renderDifficultyButtons(song);

  // 自己ベスト
  updateBestScore(song.id);

  renderSongList();

  saveLastSelection();

  // プレビュー再生
const shouldBlockPreview =
  isRandomMapSelection() || ((song.id === "boss" || song.id === "boss2" || song.id === "boss3") && isLocked);

// Keep the current playback position when the same song is selected again.
if (previewSongId !== song.id) {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }
  previewSongId = null;
}

if (!shouldBlockPreview && !previewAudio) {
  previewAudio = new Audio(`songs/${song.id}/music.wav`);
  previewSongId = song.id;
  previewAudio.loop = true;
  previewAudio.volume = 0.5;
  previewAudio.play().catch(e => console.log("preview play failed:", e));
}
}

function renderDifficultyButtons(song) {
  const area = document.getElementById("difficultyButtons");
  area.innerHTML = "";

  song.info.charts.forEach((chart, i) => {
    if (!isMapDifficultyAllowed(song.id, chart.difficulty)) return;
    const btn = document.createElement("button");
    btn.classList.add("diffBtn");
    btn.classList.add("diff-" + chart.difficulty.toLowerCase());
    const challengeDifficultyLocked = isBoss3SequenceDifficultyLocked(song.id, i);
    btn.classList.toggle("challengeLocked", challengeDifficultyLocked);

    if (i === selectedDifficulty) {
      btn.classList.add("selected");
    }

    btn.innerHTML = `
      <div class="diffFrame">
        <div class="diffBar"></div>
        <div class="diffName">${chart.difficulty}</div>
      </div>
      <div class="diffLevel">${isRandomMapSelection() || challengeDifficultyLocked ? "?" : getDisplayedChartLevel(chart.level)}</div>
    `;

    btn.addEventListener("click", () => {
      const selectedSongId = getVisibleSongs()[selectedSongIndex]?.id;
      selectedDifficulty = i;

      document.querySelectorAll(".diffBtn").forEach((b, j) => {
        b.classList.toggle("selected", j === i);
      });

      updateDifficultyColorPlate(chart);

      const sortedSongs = getVisibleSongs();
      const sortedIndex = sortedSongs.findIndex(song => song.id === selectedSongId);
      selectedSongIndex = sortedIndex >= 0 ? sortedIndex : 0;

      updateBestScore(selectedSongId);
      renderSongList();
      selectSong(selectedSongIndex);
      saveLastSelection(); 
    });

    area.appendChild(btn);
  });
}

function getDifficultyColor(chart) {
  const difficulty = chart.difficulty.toLowerCase();

  if (difficulty === "basic") return "cyan";
  if (difficulty === "expert") return "#ff4444";
  if (difficulty === "fracture") return "#ffb7ff";

  return "white";
}

function updateDifficultyColorPlate(chart) {
  const plate = document.getElementById("difficultyColorPlate");
  if (!plate || !chart) return;

  const color = getDifficultyColor(chart);

  plate.style.backgroundColor = color;
}

function updateBestScore(songId) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const songData = saveData[songId]?.[selectedDifficulty] || {};

  const rankEl = document.getElementById("detailRank");
  const bestEl = document.getElementById("detailBest");

  const rank = songData.bestRank || "-";
  rankEl.textContent = rank;

  // ランクの色付け
  rankEl.style.background = "";
  rankEl.style.webkitBackgroundClip = "";
  rankEl.style.webkitTextFillColor = "";
  rankEl.style.color = "";

  if (rank === "SS") {
    rankEl.style.background = "linear-gradient(90deg, #FF0000, #FF7700, #FFFF00, #00FF00, #0000FF, #8B00FF)";
    rankEl.style.webkitBackgroundClip = "text";
    rankEl.style.webkitTextFillColor = "transparent";
  } else if (rank === "S" || rank === "S+" || rank === "S++") {
    rankEl.style.color = "#FFD700";
  } else if (rank === "A" || rank === "A+") {
    rankEl.style.color = "#FF4444";
  } else if (rank === "B" || rank === "B+") {
    rankEl.style.color = "#66BBFF";
  } else if (rank === "C" || rank === "D") {
    rankEl.style.color = "#4488AA";
  } else if (rank === "F") {
    rankEl.style.color = "#888888";
  } else {
    rankEl.style.color = "cyan";
  }

  bestEl.textContent = "BEST : " + (songData.bestScore || 0).toString().padStart(7, "0");
}

document.getElementById("startButton").addEventListener("click", async () => {
  if (puzzleStartCommitted) return;

   if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
    previewSongId = null;
  }
  const randomCandidates = isRandomMapSelection()
    ? getRandomMapCandidates(selectedDifficulty)
    : [];
  const song = isRandomMapSelection()
    ? randomCandidates[Math.floor(Math.random() * randomCandidates.length)]
    : getVisibleSongs()[selectedSongIndex];
  if (!song) return;
  if (song.id === "boss3" && isSongLocked(song.id)) return;
  if (isBoss3SequenceDifficultyLocked(song.id, selectedDifficulty)) return;

  if (mapSelectMode) {
    if (!window.MapStamina?.consume()) {
      location.href = `unlock-map.html?map=${encodeURIComponent(selectedMapId)}`;
      return;
    }
    puzzleStartCommitted = true;
    document.getElementById("startButton").disabled = true;
  }

  const se = new Audio("sounds/startsound.mp3");
  se.volume = 0.8;
  se.play();

  const userOffset = loadUserOffset(song.id);
  const noteSpeed = Number(loadSettings().speed);
  const instantTitleConditions = [];
  if (noteSpeed === 1) instantTitleConditions.push("playSpeed:1");
  if (noteSpeed === 20) instantTitleConditions.push("playSpeed:20");
  if (Math.abs(userOffset) === 99) instantTitleConditions.push("playOffset:99");
  for (const condition of instantTitleConditions) {
    await unlockSpecialTitleFromSelect(condition);
  }

  const overlay = document.getElementById("jacketOverlay");
  const blackOverlay = document.getElementById("blackOverlay");

  overlay.style.backgroundImage = `url('songs/${song.id}/jacket.png')`;

  // ジャケット表示＆背景暗転を同時に開始
  overlay.classList.add("active");
  blackOverlay.classList.add("dark");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add("expand");
    });
  });

  setTimeout(() => {
    const mapQuery = mapSelectMode
      ? `&mode=map&map=${encodeURIComponent(selectedMapId)}&piece=${encodeURIComponent(selectedMapPieceId)}`
      : "";
    location.href = `game.html?song=${song.id}&difficulty=${selectedDifficulty}&userOffset=${userOffset}${mapQuery}`;
  }, 700);
});

loadSongList().catch(error => {
  console.error("Failed to load the select screen:", error);
  hideAssetLoadingScreen();
});

// ---- 設定 ----
const DEFAULT_SPEED = 10;
const DEFAULT_KEY_LAYOUT = "default";
const DEFAULT_SELECT_BACKGROUND = "select_bg";
const SELECT_BACKGROUND_OPTIONS = {
  select_bg: {
    name: "DEFAULT",
    path: "assets/bg/select_bg.jpg"
  }
};

function migrateSelectBackgroundFileNames() {
  const currentSaveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  let changed = false;
  if (currentSaveData.unlockedSelectBackgrounds?.["map1_bg.jpg"] === true) {
    currentSaveData.unlockedSelectBackgrounds["map1_bg.png"] = true;
    delete currentSaveData.unlockedSelectBackgrounds["map1_bg.jpg"];
    changed = true;
  }
  if (currentSaveData.settings?.selectBackground === "reward:map1_bg.jpg") {
    currentSaveData.settings.selectBackground = "reward:map1_bg.png";
    changed = true;
  }
  if (changed) localStorage.setItem("rhythmGame", JSON.stringify(currentSaveData));
}

function registerUnlockedSelectBackgrounds() {
  const currentSaveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  for (const [file, unlocked] of Object.entries(currentSaveData.unlockedSelectBackgrounds || {})) {
    if (unlocked !== true || !file || /[\\/]/.test(file)) continue;
    const id = `reward:${file}`;
    SELECT_BACKGROUND_OPTIONS[id] = {
      name: file.replace(/\.[^.]+$/, "").toUpperCase(),
      path: `assets/bg/${file}`
    };
  }
}

async function loadSelectBackgroundNames() {
  try {
    const response = await fetch("assets/bg/info.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    for (const background of data.backgrounds || []) {
      const option = SELECT_BACKGROUND_OPTIONS[`reward:${background?.file}`];
      if (option && String(background?.name || "").trim()) option.name = String(background.name).trim();
    }
  } catch (error) {
    console.warn("背景名の読み込みに失敗しました。", error);
  }
}

migrateSelectBackgroundFileNames();
registerUnlockedSelectBackgrounds();
const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
const secretBossUnlocked = saveData.secretBossUnlocked === true;

function loadSettings() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const settings = saveData.settings || {};
  return {
    speed: settings.speed || DEFAULT_SPEED,
    keyLayout: settings.keyLayout || DEFAULT_KEY_LAYOUT,
    selectBackground: SELECT_BACKGROUND_OPTIONS[settings.selectBackground]
      ? settings.selectBackground
      : DEFAULT_SELECT_BACKGROUND,
    sfx: settings.sfx !== false // デフォルトはON
  };
}

function saveSettings(settings) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  saveData.settings = settings;
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
}

// 設定を画面に反映
function applySettingsToUI(settings) {
  document.getElementById("speedInput").value = settings.speed;

  document.querySelectorAll(".keyLayoutBtn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.layout === settings.keyLayout);
  });

  const backgroundIds = Object.keys(SELECT_BACKGROUND_OPTIONS);
  const backgroundIndex = Math.max(0, backgroundIds.indexOf(settings.selectBackground));
  const background = SELECT_BACKGROUND_OPTIONS[backgroundIds[backgroundIndex]];
  document.getElementById("backgroundPreview").style.backgroundImage = `url("${background.path}")`;
  document.getElementById("backgroundOptionName").textContent = background.name;
  document.getElementById("backgroundPrev").disabled = backgroundIndex <= 0;
  document.getElementById("backgroundNext").disabled = backgroundIndex >= backgroundIds.length - 1;
}

function applySelectBackground(backgroundId) {
  const background = SELECT_BACKGROUND_OPTIONS[backgroundId]
    || SELECT_BACKGROUND_OPTIONS[DEFAULT_SELECT_BACKGROUND];
  document.getElementById("selectScreen").style.backgroundImage = `url("${background.path}")`;
}

applySelectBackground(loadSettings().selectBackground);

// 設定ポップアップの開閉
document.getElementById("settingsButton").addEventListener("click", () => {
  const settings = loadSettings();
  applySettingsToUI(settings);
  document.getElementById("settingsOverlay").classList.add("visible");
  document.getElementById("settingsPopup").classList.add("visible");
});

document.getElementById("settingsOverlay").addEventListener("click", () => {
  document.getElementById("settingsOverlay").classList.remove("visible");
  document.getElementById("settingsPopup").classList.remove("visible");
});

document.getElementById("settingsClose").addEventListener("click", () => {
  document.getElementById("settingsOverlay").classList.remove("visible");
  document.getElementById("settingsPopup").classList.remove("visible");
});

// 速度の+/-ボタン
document.getElementById("speedMinus").addEventListener("click", () => {
  const input = document.getElementById("speedInput");
  const val = Math.max(1, Math.round((Number(input.value) - 0.5) * 2) / 2);
  input.value = val;
  const settings = loadSettings();
  settings.speed = val;
  saveSettings(settings);
});

document.getElementById("speedPlus").addEventListener("click", () => {
  const input = document.getElementById("speedInput");
  const val = Math.min(20, Math.round((Number(input.value) + 0.5) * 2) / 2);
  input.value = val;
  const settings = loadSettings();
  settings.speed = val;
  saveSettings(settings);
});

// 速度の直接入力
document.getElementById("speedInput").addEventListener("change", () => {
  const input = document.getElementById("speedInput");
  let val = Number(input.value);
  val = Math.min(20, Math.max(1, Math.round(val * 10) / 10));
  input.value = val;
  const settings = loadSettings();
  settings.speed = val;
  saveSettings(settings);
});

// キー配置ボタン
document.querySelectorAll(".keyLayoutBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".keyLayoutBtn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    const settings = loadSettings();
    settings.keyLayout = btn.dataset.layout;
    saveSettings(settings);
  });
});

//初回アクセス
if (!saveData.profile || !saveData.profile.username || !saveData.profile.tutorialDone) {
  location.href = "onboarding.html";
}

//パートナー追加したら書き足す
const partners = {
  breaka: {name: "ブレイカ",
    icon: "images/partners/breaka_icon.png",
    full: "images/partners/breaka_full.png",
    iconScale: 1.0,
    fullScale: 1.1, 
    expTable: [
      100, 120, 150, 180, 220,
      270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170,
      1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120,
      3370, 3630, 3900, 4180
    ] ,
      skill: {
    type: "timedHeal",
    count: 2,
    amount: 500,
    name: "ヒールソング",
    description: "楽曲中に2回、ライフを300回復する"
  }
  },
  canon: {name: "カノン",
    icon: "images/partners/canon_icon.png",
    full: "images/partners/canon_full.png",
    eventFull: "images/partners/canon_event.png",
    iconScale: 0.80,
    fullScale:0.9,
    expTable: [100, 120, 150,180, 220,
      270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170,
      1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120,
      3370, 3630, 3900, 4180 ],
     skill: null 
  },
   katy: {name: "ケイティ",
    icon: "images/partners/katy_icon.png",
    full: "images/partners/katy_full.png",
    iconScale: 0.82,
    fullScale:1.05,
    expTable: [100, 120, 150,180, 220,
      270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170,
      1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120,
      3370, 3630, 3900, 4180 ],
     skill: {
  type: "judgementRecovery",
  minJudge: "perfect",
  amount: 1,
  name: "Keep Going!",
  description: "Perfectを出すたびにライフをわずかに回復"
}
  },
    isabel: {name: "イザベル",
    icon: "images/partners/isabel_icon.png",
    full: "images/partners/isabel_full.png",
    iconScale: 1.0,
    fullScale:1.0,
    expTable: [100, 120, 150,180, 220,
      270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170,
      1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120,
      3370, 3630, 3900, 4180 ],
       skill: {
    type: "mirrorChart",
    name: "鏡写しの音色",
    description: "譜面の配置を左右反転する"
  },
  }
  
};

function getSaveData() {
  return JSON.parse(localStorage.getItem("rhythmGame") || "{}");
}

function setSaveData(saveData) {
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
}

function isPartnerSkillEnabled() {
  const saveData = getSaveData();
  return saveData.settings?.partnerSkillEnabled !== false;
}

function setPartnerSkillEnabled(enabled) {
  const saveData = getSaveData();

  if (!saveData.settings) {
    saveData.settings = {};
  }

  saveData.settings.partnerSkillEnabled = enabled;
  setSaveData(saveData);
}

function applyRateColor(element, rate) {
  if (!element) return;

  const value = Number(rate || 0);
  element.style.background = "";
  element.style.backgroundClip = "";
  element.style.webkitBackgroundClip = "";
  element.style.webkitTextFillColor = "";
  element.style.textShadow = "";
  element.style.fontWeight = "";
  element.style.letterSpacing = "";

  if (value >= 250) {
    element.style.background = "linear-gradient(90deg, #7DF9FF, #FFFFFF, #FF8EDB)";
    element.style.backgroundClip = "text";
    element.style.webkitBackgroundClip = "text";
    element.style.webkitTextFillColor = "transparent";
    element.style.color = "transparent";
    return;
  }

  const color = value >= 225 ? "#FF8EDB"
    : value >= 200 ? "#FF4F3D"
    : value >= 150 ? "#FFD84A"
    : value >= 100 ? "#B875FF"
    : value >= 60 ? "#55DFFF"
    : value >= 30 ? "#5EE68A"
    : value >= 10 ? "#CD8A5A"
    : "#A0A7B4";

  element.style.color = color;
}

function applyRateRankMark(element, rate, username) {
  if (!element) return;

  const value = Number(rate || 0);
  element.classList.remove("rateMarkRed", "rateMarkPink", "rateMarkPurple", "rateMarkDeveloper");

  if (["ガラスニキ", "がらすにき", "glassniki"].includes(username)) {
    element.classList.add("rateMarkDeveloper");
    return;
  }

  if (value >= 250) element.classList.add("rateMarkPurple");
  else if (value >= 225) element.classList.add("rateMarkPink");
  else if (value >= 200) element.classList.add("rateMarkRed");
}

const DEFAULT_PROFILE_TITLE = {
  id: "default:new-player",
  name: "新米プレイヤー",
  background: "yellow",
  category: "rate",
  acquisitionText: "最初から所持"
};
const PROFILE_TITLE_BACKGROUNDS = ["green", "yellow", "blue", "purple", "red"];
const TITLE_ACQUISITION_LABELS = {
  play: "プレイ",
  clear: "クリア",
  fc: "FULL COMBO",
  ap: "ALL PERFECT",
  up: "ULTIMATE PERFECT"
};

function normalizeProfileTitleBackground(background) {
  return PROFILE_TITLE_BACKGROUNDS.includes(background) ? background : "yellow";
}

function applyProfileTitleAppearance(element, background) {
  if (!element) return;
  for (const color of PROFILE_TITLE_BACKGROUNDS) {
    element.classList.remove(`titleBackground-${color}`);
  }
  element.classList.add(`titleBackground-${normalizeProfileTitleBackground(background)}`);
}

function setProfileTitleText(element, text) {
  if (!element) return;
  const span = document.createElement("span");
  span.className = "profileTitleMarqueeText";
  span.textContent = text;
  element.replaceChildren(span);
  element.classList.remove("profileTitleMarqueeActive");
  element.style.removeProperty("--profile-title-scroll-distance");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const style = getComputedStyle(element);
      const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const availableWidth = Math.max(0, element.clientWidth - horizontalPadding);
      const distance = Math.ceil(span.scrollWidth - availableWidth);
      if (distance <= 1) return;
      element.style.setProperty("--profile-title-scroll-distance", `${distance}px`);
      element.classList.add("profileTitleMarqueeActive");
    });
  });
}

function getUnlockedProfileTitles(currentSaveData) {
  const titles = [DEFAULT_PROFILE_TITLE];
  for (const [id, title] of Object.entries(currentSaveData.unlockedTitles || {})) {
    if (!title || typeof title !== "object" || !String(title.name || "").trim()) continue;
    titles.push({
      id,
      name: String(title.name).trim(),
      background: normalizeProfileTitleBackground(title.background),
      category: title.category || "songRecord",
      songId: title.songId || "",
      difficulties: Array.isArray(title.difficulties)
        ? title.difficulties
        : title.difficulty
          ? [title.difficulty]
          : [],
      condition: title.condition || "",
      acquisitionText: title.acquisitionText || "",
      unlockedAt: Number(title.unlockedAt || 0)
    });
  }
  return titles;
}

const waitForTitleUnlockToast = duration => new Promise(resolve => setTimeout(resolve, duration));
let titleUnlockToastQueue = Promise.resolve();

function queueTitleUnlockToast(title, initialDelay = 0) {
  titleUnlockToastQueue = titleUnlockToastQueue.then(async () => {
    const toast = document.getElementById("titleUnlockToast");
    const badge = document.getElementById("titleUnlockToastBadge");
    if (initialDelay > 0) await waitForTitleUnlockToast(initialDelay);
    setProfileTitleText(badge, title.name);
    applyProfileTitleAppearance(badge, title.background);
    toast.setAttribute("aria-hidden", "false");
    toast.classList.add("visible");
    await waitForTitleUnlockToast(3600);
    toast.classList.remove("visible");
    toast.setAttribute("aria-hidden", "true");
    await waitForTitleUnlockToast(650);
  });
  return titleUnlockToastQueue;
}

async function showPendingTitleUnlockToasts() {
  const currentSaveData = getSaveData();
  const viewedTitles = currentSaveData.viewedTitles || {};
  if (!currentSaveData.notifiedTitles || typeof currentSaveData.notifiedTitles !== "object" || Array.isArray(currentSaveData.notifiedTitles)) {
    currentSaveData.notifiedTitles = {};
  }

  let notificationStateChanged = false;
  for (const [id, title] of Object.entries(currentSaveData.unlockedTitles || {})) {
    if (title?.category !== "map" || currentSaveData.notifiedTitles[id] === true) continue;
    currentSaveData.notifiedTitles[id] = true;
    notificationStateChanged = true;
  }

  const pendingTitles = getUnlockedProfileTitles(currentSaveData)
    .filter(title =>
      title.id !== DEFAULT_PROFILE_TITLE.id &&
      title.category !== "map" &&
      viewedTitles[title.id] !== true &&
      currentSaveData.notifiedTitles[title.id] !== true
    )
    .sort((a, b) => a.unlockedAt - b.unlockedAt);
  if (pendingTitles.length === 0) {
    if (notificationStateChanged) setSaveData(currentSaveData);
    return;
  }

  for (const title of pendingTitles) {
    currentSaveData.notifiedTitles[title.id] = true;
  }
  setSaveData(currentSaveData);

  pendingTitles.forEach((title, index) => queueTitleUnlockToast(title, index === 0 ? 500 : 0));
}

function getProfileTitleAcquisitionText(title) {
  if (title.acquisitionText) return title.acquisitionText;

  if (title.category === "songRecord") {
    const song = songList.find(entry => entry.id === title.songId);
    const songName = song?.info?.title || title.songId || "楽曲";
    const difficulties = title.difficulties.length > 0
      ? title.difficulties.join(" / ")
      : "指定難易度";
    const condition = TITLE_ACQUISITION_LABELS[title.condition] || title.condition || "条件達成";
    return `${songName}：${difficulties}で${condition}`;
  }

  return "獲得条件を達成";
}

async function syncEarnedProfileTitles() {
  try {
    const response = await fetch("titles.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const definitions = await response.json();
    const currentSaveData = getSaveData();
    const currentRate = Number(currentSaveData.profile?.rate || 0);
    if (!currentSaveData.unlockedTitles || typeof currentSaveData.unlockedTitles !== "object" || Array.isArray(currentSaveData.unlockedTitles)) {
      currentSaveData.unlockedTitles = {};
    }

    let changed = false;
    const definedRateTitleIds = new Set((definitions.rateTitles || []).map(title => String(title?.id || "").trim()).filter(Boolean));
    const definedRecordTitleIds = new Set((definitions.recordTitles || []).map(title => String(title?.id || "").trim()).filter(Boolean));
    const definedMapTitleIds = new Set((definitions.mapTitles || []).map(title => String(title?.id || "").trim()).filter(Boolean));
    const definedStoryTitleIds = new Set((definitions.storyTitles || []).map(title => String(title?.id || "").trim()).filter(Boolean));
    const definedSpecialTitleIds = new Set((definitions.specialTitles || []).map(title => String(title?.id || "").trim()).filter(Boolean));
    const definedSongTitleIds = new Set();
    const syncUnlockedTitle = (id, titleData, legacyId = "") => {
      const existingId = currentSaveData.unlockedTitles[id] ? id : legacyId;
      const existingTitle = existingId ? currentSaveData.unlockedTitles[existingId] : null;
      if (!existingTitle) return;

      const previousName = existingTitle.name || "";
      const updatedTitle = {
        ...existingTitle,
        ...titleData,
        unlockedAt: Number(existingTitle.unlockedAt || Date.now())
      };
      if (existingId !== id) {
        delete currentSaveData.unlockedTitles[existingId];
        if (currentSaveData.viewedTitles?.[existingId] === true) {
          currentSaveData.viewedTitles[id] = true;
          delete currentSaveData.viewedTitles[existingId];
        }
        if (currentSaveData.notifiedTitles?.[existingId] === true) {
          currentSaveData.notifiedTitles[id] = true;
          delete currentSaveData.notifiedTitles[existingId];
        }
      }
      if (existingId !== id || JSON.stringify(existingTitle) !== JSON.stringify(updatedTitle)) {
        currentSaveData.unlockedTitles[id] = updatedTitle;
        if (currentSaveData.profile?.titleId === existingId || currentSaveData.profile?.title === previousName) {
          currentSaveData.profile.titleId = id;
          currentSaveData.profile.title = updatedTitle.name;
          currentSaveData.profile.titleBackground = updatedTitle.background;
        }
        changed = true;
      }
    };

    for (const definition of definitions.rateTitles || []) {
      const id = String(definition?.id || "").trim();
      const name = String(definition?.name || "").trim();
      const requiredRate = Number(definition?.requiredRate);
      if (!id || !name || !Number.isFinite(requiredRate)) continue;
      if (requiredRate <= 0) {
        const previousName = DEFAULT_PROFILE_TITLE.name;
        DEFAULT_PROFILE_TITLE.id = id;
        DEFAULT_PROFILE_TITLE.name = name;
        DEFAULT_PROFILE_TITLE.background = definition.background || "yellow";
        DEFAULT_PROFILE_TITLE.acquisitionText = definition.acquisitionText || "最初から所持";
        if (currentSaveData.profile?.titleId === id || currentSaveData.profile?.title === previousName) {
          if (currentSaveData.profile.title !== name || currentSaveData.profile.titleBackground !== DEFAULT_PROFILE_TITLE.background) {
            currentSaveData.profile.titleId = id;
            currentSaveData.profile.title = name;
            currentSaveData.profile.titleBackground = DEFAULT_PROFILE_TITLE.background;
            changed = true;
          }
        }
        continue;
      }
      if (currentRate < requiredRate) continue;

      if (!currentSaveData.unlockedTitles[id]) {
        currentSaveData.unlockedTitles[id] = { unlockedAt: Date.now() };
      }
      syncUnlockedTitle(id, {
        name,
        category: "rate",
        background: definition.background || "yellow",
        requiredRate,
        acquisitionText: definition.acquisitionText || `RATE ${requiredRate.toFixed(1)}以上に到達`
      });
    }

    for (const definition of definitions.storyTitles || []) {
      const id = String(definition?.id || "").trim();
      const name = String(definition?.name || "").trim();
      const storyId = String(definition?.storyId || "").trim();
      if (!id || !name || !storyId) continue;
      if (currentSaveData.storyRead?.[storyId] !== true) continue;

      if (!currentSaveData.unlockedTitles[id]) {
        currentSaveData.unlockedTitles[id] = { unlockedAt: Date.now() };
      }
      syncUnlockedTitle(id, {
        name,
        category: "story",
        background: definition.background || "green",
        storyId,
        acquisitionText: definition.acquisitionText || `${storyId}を読了`
      });
    }

    for (const definition of definitions.recordTitles || []) {
      const id = String(definition?.id || "").trim();
      const name = String(definition?.name || "").trim();
      const condition = String(definition?.condition || "").trim();
      if (!id || !name || !condition) continue;

      const alreadyAchieved = condition === "anyUltimatePerfect" && songList.some(song =>
        (song.info?.charts || []).some((chart, difficultyIndex) =>
          currentSaveData[song.id]?.[difficultyIndex]?.ultimatePerfect === true
        )
      );
      if (!currentSaveData.unlockedTitles[id] && !alreadyAchieved) continue;
      if (!currentSaveData.unlockedTitles[id]) {
        currentSaveData.unlockedTitles[id] = { unlockedAt: Date.now() };
      }
      syncUnlockedTitle(id, {
        name,
        category: "record",
        background: definition.background || "green",
        condition,
        acquisitionText: definition.acquisitionText || "プレイ実績条件を達成"
      });
    }

    for (const definition of definitions.mapTitles || []) {
      const id = String(definition?.id || "").trim();
      if (!id || !currentSaveData.unlockedTitles[id]) continue;
      const existingTitle = currentSaveData.unlockedTitles[id];
      syncUnlockedTitle(id, {
        name: String(definition.name || "").trim(),
        category: "map",
        background: definition.background || "blue",
        mapId: existingTitle.mapId || "",
        requiredPercent: Number(existingTitle.requiredPercent || 0),
        acquisitionText: definition.acquisitionText || existingTitle.acquisitionText || "マップ完成度報酬"
      });
    }

    for (const definition of definitions.specialTitles || []) {
      const id = String(definition?.id || "").trim();
      if (!id || !currentSaveData.unlockedTitles[id]) continue;
      syncUnlockedTitle(id, {
        name: String(definition.name || "").trim(),
        category: "special",
        background: definition.background || "purple",
        condition: definition.condition || "",
        acquisitionText: definition.acquisitionText || "特殊条件を達成"
      });
    }

    for (const song of songList) {
      const songTitles = Array.isArray(song.info?.achievementTitles) ? song.info.achievementTitles : [];
      songTitles.forEach((definition, index) => {
        const definitionId = String(definition.id || `achievement-${index + 1}`).trim();
        const name = String(definition.name || "").trim();
        const condition = String(definition.condition || "").toLowerCase();
        const difficulties = (Array.isArray(definition.difficulty) ? definition.difficulty : [definition.difficulty])
          .map(value => String(value || "").trim().toUpperCase())
          .filter(Boolean);
        if (!definitionId || !name || !condition || difficulties.length === 0) return;

        const id = `song:${song.id}:${definitionId}`;
        definedSongTitleIds.add(id);
        const difficultyKey = [...new Set(difficulties.map(value => value.toLowerCase()))].sort().join("+");
        const legacyEntry = Object.entries(currentSaveData.unlockedTitles).find(([legacyId, title]) =>
          legacyId !== id &&
          title?.category === "songRecord" &&
          title?.songId === song.id &&
          title?.condition === condition &&
          [...new Set((title.difficulties || []).map(value => String(value).toLowerCase()))].sort().join("+") === difficultyKey
        );
        const alreadyAchieved = (song.info.charts || []).some((chart, difficultyIndex) => {
          if (!difficulties.includes(String(chart.difficulty || "").toUpperCase())) return false;
          const record = currentSaveData[song.id]?.[difficultyIndex] || {};
          const ultimatePerfect = record.ultimatePerfect === true;
          const allPerfect = record.allPerfect === true || ultimatePerfect;
          const fullCombo = record.fullCombo === true || allPerfect;
          const cleared = record.cleared === true || fullCombo;
          const played = record.played === true || Number(record.bestScore || 0) > 0;
          if (condition === "play") return played;
          if (condition === "clear") return cleared;
          if (condition === "fc") return fullCombo;
          if (condition === "ap") return allPerfect;
          if (condition === "up") return ultimatePerfect;
          return false;
        });
        if (!currentSaveData.unlockedTitles[id] && !legacyEntry && !alreadyAchieved) return;
        if (!currentSaveData.unlockedTitles[id] && !legacyEntry) {
          currentSaveData.unlockedTitles[id] = { unlockedAt: Date.now() };
        }

        syncUnlockedTitle(id, {
          name,
          category: "songRecord",
          background: definition.background || "red",
          songId: song.id,
          difficulties,
          condition,
          acquisitionText: String(definition.acquisitionText || "").trim()
        }, legacyEntry?.[0] || "");
      });
    }

    for (const [id, title] of Object.entries(currentSaveData.unlockedTitles)) {
      const category = title?.category;
      const deletedFromDefinitions =
        (category === "rate" && !definedRateTitleIds.has(id)) ||
        (category === "record" && !definedRecordTitleIds.has(id)) ||
        (category === "map" && !definedMapTitleIds.has(id)) ||
        (category === "story" && !definedStoryTitleIds.has(id)) ||
        (category === "special" && !definedSpecialTitleIds.has(id)) ||
        (category === "songRecord" && songList.length > 0 && !definedSongTitleIds.has(id));
      if (!deletedFromDefinitions) continue;

      delete currentSaveData.unlockedTitles[id];
      if (currentSaveData.viewedTitles) delete currentSaveData.viewedTitles[id];
      if (currentSaveData.notifiedTitles) delete currentSaveData.notifiedTitles[id];
      if (currentSaveData.profile?.titleId === id || currentSaveData.profile?.title === title?.name) {
        currentSaveData.profile.titleId = DEFAULT_PROFILE_TITLE.id;
        currentSaveData.profile.title = DEFAULT_PROFILE_TITLE.name;
        currentSaveData.profile.titleBackground = DEFAULT_PROFILE_TITLE.background;
      }
      changed = true;
    }

    if (changed) {
      setSaveData(currentSaveData);
      loadProfilePanel();
      renderProfileTitles();
    }
  } catch (error) {
    console.error("称号の同期に失敗しました。", error);
  }
}

async function unlockSpecialTitleFromSelect(condition) {
  try {
    const response = await fetch("titles.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const definitions = await response.json();
    const definition = (definitions.specialTitles || []).find(title => title?.condition === condition);
    if (!definition) return;

    const currentSaveData = getSaveData();
    if (!currentSaveData.unlockedTitles || typeof currentSaveData.unlockedTitles !== "object" || Array.isArray(currentSaveData.unlockedTitles)) {
      currentSaveData.unlockedTitles = {};
    }
    if (currentSaveData.unlockedTitles[definition.id]) return;

    const unlockedTitle = {
      id: definition.id,
      name: definition.name,
      category: "special",
      background: definition.background || "purple",
      condition,
      acquisitionText: definition.acquisitionText || "特殊条件を達成",
      unlockedAt: Date.now()
    };
    currentSaveData.unlockedTitles[definition.id] = unlockedTitle;
    if (!currentSaveData.notifiedTitles || typeof currentSaveData.notifiedTitles !== "object" || Array.isArray(currentSaveData.notifiedTitles)) {
      currentSaveData.notifiedTitles = {};
    }
    currentSaveData.notifiedTitles[definition.id] = true;
    setSaveData(currentSaveData);
    queueTitleUnlockToast(unlockedTitle);
  } catch (error) {
    console.error("特殊称号の獲得処理に失敗しました。", error);
  }
}

function loadProfilePanel() {
const saveData = getSaveData();

if (!saveData.profile) {
  saveData.profile = {};
}

if (!saveData.profile.partner) {
  saveData.profile.partner = "breaka";
  setSaveData(saveData);
}

if (!saveData.profile.title) {
  saveData.profile.title = DEFAULT_PROFILE_TITLE.name;
  saveData.profile.titleId = DEFAULT_PROFILE_TITLE.id;
  saveData.profile.titleBackground = DEFAULT_PROFILE_TITLE.background;
  setSaveData(saveData);
}

const profile = saveData.profile;
const partnerId = profile.partner || "breaka"; // ← 追加
const partner = partners[partnerId] || partners.breaka;

const profileNameEl = document.getElementById("profileName");
profileNameEl.textContent = profile.username || "Player";
applyRateRankMark(profileNameEl, profile.rate, profile.username);
const profileRateEl = document.getElementById("profileRate");
profileRateEl.textContent = "RATE " + Number(profile.rate || 0).toFixed(1);
applyRateColor(profileRateEl, profile.rate);
const profileTitleEl = document.getElementById("profileTitle");
setProfileTitleText(profileTitleEl, profile.title || DEFAULT_PROFILE_TITLE.name);
applyProfileTitleAppearance(profileTitleEl, profile.titleBackground || DEFAULT_PROFILE_TITLE.background);

const partnerIconEl = document.getElementById("partnerIcon");
partnerIconEl.src = partner.icon;
const scale = partner.iconScale || 1.0;
partnerIconEl.style.width = (72 * scale) + "px";
partnerIconEl.style.height = (72 * scale) + "px";
document.getElementById("partnerFullImage").src = partner.full;
document.getElementById("partnerName").textContent = partner.name;

const partnerData = saveData.partnerData?.[partnerId] || { level: 1, exp: 0 };
document.getElementById("partnerLevel").textContent = `Lv.${partnerData.level}`;
}

function getAvailablePartnerList() {
  const saveData = getSaveData();
  const unlockedPartners = saveData.unlockedPartners || {};

  const list = ["breaka", "canon","katy"];

  if (unlockedPartners.isabel === true) {
    list.push("isabel");
  }

  return list;
}

// ---- パートナー選択 ----追加したら書き足す↑
let partnerList = getAvailablePartnerList();
let currentPartnerIndex = 0;
let partnerTalkCount = 0;

const partnerIconButton = document.getElementById("partnerIconButton");
const partnerModal = document.getElementById("partnerModal");
const partnerCloseButton = document.getElementById("partnerCloseButton");
const partnerPrev = document.getElementById("partnerPrev");
const partnerNext = document.getElementById("partnerNext");

const partnerMessages = {
  breaka: [
    "どうも。よろしくね。",
    "まあ、せいぜい頑張りなよ。",
    "...眠いな...",
    "私と話してても面白くないよ。",
    "そんなに触りたいの？"
  ],
  canon: [
    "プレイヤーさん！やっほー！",
    "一緒に歌うの楽しみだな～",
    "わたしのうち、花屋さんやってるんだよね！",
    "きみはどんな歌が好き？",
    "それじゃあ、頑張ろうね！"
  ],
  katy: [
    "英語の先生をやっています。",
    "一緒に楽しみましょう。",
    "トライアスロンが趣味なの。",
    "こう見えて体育会系なんですよ？",
    "Please call me Katy!"
  ],
  isabel: [
    "これからよろしくね。",
    "あなたの演奏、期待してるよ。",
    "難しくても、諦めないで。",
    "…わたしのこと？まあ、おいおいね。"
  ]
};

function getDisplayedPartnerId() {
  return partnerList[currentPartnerIndex] || "breaka";
}

function updatePartnerSpeech() {
  const bubble = document.getElementById("partnerSpeechBubble");
  if (!bubble) return;

  const partnerId = getDisplayedPartnerId();

  if (partnerId === "canon" && isCanonPartnerLocked()) {
    bubble.style.display = "none";
    bubble.textContent = "";
    return;
  }

  bubble.style.display = "block";

  const messages = partnerMessages[partnerId] || partnerMessages.breaka;
  const messageIndex = Math.min(partnerTalkCount, messages.length - 1);
  bubble.textContent = messages[messageIndex];
}

function getPartnerLevel(partnerId) {
  const saveData = getSaveData();

  if (!saveData.partnerData) {
    saveData.partnerData = {};
  }

  if (!saveData.partnerData[partnerId]) {
    saveData.partnerData[partnerId] = { level: 1, exp: 0 };
    setSaveData(saveData);
  }

  return saveData.partnerData[partnerId].level;
}

let canonPartnerEventActive = false;

function showPartnerEventMessage(text) {
  const message = document.getElementById("partnerEventMessage");
  if (message) {
    message.textContent = text;
  }
}

function clearPartnerEventMessage() {
  showPartnerEventMessage("");
}

function isCanonEventTargetDisplayed() {
  return canonPartnerEventActive && getDisplayedPartnerId() === "canon";
}

function isCanonPartnerLocked() {
  const saveData = getSaveData();
  return saveData.storyFlags?.canonPartnerLocked === true;
}

function isCanonUnavailableDisplayed() {
  return getDisplayedPartnerId() === "canon" && isCanonPartnerLocked();
}
function updatePartnerDisplay() {
  const partnerId = partnerList[currentPartnerIndex];
  const partner = partners[partnerId];
  if (!partner) return;

  const fullImg = document.getElementById("partnerFullImage");

  if (canonGlowTimer) {
    clearTimeout(canonGlowTimer);
    canonGlowTimer = null;
  }

  const canonLocked =
    partnerId === "canon" && isCanonPartnerLocked();

  if (canonLocked) {
    fullImg.src = partner.eventFull || partner.full;

    if (canonPartnerEventActive) {
      fullImg.classList.add("canonEventGlow");

      canonGlowTimer = setTimeout(() => {
        fullImg.classList.remove("canonEventGlow");
        canonGlowTimer = null;
      }, 1000);

      const se = new Audio("sounds/canon_glow_start.mp3");
      se.volume = 0.9;
      se.play();

    } else {
      fullImg.classList.remove("canonEventGlow");
    }
  } else {
    fullImg.src = partner.full;
    fullImg.classList.remove("canonEventGlow");
  }

  const fullScale = partner.fullScale || 1.0;
  fullImg.style.height = (100 * fullScale) + "%";

  document.getElementById("partnerName").textContent = partner.name;

  const levelEl = document.getElementById("partnerLevel");
  if (levelEl) {
    levelEl.textContent = "Lv." + getPartnerLevel(partnerId);
  }

  const skillBox = document.getElementById("partnerSkillBox");
const skillName = document.getElementById("partnerSkillName");
const skillDescription = document.getElementById("partnerSkillDescription");
const skillToggleText = document.getElementById("partnerSkillToggleText");

const skillEnabled = isPartnerSkillEnabled();

if (partner.skill) {
  skillBox.disabled = false;
  skillBox.classList.toggle("skillOff", !skillEnabled);

  skillName.textContent = partner.skill.name || "SKILL";
  skillDescription.textContent = partner.skill.description || "";

  skillToggleText.textContent = skillEnabled
    ? "タップしてスキルをOFF"
    : "タップしてスキルをON";
} else {
  skillBox.disabled = true;
  skillBox.classList.add("skillOff");

  skillName.textContent = "???";
  skillDescription.textContent = "使用できるスキルがありません";
  skillToggleText.textContent = "スキルは使用できません";
}

  partnerTalkCount = 0;
  updatePartnerSpeech();
}

function saveCurrentPartnerSelection() {
  const partnerId = getDisplayedPartnerId();

  if (partnerId === "canon" && isCanonPartnerLocked()) {
    showPartnerEventMessage("このパートナーは選択できません");
    return false;
  }

  const saveData = getSaveData();

  if (!saveData.profile) {
    saveData.profile = {};
  }

  saveData.profile.partner = partnerId;
  setSaveData(saveData);
  loadProfilePanel();

  return true;
}

partnerIconButton.addEventListener("click", () => {
  partnerList = getAvailablePartnerList();

  const saveData = getSaveData();
  partnerTalkCount = 0;
  updatePartnerSpeech();

  const currentPartner = saveData.profile?.partner || "breaka";
  currentPartnerIndex = partnerList.indexOf(currentPartner);
  if (currentPartnerIndex < 0) currentPartnerIndex = 0;

  updatePartnerDisplay();
  partnerModal.classList.remove("hidden");
});

partnerCloseButton.addEventListener("click", () => {
  if (!saveCurrentPartnerSelection()) return;

  canonPartnerEventActive = false;
  clearPartnerEventMessage();
  partnerModal.classList.add("hidden");
});

partnerPrev.addEventListener("click", () => {
  currentPartnerIndex = (currentPartnerIndex - 1 + partnerList.length) % partnerList.length;
  clearPartnerEventMessage();
  updatePartnerDisplay();
});

partnerNext.addEventListener("click", () => {
  currentPartnerIndex = (currentPartnerIndex + 1) % partnerList.length;
  clearPartnerEventMessage();
  updatePartnerDisplay();
});

document.getElementById("partnerFullImage").addEventListener("click", () => {
  partnerTalkCount++;
  updatePartnerSpeech();
});

document.getElementById("partnerModalBg").addEventListener("click", () => {
  if (isCanonEventTargetDisplayed()) {
    showPartnerEventMessage("このパートナーは選択できません");
    return;
  }

  saveCurrentPartnerSelection();
  canonPartnerEventActive = false;
  clearPartnerEventMessage();
  partnerModal.classList.add("hidden");
});

loadProfilePanel();
syncEarnedProfileTitles();

let lastDetectedDevicePixelRatio = window.devicePixelRatio;
let lastDetectedViewportScale = window.visualViewport?.scale || 1;

function detectSiteZoomForTitle() {
  const currentDevicePixelRatio = window.devicePixelRatio;
  const currentViewportScale = window.visualViewport?.scale || 1;
  const zoomChanged =
    Math.abs(currentDevicePixelRatio - lastDetectedDevicePixelRatio) > 0.001 ||
    Math.abs(currentViewportScale - lastDetectedViewportScale) > 0.001;

  lastDetectedDevicePixelRatio = currentDevicePixelRatio;
  lastDetectedViewportScale = currentViewportScale;
  if (!zoomChanged) return;

  const song = getVisibleSongs()[selectedSongIndex];
  if (!song || isRandomMapSelection()) return;
  if (song.id === "song1") {
    unlockSpecialTitleFromSelect("jacketZoom:start");
  }
}

window.addEventListener("resize", detectSiteZoomForTitle);
window.visualViewport?.addEventListener("resize", detectSiteZoomForTitle);

function getTopRateCharts() {
  const currentSaveData = getSaveData();
  const rateCharts = [];

  for (const song of songList) {
    const charts = song.info.charts || [];

    for (let difficultyIndex = 0; difficultyIndex < charts.length; difficultyIndex++) {
      const chart = charts[difficultyIndex];
      const chartSave = currentSaveData[song.id]?.[difficultyIndex] || {};
      const bestScore = Number(chartSave.bestScore || 0);
      if (bestScore <= 0) continue;

      const difficulty = Number(chart.level || 0);
      const scoreRatio = bestScore / 1000000;
      const rateConstant = Math.round(
        difficulty * Math.pow(scoreRatio, 6) / Math.pow(0.95, 5) * 0.8 * 1000
      ) / 1000;

      rateCharts.push({
        song,
        chart,
        bestScore,
        bestRank: chartSave.bestRank || "-",
        cleared: chartSave.cleared === true,
        fullCombo: chartSave.fullCombo === true,
        allPerfect: chartSave.allPerfect === true,
        ultimatePerfect: chartSave.ultimatePerfect === true,
        rateConstant
      });
    }
  }

  return rateCharts
    .sort((a, b) =>
      b.rateConstant - a.rateConstant ||
      b.bestScore - a.bestScore ||
      String(a.song.info.title).localeCompare(String(b.song.info.title), "ja")
    )
    .slice(0, 20);
}

function getDifficultyShortName(difficulty) {
  const names = { basic: "BA", expert: "EX", fracture: "FR" };
  return names[String(difficulty || "").toLowerCase()] || "--";
}

function applyScoreboardRankStyle(element, rank) {
  if (rank === "SS") {
    element.style.background =
      "linear-gradient(90deg, #ff5964, #ffe66d, #58e6ff, #d681ff)";
    element.style.webkitBackgroundClip = "text";
    element.style.webkitTextFillColor = "transparent";
  } else if (rank.startsWith("S")) {
    element.style.color = "#ffe36e";
  } else if (rank.startsWith("A")) {
    element.style.color = "#ff6b76";
  } else if (rank.startsWith("B")) {
    element.style.color = "#67c8ff";
  } else if (rank === "F") {
    element.style.color = "#8b939d";
  }
}

function createScoreboardCard(entry) {
  const card = document.createElement("article");
  const difficultyName = String(entry.chart.difficulty || "").toLowerCase();
  card.className = `scoreboardCard diff-${difficultyName}`;

  const meta = document.createElement("div");
  meta.className = "scoreboardCardMeta";

  const difficulty = document.createElement("div");
  difficulty.className = "scoreboardCardDifficulty";
  difficulty.textContent =
    `${getDifficultyShortName(difficultyName)} ${getDisplayedChartLevel(entry.chart.level)}`;

  const decoration = document.createElement("div");
  decoration.className = "scoreboardCardDecoration";
  decoration.setAttribute("aria-hidden", "true");

  const rateArea = document.createElement("div");
  const rateLabel = document.createElement("div");
  rateLabel.className = "scoreboardCardRateLabel";
  rateLabel.textContent = "RATE";
  const rate = document.createElement("div");
  rate.className = "scoreboardCardRate";
  rate.textContent = (entry.rateConstant * 20).toFixed(1);
  rateArea.append(rateLabel, rate);
  meta.append(difficulty, decoration, rateArea);

  const jacketArea = document.createElement("div");
  jacketArea.className = "scoreboardCardJacketArea";
  const jacket = document.createElement("img");
  jacket.className = "scoreboardCardJacket";
  jacket.src = `songs/${entry.song.id}/jacket.png`;
  jacket.alt = entry.song.info.title || "";
  jacketArea.appendChild(jacket);

  const lampState = entry.ultimatePerfect
    ? "ultimatePerfect"
    : entry.allPerfect
      ? "allPerfect"
      : entry.fullCombo
        ? "fullCombo"
        : entry.cleared
          ? "cleared"
          : "";
  if (lampState) {
    const lamp = document.createElement("span");
    lamp.className = `scoreboardCardLamp ${lampState}`;
    lamp.setAttribute("aria-label", lampState);
    jacketArea.appendChild(lamp);
  }

  const result = document.createElement("div");
  result.className = "scoreboardCardResult";
  const score = document.createElement("span");
  score.className = "scoreboardCardScore";
  score.textContent = String(entry.bestScore).padStart(7, "0");
  const rank = document.createElement("span");
  rank.className = "scoreboardCardRank";
  rank.textContent = entry.bestRank;
  applyScoreboardRankStyle(rank, entry.bestRank);
  result.append(score, rank);

  card.append(meta, jacketArea, result);
  return card;
}

function renderProfileScoreboard() {
  const scoreboard = document.getElementById("profileScoreboard");
  const entries = getTopRateCharts();
  scoreboard.innerHTML = "";

  for (const entry of entries) {
    scoreboard.appendChild(createScoreboardCard(entry));
  }

  for (let index = entries.length; index < 20; index++) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "scoreboardCard empty";
    emptyCard.setAttribute("aria-hidden", "true");
    scoreboard.appendChild(emptyCard);
  }
}

function equipProfileTitle(title) {
  const currentSaveData = getSaveData();
  if (!currentSaveData.profile) currentSaveData.profile = {};
  if (!currentSaveData.viewedTitles || typeof currentSaveData.viewedTitles !== "object" || Array.isArray(currentSaveData.viewedTitles)) {
    currentSaveData.viewedTitles = {};
  }
  currentSaveData.viewedTitles[title.id] = true;
  currentSaveData.profile.titleId = title.id;
  currentSaveData.profile.title = title.name;
  currentSaveData.profile.titleBackground = normalizeProfileTitleBackground(title.background);
  setSaveData(currentSaveData);

  const panelTitle = document.getElementById("profileTitle");
  setProfileTitleText(panelTitle, title.name);
  applyProfileTitleAppearance(panelTitle, title.background);
  updateProfileDetailSummary();
  renderProfileTitles();
}

function renderProfileTitles() {
  const currentSaveData = getSaveData();
  const profile = currentSaveData.profile || {};
  const titles = getUnlockedProfileTitles(currentSaveData);
  const viewedTitles = currentSaveData.viewedTitles || {};
  const selectedId = profile.titleId
    || titles.find(title => title.name === profile.title)?.id
    || DEFAULT_PROFILE_TITLE.id;
  const list = document.getElementById("profileTitlesList");
  list.innerHTML = "";

  for (const title of titles) {
    const entry = document.createElement("div");
    entry.className = "profileTitleEntry";
    entry.classList.toggle("selected", title.id === selectedId);
    entry.classList.toggle("new", title.id !== DEFAULT_PROFILE_TITLE.id && viewedTitles[title.id] !== true);

    const button = document.createElement("button");
    button.type = "button";
    button.className = `profileTitleChoice titleBackground-${title.background}`;
    button.classList.toggle("selected", title.id === selectedId);
    setProfileTitleText(button, title.name);
    button.addEventListener("click", () => equipProfileTitle(title));

    const condition = document.createElement("div");
    condition.className = "profileTitleCondition";
    condition.textContent = getProfileTitleAcquisitionText(title);
    entry.append(button, condition);
    list.appendChild(entry);
  }

  document.getElementById("profileTitlesCount").textContent = String(titles.length);
}

function updateProfileDetailSummary() {
  const currentSaveData = getSaveData();
  const profile = currentSaveData.profile || {};
  const partner = partners[profile.partner || "breaka"] || partners.breaka;
  const name = document.getElementById("profileDetailName");
  const rate = document.getElementById("profileDetailRate");
  const icon = document.getElementById("profileDetailIcon");
  const title = document.getElementById("profileDetailTitleBadge");

  name.textContent = profile.username || "Player";
  applyRateRankMark(name, profile.rate, profile.username);
  rate.textContent = "RATE " + Number(profile.rate || 0).toFixed(1);
  applyRateColor(rate, profile.rate);
  setProfileTitleText(title, profile.title || DEFAULT_PROFILE_TITLE.name);
  applyProfileTitleAppearance(title, profile.titleBackground || DEFAULT_PROFILE_TITLE.background);
  icon.src = partner.icon;

  const iconScale = partner.iconScale || 1.0;
  icon.style.width = `${58 * iconScale}px`;
  icon.style.height = `${58 * iconScale}px`;
}

function renderProfileClearStats() {
  const currentSaveData = getSaveData();
  const stats = {
    total: 0,
    cleared: 0,
    fullCombo: 0,
    allPerfect: 0,
    ultimatePerfect: 0
  };

  for (const song of songList) {
    const charts = song.info.charts || [];

    charts.forEach((chart, difficultyIndex) => {
      if (String(chart.difficulty || "").toLowerCase() !== profileStatsDifficulty) {
        return;
      }

      stats.total++;
      const record = currentSaveData[song.id]?.[difficultyIndex] || {};
      const isUltimatePerfect = record.ultimatePerfect === true;
      const isAllPerfect = record.allPerfect === true || isUltimatePerfect;
      const isFullCombo = record.fullCombo === true || isAllPerfect;
      const isCleared = record.cleared === true || isFullCombo;

      if (isCleared) stats.cleared++;
      if (isFullCombo) stats.fullCombo++;
      if (isAllPerfect) stats.allPerfect++;
      if (isUltimatePerfect) stats.ultimatePerfect++;
    });
  }

  const difficultyButton = document.getElementById("profileStatsDifficulty");
  const difficultyLabels = { expert: "EX", fracture: "FR", basic: "BA" };
  difficultyButton.textContent = difficultyLabels[profileStatsDifficulty];
  difficultyButton.className = `diff-${profileStatsDifficulty}`;

  setProfileStatValue("profileClearCount", stats.cleared, stats.total);
  setProfileStatValue("profileFullComboCount", stats.fullCombo, stats.total);
  setProfileStatValue("profileAllPerfectCount", stats.allPerfect, stats.total);
  setProfileStatValue("profileUltimatePerfectCount", stats.ultimatePerfect, stats.total);
}

function setProfileStatValue(elementId, value, total) {
  const element = document.getElementById(elementId);
  const totalElement = document.createElement("span");
  totalElement.className = "profileClearStatTotal";
  totalElement.textContent = `/${total}`;
  element.replaceChildren(document.createTextNode(String(value)), totalElement);
}

function openProfileDetail() {
  updateProfileDetailSummary();
  renderProfileClearStats();
  renderProfileScoreboard();
  renderProfileTitles();
  const modal = document.getElementById("profileDetailModal");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeProfileDetail() {
  const modal = document.getElementById("profileDetailModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

document.getElementById("profilePanel").addEventListener("click", openProfileDetail);
document.getElementById("profileDetailClose").addEventListener("click", closeProfileDetail);
document.getElementById("profileDetailBackdrop").addEventListener("click", closeProfileDetail);
document.getElementById("profileStatsDifficulty").addEventListener("click", () => {
  const difficultyOrder = ["expert", "fracture", "basic"];
  const currentIndex = difficultyOrder.indexOf(profileStatsDifficulty);
  profileStatsDifficulty = difficultyOrder[(currentIndex + 1) % difficultyOrder.length];
  renderProfileClearStats();
});

function changeSelectBackground(direction) {
  const backgroundIds = Object.keys(SELECT_BACKGROUND_OPTIONS);
  const settings = loadSettings();
  const currentIndex = Math.max(0, backgroundIds.indexOf(settings.selectBackground));
  const nextIndex = Math.min(backgroundIds.length - 1, Math.max(0, currentIndex + direction));
  if (nextIndex === currentIndex) return;

  settings.selectBackground = backgroundIds[nextIndex];
  saveSettings(settings);
  applySelectBackground(settings.selectBackground);
  applySettingsToUI(settings);
}

document.getElementById("backgroundPrev").addEventListener("click", () => changeSelectBackground(-1));
document.getElementById("backgroundNext").addEventListener("click", () => changeSelectBackground(1));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeProfileDetail();
});

function calculatePlayerRate(songList) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const rateConstants = [];

  for (const song of songList) {
    const songId = song.id;
    const charts = song.info.charts || [];

    for (let difficultyIndex = 0; difficultyIndex < charts.length; difficultyIndex++) {
      const chart = charts[difficultyIndex];

      const difficulty = Number(chart.level || 0);
      const bestScore = Number(
        saveData[songId]?.[difficultyIndex]?.bestScore || 0
      );

      if (saveData[songId]?.[difficultyIndex]) {
        saveData[songId][difficultyIndex].level = difficulty;
      }

      if (bestScore <= 0) continue;

      const scoreRatio = bestScore / 1000000;
      const rateConstantRaw =
        difficulty * Math.pow(scoreRatio, 6) / Math.pow(0.95, 5) * 0.8;

      // 単曲レートは小数第3位まで保持する。
      const rateConstant = Math.round(rateConstantRaw * 1000) / 1000;

      rateConstants.push(rateConstant);
    }
  }

  rateConstants.sort((a, b) => b - a);

  const top20 = rateConstants.slice(0, 20);

  while (top20.length < 20) {
    top20.push(0);
  }

  const rate = top20.reduce((sum, value) => sum + value, 0);

  if (!saveData.profile) {
    saveData.profile = {};
  }

  saveData.profile.rate = Math.round(rate * 10) / 10;

  localStorage.setItem("rhythmGame", JSON.stringify(saveData));

  return saveData.profile.rate;
}

function checkCanonPartnerEvent() {
  const saveData = getSaveData();

  if (!saveData.storyFlags?.pendingCanonPartnerEvent) return;
  if (saveData.storyFlags?.canonPartnerEventSeen === true) return;

  canonPartnerEventActive = true;

  if (!saveData.storyFlags) {
    saveData.storyFlags = {};
  }

  saveData.storyFlags.canonPartnerLocked = true;
  saveData.storyFlags.canonPartnerEventSeen = true;
  saveData.storyFlags.pendingCanonPartnerEvent = false;

  setSaveData(saveData);

  currentPartnerIndex = partnerList.indexOf("canon");
  if (currentPartnerIndex < 0) currentPartnerIndex = 0;

  clearPartnerEventMessage();
  updatePartnerDisplay();

  partnerModal.classList.remove("hidden");
}

document.getElementById("storyButton").addEventListener("click", () => {
  const overlay = document.getElementById("storyFadeOverlay");
  overlay.classList.add("active");

  setTimeout(() => {
    location.href = "story.html";
  }, 700);
});

const unlockMapButton = document.getElementById("unlockMapButton");
let mapNavigationStarted = false;

function getTotalShards() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  return Number(saveData.playShards || 0) + Object.values(saveData.mapProgress || {}).reduce(
    (total, progress) => total + Number(progress?.shards || 0),
    0
  );
}

function updateSelectShardDisplay() {
  document.getElementById("selectShardValue").textContent = String(getTotalShards());
}

updateSelectShardDisplay();

document.getElementById("unlockSongButton").addEventListener("click", () => {
  const song = getVisibleSongs()[selectedSongIndex];
  if (!song || isSongPrerequisiteLocked(song.id) || !isSongShardLocked(song.id)) return;
  const cost = getSongShardUnlockCost(song.id);
  if (getTotalShards() < cost) return;

  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  let remainingCost = cost;
  const paymentBreakdown = {};
  const availablePlayShards = Math.max(0, Number(saveData.playShards || 0));
  const playShardPayment = Math.min(availablePlayShards, remainingCost);
  saveData.playShards = availablePlayShards - playShardPayment;
  if (playShardPayment > 0) paymentBreakdown.__playShards = playShardPayment;
  remainingCost -= playShardPayment;

  for (const [mapId, progress] of Object.entries(saveData.mapProgress || {})) {
    if (remainingCost <= 0) break;
    const available = Math.max(0, Number(progress?.shards || 0));
    const payment = Math.min(available, remainingCost);
    progress.shards = available - payment;
    if (payment > 0) paymentBreakdown[mapId] = payment;
    remainingCost -= payment;
    if (remainingCost <= 0) break;
  }
  if (!saveData.shardUnlockedSongs) saveData.shardUnlockedSongs = {};
  if (!saveData.shardPurchasePayments) saveData.shardPurchasePayments = {};
  saveData.shardUnlockedSongs[song.id] = true;
  saveData.shardPurchasePayments[song.id] = paymentBreakdown;
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));

  const unlockButton = document.getElementById("unlockSongButton");
  const startButton = document.getElementById("startButton");
  unlockButton.disabled = true;
  unlockButton.classList.add("unlocking");
  const jacketArea = document.getElementById("jacketArea");
  recentlyShardUnlockedSongId = song.id;
  jacketArea.classList.remove("lockedJacket", "shardLockedJacket");
  jacketArea.classList.add("shardUnlockFlash");
  document.getElementById("userOffsetArea").style.display = "flex";
  updateOffsetUI(song.id);
  updateSelectShardDisplay();
  renderSongList();

  setTimeout(() => {
    jacketArea.classList.remove("shardUnlockFlash");
    document.querySelector(".songItem.shardJustUnlocked")?.classList.remove("shardJustUnlocked");
    recentlyShardUnlockedSongId = "";
  }, 460);

  setTimeout(() => {
    unlockButton.style.display = "none";
    unlockButton.classList.remove("unlocking");
    startButton.style.visibility = "visible";
    startButton.classList.add("quickReveal");
  }, 180);
});

document.addEventListener("keydown", event => {
  if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "s")) return;
  const song = getVisibleSongs()[selectedSongIndex];
  const cost = song ? getSongShardUnlockCost(song.id) : 0;
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (!song || cost <= 0 || saveData.shardUnlockedSongs?.[song.id] !== true) return;
  event.preventDefault();

  const paymentBreakdown = saveData.shardPurchasePayments?.[song.id];
  if (paymentBreakdown && Object.keys(paymentBreakdown).length > 0) {
    for (const [mapId, amount] of Object.entries(paymentBreakdown)) {
      if (mapId === "__playShards") {
        saveData.playShards = Number(saveData.playShards || 0) + Number(amount || 0);
        continue;
      }
      if (!saveData.mapProgress) saveData.mapProgress = {};
      if (!saveData.mapProgress[mapId]) saveData.mapProgress[mapId] = { clearedPieces: [], failedPieces: {}, shards: 0 };
      saveData.mapProgress[mapId].shards = Number(saveData.mapProgress[mapId].shards || 0) + Number(amount || 0);
    }
  } else {
    const refundMapId = selectedMapId || Object.keys(saveData.mapProgress || {})[0] || "map01";
    if (!saveData.mapProgress) saveData.mapProgress = {};
    if (!saveData.mapProgress[refundMapId]) saveData.mapProgress[refundMapId] = { clearedPieces: [], failedPieces: {}, shards: 0 };
    saveData.mapProgress[refundMapId].shards = Number(saveData.mapProgress[refundMapId].shards || 0) + cost;
  }

  delete saveData.shardUnlockedSongs[song.id];
  if (saveData.shardPurchasePayments) delete saveData.shardPurchasePayments[song.id];
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
  updateSelectShardDisplay();
  selectSong(selectedSongIndex);
});

document.addEventListener("keydown", event => {
  if (!(event.ctrlKey && event.shiftKey && event.code === "KeyD")) return;
  event.preventDefault();

  const song = isRandomMapSelection()
    ? getRandomMapCandidates()[0]
    : getVisibleSongs()[selectedSongIndex];
  if (!song) return;

  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (!saveData[song.id]?.[selectedDifficulty]) {
    console.info(`[DEBUG] ${song.id} / difficulty ${selectedDifficulty} に削除対象のプレイデータはありません。`);
    return;
  }

  delete saveData[song.id][selectedDifficulty];
  if (Object.keys(saveData[song.id]).length === 0) delete saveData[song.id];
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));

  calculatePlayerRate(songList);
  loadProfilePanel();
  selectSong(selectedSongIndex);
  renderProfileClearStats();
  renderProfileScoreboard();
  console.info(`[DEBUG] ${song.id} / ${song.info.charts[selectedDifficulty]?.difficulty || selectedDifficulty} のプレイデータを削除しました。`);
});

if (mapSelectMode) {
  unlockMapButton.textContent = "BACK";
}

unlockMapButton.addEventListener("click", () => {
  if (mapNavigationStarted) return;
  mapNavigationStarted = true;
  const destination = mapSelectMode && selectedMapId
    ? `unlock-map.html?map=${encodeURIComponent(selectedMapId)}`
    : "map-select.html";
  document.getElementById("selectFadeOverlay")?.classList.remove("fadeIn");
  setTimeout(() => { location.href = destination; }, 800);
});

//スキル
document.getElementById("partnerSkillBox").addEventListener("click", () => {
  const partnerId = partnerList[currentPartnerIndex];
  const partner = partners[partnerId];

  if (!partner?.skill) return;

  const nextEnabled = !isPartnerSkillEnabled();
  setPartnerSkillEnabled(nextEnabled);
  updatePartnerDisplay();
});

//選曲保存
function saveLastSelection() {
  const saveData = getSaveData();
  const selectedSong = getVisibleSongs()[selectedSongIndex];
  saveData.lastSelection = {
    folderIndex: selectedFolderIndex,
    songIndex: selectedSongIndex,
    songId: selectedSong?.id,
    difficulty: selectedDifficulty
  };
  setSaveData(saveData);
}
