const params = new URLSearchParams(window.location.search);
const currentSong = params.get("song") || "song1";
const currentDifficulty = Number(params.get("difficulty")) || 0;
const bossChallenge = params.get("bossChallenge") === "1";
const SECRET_SOURCE_SONG = "song3";
const SECRET_BOSS_SONG = "boss";
const SECRET_TRIGGER_MEASURE = 94;
const autoStart = params.get("autoStart") === "1";
// ---- 設定読み込み ----
const saveDataForSettings = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
const settings = saveDataForSettings.settings || {};

// 速度
const speed = settings.speed || 10;

// キー配置
const keyLayout = settings.keyLayout || "default";
const laneKeys = keyLayout === "alt"
  ? { 0: "g", 1: "h", 2: "j", 3: "k", 4: "l" }
  : { 0: "d", 1: "f", 2: " ", 3: "j", 4: "k" };

const keyToLane = keyLayout === "alt"
  ? { g: "lane0", h: "lane1", j: "lane2", k: "lane3", l: "lane4" }
  : { d: "lane0", f: "lane1", " ": "lane2", j: "lane3", k: "lane4" };

let songInfo = {};

const music = new Audio(`songs/${currentSong}/music.wav`);

let BPM = 180;
let beatTime = 60000 / BPM;
let measureBeats = 4;
let offset = -80;
let perfectScore = 0;
let goodScore = 0;
let speedEvents = []; // { timeMs: number, multiplier: number }

const judgeY = 470;
const spawnY = -100;
const distance = judgeY - spawnY;
const travelFrames = distance / speed;
const travelTime = travelFrames * (1000 / 60);
const longEndJudgeEarlyPx = 20;
const longStartVisualOffsetPx = 10;

function buildTempoMap(tempoEvents) {
  const merged = new Map();

  merged.set(1, {
    measure: 1,
    bpm: BPM,
    timesig: measureBeats
  });

  for (const event of tempoEvents) {
    const measure = Math.max(1, Number(event.measure));
    const existing = merged.get(measure) || { measure };
    merged.set(measure, {
      ...existing,
      ...event,
      measure
    });
  }

  const sorted = [...merged.values()].sort((a, b) => a.measure - b.measure);

  let currentBpm = BPM;
  let currentTimesig = measureBeats;
  let currentMs = 0;
  let previousMeasure = 1;

  return sorted.map((event, index) => {
    if (index > 0) {
      const measureCount = event.measure - previousMeasure;
      currentMs += measureCount * currentTimesig * (60000 / currentBpm);
    }

    currentBpm = Number(event.bpm || currentBpm);
    currentTimesig = Number(event.timesig || currentTimesig);
    previousMeasure = event.measure;

    return {
      measure: event.measure,
      bpm: currentBpm,
      timesig: currentTimesig,
      startMs: currentMs
    };
  });
}

function getNoteTime(measure, division) {
  const numerator = division[0];
  const denominator = division[1];

  let tempo = tempoMap[0] || {
    measure: 1,
    bpm: BPM,
    timesig: measureBeats,
    startMs: 0
  };

  for (const item of tempoMap) {
    if (item.measure <= measure) {
      tempo = item;
    } else {
      break;
    }
  }

  const beatMs = 60000 / tempo.bpm;
  const measureMs = tempo.timesig * beatMs;

  return (
    tempo.startMs +
    (measure - tempo.measure) * measureMs +
    (numerator / denominator) * measureMs
  );
}

let chart = [];
let tempoMap = [];

// ---- DOM要素 ----
const result = document.getElementById("result");
const comboText = document.getElementById("combo");
const cover = document.getElementById("cover");
const scoreText = document.getElementById("score");
const lifeFill = document.getElementById("lifeFill");
const startText = document.getElementById("startText");
const failedText = document.getElementById("failed");
const rankText = document.getElementById("rank");
const fastLateText = document.getElementById("fastLate");
const fullComboText = document.getElementById("fullCombo");
const allPerfectText = document.getElementById("allPerfect");
const ultimatePerfectText = document.getElementById("ultimatePerfect");
const resultScreen = document.getElementById("resultScreen");
const resultRank = document.getElementById("resultRank");
const resultBadge = document.getElementById("resultBadge");
const resultScore = document.getElementById("resultScore");
const resultBestScore = document.getElementById("resultBestScore");
const resultYellowPerfect = document.getElementById("resultYellowPerfect");
const resultPerfect = document.getElementById("resultPerfect");
const resultGood = document.getElementById("resultGood");
const resultMiss = document.getElementById("resultMiss");
const resultFast = document.getElementById("resultFast");
const resultLate = document.getElementById("resultLate");
const retryButton = document.getElementById("retryButton");
const resultTitle = document.getElementById("resultTitle");
const resultArtist = document.getElementById("resultArtist");
const resultDifficulty = document.getElementById("resultDifficulty");
const pauseButton = document.getElementById("pauseButton");
const pauseScreen = document.getElementById("pauseScreen");
const fadeOverlay = document.getElementById("fadeOverlay");
const blackOverlay = document.getElementById("blackOverlay");
const resultBGM = new Audio("sounds/result.mp3");
const secretNoiseOverlay = document.getElementById("secretNoiseOverlay");
const judgeTimeOffsetMs = 20;
//パートナー追加時書き足す
const partners = {
  breaka: {
    name: "ブレイカ",
    icon: "images/partners/breaka_icon.png",
    full: "images/partners/breaka_full.png",
    iconScale: 1.0,
    expTable: [
      100, 120, 150, 180, 220,
      270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170,
      1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120,
      3370, 3630, 3900, 4180
    ] // Lv1→2, 2→3, ... 29→30の必要経験値（29個）
  },
  canon: { 
    name: "カノン",
    icon: "images/partners/canon_icon.png",
    full: "images/partners/canon_full.png",
    iconScale: 0.8,
    expTable: [100, 120, 150, 180, 220,
      270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170,
      1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120,
      3370, 3630, 3900, 4180] 
  }
};
resultBGM.loop = true;

// ---- ゲーム状態 ----
let combo = 0;
let life = 5000;
let score = 0;
let missCount = 0;
let goodCount = 0;
let yellowPerfectCount = 0;
let perfectCount = 0;
let fastCount = 0;
let lateCount = 0;
const maxLife = 5000;
const keys = {};
const notes = [];
const measureLines = [];
let started = false;
let paused = false;
let startDelayMs = 0;
let starting = false;

let prerollMs = travelTime;
let gameStartTime = 0;
let musicStarted = false;
let pauseStartedAt = 0;

let secretBossUnlocked = false;
let secretBossTriggered = false;
let secretBossTriggerChecked = false;
let secretBossTriggerTime = null;

async function loadSongInfo() {
  const infoResponse = await fetch(`songs/${currentSong}/info.json`);
  songInfo = await infoResponse.json();

  document.getElementById("songTitle").textContent = songInfo.title;
  document.getElementById("songArtist").textContent = songInfo.artist;

  const currentchart = songInfo.charts[currentDifficulty];
  const diffEl = document.getElementById("songDifficulty");
  diffEl.textContent = currentchart.difficulty + " Lv." + currentchart.level;

  diffEl.style.background = "";
  diffEl.style.webkitBackgroundClip = "";
  diffEl.style.webkitTextFillColor = "";
  diffEl.style.color = "";

  if (currentchart.difficulty.toLowerCase() === "expert") {
    diffEl.style.color = "#FF4444";
  } else if (currentchart.difficulty.toLowerCase() === "fracture") {
    diffEl.style.background = "linear-gradient(90deg, #FFB7C5, #B7E0FF)";
    diffEl.style.webkitBackgroundClip = "text";
    diffEl.style.webkitTextFillColor = "transparent";
  }

  if (songInfo.background) {
  document.body.style.backgroundImage = `url('songs/${currentSong}/${songInfo.background}')`;
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  document.body.style.backgroundRepeat = "no-repeat";
} else {
  document.body.style.backgroundImage = "";
}
}

async function loadChart() {
  const chartFile = songInfo.charts[currentDifficulty].file;
  const response = await fetch(`songs/${currentSong}/charts/${chartFile}`);
  const text = await response.text();
  const lines = text.split("\n").map(line => line.trim()).filter(line => line);

    chart = [];
  const tempoEvents = [];

  for (let line of lines) {
    if (line.startsWith("#")) continue;

    if (line.startsWith("@offset")) {
      const parts = line.split(",");
      offset = Number(parts[1]);
      continue;
    }

    if (line.startsWith("@startdelay")) {
  const parts = line.split(",");
  startDelayMs = Number(parts[1]);
  continue;
}

if (line.startsWith("@speed")) {
  const parts = line.split(",");
  const measure = Number(parts[1]);
  const division = parts[2].split("/").map(Number);
  const multiplier = Number(parts[3]);
  const timeMs = getNoteTime(measure, division) + offset;
  speedEvents.push({ timeMs, multiplier });
  continue;
}

    if (line.startsWith("@bpm")) {
      const parts = line.split(",");
      if (parts.length >= 3) {
        tempoEvents.push({
          measure: Number(parts[1]),
          bpm: Number(parts[2])
        });
      } else {
        BPM = Number(parts[1]);
        beatTime = 60000 / BPM;
      }
      continue;
    }

    if (line.startsWith("@timesig")) {
      const parts = line.split(",");
      if (parts.length >= 3) {
        tempoEvents.push({
          measure: Number(parts[1]),
          timesig: Number(parts[2])
        });
      } else {
        measureBeats = Number(parts[1]);
      }
      continue;
    }

    if (line.startsWith("@tempo")) {
      const parts = line.split(",");
      tempoEvents.push({
        measure: Number(parts[1]),
        bpm: Number(parts[2]),
        timesig: Number(parts[3])
      });
      continue;
    }
  
  }
  tempoMap = buildTempoMap(tempoEvents);

  tempoMap = buildTempoMap(tempoEvents);

// 速度イベントを時刻順にソート
speedEvents = [];
for (let line of lines) {
  if (!line.startsWith("@speed")) continue;
  const parts = line.split(",");
  const measure = Number(parts[1]);
  const division = parts[2].split("/").map(Number);
  const multiplier = Number(parts[3]);
  const timeMs = getNoteTime(measure, division) + offset;
  speedEvents.push({ timeMs, multiplier });
}
speedEvents.sort((a, b) => a.timeMs - b.timeMs);
  
  for (let line of lines) {

    if (line.startsWith("#")) continue;
    if (line.startsWith("@")) continue;

    // dual
    if (line.includes("dual")) {
      const laneText = line.match(/\[(.*?)\]/)[1];
      const lanes = laneText.split("|").map(Number);
      const parts = line.split(",");
      const hitTime = getNoteTime(Number(parts[0]), parts[1].split("/").map(Number));
      chart.push({
        lanes: lanes,
        measure: Number(parts[0]),
        division: parts[1].split("/").map(Number),
        type: "dual",
        hitTime: hitTime + offset,
        spawned: false
      });
      continue;
    }

    const parts = line.split(",");
    if (parts.length < 3) {
      console.log("不正な行:", line);
      continue;
    }

    // long
    if (parts.includes("long")) {
      const hitTime = getNoteTime(Number(parts[0]), parts[1].split("/").map(Number));
      const endTime = getNoteTime(Number(parts[4]), parts[5].split("/").map(Number));
      chart.push({
        lane: Number(parts[2]),
        measure: Number(parts[0]),
        division: parts[1].split("/").map(Number),
        endMeasure: Number(parts[4]),
        endDivision: parts[5].split("/").map(Number),
        type: "long",
        hitTime: hitTime + offset,
        endTime: endTime + offset,
        spawned: false
      });
      continue;
    }

    // simultaneous
    if (parts[2].includes("+")) {
      const lanes = parts[2].split("+").map(Number);
      for (let lane of lanes) {
        const hitTime = getNoteTime(Number(parts[0]), parts[1].split("/").map(Number));
        chart.push({
          lane: lane,
          measure: Number(parts[0]),
          division: parts[1].split("/").map(Number),
          type: "tap",
          hitTime: hitTime + offset,
          spawned: false
        });
      }
      continue;
    }

    // normal tap
    const hitTime = getNoteTime(Number(parts[0]), parts[1].split("/").map(Number));
    chart.push({
      lane: Number(parts[2]),
      measure: Number(parts[0]),
      division: parts[1].split("/").map(Number),
      type: "tap",
      hitTime: hitTime + offset,
      spawned: false
    });

    const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
secretBossUnlocked = saveData.secretBossUnlocked === true;

if (currentSong === SECRET_SOURCE_SONG && !secretBossUnlocked) {
  secretBossTriggerTime = getNoteTime(SECRET_TRIGGER_MEASURE, [0, 1]) + offset;
} else {
  secretBossTriggerTime = null;
}
  }

  // ノーツ数を数えて得点を計算（ロングは始点1個扱い）
  let totalNotes = 0;
  for (let note of chart) {
    totalNotes++;
  }
  perfectScore = 1000000 / totalNotes;
  goodScore = perfectScore * 0.7;

  console.log("総ノーツ数:", totalNotes);
  console.log("パーフェクト1個:", perfectScore, "点");
  console.log("グッド1個:", goodScore, "点");
  console.log(chart);
}

function getVisualOffsetFromTime(targetMs) {
  // 基本速度での1msあたりのpx
  const basePxPerMs = distance / travelTime;

  if (speedEvents.length === 0) {
    return targetMs * basePxPerMs;
  }

  let visualOffset = 0;
  let currentMultiplier = 1.0;
  let prevMs = 0;

  for (const event of speedEvents) {
    if (event.timeMs >= targetMs) break;
    visualOffset += (event.timeMs - prevMs) * basePxPerMs * currentMultiplier;
    prevMs = event.timeMs;
    currentMultiplier = event.multiplier;
  }

  visualOffset += (targetMs - prevMs) * basePxPerMs * currentMultiplier;
  return visualOffset;
}

function showJudgeText(text, color) {
  result.textContent = text;
  result.style.color = color;
  result.classList.remove("judgePop");
  void result.offsetWidth;
  result.classList.add("judgePop");
}

function spawnParticles(laneIndex, color) {
  const laneElement = document.getElementById("lane" + laneIndex);
  if (!laneElement) return;

  for (let i = 0; i < 10; i++) {
    const particle = document.createElement("div");
    particle.classList.add("particle");
    particle.style.background = color;
    particle.style.boxShadow = `0 0 4px ${color}`;
    particle.style.left = (Math.random() * 60 + 10) + "px";
    particle.style.top = "490px"; 
    const tx = (Math.random() - 0.5) * 60;
    const ty = -(Math.random() * 80 + 40);
    particle.style.setProperty("--tx", tx + "px");
    particle.style.setProperty("--ty", ty + "px");
    particle.style.animation = `particleFly ${0.4 + Math.random() * 0.3}s ease-out forwards`;
    laneElement.appendChild(particle);
    setTimeout(() => particle.remove(), 800);
  }
}

function spawnLaneGlow(laneIndex, color, opacity = 0.3) {
  const laneElement = document.getElementById("lane" + laneIndex);
  if (!laneElement) return;
  const glow = document.createElement("div");
  glow.classList.add("laneGlowEffect");
  glow.style.background = `linear-gradient(to top, ${color}, transparent)`;
  glow.style.position = "absolute";
  glow.style.top = "0";
  glow.style.left = "0";
  glow.style.width = "100%";
  glow.style.height = "100%";
  glow.style.opacity = opacity;
  glow.style.zIndex = "50";
  glow.style.pointerEvents = "none";
  glow.style.animation = "laneGlow 0.4s ease-out forwards";
  laneElement.appendChild(glow);
  setTimeout(() => glow.remove(), 400);
}

function showFinishSplash(text, color) {
  if (life <= 0) return;

  const clearSplash = document.getElementById("clearSplash");
  if (!clearSplash) return;

  clearSplash.textContent = text;
  clearSplash.style.color = color;

  clearSplash.classList.remove("show");
  void clearSplash.offsetWidth;
  clearSplash.classList.add("show");

  const particleColor = color || "#66ddff";
  for (let lane = 0; lane < 5; lane++) {
    spawnParticles(lane, particleColor);
  }

  setTimeout(() => {
    clearSplash.classList.remove("show");
  }, 1300);
}

function showFinishRing(color = "rgba(255, 183, 197, 0.8)") {
  const ring = document.getElementById("finishRing");
  if (!ring) return;

  ring.style.borderColor = color;
  ring.classList.remove("show");
  void ring.offsetWidth;
  ring.classList.add("show");

  setTimeout(() => {
    ring.classList.remove("show");
  }, 650);
}

// ---- スコア・UI更新 ----
function updateScore() {
  scoreText.textContent = Math.round(score).toString().padStart(7, "0");
  updateRank();
  updateComboGlow();
  updateJudgeCounters();
}

function updateRank() {
  const currentScore = Math.round(score);
  let rank, color, gradient;

  if (currentScore >= 1000000) {
    rank = "SS";
    gradient = true;
  } else if (currentScore >= 990000) {
    rank = "S++";
    color = "#FFD700";
  } else if (currentScore >= 980000) {
    rank = "S+";
    color = "#FFD700";
  } else if (currentScore >= 950000) {
    rank = "S";
    color = "#FFD700";
  } else if (currentScore >= 920000) {
    rank = "A+";
    color = "#FF4444";
  } else if (currentScore >= 880000) {
    rank = "A";
    color = "#FF4444";
  } else if (currentScore >= 840000) {
    rank = "B+";
    color = "#66BBFF";
  } else if (currentScore >= 800000) {
    rank = "B";
    color = "#66BBFF";
  } else if (currentScore >= 600000) {
    rank = "C";
    color = "#4488AA";
  } else if (currentScore >= 300000) {
    rank = "D";
    color = "#4488AA";
  } else {
    rank = "F";
    color = "#888888";
  }

  rankText.textContent = rank;

  if (gradient) {
    rankText.style.background =
      "linear-gradient(90deg, #FF0000, #FF7700, #FFFF00, #00FF00, #0000FF, #8B00FF)";
    rankText.style.webkitBackgroundClip = "text";
    rankText.style.webkitTextFillColor = "transparent";
    rankText.style.color = "";
  } else {
    rankText.style.background = "";
    rankText.style.webkitBackgroundClip = "";
    rankText.style.webkitTextFillColor = "";
    rankText.style.color = color;
  }
}

function updateCover() {
  if (keys["d"] || keys["f"] || keys[" "] || keys["j"] || keys["k"]) {
    cover.style.opacity = "1";
  } else {
    cover.style.opacity = "0";
  }
}

function updateLifeBar() {
  const percent = (life / maxLife) * 100;
  lifeFill.style.width = percent + "%";
  let r, g;
  if (percent > 50) {
    r = Math.floor(255 * ((100 - percent) / 50));
    g = 255;
  } else {
    r = 255;
    g = Math.floor(255 * (percent / 50));
  }
  lifeFill.style.backgroundColor = `rgb(${r}, ${g}, 0)`;
}

function updateComboGlow() {
  if (missCount === 0 && goodCount === 0) {
    comboText.classList.add("glowing");
  } else {
    comboText.classList.remove("glowing");
  }
}

function updateJudgeCounters() {
  const yellowEl = document.getElementById("yellowPerfectCounter");
  const whiteEl = document.getElementById("whitePerfectCounter");
  const goodEl = document.getElementById("goodCounter");
  const missEl = document.getElementById("missCounter");

  if (yellowEl) yellowEl.textContent = yellowPerfectCount;
  if (whiteEl) whiteEl.textContent = perfectCount;
  if (goodEl) goodEl.textContent = goodCount;
  if (missEl) missEl.textContent = missCount;
}

function checkFailure() {
  if (life <= 0) {
    comboText.style.display = "none";
    failedText.style.opacity = "1";
  }
}

function applyMiss(showText = true) {
  if (showText) {
    showJudgeText("Miss...", "#FF4444");
  }
  combo = 0;
  comboText.textContent = "0 Combo";
  life -= 70;
  if (life < 0) life = 0;
  updateLifeBar();
  checkFailure();
  missCount++;
  updateComboGlow();
  updateJudgeCounters();
}

// ---- ノーツ・小節線生成 ----
function getCurrentMs() {
  if (!started) return -prerollMs;
  return performance.now() - gameStartTime - prerollMs;
}

function getYFromTime(hitTime) {
  const currentMs = getCurrentMs();

  if (speedEvents.length === 0) {
    // 速度変化なし：従来通り
    const progress = (currentMs - hitTime + travelTime) / travelTime;
    return spawnY + distance * progress;
  }

  // 速度変化あり：視覚的オフセットで計算
  const basePxPerMs = distance / travelTime;
  const currentVisual = getVisualOffsetFromTime(currentMs);
  const hitVisual = getVisualOffsetFromTime(hitTime);

  return judgeY - (hitVisual - currentVisual);
}

function getSpawnTimeFromHitTime(hitTime) {
  const basePxPerMs = distance / travelTime;
  const hitVisual = getVisualOffsetFromTime(hitTime);
  const spawnVisual = hitVisual - distance;

  let spawnTime = hitTime - travelTime;

  if (speedEvents.length > 0) {
    let accumulated = 0;
    let prevMs = 0;
    let currentMultiplier = 1.0;
    let found = false;

    for (const event of speedEvents) {
      const segmentVisual = (event.timeMs - prevMs) * basePxPerMs * currentMultiplier;

      if (accumulated + segmentVisual >= spawnVisual) {
        spawnTime = prevMs + (spawnVisual - accumulated) / (basePxPerMs * currentMultiplier);
        found = true;
        break;
      }

      accumulated += segmentVisual;
      prevMs = event.timeMs;
      currentMultiplier = event.multiplier;
    }

    if (!found) {
      spawnTime = prevMs + (spawnVisual - accumulated) / (basePxPerMs * currentMultiplier);
    }
  }

  return spawnTime;
}

function createNote(noteData) {
  const note = document.createElement("div");
  note.classList.add("note");

  if (noteData.type === "dual") {
    note.classList.add("dual");
  }

 if (noteData.type === "long") {
  const startVisual = getVisualOffsetFromTime(noteData.hitTime);
  const endVisual = getVisualOffsetFromTime(noteData.endTime);
  noteData.length = (endVisual - startVisual) + longStartVisualOffsetPx;
  note.style.height = noteData.length + "px";
  note.style.transform = "translateY(-100%)";
  note.style.background = "#FF8800";
}

  if (noteData.type === "dual") {
    const laneCount = noteData.lanes.length;
    note.style.width = (laneCount * 100 - 20) + "px";
  }

  if (noteData.type === "tap" || noteData.type === "dual") {
  note.style.transform = "translateY(-50%)";
}

  noteData.element = note;

  const laneIndex = noteData.lanes ? noteData.lanes[0] : noteData.lane;

    const game = document.getElementById("game");

  note.style.left = (laneIndex * 100 + 10) + "px";
  game.appendChild(note);
}

function createMeasureLine(measure, measureTime) {
  const line = document.createElement("div");
  line.classList.add("measureLine");
  document.getElementById("game").appendChild(line);
  measureLines.push({
    measure: measure,
    measureTime: measureTime,
    element: line,
    active: true
  });
}

// ---- ゲームループ ----
function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (!started) return;
  if (paused) return;

  const currentMs = getCurrentMs();

  if (
  secretBossTriggerTime !== null &&
  !secretBossTriggerChecked &&
  currentMs >= secretBossTriggerTime
) {
  secretBossTriggerChecked = true;

  if (life > 0) {
    secretBossTriggered = true;
    secretNoiseOverlay.classList.add("active");
  }
}

  if (!musicStarted && currentMs >= 0) {
  musicStarted = true;
  music.currentTime = 0;
  music.play().catch(e => {
    console.error("music.play failed:", e);
  });
}

    // 小節線生成
  for (let measure = 1; measure <= 100; measure++) {
    const measureTime = getNoteTime(measure, [0, 1]) + offset;
    const spawnTime = getSpawnTimeFromHitTime(measureTime);

    if (currentMs >= spawnTime && !measureLines.some(l => l.measure === measure)) {
      createMeasureLine(measure, measureTime);
    }
  }

  // 小節線更新
  for (let line of measureLines) {
    if (!line.active) continue;
    const y = getYFromTime(line.measureTime);
    line.element.style.top = y + "px";
    if (y > 700) {
      line.active = false;
      line.element.remove();
    }
  }

  // ノーツ生成
for (let noteData of chart) {
  const spawnTime = getSpawnTimeFromHitTime(noteData.hitTime);

  if (!noteData.spawned && currentMs >= spawnTime) {
      noteData.active = true;
      noteData.holding = false;
      noteData.holdResult = null; // 始点判定結果（"perfect" or "good"）
      noteData.endJudged = false;
      createNote(noteData);
      notes.push(noteData);
      noteData.spawned = true;
    }
  }

  // ノーツ更新
  for (let note of notes) {
    if (!note.active) continue;

    note.y = getYFromTime(note.hitTime);

if (note.type === "long") {
  note.element.style.top = (note.y + longStartVisualOffsetPx) + "px";
} else {
  note.element.style.top = note.y + "px";
}

// ロングノーツの処理
 if (note.type === "long") {

 // 始点を過ぎても押されていない → ミス確定
 if (!note.holding && note.holdResult === null && note.y > judgeY + 100) {
 applyMiss();
 note.holdResult = "miss";
 note.holding = true; // 終点まで監視を続けるためtrueにする
  }

  // 色の切り替え：今実際にキーが押されているかどうかで判定
  if (note.holding && note.holdResult !== "miss") {
    const holdKey = keys[laneKeys[note.lane]];
    if (holdKey && !note.releasedOnce) {
      // 押している間は黄色
      note.element.style.background = "#ffaa00";
      note.element.style.boxShadow = "0 0 10px #FFaa00";
    } else {
      // 離したらオレンジに戻る、かつ一度離したフラグを立てる
      if (!holdKey) note.releasedOnce = true;
      note.element.style.background = "#FF8800";
      note.element.style.boxShadow = "0 0 10px #FF8800";
    }

    if (holdKey && !note.releasedOnce) {
  // 押している間は黄色
  note.element.style.background = "#ffaa00";
  note.element.style.boxShadow = "0 0 10px #FFaa00";

  // パーティクルを一定間隔で出す ← 追加
  note.particleTick = (note.particleTick || 0) + 1;
  if (note.particleTick >= 8) { // 8フレームごとに1回
    note.particleTick = 0;
    spawnParticles(note.lane, "#00FF88");
  }
} else {
  if (!note.holding) note.releasedOnce = true;
  note.element.style.background = "#FF8800";
  note.element.style.boxShadow = "0 0 10px #FF8800";
  note.particleTick = 0; // リセット
}
  }

// ロング終点の処理
if (note.holding) {
  const endY = getYFromTime(note.endTime);

  // 判定は今まで通り。longEndJudgeEarlyPx の分だけ早く判定される。
  if (!note.endJudged && endY > judgeY - longEndJudgeEarlyPx) {
    note.endJudged = true;

    if (note.holdResult !== "miss") {
      const holdKey = keys[laneKeys[note.lane]];

      if (holdKey) {
        if (note.holdResult === "perfect") {
          showJudgeText("Perfect!","#FFE87C");
          score += perfectScore + 1;
          yellowPerfectCount++;
        } else {
          showJudgeText("Good!","#88FF88");
          score += goodScore;
          goodCount++;
        }

        combo++;
        comboText.textContent = combo + " Combo";
        updateScore();
      } else {
        applyMiss();
      }
    }
  }

  // 削除は見た目上の終点が判定ラインを超えたら。
  const visualEndY = parseFloat(note.element.style.top) - note.element.offsetHeight;

  if (visualEndY > judgeY) {
    note.active = false;
    note.element.remove();
    checkClear();
  }
}

continue;
}

    // tap / dual のミス判定
    if (
      (note.type === "tap" || note.type === "dual") &&
      note.y > judgeY + 100
    ) {
      applyMiss();
      note.active = false;
      note.element.remove();
      checkClear();
    }
  }

  updateCover();
}

function checkClear() {
  console.log("checkClear呼び出し元:", new Error().stack);
  console.log("chartの中身:", chart);
  console.log("notes:", notes.length, "chart.length:", chart.length, "active:", notes.filter(n => n.active).length);
  console.log("checkClear", "notes:", notes.length, "chart:", chart.length, "active:", notes.filter(n => n.active).length);
  if (notes.length === 0) { console.log("return: notes 0"); return; }
  if (notes.filter(n => n.active).length > 0) { console.log("return: active"); return; }
  if (notes.length < chart.length) { console.log("return: notes < chart"); return; }
  console.log("クリア条件満たした！");
  // 以下はそのまま

  if (yellowPerfectCount === chart.length) {
  showFinishRing("rgba(255, 255, 255, 0.9)");
  showFinishSplash("ULTIMATE PERFECT!!!", "#FFB7C5");
} else if (missCount === 0 && goodCount === 0) {
  showFinishRing("rgba(255, 183, 197, 0.8)");
  showFinishSplash("ALL PERFECT!!", "#FFB7C5");
} else if (missCount === 0) {
  showFinishSplash("FULL COMBO!!", "#FFD700");
} else {
  showFinishSplash("CLEAR!", "#66ddff");
}
showResult();
}

function calculateRateFromSaveData(saveData) {
  const rateConstants = [];

  for (const songId in saveData) {
    if (songId === "settings" || songId === "profile" || songId === "secretBossUnlocked") {
      continue;
    }

    const songScores = saveData[songId];
    if (!songScores || typeof songScores !== "object") continue;

    for (const difficultyIndex in songScores) {
      const record = songScores[difficultyIndex];
      const bestScore = Number(record?.bestScore || 0);
      const level = Number(record?.level || 0);

      if (bestScore <= 0 || level <= 0) continue;

      const rateConstant = Math.round((level * bestScore / 1000000) * 10) / 10;
      rateConstants.push(rateConstant);
    }
  }

  rateConstants.sort((a, b) => b - a);

  const top20 = rateConstants.slice(0, 20);
  while (top20.length < 20) {
    top20.push(0);
  }

  return Math.round(top20.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

function calcExpGain(level) {
  const chartLevel = songInfo.charts[currentDifficulty].level;
  const finalScore = Math.round(score);

  // GOOD以上の数（yellowPerfect + perfect + good）
  const goodOrAbove = yellowPerfectCount + perfectCount + goodCount;

  // 倍率計算（最小0.1、最大1.5）
  const accuracyMultiplier = Math.min(1.5, Math.max(0.1, goodOrAbove / 300));

  let exp = 100 * (1 + chartLevel / 20) * (finalScore / 500000) * accuracyMultiplier;

  if (life <= 0) {
    exp *= 0.5;
  } else if (missCount === 0 && goodCount === 0) {
    exp += 100; // AP
  } else if (missCount === 0) {
    exp += 50; // FC
  }

  return Math.round(exp);
}

function applyPartnerExp() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");

  if (!saveData.profile) {
    saveData.profile = {};
  }

  const partnerId = saveData.profile.partner || "breaka";
  const partner = partners[partnerId];

  if (!partner) {
    return { expGain: 0, levelUps: [] };
  }

  if (!saveData.partnerData) {
    saveData.partnerData = {};
  }

  if (!saveData.partnerData[partnerId]) {
    saveData.partnerData[partnerId] = {
      level: 1,
      exp: 0
    };
  }

  const data = saveData.partnerData[partnerId];
  const expGain = calcExpGain(data.level);
  const levelUps = [];

  data.exp += expGain;

  // レベルアップ処理
  while (data.level < 30) {
    const needed = partner.expTable[data.level - 1];
    if (data.exp >= needed) {
      data.exp -= needed;
      data.level++;
      levelUps.push(data.level);
    } else {
      break;
    }
  }

  if (data.level >= 30) {
    data.exp = 0;
  }

  localStorage.setItem("rhythmGame", JSON.stringify(saveData));

  return { expGain, levelUps };
}

function showResult() {
  if (showResult.called) return; // 2重呼び出し防止
  showResult.called = true;
  if (secretBossTriggered && !secretBossUnlocked) {
  blackOverlay.classList.add("dark");

  setTimeout(() => {
    location.href = `boss_intro.html?difficulty=${currentDifficulty}`;
  }, 3000);

  return;
}
  updateRank();
  document.getElementById("songInfo").style.display = "none";
  const finalScore = Math.round(score);
  console.log("finalScore:", finalScore);

  // 自己ベスト取得・更新
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
if (!saveData[currentSong]) saveData[currentSong] = {};
if (!saveData[currentSong][currentDifficulty]) saveData[currentSong][currentDifficulty] = {};
const prev = saveData[currentSong][currentDifficulty];
const wasPlayed = prev.played === true;
prev.played = true;
const oldRate = Number(saveData.profile?.rate || 0);
const isNewBest = finalScore > (prev.bestScore || 0);
const currentChart = songInfo.charts[currentDifficulty];

prev.level = Number(currentChart.level || 0);

  if (isNewBest) prev.bestScore = finalScore;
  prev.level = Number(currentChart.level || 0);
  if (life > 0) prev.cleared = true;
  if (missCount === 0) prev.fullCombo = true;
  if (missCount === 0 && goodCount === 0) prev.allPerfect = true;
  if (yellowPerfectCount === chart.length) prev.ultimatePerfect = true;

  // ランクを取得
  const currentRank = rankText.textContent;
  if (!prev.bestRank || finalScore >= (prev.bestScore || 0)) {
    prev.bestRank = currentRank;
  }

  if (currentSong === SECRET_BOSS_SONG && bossChallenge) {
  saveData.secretBossUnlocked = true;
}

const newRate = calculateRateFromSaveData(saveData);
const rateGain = Math.round((newRate - oldRate) * 10) / 10;

if (!saveData.profile) saveData.profile = {};
saveData.profile.rate = newRate;

  localStorage.setItem("rhythmGame", JSON.stringify(saveData));

const partnerId = saveData.profile?.partner || "breaka";
const partner = partners[partnerId] || partners.breaka;

document.getElementById("profileName").textContent =
  saveData.profile.username || "Player";

document.getElementById("profileRate").textContent =
  "RATE " + Number(newRate || 0).toFixed(1);

document.getElementById("rateGain").textContent =
  rateGain > 0 ? "+" + rateGain.toFixed(1) : "";

const resultProfileIcon = document.getElementById("partnerIcon");
if (resultProfileIcon) {
  resultProfileIcon.src = partner.icon;
  const scale = partner.iconScale || 1.0;
  resultProfileIcon.style.width = (72 * scale) + "px";
  resultProfileIcon.style.height = (72 * scale) + "px";
}

const resultPartnerimage = document.getElementById("resultPartnerImage");
if (resultPartnerimage) {
  resultPartnerimage.src = partner.full;
}

  // リザルト画面に値をセット
  resultTitle.textContent = songInfo.title;
  resultArtist.textContent = songInfo.artist;
resultDifficulty.textContent = currentChart.difficulty + " Lv." + currentChart.level;

// ジャケット画像
document.getElementById("resultJacket").src = `songs/${currentSong}/jacket.png`;

// 難易度ごとの色設定
resultDifficulty.style.background = "";
resultDifficulty.style.webkitBackgroundClip = "";
resultDifficulty.style.webkitTextFillColor = "";
resultDifficulty.style.color = "";
if (currentChart.difficulty.toLowerCase() === "basic") {
  resultDifficulty.style.color = "cyan";
} else if (currentChart.difficulty.toLowerCase() === "expert") {
  resultDifficulty.style.color = "#FF4444";
} else if (currentChart.difficulty.toLowerCase() === "fracture") {
  resultDifficulty.style.background = "linear-gradient(90deg, #FFB7C5, #B7E0FF)";
  resultDifficulty.style.webkitBackgroundClip = "text";
  resultDifficulty.style.webkitTextFillColor = "transparent";
}

  resultScore.textContent = finalScore.toString().padStart(7, "0");
  resultBestScore.textContent = isNewBest
    ? "NEW BEST!"
    : "BEST: " + (prev.bestScore || 0).toString().padStart(7, "0");

  // ランク表示
  resultRank.textContent = currentRank;
  resultRank.style.color = rankText.style.color || "";
  resultRank.style.background = rankText.style.background || "";
  resultRank.style.webkitBackgroundClip = rankText.style.webkitBackgroundClip || "";
  resultRank.style.webkitTextFillColor = rankText.style.webkitTextFillColor || "";

  // バッジ表示
if (life <= 0) {
  resultBadge.textContent = "FAILED";
  resultBadge.style.color = "#888888";
  resultBadge.style.transform = "rotate(10deg)";
  resultBadge.style.position = "relative";
  resultBadge.style.left = "40px";
} else if (yellowPerfectCount === chart.length) {
  resultBadge.textContent = "ULTIMATE PERFECT!!!";
  resultBadge.style.background = "linear-gradient(90deg, #FFB7C5, #B7E0FF)";
  resultBadge.style.webkitBackgroundClip = "text";
  resultBadge.style.webkitTextFillColor = "transparent";
  resultBadge.style.transform = "";
} else if (missCount === 0 && goodCount === 0) {
  resultBadge.textContent = "ALL PERFECT!!";
  resultBadge.style.color = "#FFB7C5";
  resultBadge.style.transform = "";
} else if (missCount === 0) {
  resultBadge.textContent = "FULL COMBO!!";
  resultBadge.style.color = "#FFD700";
  resultBadge.style.transform = "";
} else {
  resultBadge.textContent = "CLEAR!";
  resultBadge.style.color = "white";
  resultBadge.style.transform = "";
}

  // 判定内訳
  resultYellowPerfect.textContent = "Perfect: " + yellowPerfectCount;
  resultPerfect.textContent = "Perfect: " + perfectCount;
  resultGood.textContent = "Good: " + goodCount;
  resultMiss.textContent = "Miss: " + missCount;
  resultFast.textContent = "Fast: " + fastCount;
  resultLate.textContent = "Late: " + lateCount;

  setTimeout(() => {
  resultScreen.classList.add("visible");
  setTimeout(() => {
    resultScreen.classList.add("fadeIn");
  }, 100);
  music.pause(); // プレイ中の曲を止める
  resultBGM.play(); // リザルトBGMを流す
  
  const { expGain, levelUps } = applyPartnerExp();
  const notify = document.getElementById("partnerExpNotify");
  notify.innerHTML = "";

  //ストーリー
  const storyUnlockNotice = document.getElementById("storyUnlockNotice");

if (storyUnlockNotice) {
  const unlockedByThisPlay =
    !wasPlayed &&
    (currentSong === "song5" || currentSong === "boss" || currentSong === "song2");

  if (unlockedByThisPlay) {
    storyUnlockNotice.textContent = "ストーリーが解禁されました。";
    storyUnlockNotice.classList.add("visible");
  } else {
    storyUnlockNotice.textContent = "";
    storyUnlockNotice.classList.remove("visible");
  }
}

  // 経験値表示
  const expText = document.createElement("div");
  expText.classList.add("expNotifyText");
  expText.textContent = `+${expGain} EXP`;
  notify.appendChild(expText);

  // レベルアップ表示
  levelUps.forEach((newLevel, i) => {
    setTimeout(() => {
      const lvText = document.createElement("div");
      lvText.classList.add("levelUpText");
      lvText.textContent = `↑ Lv.${newLevel}`;
      notify.appendChild(lvText);
    }, 800 * (i + 1));
  })
}, 2000);
}

function startGamePlay() {
  if (started || starting) return;

  starting = true;
  started = true;
  musicStarted = false;

  music.pause();
  music.currentTime = 0;

  // startDelayMs がある場合は、その時間だけ待ってからプリロール開始。
  gameStartTime = performance.now() + Math.max(0, startDelayMs);

  startText.style.display = "none";

  starting = false;
}

// ---- キー入力 ----
document.addEventListener("keydown", async (e) => {
  if (keys[e.key]) return; // キーリピート防止
  keys[e.key] = true;

  // ゲーム開始
  if (e.key === " " && !started && !starting) {
    e.preventDefault();
    startGamePlay();
    return;
  }

  const targetLane = keyToLane[e.key];
  if (!targetLane) return;

  // 押したレーンを光らせる
  const laneElement = document.getElementById(targetLane);
  const flash = laneElement.querySelector(".flash");
  flash.style.opacity = "1";
  setTimeout(() => { flash.style.opacity = "0"; }, 100);

  // グローエフェクト（キーを叩いた時に常に発生）
  console.log("グロー呼び出し:", targetLane);
spawnLaneGlow(Number(targetLane.replace("lane", "")), "white");

  // dualノーツの場合、関係するレーンをすべて光らせる
  for (let note of notes) {
    if (!note.active) continue;
    if (note.type !== "dual") continue;
    const hit = note.lanes.some(lane => "lane" + lane === targetLane);
    if (!hit) continue;
    for (let lane of note.lanes) {
      const dualLane = document.getElementById("lane" + lane);
      const dualFlash = dualLane.querySelector(".flash");
      dualFlash.style.opacity = "1";
      setTimeout(() => { dualFlash.style.opacity = "0"; }, 100);
      spawnLaneGlow(lane, "#66DDFF",0.6);
    }
    break;
  }

  // ノーツ判定
  for (let note of notes) {
    if (!note.active) continue;

    // レーンチェック
    if (note.type === "dual") {
      const hit = note.lanes.some(lane => "lane" + lane === targetLane);
      if (!hit) continue;
    } else {
      if ("lane" + note.lane !== targetLane) continue;
    }

    const laneIndex = Number(targetLane.replace("lane", ""));

    const judgedMs = getCurrentMs() - judgeTimeOffsetMs;
const diff = Math.abs(judgedMs - note.hitTime);

    // ロングノーツの始点判定
if (note.type === "long") {
  if (getCurrentMs() < note.hitTime - 140) {
  continue;
}
  if (diff < 60) {
    note.holdResult = "perfect";
    note.holding = true;
    showJudgeText("Perfect!","#FFE87C");
    fastLateText.textContent = "";
    comboText.textContent = combo + " Combo";
spawnParticles(laneIndex, "#FFE87C");
    break;
  } else if (diff < 120) {
    note.holdResult = "good";
    note.holding = true;
    showJudgeText("Good!","#88FF88");
    fastLateText.textContent = getCurrentMs() < note.hitTime ? "Fast" : "Late";
    comboText.textContent = combo + " Combo";
    if (getCurrentMs() < note.hitTime) {
    fastCount++;
  } else {
    lateCount++;
  }
spawnParticles(laneIndex, "#FFE87C");
    break;
  }
  continue;
}

// tap / dual の判定
if (diff < 40) {
  showJudgeText("Perfect!","#FFE87C");
  fastLateText.textContent = "";
  combo++;
  yellowPerfectCount++
  score += perfectScore + 1;
  updateScore();
  comboText.textContent = combo + " Combo";
  note.active = false;
  note.element.remove();
  checkClear();
spawnParticles(laneIndex, "#FFE87C");
  break;
} else if (diff < 60) {
  showJudgeText("Perfect!","white");
  fastLateText.textContent = getCurrentMs() < note.hitTime ? "Fast" : "Late";
  combo++;
    perfectCount++;
  if (getCurrentMs() < note.hitTime) {
    fastCount++;
  } else {
    lateCount++;
  }
  score += perfectScore;
  updateScore();
  comboText.textContent = combo + " Combo";
  note.active = false;
  note.element.remove();
  checkClear();
spawnParticles(laneIndex, "#FFE87C");
  break;
} else if (diff < 120) {
  showJudgeText("Good!","#88FF88");
  fastLateText.textContent = getCurrentMs() < note.hitTime ? "Fast" : "Late";
  combo++;
  goodCount++
  if (getCurrentMs() < note.hitTime) {
    fastCount++;
  } else {
    lateCount++;
  }
  score += goodScore;
  updateScore();
  comboText.textContent = combo + " Combo";
  note.active = false;
  note.element.remove();
  checkClear();
  spawnParticles(laneIndex, "white");
  break;
} else if (diff < 150) {
  showJudgeText("Miss...", "#FF4444");
  fastLateText.textContent = getCurrentMs() < note.hitTime ? "Fast" : "Late";
  if (getCurrentMs() < note.hitTime) {
    fastCount++;
  } else {
    lateCount++;
  }
  applyMiss(false); // showJudgeTextをスキップ
  note.active = false;
  note.element.remove();
  checkClear();
  break;
}
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

// ---- 起動 ----
async function startGame() {
  await loadSongInfo();
  await loadChart();
  updateLifeBar();
  updateJudgeCounters();
  gameLoop();

  // フェードイン
  setTimeout(() => {
  console.log("fadeIn追加します");
  fadeOverlay.classList.add("fadeIn");
  console.log("fadeOverlayのクラス:", fadeOverlay.classList);
}, 100);
}

function goToSelect() {
  resultBGM.pause();
  resultBGM.currentTime = 0;
  blackOverlay.classList.add("dark");
  setTimeout(() => {
    location.href = `select.html?song=${currentSong}&difficulty=${currentDifficulty}`;
  }, 600);
}

retryButton.addEventListener("click", () => {
  resultBGM.pause();
  resultBGM.currentTime = 0;
  blackOverlay.classList.add("dark");
  setTimeout(() => {
    location.reload();
  }, 600);
});

pauseButton.addEventListener("click", () => {
  pauseButton.blur();
  if (!started || paused || showResult.called) return;

  paused = true;
  pauseStartedAt = performance.now();

  if (musicStarted) {
    music.pause();
  }

  pauseScreen.classList.add("visible");
  setTimeout(() => {
    pauseScreen.classList.add("fadeIn");
  }, 100);
});

document.getElementById("pauseRetry").addEventListener("click", () => {
  location.reload();
});

document.getElementById("selectButton").addEventListener("click", () => {
  goToSelect();
});

document.getElementById("pauseBack").addEventListener("click", () => {
  goToSelect();
});

document.getElementById("pauseContinue").addEventListener("click", () => {
  if (!paused) return;

  const pausedDuration = performance.now() - pauseStartedAt;
  gameStartTime += pausedDuration;

  paused = false;

  if (musicStarted) {
    music.play().catch(e => {
      console.error("music.play failed:", e);
    });
  }

  pauseScreen.classList.remove("fadeIn");
  setTimeout(() => {
    pauseScreen.classList.remove("visible");
  }, 300);
});

if (autoStart) {
  setTimeout(() => {
    startGamePlay();
  }, 800);
}

document.addEventListener("wheel", (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
  }
}, { passive: false });

function debugForceClear() {
  if (!started || paused || showResult.called) return;

  // FAILED状態なら少しだけ回復させてクリア扱いにする
  if (life <= 0) {
    life = 1;
    updateLifeBar();
  }

  // 残っているノーツを全部消す
  for (const note of notes) {
    if (note.active && note.element) {
      note.element.remove();
    }
    note.active = false;
  }

  // 未生成ノーツも生成済み扱いにする
  for (const noteData of chart) {
    noteData.spawned = true;
    noteData.active = false;
  }

  comboText.style.display = "none";

  showResult();
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") {
    e.preventDefault();
    debugForceClear();
  }
});

function loadPlayProfilePanel() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const profile = saveData.profile || {};

  const partnerId = profile.partner || "breaka";
  const partner = partners[partnerId] || partners.breaka;

  const nameEl = document.getElementById("playProfileName");
  const rateEl = document.getElementById("playProfileRate");
  const iconEl = document.getElementById("playPartnerIcon");

  if (nameEl) {
    nameEl.textContent = profile.username || "Player";
  }

  if (rateEl) {
    rateEl.textContent = "RATE " + Number(profile.rate || 0).toFixed(1);
  }
if (iconEl) {
  iconEl.src = partner.icon;
  const scale = partner.iconScale || 1.0;
  iconEl.style.width = (72 * scale) + "px";
  iconEl.style.height = (72 * scale) + "px";
}
}

window.addEventListener("DOMContentLoaded", () => {
  loadPlayProfilePanel();
  startGame();
});