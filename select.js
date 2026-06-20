let songList = [];
let selectedSongIndex = 0;
let selectedDifficulty = 0;
let previewAudio = null;
let canonGlowTimer = null;

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
  const song = songList[selectedSongIndex];
  const input = document.getElementById("userOffsetInput");
  const val = Math.max(-50, Number(input.value) - 1);
  input.value = val;
  saveUserOffset(song.id, val);
});

document.getElementById("userOffsetPlus").addEventListener("click", () => {
  const song = songList[selectedSongIndex];
  const input = document.getElementById("userOffsetInput");
  const val = Math.min(50, Number(input.value) + 1);
  input.value = val;
  saveUserOffset(song.id, val);
});

document.getElementById("userOffsetInput").addEventListener("change", () => {
  const song = songList[selectedSongIndex];
  const input = document.getElementById("userOffsetInput");
  let val = Number(input.value);
  val = Math.min(50, Math.max(-50, val));
  input.value = val;
  saveUserOffset(song.id, val);
});

function isSongLocked(songId) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");

  if (songId === "song3") {
    return saveData.storyRead?.chapter1_episode5 !== true;
  }

  if (songId === "boss") {
    return saveData.secretBossUnlocked !== true;
  }

  return false;
}

function getSongUnlockMessage(songId) {
  if (songId === "song3") {
    return "この楽曲の解禁には1-5の読了が必要です";
  }

  if (songId === "boss") {
    return "この楽曲の解禁には、「Starlight Adventure」のクリアが必要です";
  }

  return "";
}

async function loadSongList() {
  const response = await fetch("songs/songlist.json");
  const data = await response.json();

  for (let songId of data.songs) {
    const infoResponse = await fetch(`songs/${songId}/info.json`);
    const info = await infoResponse.json();
    songList.push({ id: songId, info: info });
  }

   const fadeOverlay = document.getElementById("selectFadeOverlay");
  setTimeout(() => {
    fadeOverlay.classList.add("fadeIn");
  }, 100);

  const params = new URLSearchParams(window.location.search);
  const initialSong = params.get("song");
  const initialDifficulty = Number(params.get("difficulty")) || 0;

  const initialIndex = initialSong
    ? songList.findIndex(s => s.id === initialSong)
    : 0;

  selectedDifficulty = initialDifficulty;
  selectSong(initialIndex >= 0 ? initialIndex : 0);

  renderSongList();
  calculatePlayerRate(songList);
  loadProfilePanel();
  checkCanonPartnerEvent();
}

function renderSongList() {
  const listEl = document.getElementById("songList");
  listEl.innerHTML = "";

  for (let i = 0; i < songList.length; i++) {
    const song = songList[i];
    const isLocked = isSongLocked(song.id);
    const shouldHideSongInfo = song.id === "boss" && isLocked;
    const item = document.createElement("div");
    item.classList.add("songItem");
    if (i === selectedSongIndex) item.classList.add("selected");

    // ジャケット背景
const bg = document.createElement("div");
bg.classList.add("songItemBg");


if (song.id === "boss" && isLocked) {
  bg.style.backgroundImage = "";
  bg.style.backgroundColor = "#000";
  bg.classList.remove("lockedSongBg");
} else if (isLocked) {
  bg.style.backgroundImage = `url('songs/${song.id}/jacket.png')`;
  bg.classList.add("lockedSongBg");
} else {
  bg.style.backgroundImage = `url('songs/${song.id}/jacket.png')`;
  bg.classList.remove("lockedSongBg");
}

    // テキスト
    const text = document.createElement("div");
    text.classList.add("songItemText");
   
  const chart = song.info.charts[selectedDifficulty] || song.info.charts[0];
  const diffClass = "diff-" + (chart.difficulty || "basic").toLowerCase();

  // fracture選択中かどうか
const selectedChart = songList[selectedSongIndex]?.info.charts[selectedDifficulty];
const currentDiffIsFracture = selectedChart?.difficulty.toLowerCase() === "fracture";

// この曲にfractureがあるか
const hasFracture = song.info.charts.some(c => c.difficulty.toLowerCase() === "fracture");

if (currentDiffIsFracture && !hasFracture) {
  text.innerHTML = `
    <div class="songItemTitle">${shouldHideSongInfo ? "???" : song.info.title}</div>
    <div class="songItemArtist" style="position: relative; top: 0px;">${shouldHideSongInfo ? "???" : song.info.artist}</div>
    `;
} else {
  const chart = song.info.charts[selectedDifficulty] || song.info.charts[0];
  const diffClass = "diff-" + (chart.difficulty || "basic").toLowerCase();
  text.innerHTML = `
    <div class="songItemTitle">${shouldHideSongInfo ? "???" : song.info.title}
      <span class="songItemLevel ${diffClass}">${shouldHideSongInfo ? "?" : chart.level}</span>
    </div>
    <div class="songItemArtist">${shouldHideSongInfo ? "???" : song.info.artist}</div>
  `;
}
    item.appendChild(bg);

// ランプ
const lamp = document.createElement("div");
lamp.classList.add("songItemLamp");

// fracture選択中かつこの曲にfractureがない場合はランプ非表示
if (currentDiffIsFracture && !hasFracture) {
  lamp.style.display = "none";
} else {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const chartIndex = song.info.charts.findIndex(
    c => c.difficulty === (song.info.charts[selectedDifficulty] || song.info.charts[0]).difficulty
  );
  const songSave = saveData[song.id]?.[chartIndex] || {};

  if (songSave.allPerfect) {
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
}

function selectSong(index) {
  selectedSongIndex = index;
  const song = songList[index];
  const isLocked = isSongLocked(song.id);
const shouldHideSongInfo = song.id === "boss" && isLocked;
  if (selectedDifficulty >= song.info.charts.length) {
    selectedDifficulty = song.info.charts.length - 1;
  }

  const items = document.querySelectorAll(".songItem");
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === index);
  });

  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");

  //ジャケット
if (song.id === "boss" && isLocked) {
  document.getElementById("jacketImage").src = "assets/black.png";
  document.getElementById("jacketArea").classList.remove("lockedJacket");
} else {
  document.getElementById("jacketImage").src = `songs/${song.id}/jacket.png`;

  if (isLocked) {
    document.getElementById("jacketArea").classList.add("lockedJacket");
  } else {
    document.getElementById("jacketArea").classList.remove("lockedJacket");
  }

  updateOffsetUI(song.id);
}

//曲名＋アーティスト
document.getElementById("detailTitle").textContent =
  shouldHideSongInfo ? "???" : song.info.title;

document.getElementById("detailArtist").textContent =
  shouldHideSongInfo ? "???" : song.info.artist;

  // 難易度ボタンとスタートボタンの表示切り替え
  const difficultyButtons = document.getElementById("difficultyButtons");
  const startButton = document.getElementById("startButton");
  let unlockText = document.getElementById("unlockText");

if (isLocked) {
  difficultyButtons.style.display = "none";
  startButton.style.display = "none";

  if (!unlockText) {
    unlockText = document.createElement("div");
    unlockText.id = "unlockText";
    startButton.parentNode.insertBefore(unlockText, startButton);
  }

  unlockText.textContent = getSongUnlockMessage(song.id);
  unlockText.style.display = "block";
} else {
  difficultyButtons.style.display = "flex";
  startButton.style.display = "block";
  if (unlockText) unlockText.style.display = "none";
}

  // 難易度ボタン
  renderDifficultyButtons(song);

  // 自己ベスト
  updateBestScore(song.id);

  renderSongList();

  // プレビュー再生
if (previewAudio) {
  previewAudio.pause();
  previewAudio = null;
}

const shouldBlockPreview = song.id === "boss" && isLocked;

if (!shouldBlockPreview) {
  previewAudio = new Audio(`songs/${song.id}/music.wav`);
  previewAudio.volume = 0.5;
  previewAudio.play().catch(e => console.log("preview play failed:", e));
}
}

function renderDifficultyButtons(song) {
  const area = document.getElementById("difficultyButtons");
  area.innerHTML = "";

  song.info.charts.forEach((chart, i) => {
    const btn = document.createElement("button");
    btn.classList.add("diffBtn");
    btn.classList.add("diff-" + chart.difficulty.toLowerCase());

    if (i === selectedDifficulty) {
      btn.classList.add("selected");
    }

    btn.innerHTML = `
      <div class="diffFrame">
        <div class="diffBar"></div>
        <div class="diffName">${chart.difficulty}</div>
      </div>
      <div class="diffLevel">${chart.level}</div>
    `;

    btn.addEventListener("click", () => {
      selectedDifficulty = i;

      document.querySelectorAll(".diffBtn").forEach((b, j) => {
        b.classList.toggle("selected", j === i);
      });

      updateBestScore(songList[selectedSongIndex].id);
      renderSongList();
    });

    area.appendChild(btn);
  });
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

  bestEl.textContent = "BEST: " + (songData.bestScore || 0).toString().padStart(7, "0");
}

document.getElementById("startButton").addEventListener("click", () => {

 const se = new Audio("sounds/startsound.mp3");
  se.volume = 0.8; // 音量調整（任意）
  se.play();

   if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }
  const song = songList[selectedSongIndex];
  const userOffset = loadUserOffset(song.id);

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
    location.href = `game.html?song=${song.id}&difficulty=${selectedDifficulty}&userOffset=${userOffset}`;
  }, 700);
});

loadSongList();

// ---- 設定 ----
const DEFAULT_SPEED = 10;
const DEFAULT_KEY_LAYOUT = "default";
const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
const secretBossUnlocked = saveData.secretBossUnlocked === true;

function loadSettings() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const settings = saveData.settings || {};
  return {
    speed: settings.speed || DEFAULT_SPEED,
    keyLayout: settings.keyLayout || DEFAULT_KEY_LAYOUT,
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

  document.querySelectorAll(".sfxToggleBtn").forEach(btn => {
    const isOn = btn.dataset.value === "on";
    btn.classList.toggle("selected", isOn === settings.sfx);
  });
}

document.querySelectorAll(".sfxToggleBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sfxToggleBtn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    const settings = loadSettings();
    settings.sfx = btn.dataset.value === "on";
    saveSettings(settings);
  });
});

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
  const val = Math.max(1, Math.round((Number(input.value) - 0.1) * 10) / 10);
  input.value = val;
  const settings = loadSettings();
  settings.speed = val;
  saveSettings(settings);
});

document.getElementById("speedPlus").addEventListener("click", () => {
  const input = document.getElementById("speedInput");
  const val = Math.min(20, Math.round((Number(input.value) + 0.1) * 10) / 10);
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
  breaka: {
    name: "ブレイカ",
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
    ] 
  },
  canon: { // ← 追加
    name: "カノン",
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
      3370, 3630, 3900, 4180 ] 
  }
};

function getSaveData() {
  return JSON.parse(localStorage.getItem("rhythmGame") || "{}");
}

function setSaveData(saveData) {
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
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

const profile = saveData.profile;
const partnerId = profile.partner || "breaka"; // ← 追加
const partner = partners[partnerId] || partners.breaka;

document.getElementById("profileName").textContent = profile.username || "Player";
document.getElementById("profileRate").textContent =
  "RATE " + Number(profile.rate || 0).toFixed(1);

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

// ---- パートナー選択 ----
const partnerList = ["breaka", "canon"];
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
  const saveData = getSaveData();
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

      if (bestScore <= 0) continue;

      const rateConstantRaw = difficulty * bestScore / 1000000;

      // 小数第1位まで
      const rateConstant = Math.round(rateConstantRaw * 10) / 10;

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