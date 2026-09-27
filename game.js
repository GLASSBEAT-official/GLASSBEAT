const params = new URLSearchParams(window.location.search);
const currentSong = params.get("song") || "song1";
const currentDifficulty = Number(params.get("difficulty")) || 0;
const bossChallenge = params.get("bossChallenge") === "1";
const SECRET_SOURCE_SONG = "song3";
const SECRET_BOSS_SONG = "boss";
const SECRET_TRIGGER_MEASURE = 94;
const autoStart = params.get("autoStart") === "1";
const boss3Intro = params.get("boss3Intro") === "1";
const userOffset = Number(params.get("userOffset")) || 0;
const storyChallenge = params.get("storyChallenge") === "1";
const boss2Challenge = params.get("boss2Challenge") === "1";
const skipStoryIntro = params.get("skipStoryIntro") === "1";
const bulletChallenge = params.get("bulletChallenge") === "1";
const boss3Challenge = params.get("boss3Challenge") === "1";
const unlockChallenge = storyChallenge || bulletChallenge || boss3Challenge;
const mapMode = params.get("mode") === "map";
const song19StoryChallenge = boss3Challenge && currentSong === "song19";
const chapter4StoryChallenge = storyChallenge && currentSong === "song33";
const song35StoryChallenge = storyChallenge && currentSong === "song35";
const boss4ChaosIntroMode = currentSong === "boss4" && params.get("boss4ChaosIntro") === "1";
const BOSS4_ACCESS_TICKET_KEY = "glassbeatBoss4AccessTicket";
const BOSS4_RELOAD_PERMIT_KEY = "glassbeatBoss4ReloadPermit";

function issueBoss4AccessTicket(difficulty, chaosIntro = false) {
  try {
    sessionStorage.setItem(BOSS4_ACCESS_TICKET_KEY, JSON.stringify({
      difficulty: Number(difficulty),
      chaosIntro: Boolean(chaosIntro),
      expiresAt: Date.now() + 15000
    }));
  } catch (error) {
    console.warn("boss4 access ticket could not be saved:", error);
  }
}

function consumeBoss4AccessTicket() {
  if (currentSong !== "boss4") return true;
  try {
    const rawTicket = sessionStorage.getItem(BOSS4_ACCESS_TICKET_KEY);
    sessionStorage.removeItem(BOSS4_ACCESS_TICKET_KEY);
    if (rawTicket) {
      const ticket = JSON.parse(rawTicket);
      if (
        Number(ticket.difficulty) === currentDifficulty
        && ticket.chaosIntro === boss4ChaosIntroMode
        && Number(ticket.expiresAt) >= Date.now()
      ) return true;
    }

    const navigationEntry = performance.getEntriesByType("navigation")[0];
    if (navigationEntry?.type !== "reload") return false;
    const rawReloadPermit = sessionStorage.getItem(BOSS4_RELOAD_PERMIT_KEY);
    if (!rawReloadPermit) return false;
    const reloadPermit = JSON.parse(rawReloadPermit);
    return Number(reloadPermit.difficulty) === currentDifficulty
      && reloadPermit.chaosIntro === boss4ChaosIntroMode
      && Number(reloadPermit.expiresAt) >= Date.now();
  } catch (error) {
    try { sessionStorage.removeItem(BOSS4_ACCESS_TICKET_KEY); } catch (cleanupError) {}
    return false;
  }
}

const boss4AccessAuthorized = consumeBoss4AccessTicket();
if (currentSong === "boss4" && boss4AccessAuthorized) {
  try {
    sessionStorage.setItem(BOSS4_RELOAD_PERMIT_KEY, JSON.stringify({
      difficulty: currentDifficulty,
      chaosIntro: boss4ChaosIntroMode,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000
    }));
  } catch (error) {
    console.warn("boss4 reload permit could not be saved:", error);
  }
}
if (!boss4AccessAuthorized) {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (!saveData.unlockedTitles || typeof saveData.unlockedTitles !== "object" || Array.isArray(saveData.unlockedTitles)) {
    saveData.unlockedTitles = {};
  }
  if (!saveData.unlockedTitles["special:link-tinkerer"]) {
    saveData.unlockedTitles["special:link-tinkerer"] = {
      name: "リンクいじりんちゅ",
      category: "special",
      background: "purple",
      condition: "tamperBoss4Link",
      acquisitionText: "リンクを直接編集してboss4へアクセス",
      unlockedAt: Date.now()
    };
    localStorage.setItem("rhythmGame", JSON.stringify(saveData));
  }

  document.body.classList.add("boss4AccessDeniedActive");
  const deniedOverlay = document.getElementById("boss4AccessDenied");
  requestAnimationFrame(() => deniedOverlay?.classList.add("active"));
  setTimeout(() => {
    deniedOverlay?.classList.add("leaving");
    setTimeout(() => {
      location.replace(`select.html?song=boss4&difficulty=${currentDifficulty}`);
    }, 520);
  }, 3600);
}
let boss4ChaosStartInputLocked = boss4ChaosIntroMode;
if (boss4ChaosIntroMode) {
  document.body.classList.add("boss4ChaosSequence");
}
if (song19StoryChallenge) {
  document.body.classList.add("song19StoryChallenge");
}
if (song35StoryChallenge) {
  document.body.classList.add("song35EventMinimalHud");
}
if (chapter4StoryChallenge) {
  document.body.classList.add("chapter4StoryChallenge");
  const storyChallengePartner = document.getElementById("storyChallengePartner");
  const storyChallengeBubble = document.getElementById("storyChallengeBubble");
  if (storyChallengePartner) {
    storyChallengePartner.src = "images/partners/triochallenge.png";
    storyChallengePartner.alt = "";
  }
  if (storyChallengeBubble) {
    storyChallengeBubble.textContent = "さあ、いこう！";
  }
}
const currentMapId = params.get("map") || "";
const currentMapPieceId = params.get("piece") || "";
let activeMapPiece = null;
let activeMapData = null;
let mapPieceWasNewlyCleared = false;
let mapAttemptFailed = false;
let mapAttemptFailureReasons = [];

async function loadMapMissionContext() {
  if (!mapMode) return;
  if (!/^[a-zA-Z0-9_-]+$/.test(currentMapId) || !currentMapPieceId) {
    console.warn("[Map Mission] マップIDまたはピースIDが不正です。");
    return;
  }

  try {
    const response = await fetch(`map/maps/${currentMapId}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const mapData = await response.json();
    activeMapData = mapData;
    activeMapPiece = mapData.pieces?.find(piece => piece.id === currentMapPieceId) || null;
    if (!activeMapPiece) {
      console.warn(`[Map Mission] ${currentMapId} にピース ${currentMapPieceId} が見つかりません。`);
    }
  } catch (error) {
    console.error("[Map Mission] マップデータの読み込みに失敗しました。", error);
  }
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

function preloadCurrentGameImages() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const partnerId = saveData.profile?.partner || "breaka";
  const partner = partners[partnerId] || partners.breaka;

  return preloadImageAssets([
    song35StoryChallenge && `songs/${currentSong}/backgroundBefore.png`,
    boss4ChaosIntroMode && "songs/boss4/background2.png",
    songInfo.background && `songs/${currentSong}/${songInfo.background}`,
    `songs/${currentSong}/jacket.png`,
    partner.icon,
    partner.full,
    partner.challenge,
    ...Array.from(document.images, image => image.currentSrc || image.src)
  ]);
}

// ---- 設定読み込み ----
const saveDataForSettings = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
const settings = saveDataForSettings.settings || {};
const configuredMusicVolume = Number.isFinite(Number(settings.musicVolume))
  ? Math.min(100, Math.max(0, Number(settings.musicVolume))) / 100
  : 0.7;
const song35FinalTrialDistortionActive = isSong35FinalPuzzleReady();
const musicVolume = configuredMusicVolume;
const noteThickness = Number.isFinite(Number(settings.noteThickness))
  ? Math.min(100, Math.max(50, Math.round(Number(settings.noteThickness))))
  : 80;
// 80 = 従来の20px。中心位置は変えず、見た目の厚みだけを変更する。
document.documentElement.style.setProperty("--note-thickness", `${noteThickness / 4}px`);
const boss4SecondTrialGameplayActive =
  saveDataForSettings.storyFlags?.boss4PuzzleStarted === true
  && Number(saveDataForSettings.storyFlags?.boss4PuzzleStage || 0) === 1
  && saveDataForSettings.storyFlags?.boss4PuzzleTransitionPending !== true
  && Number(settings.musicVolume ?? 70) === 0;
if (boss4SecondTrialGameplayActive) {
  document.body.classList.add("boss4SecondTrialGameplay");
}

// 速度
const speed = settings.speed || 10;

// キー配置
const keyLayout = settings.keyLayout || "default";
const CUSTOM_KEY_BINDING_CODES = new Set([
  ...Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`),
  ...Array.from({ length: 10 }, (_, index) => `Digit${index}`),
  "Space"
]);
const savedCustomKeyBindings = Array.isArray(settings.customKeyBindings)
  && settings.customKeyBindings.length === 5
  && new Set(settings.customKeyBindings).size === 5
  && settings.customKeyBindings.every(code => CUSTOM_KEY_BINDING_CODES.has(code))
  ? settings.customKeyBindings
  : null;

function createCustomKeyBinding(code) {
  if (code === "Space") return { key: " ", codes: ["Space"] };
  if (code.startsWith("Digit")) {
    const digit = code.slice(-1);
    return { key: digit, codes: [code, `Numpad${digit}`] };
  }
  return { key: code.slice(-1).toLowerCase(), codes: [code] };
}

const keyBindings = keyLayout === "custom" && savedCustomKeyBindings
  ? savedCustomKeyBindings.map(createCustomKeyBinding)
  : keyLayout === "alt"
  ? [
      { key: "d", codes: ["KeyD"] },
      { key: "f", codes: ["KeyF"] },
      { key: " ", codes: ["Space"] },
      { key: "j", codes: ["KeyJ"] },
      { key: "k", codes: ["KeyK"] }
    ]
  : keyLayout === "num"
  ? [
      { key: "4", codes: ["Digit4", "Numpad4"] },
      { key: "5", codes: ["Digit5", "Numpad5"] },
      { key: "7", codes: ["Digit7", "Numpad7"] },
      { key: "8", codes: ["Digit8", "Numpad8"] },
      { key: "9", codes: ["Digit9", "Numpad9"] }
    ]
  : [
      { key: "g", codes: ["KeyG"] },
      { key: "h", codes: ["KeyH"] },
      { key: "j", codes: ["KeyJ"] },
      { key: "k", codes: ["KeyK"] },
      { key: "l", codes: ["KeyL"] }
    ];

const laneKeys = {};
const keyToLane = {};
const codeToKey = {};
const codeToLane = {};

keyBindings.forEach((binding, lane) => {
  const laneId = "lane" + lane;
  laneKeys[lane] = binding.key;
  keyToLane[binding.key] = laneId;
  binding.codes.forEach((code) => {
    codeToKey[code] = binding.key;
    codeToLane[code] = laneId;
  });
});

function normalizeInputKey(e) {
  const key = e.key === " "
    ? " "
    : e.key.length === 1
    ? e.key.toLowerCase()
    : e.key;

  return keyToLane[key] ? key : (codeToKey[e.code] || key);
}

function getLaneFromInput(e) {
  const key = normalizeInputKey(e);
  return keyToLane[key] || codeToLane[e.code] || null;
}

let songInfo = {};
let titleDefinitions = { rateTitles: [], recordTitles: [], specialTitles: [] };

const music = new Audio(`songs/${currentSong}/music.wav`);
music.preload = "auto";
music.volume = musicVolume;
let optimizedMusicObjectUrl = null;
let musicPreparationPromise = null;
let musicPlaybackPrimePromise = null;
let decodedMusicContext = null;
let decodedMusicBuffer = null;
let decodedMusicSource = null;
let decodedMusicGain = null;
let decodedMusicStartPerformanceTime = 0;
let decodedMusicStartOffsetSec = 0;
let decodedMusicPausedAtSec = 0;
let decodedMusicEnded = false;
let decodedMusicStopIsIntentional = false;
const gameOverSE = new Audio("sounds/gameover.mp3");
gameOverSE.volume = 0.9;
const song35PuzzleNoise = new Audio("sounds/noise.mp3");
song35PuzzleNoise.preload = "auto";
song35PuzzleNoise.loop = false;
song35PuzzleNoise.volume = 0;
const boss4HeartSE = new Audio("sounds/heart.mp3");
boss4HeartSE.preload = "auto";
boss4HeartSE.loop = true;
boss4HeartSE.volume = 0.9;
const boss4ViolinSE = new Audio("sounds/boss4violin.mp3");
boss4ViolinSE.preload = "auto";
boss4ViolinSE.volume = 1;
let boss4HeartDistortionTimer = null;

function writeAsciiToView(view, offset, text) {
  for (let index = 0; index < text.length; index++) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function audioBufferToPcmWavBlob(audioBuffer) {
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  const frameCount = audioBuffer.length;
  const bytesPerSample = 2;
  const dataByteLength = frameCount * channelCount * bytesPerSample;
  const wavBuffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(wavBuffer);

  writeAsciiToView(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAsciiToView(view, 8, "WAVE");
  writeAsciiToView(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAsciiToView(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  const channels = Array.from({ length: channelCount }, (_, index) =>
    audioBuffer.getChannelData(index)
  );
  let byteOffset = 44;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(byteOffset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      byteOffset += bytesPerSample;
    }
  }

  return new Blob([wavBuffer], { type: "audio/wav" });
}

function detectMp3SampleRate(encodedAudio) {
  const bytes = new Uint8Array(encodedAudio);
  let start = 0;

  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const tagSize = ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    start = Math.min(bytes.length, 10 + tagSize);
  }

  for (let index = start; index + 3 < bytes.length; index++) {
    if (bytes[index] !== 0xff || (bytes[index + 1] & 0xe0) !== 0xe0) continue;

    const versionBits = (bytes[index + 1] >> 3) & 0x03;
    const layerBits = (bytes[index + 1] >> 1) & 0x03;
    const sampleRateIndex = (bytes[index + 2] >> 2) & 0x03;
    if (versionBits === 1 || layerBits === 0 || sampleRateIndex === 3) continue;

    const mpeg1Rates = [44100, 48000, 32000];
    const divisor = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4;
    return mpeg1Rates[sampleRateIndex] / divisor;
  }

  return null;
}

async function prepareOptimizedMusicSource() {
  // 拡張子ではなく音源ヘッダーを確認する。MP3はサンプルレートに関係なく、
  // 初回ノーツ付近でのデコード負荷を避けるためロード画面内で48kHz PCMへ変換する。
  if (optimizedMusicObjectUrl) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  let decodingContext = null;
  try {
    const musicUrl = `songs/${currentSong}/music.wav`;
    const probeResponse = await fetch(musicUrl, {
      headers: { Range: "bytes=0-262143" }
    });
    if (!probeResponse.ok) return;

    const probeAudio = await probeResponse.arrayBuffer();
    const sampleRate = detectMp3SampleRate(probeAudio);
    // boss4初回イベントは音源形式にかかわらずロード中に全体をデコードし、
    // プレイ開始直後のデコーダー起動によるフレーム落ちを避ける。
    if (sampleRate === null && !boss4ChaosIntroMode) return;

    // Range非対応のローカルサーバーでは200で全体が返るため、その場合は再利用する。
    const encodedAudio = probeResponse.status === 200
      ? probeAudio
      : await (await fetch(musicUrl)).arrayBuffer();
    decodingContext = new AudioContextClass({ sampleRate: 48000 });
    decodedMusicBuffer = await decodingContext.decodeAudioData(encodedAudio);
    decodedMusicContext = decodingContext;
    decodingContext = null;
    decodedMusicGain = decodedMusicContext.createGain();
    decodedMusicGain.gain.value = musicVolume;
    decodedMusicGain.connect(decodedMusicContext.destination);
    // Web Audioで再生する曲はHTMLAudio側に保持させず、二重デコードを防ぐ。
    music.pause();
    music.removeAttribute("src");
    music.load();
    console.info(`[Audio] ${currentSong}: 楽曲をWeb Audio用に事前デコードしました。`);
  } catch (error) {
    // 自動判定や変換に失敗しても、元音源でそのままプレイできる。
    console.warn("audio predecode skipped:", error);
  } finally {
    decodingContext?.close().catch(() => {});
  }
}

async function preloadMusicForPlayback(timeoutMs = 12000) {
  if (!musicPreparationPromise) {
    musicPreparationPromise = prepareOptimizedMusicSource();
  }
  await musicPreparationPromise;

  if (decodedMusicBuffer) return;

  if (music.readyState >= music.HAVE_FUTURE_DATA) {
    return;
  }

  await new Promise(resolve => {
    let settled = false;
    let timeoutId = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      music.removeEventListener("canplay", finish);
      music.removeEventListener("error", finish);
      resolve();
    };

    timeoutId = setTimeout(finish, timeoutMs);
    music.addEventListener("canplay", finish, { once: true });
    music.addEventListener("error", finish, { once: true });
    music.load();
  });
}

function primeMusicPlayback() {
  if (musicPlaybackPrimePromise) return musicPlaybackPrimePromise;

  musicPlaybackPrimePromise = (async () => {
    if (decodedMusicBuffer && decodedMusicContext) {
      await decodedMusicContext.resume();
      return;
    }

    const wasMuted = music.muted;
    music.pause();
    music.currentTime = 0;
    music.muted = true;

    try {
      await music.play();
      // デコーダーだけでなく、ブラウザの音声出力経路もプリロール中に起動する。
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } catch (error) {
      console.warn("audio playback prime skipped:", error);
    } finally {
      music.pause();
      music.currentTime = 0;
      music.muted = wasMuted;
    }
  })();

  return musicPlaybackPrimePromise;
}

async function startPreparedMusicPlayback() {
  if (musicStarted) return;

  // ここからは音源時計へ切り替える。準備が未完了なら0msで待ち、同期を守る。
  musicStarted = true;
  if (musicPlaybackPrimePromise) await musicPlaybackPrimePromise;
  if (!started || paused) return;

  playMusicPlayback(0);
}

function getDecodedMusicCurrentSec() {
  if (!decodedMusicBuffer) return 0;
  if (!decodedMusicSource) return decodedMusicPausedAtSec;
  // AudioContext.currentTimeの音声ブロック単位の段差を、描画用の高精度時計で補間する。
  return Math.min(
    decodedMusicBuffer.duration,
    decodedMusicStartOffsetSec + Math.max(0, (performance.now() - decodedMusicStartPerformanceTime) / 1000)
  );
}

async function playMusicPlayback(offsetSec = decodedMusicPausedAtSec) {
  if (!decodedMusicBuffer || !decodedMusicContext || !decodedMusicGain) {
    music.currentTime = Math.max(0, offsetSec);
    music.play().catch(error => console.error("music.play failed:", error));
    return;
  }

  if (decodedMusicContext.state !== "running") {
    await decodedMusicContext.resume();
  }
  if (decodedMusicSource) return;

  const safeOffset = Math.max(0, Math.min(decodedMusicBuffer.duration, Number(offsetSec) || 0));
  const source = decodedMusicContext.createBufferSource();
  source.buffer = decodedMusicBuffer;
  source.connect(decodedMusicGain);
  decodedMusicSource = source;
  decodedMusicStartOffsetSec = safeOffset;
  decodedMusicPausedAtSec = safeOffset;
  decodedMusicStartPerformanceTime = performance.now();
  decodedMusicEnded = false;
  decodedMusicStopIsIntentional = false;

  source.onended = () => {
    if (decodedMusicSource !== source) return;
    decodedMusicSource = null;
    if (decodedMusicStopIsIntentional) {
      decodedMusicStopIsIntentional = false;
      return;
    }
    decodedMusicPausedAtSec = decodedMusicBuffer.duration;
    decodedMusicEnded = true;
    beginPostMusicClock();
  };
  source.start(0, safeOffset);
}

function pauseMusicPlayback({ reset = false } = {}) {
  if (!decodedMusicBuffer) {
    music.pause();
    if (reset) music.currentTime = 0;
    return;
  }

  if (decodedMusicSource) {
    decodedMusicPausedAtSec = getDecodedMusicCurrentSec();
    const source = decodedMusicSource;
    decodedMusicStopIsIntentional = true;
    decodedMusicSource = null;
    source.onended = null;
    try { source.stop(); } catch (error) {}
  }

  if (reset) {
    decodedMusicPausedAtSec = 0;
    decodedMusicEnded = false;
    decodedMusicGain.gain.cancelScheduledValues(decodedMusicContext.currentTime);
    decodedMusicGain.gain.value = musicVolume;
  }
}

function isMusicPlaybackEnded() {
  return decodedMusicBuffer ? decodedMusicEnded : music.ended;
}

window.addEventListener("pagehide", () => {
  if (optimizedMusicObjectUrl) URL.revokeObjectURL(optimizedMusicObjectUrl);
}, { once: true });

let BPM = 180;
let beatTime = 60000 / BPM;
let measureBeats = 4;
let offset = -80;
let perfectScore = 0;
let goodScore = 0;
let speedEvents = []; // { timeMs: number, multiplier: number }
let initialSpeedMultiplier = 1;
let stopEvents = []; // { startMs, endMs, recoveryEndMs }
let rushEvents = []; // { timeMs: number, active: boolean }
let rushModeActive = false;
let rushFadeTimer = null;
let activePartnerSkill = null;
let timedHealTriggers = [];
let timedHealUsed = [];
let emergencyHealUsed = false;
let gameLoopStarted = false;
let storyChallengeIntroActive = false;
let storyChallengeIntroPending =
  storyChallenge && !skipStoryIntro && !song35StoryChallenge;
let gameAssetsReady = false;

const judgeLineElement = document.getElementById("judgeline");
const judgeY = judgeLineElement.offsetTop + judgeLineElement.offsetHeight / 2;
const heartCenterY = judgeY + judgeLineElement.offsetHeight / 2;
const spawnY = -100;
const distance = judgeY - spawnY;
const travelFrames = distance / speed;
const travelTime = travelFrames * (1000 / 60);
const longStartMissAfterMs = 120;
const tapMissAfterMs = 150;
const longEndJudgeEarlyMs = 33;
const longStartVisualOffsetPx = 10;

function buildTempoMap(tempoEvents) {
  const merged = new Map();

  merged.set(0, {
    measure: 1,
    division: [0, 1],
    position: 0,
    bpm: BPM,
    timesig: measureBeats
  });

  for (const event of tempoEvents) {
    const measure = Math.max(1, Number(event.measure));
    const division = Array.isArray(event.division) ? event.division : [0, 1];
    const denominator = Math.max(1, Number(division[1]) || 1);
    const numerator = Math.max(0, Math.min(denominator - 1, Number(division[0]) || 0));
    const position = measure - 1 + numerator / denominator;
    const existing = merged.get(position) || { measure, division: [numerator, denominator], position };
    merged.set(position, {
      ...existing,
      ...event,
      measure,
      division: [numerator, denominator],
      position
    });
  }

  const sorted = [...merged.values()].sort((a, b) => a.position - b.position);

  let currentBpm = BPM;
  let currentTimesig = measureBeats;
  let currentMs = 0;
  let previousPosition = 0;

  return sorted.map((event, index) => {
    if (index > 0) {
      const measureCount = event.position - previousPosition;
      currentMs += measureCount * currentTimesig * (60000 / currentBpm);
    }

    currentBpm = Number(event.bpm || currentBpm);
    currentTimesig = Number(event.timesig || currentTimesig);
    previousPosition = event.position;

    return {
      measure: event.measure,
      division: event.division,
      position: event.position,
      bpm: currentBpm,
      timesig: currentTimesig,
      startMs: currentMs
    };
  });
}

function getNoteTime(measure, division) {
  const numerator = division[0];
  const denominator = division[1];

  const targetPosition = measure - 1 + numerator / denominator;
  let tempo = tempoMap[0] || {
    measure: 1,
    position: 0,
    bpm: BPM,
    timesig: measureBeats,
    startMs: 0
  };

  for (const item of tempoMap) {
    if (item.position <= targetPosition) {
      tempo = item;
    } else {
      break;
    }
  }

  const beatMs = 60000 / tempo.bpm;
  const measureMs = tempo.timesig * beatMs;

  return (
    tempo.startMs +
    (targetPosition - tempo.position) * measureMs
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
const resultPlayRewardRate = document.getElementById("resultPlayRewardRate");
const resultPlayRewardAmount = document.getElementById("resultPlayRewardAmount");
const resultAchievementGauge = document.getElementById("resultAchievementGauge");
const resultAchievementRate = document.getElementById("resultAchievementRate");
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
const heartPlayer = document.getElementById("heartPlayer");
const timingCalibrationMs = 33;

// パートナーの定義は partner-data.js に集約。
const partners = window.partners;
resultBGM.loop = true;

// ---- ゲーム状態 ----
let combo = 0;
let maxCombo = 0;
let life = 2500;
let damageTakenDuringPlay = 0;
let score = 0;
let missCount = 0;
let goodCount = 0;
let yellowPerfectCount = 0;
let perfectCount = 0;
let fastCount = 0;
let lateCount = 0;
const maxLife = 2500;
const keys = {};
const notes = [];
const damageNotes = [];
const noteElementPool = [];
const maxPooledNoteElements = 64;
let chartSpawnQueue = [];
let damageSpawnQueue = [];
let chartSpawnCursor = 0;
let damageSpawnCursor = 0;
let started = false;
let paused = false;
let startDelayMs = 0;
let starting = false;

let prerollMs = travelTime;
let gameStartTime = 0;
let musicStarted = false;
let pauseStartedAt = 0;
let musicEndedAtPerformance = null;
let musicEndedAtMs = 0;
const resultDelayAfterLastNoteMs = 5000;
const resultFadeDurationMs = 1000;
let normalClearReady = false;
let resultDelayFadeActive = false;
let resultDelayFadeStartVolume = 1;

function beginPostMusicClock() {
  if (musicEndedAtPerformance !== null) return;
  musicEndedAtPerformance = performance.now();
  musicEndedAtMs = decodedMusicBuffer
    ? decodedMusicBuffer.duration * 1000
    : Math.max(
      Number.isFinite(music.duration) ? music.duration * 1000 : 0,
      Number(music.currentTime || 0) * 1000
    );
}

music.addEventListener("ended", beginPostMusicClock);

let secretBossUnlocked = false;
let secretBossTriggered = false;
let secretBossTriggerChecked = false;
let secretBossTriggerTime = null;
let song11BgEventTriggered = false;
let song11BgEventTime = null;
let song35BgEventTriggered = false;
let song35BgEventTime = null;
let song35LightLinesActive = false;
let song35NextLightLineAt = 0;
let song35LightLineSequenceIndex = 0;
let song35FinalPuzzleTriggerTime = null;
let song35FinalPuzzleTriggered = false;
let song19LongCutTriggered = false;
let heartX = 250;
let pendingHeartClientX = null;
let heartMoveFrame = null;
let lastHeartKeyboardMoveAt = null;
let heartControlsLocked = false;
let heartResistanceActive = false;
let heartPointerControlsInstalled = false;
let boss3BulletPhaseActive = false;
let boss3HeartDropStarted = false;
let boss3HeartFadeStarted = false;
let lastBulletDamageAt = -Infinity;
let bulletChallengeCleared = false;
const bulletDamage = 70;
const bulletInvincibleMs = 900;
const damageHitboxInsetPx = 10;
const maxEnemyLife = 1000;
const dualEnemyDamage = 27;
let enemyLife = maxEnemyLife;
let bulletEnemyFailureShown = false;
const chapter4DualNoteQuota = currentDifficulty === 1 ? 60 : 40;
let chapter4DualNoteGoodCount = 0;
let chapter4DualNoteFailureShown = false;
let challengeFailureEntryStarted = false;
const chapter4StaffNoteHeights = [];
let chapter4StaffPageStart = 0;
let chapter4StaffTurnTimer = null;
let chapter4MissionCheckpointReached = false;
let bulletFinalEventStarted = false;
let bulletFinalEventDarkened = false;
let bulletPauseLocked = false;
let bulletTutorialActive = false;
let boss3IntroActive = boss3Intro;
let boss3IntroRunning = false;
let boss3HoverTapsShown = false;
let boss3HoverTapsRemoved = false;
let boss3Background2TransitionStarted = false;
let boss3Background2Preload = null;
let boss3Background3TransitionStarted = false;
let boss3Background3Preload = null;
let boss3TempoWarpStarted = false;
let boss3TempoWarpFinished = false;
let boss3FinalWhiteMistShown = false;
let boss3BranchDifficultyIndex = null;
let boss4BackgroundRevealIndex = 0;
let boss4BackgroundDarkenIndex = 0;
let boss4Background2Triggered = false;
let boss4ChromaticTimes = [];
let boss4ChromaticCursor = 0;
let boss4RedLightLinesActive = false;
let boss4NextRedLightLineAt = 0;
let boss4RedLightLineSequenceIndex = 0;
let boss4LowerPinkGlowActive = false;
let boss4NextPinkParticleAt = 0;
let boss4ReverseBackgroundTriggered = false;
let boss4Background3Triggered = false;
let boss4FinalDarknessTriggered = false;
let boss4StoryTransitionStarted = false;
let boss4ReverseChartTiming = null;
let boss4SecondTrialLastWaveAt = -Infinity;
let boss4SecondTrialLastAtmosphereUpdateAt = -Infinity;
let boss4SecondTrialFinalPulseShown = false;
let song35FinalTrialLastWarpUpdateAt = -Infinity;
let song35FinalTrialDistortionCancelled = false;
let song35FinalTrialThirtySecondPulseShown = false;
let song35FinalTrialTenSecondPulseShown = false;
let boss4LateWarpLastUpdateAt = -Infinity;
let boss4LateWarpFinished = false;

function getTotalJudgementNoteCount() {
  return chart.length + damageNotes.filter(note => note.type === "musicNote").length;
}
const BOSS3_INTRO_CHART_FILE = "challenge.txt";
const BOSS3_BRANCH_MEASURE = 66;
const BOSS3_INTRO_MUSIC_DELAY_MS = 1500;
const BOSS3_BACKGROUND_WIPE_DURATION_MS = 1250;
const finalBarrageNotes = [];
let finalBarrageTargetX = 0;
let finalBarrageTargetY = 0;
let finalBarrageDamagePerHit = 0;
let lastFinalBarrageImpactAt = -Infinity;
const bulletHitSE = new Audio("sounds/hit.mp3");
const enemyRecoverySE = new Audio("sounds/dragon.mp3");
const boss3StartSE = new Audio("sounds/startsound.mp3");
const bulletEventSE = new Audio("sounds/bulletevent.mp3");

function getDisplayedChartLevel(level) {
  const numericLevel = Number(level) || 0;
  const integerLevel = Math.trunc(numericLevel);
  const decimalDigit = Math.floor((numericLevel - integerLevel) * 10 + Number.EPSILON * 10);
  return `${integerLevel}${decimalDigit >= 5 ? "+" : ""}`;
}

function placeBoss3HudAtViewportRoot() {
  if (!boss3Intro || currentSong !== "boss3") return;
  for (const id of ["scoreArea", "pauseButton", "lifeText", "lifeBar"]) {
    const element = document.getElementById(id);
    if (element && element.parentElement !== document.body) document.body.appendChild(element);
  }
}

function getBoss3BranchDifficultyIndex() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const rawMaximum = saveData.song19MaxClearedDifficulty;
  const savedMaximum = Number(rawMaximum);
  if (rawMaximum !== null && rawMaximum !== "" && Number.isInteger(savedMaximum)) {
    return Math.max(0, Math.min(2, savedMaximum));
  }

  if (saveData.boss3UnlockChallengeCleared === true) {
    return Math.max(0, Math.min(2, Number(saveData.boss3UnlockChallengeDifficulty) || 0));
  }
  return 0;
}

function getChartLineStartMeasure(line) {
  if (!line || line.startsWith("#")) return null;
  const parts = line.split(",");

  if (line.startsWith("@")) {
    if (["@speed", "@rush", "@tempo", "@stop"].includes(parts[0])) return Number(parts[1]);
    if ((parts[0] === "@bpm" || parts[0] === "@timesig") && parts.length >= 3) return Number(parts[1]);
    return null;
  }

  if (["bullet", "damage", "damageDiamond", "damageCircle", "damageLong", "♪", "♬"].includes(parts[0])) {
    return Number(parts[1]);
  }
  return Number(parts[0]);
}

async function loadSongInfo() {
  const infoResponse = await fetch(`songs/${currentSong}/info.json`, { cache: "no-store" });
  songInfo = await infoResponse.json();

  document.getElementById("songTitle").textContent = songInfo.title;
  document.getElementById("songArtist").textContent = songInfo.artist;

  const currentchart = songInfo.charts[currentDifficulty];
  const diffEl = document.getElementById("songDifficulty");
  const concealBoss3ChallengeDifficulty =
    boss3Challenge && currentSong === "song19";
  diffEl.textContent = concealBoss3ChallengeDifficulty
    ? `${currentchart.difficulty} Lv.？`
    : currentchart.difficulty + " Lv." + getDisplayedChartLevel(currentchart.level);

  if (bulletChallenge) {
    diffEl.style.display = "none";
  } else {
    diffEl.style.display = "";
  }

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

  const initialBackground = song35StoryChallenge
    ? "backgroundBefore.png"
    : songInfo.background;
  if (initialBackground) {
  document.body.style.backgroundImage = `url('songs/${currentSong}/${initialBackground}')`;
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  document.body.style.backgroundRepeat = "no-repeat";
} else {
  document.body.style.backgroundImage = "";
}

  if (currentSong === "boss3") {
    boss3Background3Preload = new Image();
    boss3Background3Preload.src = "songs/boss3/background3.png";

    if (boss3Intro) {
      boss3Background2Preload = new Image();
      boss3Background2Preload.src = "songs/boss3/background2.png";
    }
  }
}

async function loadChart() {
  const chartFile = bulletChallenge
    ? "challenge.txt"
    : boss3Intro && currentSong === "boss3"
      ? BOSS3_INTRO_CHART_FILE
    : `charts/${songInfo.charts[currentDifficulty].file}`;
  const response = await fetch(`songs/${currentSong}/${chartFile}`);
  let text = await response.text();

  if (boss3Intro && currentSong === "boss3") {
    boss3BranchDifficultyIndex = getBoss3BranchDifficultyIndex();
    const branchChart = songInfo.charts?.[boss3BranchDifficultyIndex];
    if (branchChart?.file) {
      const branchResponse = await fetch(`songs/boss3/charts/${branchChart.file}`);
      if (!branchResponse.ok) throw new Error(`Boss3 branch chart HTTP ${branchResponse.status}`);
      const branchText = await branchResponse.text();
      const challengeLines = text.split("\n").filter(line => {
        const measure = getChartLineStartMeasure(line.trim());
        return !Number.isFinite(measure) || measure < BOSS3_BRANCH_MEASURE;
      });
      const branchLines = branchText.split("\n").filter(line => {
        const measure = getChartLineStartMeasure(line.trim());
        return Number.isFinite(measure) && measure >= BOSS3_BRANCH_MEASURE;
      });
      text = [...challengeLines, ...branchLines].join("\n");
      console.info(
        `[Boss3 Chart Branch] measure ${BOSS3_BRANCH_MEASURE}+: ${branchChart.difficulty} (${branchChart.file}), ${branchLines.length} lines`
      );
    }
  }
  const lines = text.split("\n").map(line => line.trim()).filter(line => line);

  chart = [];
  damageNotes.length = 0;
  initialSpeedMultiplier = 1;
  const tempoEvents = [];
rushEvents = [];
rushModeActive = false;
if (rushFadeTimer) clearTimeout(rushFadeTimer);
rushFadeTimer = null;
document.body.classList.remove("rushMode", "rushPreparing", "rushFading");

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

    if (line.startsWith("@initialspeed")) {
      const parts = line.split(",");
      const multiplier = Number(parts[1]);
      if (Number.isFinite(multiplier) && multiplier > 0) {
        initialSpeedMultiplier = multiplier;
      } else {
        console.warn(`[Chart] Invalid @initialspeed value: ${parts[1]}`);
      }
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
        division: parts.length >= 5 ? parts[2].split("/").map(Number) : [0, 1],
        bpm: Number(parts.length >= 5 ? parts[3] : parts[2]),
        timesig: Number(parts.length >= 5 ? parts[4] : parts[3])
      });
      continue;
    }
  
  }
  tempoMap = buildTempoMap(tempoEvents);

// 速度イベントを時刻順にソート
const baseSpeedEvents = [];
for (let line of lines) {
  if (!line.startsWith("@speed")) continue;
  const parts = line.split(",");
  const measure = Number(parts[1]);
  const division = parts[2].split("/").map(Number);
  const multiplier = Number(parts[3]);
  const timeMs = getNoteTime(measure, division) + offset;
  baseSpeedEvents.push({ timeMs, multiplier });
}

baseSpeedEvents.sort((a, b) => a.timeMs - b.timeMs);

stopEvents = [];
for (const line of lines) {
  if (!line.startsWith("@stop")) continue;
  const parts = line.split(",");
  const measure = Number(parts[1]);
  const division = parts[2].split("/").map(Number);
  const duration = (parts[3] || "1/8").split("/").map(Number);
  const startFraction = division[0] / division[1];
  const durationFraction = duration[0] / duration[1];
  const startMs = getNoteTime(measure, division) + offset;
  const endPosition = startFraction + durationFraction;
  const endMs = getNoteTime(measure, [endPosition, 1]) + offset;
  const durationMs = Math.max(0, endMs - startMs);
  if (durationMs > 0) {
    stopEvents.push({ startMs, endMs, recoveryEndMs: endMs + durationMs });
  }
}
stopEvents.sort((a, b) => a.startMs - b.startMs);

function getBaseSpeedMultiplierAt(timeMs) {
  let multiplier = initialSpeedMultiplier;
  for (const event of baseSpeedEvents) {
    if (event.timeMs > timeMs) break;
    multiplier = event.multiplier;
  }
  return multiplier;
}

function getStopSpeedFactorAt(timeMs) {
  for (const event of stopEvents) {
    if (timeMs >= event.startMs && timeMs < event.endMs) return 0;
    if (timeMs >= event.endMs && timeMs < event.recoveryEndMs) return 2;
  }
  return 1;
}

const visualSpeedBoundaries = new Set(baseSpeedEvents.map(event => event.timeMs));
for (const event of stopEvents) {
  visualSpeedBoundaries.add(event.startMs);
  visualSpeedBoundaries.add(event.endMs);
  visualSpeedBoundaries.add(event.recoveryEndMs);
}
speedEvents = [...visualSpeedBoundaries]
  .sort((a, b) => a - b)
  .map(timeMs => ({
    timeMs,
    multiplier: getBaseSpeedMultiplierAt(timeMs) * getStopSpeedFactorAt(timeMs)
  }));

rushEvents = [];

for (let line of lines) {
  if (!line.startsWith("@rush")) continue;

  const parts = line.split(",");
  const measure = Number(parts[1]);
  const division = parts[2].split("/").map(Number);
  const active = parts[3] === "on";

  const timeMs = getNoteTime(measure, division) + offset;
  rushEvents.push({ timeMs, active });
}

rushEvents.sort((a, b) => a.timeMs - b.timeMs);
  
  for (let line of lines) {

    if (line.startsWith("#")) continue;
    if (line.startsWith("@")) continue;

    const parts = line.split(",");

    if (parts[0] === "damageLong") {
      const points = [];
      const stride = (parts.length - 1) % 5 === 0 ? 5 : 4;
      for (let i = 1; i + 3 < parts.length; i += stride) {
        points.push({
          hitTime: getNoteTime(Number(parts[i]), parts[i + 1].split("/").map(Number)) + offset,
          x: Math.max(0, Math.min(1, Number(parts[i + 2]))),
          width: Math.max(1, Math.min(10, Number(parts[i + 3] || 2))),
          curve: stride === 5 ? (parts[i + 4] || "linear") : "linear"
        });
      }

      if (points.length >= 2) {
        points.sort((a, b) => a.hitTime - b.hitTime);
        damageNotes.push({
          type: "damageLong",
          points,
          hitTime: points[0].hitTime,
          spawned: false,
          active: false
        });
      }
      continue;
    }

    if (parts[0] === "♪" || parts[0] === "♬") {
      const hitTime = getNoteTime(Number(parts[1]), parts[2].split("/").map(Number));
      damageNotes.push({
        type: "musicNote",
        symbol: parts[0],
        hitTime: hitTime + offset,
        x: Math.max(0, Math.min(1, Number(parts[3]))),
        size: Number(parts[4] || (parts[0] === "♬" ? 48 : 42)),
        spawned: false,
        active: false
      });
      continue;
    }

    if (parts[0] === "bullet" || parts[0] === "damage" || parts[0] === "damageDiamond" || parts[0] === "damageCircle") {
      const hitTime = getNoteTime(Number(parts[1]), parts[2].split("/").map(Number));
      damageNotes.push({
        type: "damage",
        shape: parts[0] === "damageDiamond" ? "diamond" : "circle",
        hitTime: hitTime + offset,
        x: Math.max(0, Math.min(1, Number(parts[3]))),
        size: Number(parts[4] || 42),
        spawned: false,
        active: false
      });
      continue;
    }

    // dual
    if (line.includes("dual")) {
      const laneText = line.match(/\[(.*?)\]/)[1];
      // 1レーンだけの `[2],dual` も有効なDUALノーツとして扱う。
      const lanes = [...new Set(laneText.split("|").map(Number))]
        .filter(lane => Number.isInteger(lane) && lane >= 0 && lane < 5)
        .sort((a, b) => a - b);
      if (lanes.length === 0) continue;
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

    if (parts.length < 3) {
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

  if (boss3Intro) {
    const introCutoffMs = getNoteTime(11, [0, 1]) + offset;
    chart = chart.filter(note => Number(note.measure) > 10);
    for (let index = damageNotes.length - 1; index >= 0; index--) {
      if (Number(damageNotes[index].hitTime) < introCutoffMs) damageNotes.splice(index, 1);
    }
  }

  if (currentSong === "boss3") {
    const effectiveBoss3Difficulty = boss3Intro && Number.isInteger(boss3BranchDifficultyIndex)
      ? boss3BranchDifficultyIndex
      : currentDifficulty;
    const boss3Difficulty = String(
      songInfo.charts?.[effectiveBoss3Difficulty]?.difficulty || ""
    ).toLowerCase();

    const cutLanes = boss3Difficulty === "fracture" ? [0, 2, 4] : [0, 4];
    const cutLongs = chart.filter(note =>
      note.type === "long" && Number(note.measure) === 27 &&
      cutLanes.includes(Number(note.lane))
    );
    cutLongs.forEach(note => { note.boss3CutAtMeasure29 = true; });
    console.info(
      `[Boss3 Chart Effect] ${boss3Difficulty} measure 29 lane ${cutLanes.join("/")} cut longs: ${cutLongs.length}`
    );
  }

  // ノーツ数を数えて得点を計算（ロングは始点1個扱い）
  // 紫色のダメージノーツは採点対象の総ノーツ数に含めない。
  const collectibleMusicNoteCount = damageNotes.filter(note => note.type === "musicNote").length;
  const totalNotes = chart.length + collectibleMusicNoteCount;
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
    return targetMs * basePxPerMs * initialSpeedMultiplier;
  }

  let visualOffset = 0;
  let currentMultiplier = initialSpeedMultiplier;
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

let judgeTextAnimation = null;

function showJudgeText(text, color, effectLaneIndex = null) {
  result.textContent = text;
  result.style.color = color;
  judgeTextAnimation?.cancel();
  judgeTextAnimation = result.animate([
    { opacity: 1, transform: "translateX(-50%) scale(1.4)" },
    { opacity: 1, transform: "translateX(-50%) scale(1)", offset: 0.2 },
    { opacity: 1, transform: "translateX(-50%) scale(1)", offset: 0.7 },
    { opacity: 0, transform: "translateX(-50%) scale(1)" }
  ], {
    duration: 600,
    easing: "ease",
    fill: "forwards"
  });
  if (boss4SecondTrialGameplayActive && !/miss/i.test(text)) {
    spawnBoss4SecondTrialMelodyEffect(effectLaneIndex);
  }
}

function spawnBoss4SecondTrialMelodyEffect(effectLaneIndex) {
  const layer = document.getElementById("boss4SecondTrialMelodyLayer");
  const gameElement = document.getElementById("game");
  if (!layer || !gameElement || !document.body.classList.contains("boss4SecondTrialGameplay")) return;

  const gameRect = gameElement.getBoundingClientRect();
  const normalizedLane = Number(effectLaneIndex);
  const originX = Number.isInteger(normalizedLane) && normalizedLane >= 0 && normalizedLane < 5
    ? gameRect.left + (normalizedLane + 0.5) * gameRect.width / 5
    : gameRect.left + gameRect.width / 2;
  const originY = gameRect.top + judgeY;
  const now = performance.now();
  if (now - boss4SecondTrialLastWaveAt >= 75 && layer.querySelectorAll(".boss4SecondTrialWave").length < 8) {
    boss4SecondTrialLastWaveAt = now;
    const wave = document.createElement("span");
    wave.className = "boss4SecondTrialWave";
    wave.style.left = `${originX}px`;
    wave.style.top = `${originY}px`;
    layer.appendChild(wave);
    wave.addEventListener("animationend", () => wave.remove(), { once: true });
  }

  const existingParticles = layer.querySelectorAll(".boss4SecondTrialParticle").length;
  const particleCount = Math.min(3, 1 + Math.floor(Math.max(0, combo) / 80));
  for (let index = 0; index < particleCount && existingParticles + index < 72; index++) {
    const particle = document.createElement("span");
    const size = 2.5 + Math.random() * (combo >= 100 ? 7.5 : 5);
    particle.className = "boss4SecondTrialParticle";
    particle.style.left = `${gameRect.left + Math.random() * gameRect.width}px`;
    particle.style.top = `${originY + 8 + Math.random() * 26}px`;
    particle.style.setProperty("--second-trial-size", `${size}px`);
    particle.style.setProperty("--second-trial-rise", `${75 + Math.random() * 120}px`);
    particle.style.setProperty("--second-trial-drift", `${-32 + Math.random() * 64}px`);
    particle.style.setProperty("--second-trial-duration", `${850 + Math.random() * 850}ms`);
    layer.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

function updateBoss4SecondTrialAtmosphere(currentMs) {
  if (!boss4SecondTrialGameplayActive || !document.body.classList.contains("boss4SecondTrialGameplay")) return;
  if (currentMs - boss4SecondTrialLastAtmosphereUpdateAt < 100) return;
  boss4SecondTrialLastAtmosphereUpdateAt = currentMs;

  const chartEndTime = Math.max(1, getChartEndTime());
  const progress = Math.max(0, Math.min(1, currentMs / chartEndTime));
  const recoveryProgress = Math.max(0, Math.min(1, (progress - 0.62) / 0.35));
  document.documentElement.style.setProperty(
    "--second-trial-atmosphere-opacity",
    String(1 - recoveryProgress * 0.72)
  );

  if (!boss4SecondTrialFinalPulseShown && progress >= 0.97) {
    boss4SecondTrialFinalPulseShown = true;
    document.getElementById("boss4SecondTrialMelodyLayer")?.classList.add("finalPulse");
    enemyRecoverySE.pause();
    enemyRecoverySE.currentTime = 0;
    enemyRecoverySE.play().catch(() => {});
  }
}

function applyStrongCircularWarp(intensity, currentMs, colorStrength = 1) {
  const phase = currentMs / 1000;
  const scale = 1 + intensity * (0.028 + (Math.sin(phase * 2.8) + 1) * 0.0125);
  const hueShift = Math.sin(phase * 6.2) * 25 * intensity * colorStrength;

  document.documentElement.style.setProperty("--song35-final-warp-scale", scale.toFixed(4));
  document.documentElement.style.setProperty("--song35-final-warp-hue", `${hueShift.toFixed(2)}deg`);
  document.documentElement.style.setProperty("--song35-final-warp-contrast", String(1 + intensity * 0.24 * colorStrength));
  document.documentElement.style.setProperty("--song35-final-warp-saturation", String(1 + intensity * 0.42 * colorStrength));
  document.documentElement.style.setProperty("--song35-final-warp-blur", `${(intensity * 18).toFixed(2)}px`);
  document.documentElement.style.setProperty("--song35-final-warp-overlay", String(0.08 + intensity * 0.86));
}

function updateSong35FinalTrialDistortion(currentMs) {
  if (!song35FinalTrialDistortionActive || song35FinalPuzzleTriggered || song35FinalTrialDistortionCancelled) return;
  const startTime = getNoteTime(93, [0, 1]) + offset;
  const peakTime = getNoteTime(125, [0, 1]) + offset;
  if (currentMs < startTime) return;
  if (life <= 0) {
    song35FinalTrialDistortionCancelled = true;
    document.body.classList.add("song35FinalTrialWarpFading");
    setTimeout(() => {
      document.body.classList.remove("song35FinalTrialWarp", "song35FinalTrialWarpFading");
    }, 920);
    return;
  }
  if (currentMs - song35FinalTrialLastWarpUpdateAt < 50) return;
  song35FinalTrialLastWarpUpdateAt = currentMs;

  const rawProgress = Math.max(0, Math.min(1, (currentMs - startTime) / Math.max(1, peakTime - startTime)));
  const intensity = Math.pow(rawProgress, 1.38);
  applyStrongCircularWarp(intensity, currentMs);
  document.body.classList.add("song35FinalTrialWarp");
}

function updateBoss4LateWarp(currentMs) {
  if (!boss4ChaosIntroMode || boss4LateWarpFinished) return;

  const startTime = getNoteTime(118, [0, 1]) + offset;
  const endTime = getNoteTime(138, [0, 1]) + offset;
  if (currentMs < startTime) return;

  if (currentMs >= endTime) {
    boss4LateWarpFinished = true;
    document.body.classList.add("song35FinalTrialWarpFading");
    setTimeout(() => {
      document.body.classList.remove("boss4LateWarp", "song35FinalTrialWarpFading");
    }, 920);
    return;
  }

  if (currentMs - boss4LateWarpLastUpdateAt < 50) return;
  boss4LateWarpLastUpdateAt = currentMs;

  const rawProgress = Math.max(0, Math.min(1, (currentMs - startTime) / Math.max(1, endTime - startTime)));
  // 赤いタップノーツの視認性を保つため、boss4では色調変化だけ控えめにする。
  applyStrongCircularWarp(Math.pow(rawProgress, 1.38), currentMs, 0.55);
  document.body.classList.add("boss4LateWarp");
}

function updateSong35FinalTrialCountdown(currentMs) {
  if (!song35FinalTrialDistortionActive) return;
  document.body.classList.add("song35FinalTrialCountdown");

  if (life <= 0) {
    comboText.textContent = "";
    comboText.style.display = "none";
    comboText.classList.remove("song35FinalTrialFailed");
    document.body.classList.remove("song35FinalTrialCountdown");
    return;
  }

  comboText.style.display = "block";
  comboText.classList.remove("song35FinalTrialFailed");
  const countdownCurrentMs = started
    ? currentMs
    : -prerollMs - Math.max(0, startDelayMs) + userOffset - timingCalibrationMs;
  const blackoutTime = getNoteTime(129, [0, 1]) + offset;
  const remainingSeconds = Math.max(0, Math.ceil((blackoutTime - countdownCurrentMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  comboText.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (started && remainingSeconds <= 30 && !song35FinalTrialThirtySecondPulseShown) {
    song35FinalTrialThirtySecondPulseShown = true;
    comboText.classList.remove("song35CountdownPulse30");
    void comboText.offsetWidth;
    comboText.classList.add("song35CountdownPulse30");
    setTimeout(() => comboText.classList.remove("song35CountdownPulse30"), 1350);
  }
  if (started && remainingSeconds <= 10 && !song35FinalTrialTenSecondPulseShown) {
    song35FinalTrialTenSecondPulseShown = true;
    comboText.classList.remove("song35CountdownPulse30", "song35CountdownPulse10");
    void comboText.offsetWidth;
    comboText.classList.add("song35CountdownPulse10");
    setTimeout(() => comboText.classList.remove("song35CountdownPulse10"), 1750);
  }
}

let activeParticleCount = 0;
const maxActiveParticles = 90;

function spawnParticles(laneIndex, color) {
  const laneElement = document.getElementById("lane" + laneIndex);
  if (!laneElement) return;

  // 密集譜面で演出用DOMが際限なく増えると、ポインター追従まで止まってしまう。
  const availableCount = Math.max(0, maxActiveParticles - activeParticleCount);
  const particleBudget = activeParticleCount >= 70 ? 3 : activeParticleCount >= 40 ? 6 : 10;
  const spawnCount = Math.min(particleBudget, availableCount);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < spawnCount; i++) {
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
    fragment.appendChild(particle);
    activeParticleCount++;
    setTimeout(() => {
      particle.remove();
      activeParticleCount = Math.max(0, activeParticleCount - 1);
    }, 800);
  }
  laneElement.appendChild(fragment);
}

function spawnLaneGlow(laneIndex, color, opacity = 0.3) {
  const laneElement = document.getElementById("lane" + laneIndex);
  if (!laneElement) return;
  // 同じレーンの古い発光を再利用し、連打時のDOM増加を防ぐ。
  const previousGlow = laneElement.querySelector(".laneGlowEffect");
  if (previousGlow) previousGlow.remove();
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
  if (Object.values(laneKeys).some((key) => keys[key])) {
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

  if (unlockChallenge) {
  const damageRate = 1 - life / maxLife;
  const spread = Math.floor(160 * damageRate);
  const alpha = Math.min(0.75, damageRate * 0.85);

  document.getElementById("damageVignette").style.boxShadow =
    `inset 0 0 ${spread}px rgba(255, 0, 0, ${alpha})`;
}
}

function updateComboGlow() {
  if (missCount === 0 && goodCount === 0) {
    comboText.classList.add("glowing");
  } else {
    comboText.classList.remove("glowing");
  }
}

let comboBounceAnimation = null;

function updateComboText(value) {
  if (bulletChallenge) return;
  if (song35FinalTrialDistortionActive && started) return;
  comboText.textContent = value;

  if (combo <= 0 || combo % 100 !== 0) return;

  comboBounceAnimation?.cancel();
  comboBounceAnimation = comboText.animate([
    { transform: "translateX(-50%) scale(1)" },
    { transform: "translateX(-50%) scale(1.12)", offset: 0.32 },
    { transform: "translateX(-50%) scale(0.97)", offset: 0.66 },
    { transform: "translateX(-50%) scale(1)" }
  ], {
    duration: 320,
    easing: "ease-out",
    composite: "replace"
  });
}

function updateRushMode(currentMs) {
  let nextRushState = false;
  let nextRushStartTime = Infinity;

  for (const event of rushEvents) {
    if (event.timeMs <= currentMs) {
      nextRushState = event.active;
    } else {
      if (event.active) nextRushStartTime = event.timeMs;
      break;
    }
  }

  const preparingRush = !nextRushState && nextRushStartTime - currentMs <= 800;
  document.body.classList.toggle("rushPreparing", preparingRush);

  if (nextRushState === rushModeActive) return;

  rushModeActive = nextRushState;
  if (rushFadeTimer) {
    clearTimeout(rushFadeTimer);
    rushFadeTimer = null;
  }

  if (rushModeActive) {
    document.body.classList.remove("rushPreparing", "rushFading");
    document.body.classList.add("rushMode");
  } else {
    document.body.classList.remove("rushMode");
    document.body.classList.add("rushFading");
    rushFadeTimer = setTimeout(() => {
      document.body.classList.remove("rushFading");
      rushFadeTimer = null;
    }, 380);
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

function getSaveData() {
  return JSON.parse(localStorage.getItem("rhythmGame") || "{}");
}

function isPartnerSkillEnabled() {
  const saveData = getSaveData();
  return saveData.settings?.partnerSkillEnabled !== false;
}

function isLyraSkillLocked(saveData = getSaveData()) {
  const song35Cleared = Object.values(saveData.song35 || {}).some(record => record?.cleared === true);
  return saveData.storyFlags?.lyraSkillLocked === true
    || saveData.storyFlags?.boss4PuzzleStarted === true
    || song35Cleared;
}

function getCurrentPartnerSkill() {
  const saveData = getSaveData();

  if (!isPartnerSkillEnabled()) return null;

  const partnerId = saveData.profile?.partner || "breaka";
  const partner = partners[partnerId];

  if (partnerId === "Lyra" && isLyraSkillLocked(saveData)) return null;
  if (!partner || !partner.skill) return null;

  const partnerLevel = Number(saveData.partnerData?.[partnerId]?.level || 1);
  return {
    ...partner.skill,
    amount: window.getPartnerSkillAmount(partnerId, partnerLevel)
  };
}

function isBoss3UnlockPlay() {
  return boss3Intro && currentSong === "boss3";
}

function updateTimedHealSkill(currentMs) {
  if (!activePartnerSkill) return;
  if (activePartnerSkill.type !== "timedHeal") return;
  if (isBoss3UnlockPlay()) return;

  for (let i = 0; i < timedHealTriggers.length; i++) {
    if (timedHealUsed[i]) continue;

    if (currentMs >= timedHealTriggers[i]) {
      timedHealUsed[i] = true;
      healLife(Number(activePartnerSkill.amount || 0));
    }
  }
}

function getJudgeRankValue(judge) {
  const ranks = {
    good: 1,
    perfect: 2,
    yellowPerfect: 3
  };

  return ranks[judge] || 0;
}

function applyJudgementRecoverySkill(judge) {
  if (isBoss3UnlockPlay()) return;
  if (!activePartnerSkill) return;
  if (activePartnerSkill.type !== "judgementRecovery") return;

  const minJudge = activePartnerSkill.minJudge || "good";

  if (getJudgeRankValue(judge) >= getJudgeRankValue(minJudge)) {
    healLife(Number(activePartnerSkill.amount || 0));
  }
}

function applyEmergencyHealSkill() {
  if (isBoss3UnlockPlay() || emergencyHealUsed || !activePartnerSkill) return;
  if (activePartnerSkill.type !== "emergencyHeal") return;

  const threshold = Number(activePartnerSkill.threshold ?? 200);
  if (life >= threshold) return;

  emergencyHealUsed = true;
  healLife(Number(activePartnerSkill.amount || 0), { allowRevive: true });
}

function checkFailure() {
  if (life <= 0) {
    if (unlockChallenge) {
  if (boss3Challenge && currentSong === "song19") {
    const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
    saveData.boss3UnlockChallengeActive = false;
    saveData.boss3UnlockChallengePending = false;
    saveData.boss3UnlockChallengeFailed = true;
    localStorage.setItem("rhythmGame", JSON.stringify(saveData));
  }
  fadeOutAudio(music, 900);

  gameOverSE.currentTime = 0;
  gameOverSE.play().catch(e => {
    console.log("gameover play failed:", e);
  });

  const shutter = document.getElementById("unlockFailShutter");
  const failed = document.getElementById("unlockFailedText");

  if (shutter) {
    shutter.classList.add("close");
  }
  if (failed) {
    failed.textContent = bulletChallenge ? "SILENCED" : "UNLOCK FAILED";
    failed.classList.toggle("silenced", bulletChallenge);
    failed.style.opacity = "1";
  }
  setTimeout(() => {
    location.href = "story.html";
  }, 1800);
  return;
}
    comboText.style.display = "none";
    failedText.style.opacity = "1";
  }
}

function fadeOutAudio(audio, durationMs = 900) {
  if (!audio) return;

  if (audio === music && decodedMusicBuffer && decodedMusicGain && decodedMusicContext) {
    const gain = decodedMusicGain.gain;
    const now = decodedMusicContext.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + durationMs / 1000);
    setTimeout(() => pauseMusicPlayback(), durationMs);
    return;
  }

  const startVolume = audio.volume;
  const steps = 30;
  const intervalMs = durationMs / steps;
  let currentStep = 0;

  const timer = setInterval(() => {
    currentStep++;

    const progress = currentStep / steps;
    audio.volume = Math.max(0, startVolume * (1 - progress));

    if (currentStep >= steps) {
      clearInterval(timer);
      audio.pause();
      audio.volume = startVolume;
    }
  }, intervalMs);
}

function flashDamageVignette() {
  const damageVignette = document.getElementById("damageVignette");
  if (!damageVignette) return;

  damageVignette.classList.remove("bulletHitFlash");
  void damageVignette.offsetWidth;
  damageVignette.classList.add("bulletHitFlash");
  setTimeout(() => damageVignette.classList.remove("bulletHitFlash"), 240);
}

function applyMiss(showText = true) {
  if (showText) {
    showJudgeText("Miss...", "#FF4444");
  }
  if (mapMode) {
    flashDamageVignette();
  }
  combo = 0;
  if (!song35FinalTrialDistortionActive) comboText.textContent = "0 Combo";
  // song35のStory Challengeも、最終ミッションが表示中なら通常プレイ同様にライフを減らす。
  const song35FinalMissionActive = song35StoryChallenge && isSong35FinalPuzzleReady();
  if (!boss3Intro && (!song35StoryChallenge || song35FinalMissionActive)) {
    const missDamage = song19StoryChallenge ? 60 : 70;
    damageTakenDuringPlay += missDamage;
    life -= missDamage;
    if (life < 0) life = 0;
    applyEmergencyHealSkill();
    updateLifeBar();
    checkFailure();
  }
  if (song35FinalTrialDistortionActive) updateSong35FinalTrialCountdown(getCurrentMs());
  missCount++;
  updateComboGlow();
  updateJudgeCounters();
}

function applySong19GoodDamage() {
  if (!song19StoryChallenge || boss3Intro || life <= 0) return;

  const goodDamage = 5;
  damageTakenDuringPlay += goodDamage;
  life = Math.max(0, life - goodDamage);
  applyEmergencyHealSkill();
  updateLifeBar();
  checkFailure();
}

function healLife(amount, { allowRevive = false } = {}) {
  // boss3初回プレイはライフが減らない特別演出。すべての回復経路をここでも遮断し、
  // 回復パーティクルの生成や同期ずれが新しいスキル経由で再発するのを防ぐ。
  if (isBoss3UnlockPlay()) return;
  if (life <= 0 && !allowRevive) return;

  const beforeLife = life;
  life = Math.min(maxLife, life + amount);

  if (life > beforeLife) {
    updateLifeBar();
    spawnLifeHealParticles();
  }
}

function spawnLifeHealParticles() {
  const lifeBar = document.getElementById("lifeBar");
  if (!lifeBar) return;

  const rect = lifeBar.getBoundingClientRect();

  for (let i = 0; i < 14; i++) {
    const particle = document.createElement("div");
    particle.classList.add("lifeHealParticle");

    const x = rect.left + Math.random() * rect.width;
    const y = rect.top + rect.height / 2;

    particle.style.left = x + "px";
    particle.style.top = y + "px";

    const tx = (Math.random() - 0.5) * 70;
    const ty = -(Math.random() * 36 + 16);

    particle.style.setProperty("--tx", tx + "px");
    particle.style.setProperty("--ty", ty + "px");

    document.body.appendChild(particle);

    setTimeout(() => {
      particle.remove();
    }, 700);
  }
}

// ---- ノーツ・小節線生成 ----
function getCurrentMs() {
  return getRawCurrentMs() + userOffset - timingCalibrationMs;
}

function updateEnemyLifeBar() {
  const enemyLifeFill = document.getElementById("enemyLifeFill");
  if (!enemyLifeFill) return;
  const percent = Math.max(0, Math.min(100, enemyLife / maxEnemyLife * 100));
  enemyLifeFill.style.width = percent + "%";
}

function showDualAttackEffects(note) {
  const game = document.getElementById("game");
  const area = document.getElementById("enemyLifeArea");
  const bar = document.getElementById("enemyLifeBar");
  if (!game || !area || !bar) return;

  bar.classList.remove("dualHit");
  void bar.offsetWidth;
  bar.classList.add("dualHit");

  const percent = Math.max(0, Math.min(100, enemyLife / maxEnemyLife * 100));
  const damageNumber = document.createElement("span");
  damageNumber.className = "enemyDamageNumber";
  damageNumber.textContent = "HIT!";
  damageNumber.style.left = percent + "%";
  area.appendChild(damageNumber);
  setTimeout(() => damageNumber.remove(), 600);

  const minLane = Math.min(...note.lanes);
  const maxLane = Math.max(...note.lanes);
  const attackX = ((minLane + maxLane + 1) / 2) * 100;
  const targetX = 250;
  const targetY = 404;
  const dx = targetX - attackX;
  const dy = targetY - judgeY;
  const beam = document.createElement("div");
  beam.className = "dualAttackBeam";
  beam.style.left = attackX + "px";
  beam.style.top = judgeY + "px";
  beam.style.height = Math.hypot(dx, dy) + "px";
  beam.style.transform = `translateX(-50%) rotate(${Math.atan2(dy, dx) * 180 / Math.PI - 90}deg)`;
  game.appendChild(beam);

  const impact = document.createElement("div");
  impact.className = "dualJudgeImpact";
  impact.style.left = (attackX - 39) + "px";
  impact.style.top = (judgeY - 39) + "px";
  game.appendChild(impact);

  setTimeout(() => {
    beam.remove();
    impact.remove();
  }, 380);
}

function damageEnemyFromDual(note) {
  if (!bulletChallenge || note.type !== "dual" || enemyLife <= 0) return;
  enemyLife = Math.max(0, enemyLife - dualEnemyDamage);
  updateEnemyLifeBar();
  showDualAttackEffects(note);
  if (enemyLife === 0) {
    document.getElementById("enemyMissionComplete")?.classList.remove("hidden");
  }
}

function enterChallengeFailure(message) {
  if (challengeFailureEntryStarted) return;
  challengeFailureEntryStarted = true;
  paused = true;
  pauseMusicPlayback();
  const failureMessage = document.getElementById("bulletEnemyFailureMessage");
  if (failureMessage) failureMessage.textContent = message;
  const failureOverlay = document.getElementById("bulletEnemyFailure");
  setTimeout(() => failureOverlay?.classList.remove("hidden"), 650);
}

function showBulletEnemyFailure() {
  if (!bulletChallenge || enemyLife <= 0 || bulletEnemyFailureShown) return;
  bulletEnemyFailureShown = true;
  enterChallengeFailure("敵のライフが0になっていません");
}

function countChapter4DualNote(note) {
  if (!chapter4StoryChallenge || note?.type !== "dual" || note.chapter4QuotaCounted) return;
  note.chapter4QuotaCounted = true;
  chapter4DualNoteGoodCount++;
  chapter4StaffNoteHeights.push(Math.floor(Math.random() * 7) * 5 - 7);
  updateChapter4DualGauge(true);
}

function updateChapter4DualGauge(animate = false) {
  const gauge = document.getElementById("storyDualGauge");
  const staff = document.getElementById("storyMusicStaff");
  const notesLayer = document.getElementById("storyMusicStaffNotes");
  const percent = document.getElementById("storyMusicProgressPercent");
  if (!gauge || !staff || !notesLayer || !percent) return;

  const displayedCount = Math.min(chapter4DualNoteGoodCount, chapter4DualNoteQuota);
  const progress = displayedCount / chapter4DualNoteQuota;
  percent.textContent = `${Math.round(progress * 100)}%`;
  const mixColor = (from, to, amount) => from.map((value, index) =>
    Math.round(value + (to[index] - value) * amount)
  );
  const firstHalf = Math.min(1, progress * 2);
  const secondHalf = Math.max(0, (progress - 0.5) * 2);
  const staffColor = progress <= 0.5
    ? mixColor([180, 250, 255], [255, 160, 211], firstHalf)
    : mixColor([255, 160, 211], [255, 236, 105], secondHalf);
  const glowColor = progress <= 0.5
    ? mixColor([65, 225, 255], [255, 91, 174], firstHalf)
    : mixColor([255, 91, 174], [255, 205, 38], secondHalf);
  gauge.style.setProperty("--story-music-color", `rgb(${staffColor.join(", ")})`);
  gauge.style.setProperty("--story-music-line-color", `rgba(${staffColor.join(", ")}, 0.94)`);
  gauge.style.setProperty("--story-music-glow", `rgba(${glowColor.join(", ")}, 0.78)`);
  gauge.setAttribute("aria-valuemax", String(chapter4DualNoteQuota));
  gauge.setAttribute("aria-valuenow", String(displayedCount));
  gauge.classList.toggle("complete", displayedCount >= chapter4DualNoteQuota);

  if (!animate) return;

  const noteIndex = chapter4DualNoteGoodCount - 1;
  const slot = noteIndex - chapter4StaffPageStart;
  if (slot >= 0 && slot < 6) {
    const staffNote = document.createElement("span");
    staffNote.className = "storyMusicStaffNote";
    staffNote.textContent = "♪";
    staffNote.style.left = `${(slot + 0.5) * (100 / 6)}%`;
    staffNote.style.top = `${chapter4StaffNoteHeights[noteIndex]}px`;
    notesLayer.appendChild(staffNote);
  }

  if (chapter4DualNoteGoodCount % 6 !== 0) return;
  const completedPageEnd = chapter4DualNoteGoodCount;
  clearTimeout(chapter4StaffTurnTimer);
  chapter4StaffTurnTimer = setTimeout(() => {
    staff.classList.add("turning");
    chapter4StaffTurnTimer = setTimeout(() => {
      chapter4StaffPageStart = completedPageEnd;
      notesLayer.replaceChildren();
      for (let index = chapter4StaffPageStart; index < chapter4DualNoteGoodCount; index++) {
        const slotIndex = index - chapter4StaffPageStart;
        if (slotIndex >= 6) break;
        const staffNote = document.createElement("span");
        staffNote.className = "storyMusicStaffNote settled";
        staffNote.textContent = "♪";
        staffNote.style.left = `${(slotIndex + 0.5) * (100 / 6)}%`;
        staffNote.style.top = `${chapter4StaffNoteHeights[index]}px`;
        notesLayer.appendChild(staffNote);
      }
      staff.classList.remove("turning");
    }, 420);
  }, 280);
}

updateChapter4DualGauge();

function triggerChapter4MissionComplete(currentMs) {
  if (!chapter4StoryChallenge || chapter4MissionCheckpointReached) return;
  if (currentMs < getNoteTime(108, [0, 1]) + offset) return;
  chapter4MissionCheckpointReached = true;
  if (chapter4DualNoteGoodCount < chapter4DualNoteQuota) return;

  const staffHud = document.getElementById("storyDualGauge");
  const missionComplete = document.getElementById("storyMusicMissionComplete");
  staffHud?.classList.add("missionCompleteLeaving");
  setTimeout(() => {
    if (!missionComplete) return;
    missionComplete.classList.remove("show");
    void missionComplete.offsetWidth;
    missionComplete.classList.add("show");
    setTimeout(() => missionComplete.classList.remove("show"), 1500);
  }, 430);
}

function showChapter4DualNoteFailure() {
  if (!chapter4StoryChallenge || chapter4DualNoteFailureShown) return;
  chapter4DualNoteFailureShown = true;
  enterChallengeFailure("音符の数が足りません");
}

function spawnEnemyRecoveryParticle() {
  const area = document.getElementById("enemyLifeArea");
  if (!area) return;

  const particle = document.createElement("span");
  particle.className = "enemyRecoveryParticle";
  particle.style.left = (8 + Math.random() * 84) + "%";
  particle.style.setProperty("--recovery-x", (Math.random() * 46 - 23) + "px");
  particle.style.setProperty("--recovery-y", -(20 + Math.random() * 32) + "px");
  area.appendChild(particle);
  setTimeout(() => particle.remove(), 750);
}

function lockBulletChallengePause() {
  if (!bulletChallenge || bulletPauseLocked) return;
  bulletPauseLocked = true;
  pauseButton.disabled = true;
  pauseButton.setAttribute("aria-disabled", "true");
}

function recoverEnemyLifeForFinalEvent(durationMs = 1600) {
  const bar = document.getElementById("enemyLifeBar");
  const startedAt = performance.now();
  const startingLife = enemyLife;
  let lastParticleAt = -Infinity;

  lockBulletChallengePause();
  bar?.classList.add("enemyRecovering");
  document.body.classList.add("enemyRecoveryShake");

  return new Promise(resolve => {
    function updateRecovery(now) {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 2);
      enemyLife = Math.round(startingLife + (maxEnemyLife - startingLife) * eased);
      updateEnemyLifeBar();

      if (now - lastParticleAt >= 70) {
        lastParticleAt = now;
        spawnEnemyRecoveryParticle();
      }

      if (progress < 1) {
        requestAnimationFrame(updateRecovery);
        return;
      }

      enemyLife = maxEnemyLife;
      updateEnemyLifeBar();
      bar?.classList.remove("enemyRecovering");
      document.body.classList.remove("enemyRecoveryShake");
      resolve();
    }

    requestAnimationFrame(updateRecovery);
  });
}

function spawnFinalBarrageNote(index, count, held = false) {
  if (bulletFinalEventDarkened) return;

  const element = document.createElement("div");
  element.className = "damageNote diamond finalBarrageDiamond" + (held ? " awaitingBarrage" : "");
  let startX;
  let startY;

  if (held) {
    // 画面上部からハート直前までを均等に埋め、巨大な弾幕の壁を作る。
    const usableHeight = Math.max(180, finalBarrageTargetY - 72);
    const aspect = window.innerWidth / usableHeight;
    const columns = Math.max(10, Math.ceil(Math.sqrt(count * aspect)));
    const rows = Math.ceil(count / columns);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellWidth = window.innerWidth / columns;
    const cellHeight = usableHeight / rows;
    const jitterX = (Math.random() - 0.5) * cellWidth * 0.72;
    const jitterY = (Math.random() - 0.5) * cellHeight * 0.68;
    startX = (column + 0.5) * cellWidth + jitterX;
    startY = -28 + (row + 0.5) * cellHeight + jitterY;
  } else {
    startX = -40 + Math.random() * (window.innerWidth + 80);
    startY = -75 - Math.random() * 90;
  }

  const targetX = finalBarrageTargetX;
  const targetY = finalBarrageTargetY;
  const distanceToHeart = Math.hypot(targetX - startX, targetY - startY);
  // 近い弾が即着弾しないよう最低時間を設けつつ、上方の弾ほど少し遅らせる。
  // 黄金比ベースの分散値に乱数を混ぜ、着弾が短時間に固まらないようにする。
  // 最終弾付近まで約7秒かけて、ライフが段階的に削られていく。
  const impactSpread = (
    index * 0.61803398875 + Math.random() * 0.24
  ) % 1;
  const duration = held
    ? 1400 + Math.min(360, distanceToHeart * 0.18) + impactSpread * 5200
    : distanceToHeart / 0.28;
  const note = {
    element,
    startTime: held ? null : performance.now(),
    duration,
    startX,
    startY,
    targetX,
    targetY,
    angle: Math.atan2(targetY - startY, targetX - startX) * 180 / Math.PI - 90,
    active: true
  };

  element.style.left = "0";
  element.style.top = "0";
  element.style.transform =
    `translate3d(${startX}px, ${startY}px, 0) translate(-50%, -50%) rotate(${note.angle}deg)`;
  document.body.appendChild(element);
  finalBarrageNotes.push(note);
}

async function prepareFinalBarrage(count) {
  const heartRect = heartPlayer.getBoundingClientRect();
  finalBarrageTargetX = (heartRect.left + heartRect.right) / 2;
  finalBarrageTargetY = (heartRect.top + heartRect.bottom) / 2;
  // 全弾が着弾すれば、満タンの2500ライフでも確実に0になる値。
  finalBarrageDamagePerHit = Math.ceil(maxLife / count) + 1;

  for (let start = 0; start < count; start += 16) {
    const end = Math.min(count, start + 16);
    for (let i = start; i < end; i++) spawnFinalBarrageNote(i, count, true);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
}

function releaseFinalBarrage() {
  const releaseTime = performance.now();
  document.body.classList.add("finalBarrageDistortion");
  for (const note of finalBarrageNotes) {
    note.startTime = releaseTime;
    note.element.classList.remove("awaitingBarrage");
    const startTransform =
      `translate3d(${note.startX}px, ${note.startY}px, 0) translate(-50%, -50%) rotate(${note.angle}deg)`;
    const endTransform =
      `translate3d(${note.targetX}px, ${note.targetY}px, 0) translate(-50%, -50%) rotate(${note.angle}deg)`;
    note.animation = note.element.animate(
      [{ transform: startTransform }, { transform: endTransform }],
      { duration: note.duration, easing: "linear", fill: "forwards" }
    );
    note.animation.addEventListener("finish", () => applyFinalBarrageHit(note), { once: true });
  }
}

function applyFinalBarrageHit(note) {
  if (bulletFinalEventDarkened || !note.active || life <= 0) return;
  note.active = false;
  note.element.remove();

  damageTakenDuringPlay += finalBarrageDamagePerHit;
  life = Math.max(0, life - finalBarrageDamagePerHit);
  applyEmergencyHealSkill();
  updateLifeBar();

  const now = performance.now();
  if (now - lastFinalBarrageImpactAt >= 42) {
    lastFinalBarrageImpactAt = now;
    document.body.classList.remove("bulletDamageShake");
    void document.body.offsetWidth;
    document.body.classList.add("bulletDamageShake");
    setTimeout(() => document.body.classList.remove("bulletDamageShake"), 180);
    flashDamageVignette();

    heartPlayer?.classList.remove("invincible", "finalBarrageHit");
    void heartPlayer?.offsetWidth;
    heartPlayer?.classList.add("finalBarrageHit");
    setTimeout(() => heartPlayer?.classList.remove("finalBarrageHit"), 150);

    bulletHitSE.currentTime = 0;
    bulletHitSE.play().catch(() => {});
  }

  if (life <= 0) finishFinalBarrageDefeat();
}

function finishFinalBarrageDefeat() {
  if (bulletFinalEventDarkened) return;
  bulletFinalEventDarkened = true;
  life = 0;
  updateLifeBar();

  for (const note of finalBarrageNotes) {
    note.active = false;
    note.animation?.cancel();
    note.element.remove();
  }
  finalBarrageNotes.length = 0;

  const failedText = document.getElementById("unlockFailedText");
  if (failedText) failedText.style.opacity = "0";
  const shutter = document.getElementById("unlockFailShutter");
  shutter?.classList.add("finalBarrageClose", "close");

  gameOverSE.currentTime = 0;
  gameOverSE.play().catch(() => {});
  setTimeout(() => {
    location.href = "title.html?fromSong18=1";
  }, 1650);
}

function saveBulletChallengeClear() {
  if (!bulletChallenge || currentSong !== "song18") return;

  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  saveData.song18Unlocked = true;
  const savedMaximum = Number(saveData.song19MaxClearedDifficulty);
  const legacyMaximum = saveData.boss3UnlockChallengeCleared === true
    ? Math.max(0, Math.min(2, Number(saveData.boss3UnlockChallengeDifficulty) || 0))
    : -1;
  const maximumClearedDifficulty = Number.isInteger(savedMaximum)
    ? savedMaximum
    : legacyMaximum;
  saveData.boss3UnlockChallengePending = maximumClearedDifficulty < 2;
  if (!saveData[currentSong]) saveData[currentSong] = {};
  if (!saveData[currentSong][currentDifficulty]) saveData[currentSong][currentDifficulty] = {};

  const record = saveData[currentSong][currentDifficulty];
  record.played = true;
  record.cleared = true;
  record.level = Number(songInfo.charts?.[currentDifficulty]?.level || record.level || 0);

  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
}

async function startBulletFinalEvent() {
  if (bulletFinalEventStarted) return;
  bulletFinalEventStarted = true;
  saveBulletChallengeClear();
  fadeOutAudio(music, 500);
  await new Promise(resolve => setTimeout(resolve, 2500));

  document.getElementById("enemyMissionComplete")?.classList.add("hidden");
  heartControlsLocked = true;
  pendingHeartClientX = null;
  enemyRecoverySE.currentTime = 0;
  const recoverySoundStarted = await enemyRecoverySE.play()
    .then(() => true)
    .catch(() => false);
  await recoverEnemyLifeForFinalEvent();
  document.getElementById("game")?.classList.add("bulletAfterRecovery");

  if (recoverySoundStarted && !enemyRecoverySE.ended) {
    await new Promise(resolve => {
      const finish = () => {
        enemyRecoverySE.removeEventListener("ended", finish);
        enemyRecoverySE.removeEventListener("error", finish);
        resolve();
      };
      enemyRecoverySE.addEventListener("ended", finish, { once: true });
      enemyRecoverySE.addEventListener("error", finish, { once: true });
    });
  }

  bulletEventSE.currentTime = 0;
  bulletEventSE.play().catch(() => {});
  const barrageCount = Math.max(
    180,
    Math.min(280, Math.round(window.innerWidth * window.innerHeight / 6500))
  );
  await prepareFinalBarrage(barrageCount);
  await new Promise(resolve => setTimeout(resolve, 900));
  releaseFinalBarrage();
}

function getRawCurrentMs() {
  if (!started) return -prerollMs;
  // 音源再生後は実際のオーディオ再生位置を唯一の時計として使う。
  // play()の開始遅延・デコード待ち・一時的な処理落ちがあっても、
  // 音源が進むまで譜面と演出を先行させない。
  if (musicStarted) {
    if (isMusicPlaybackEnded() || musicEndedAtPerformance !== null) {
      beginPostMusicClock();
      return musicEndedAtMs + Math.max(0, performance.now() - musicEndedAtPerformance);
    }
    if (decodedMusicBuffer) return getDecodedMusicCurrentSec() * 1000;
    return Math.max(0, Number(music.currentTime || 0) * 1000);
  }
  return performance.now() - gameStartTime - prerollMs;
}

function getNormalYFromTime(hitTime, currentMs) {
  if (speedEvents.length === 0 && initialSpeedMultiplier === 1) {
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

function getYFromTime(hitTime, currentMs = getCurrentMs()) {
  const timing = boss4ReverseChartTiming;
  const isReverseTarget = timing
    && hitTime >= timing.firstHitMs
    && hitTime < timing.lastHitExclusiveMs;

  if (!isReverseTarget || currentMs < timing.reverseStartMs || currentMs >= timing.resumeMs) {
    return getNormalYFromTime(hitTime, currentMs);
  }

  // 117小節目1/4で通常の流下に戻しても位置が飛ばないよう、
  // その時点の本来位置を逆走の終点とする。
  const reversalY = getNormalYFromTime(hitTime, timing.resumeMs);
  if (currentMs >= timing.stopMs) return reversalY;

  const progress = Math.max(0, Math.min(1,
    (currentMs - timing.reverseStartMs) / (timing.stopMs - timing.reverseStartMs)
  ));
  // 画面下のさらに外側から一気にせり上がらせ、逆走する譜面を長く・速く見せる。
  const reverseTravelDistance = distance * 1.45 + 240;
  const belowLaneY = reversalY + reverseTravelDistance;
  return belowLaneY + (reversalY - belowLaneY) * progress;
}

function getSpawnTimeFromHitTime(hitTime) {
  const basePxPerMs = distance / travelTime;
  const hitVisual = getVisualOffsetFromTime(hitTime);
  const spawnVisual = hitVisual - distance;

  let spawnTime = hitTime - travelTime;

  if (speedEvents.length > 0 || initialSpeedMultiplier !== 1) {
    let accumulated = 0;
    let prevMs = 0;
    let currentMultiplier = initialSpeedMultiplier;
    let found = false;

    for (const event of speedEvents) {
      const segmentVisual = (event.timeMs - prevMs) * basePxPerMs * currentMultiplier;

      if (currentMultiplier > 0 && accumulated + segmentVisual >= spawnVisual) {
        spawnTime = prevMs + (spawnVisual - accumulated) / (basePxPerMs * currentMultiplier);
        found = true;
        break;
      }

      accumulated += segmentVisual;
      prevMs = event.timeMs;
      currentMultiplier = event.multiplier;
    }

    if (!found && currentMultiplier > 0) {
      spawnTime = prevMs + (spawnVisual - accumulated) / (basePxPerMs * currentMultiplier);
    }
  }

  return spawnTime;
}

function prepareGameplaySpawnQueues() {
  const shouldPreloadBoss4ReverseNote = hitTime => {
    const timing = boss4ReverseChartTiming;
    if (
      !timing
      || hitTime < timing.firstHitMs
      || hitTime >= timing.lastHitExclusiveMs
    ) return false;

    // 逆走中に画面へ入るノーツだけを先行生成する。129小節目までを一括で
    // DOM化すると譜面更新が重くなるため、画面外のノーツは通常の生成時刻を保つ。
    const reversalY = getNormalYFromTime(hitTime, timing.resumeMs);
    const reverseTravelDistance = distance * 1.45 + 240;
    return reversalY >= spawnY - reverseTravelDistance - 80
      && reversalY <= judgeY + 120;
  };

  for (const note of chart) {
    note.spawnTime = getSpawnTimeFromHitTime(note.hitTime);
    if (shouldPreloadBoss4ReverseNote(note.hitTime)) {
      note.spawnTime = Math.min(note.spawnTime, boss4ReverseChartTiming.reverseStartMs);
    }
  }
  for (const note of damageNotes) {
    note.spawnTime = getSpawnTimeFromHitTime(note.hitTime);
    if (shouldPreloadBoss4ReverseNote(note.hitTime)) {
      note.spawnTime = Math.min(note.spawnTime, boss4ReverseChartTiming.reverseStartMs);
    }
  }

  chartSpawnQueue = [...chart].sort((a, b) => a.spawnTime - b.spawnTime);
  damageSpawnQueue = [...damageNotes].sort((a, b) => a.spawnTime - b.spawnTime);
  chartSpawnCursor = 0;
  damageSpawnCursor = 0;

  // 開始速度が低い場合も、最初のノーツを途中から突然出さず、
  // 画面上端から流し始められるだけのプリロールを確保する。
  const firstSpawnTime = Math.min(
    chartSpawnQueue[0]?.spawnTime ?? Infinity,
    damageSpawnQueue[0]?.spawnTime ?? Infinity
  );
  prerollMs = Number.isFinite(firstSpawnTime)
    ? Math.max(travelTime, -firstSpawnTime + 16)
    : travelTime;
  primeInitialNoteRendering();
}

function primeInitialNoteRendering() {
  const firstSpawnTime = Math.min(
    chartSpawnQueue[0]?.spawnTime ?? Infinity,
    damageSpawnQueue[0]?.spawnTime ?? Infinity
  );
  if (!Number.isFinite(firstSpawnTime)) return;

  const preloadUntil = firstSpawnTime + 250;
  for (const noteData of chartSpawnQueue) {
    if (noteData.spawnTime > preloadUntil) break;
    createNote(noteData, { hidden: true });
  }
  for (const noteData of damageSpawnQueue) {
    if (noteData.spawnTime > preloadUntil) break;
    createDamageNote(noteData, { hidden: true });
  }

  // CSS計算と初回レイアウトをローディング画面内で完了させる。
  void document.getElementById("game")?.offsetHeight;
}

function isBoss4ContractingDual(noteData) {
  const measure = Number(noteData?.measure);
  return boss4ChaosIntroMode
    && noteData?.type === "dual"
    && measure >= 66
    && measure <= 73;
}

function updateBoss4ContractingDual(noteData) {
  if (!isBoss4ContractingDual(noteData) || !noteData.element) return;

  const fallDistance = Math.max(1, judgeY - spawnY);
  const rawProgress = Math.max(0, Math.min(1, (noteData.y - spawnY) / fallDistance));
  const shrinkProgress = rawProgress * rawProgress * (3 - 2 * rawProgress);
  const fullLaneLeft = 10;
  const fullLaneWidth = 480;
  const targetLeft = noteData.boss4DualTargetLeft;
  const targetWidth = noteData.boss4DualTargetWidth;

  noteData.element.style.left = `${fullLaneLeft + (targetLeft - fullLaneLeft) * shrinkProgress}px`;
  noteData.element.style.width = `${fullLaneWidth + (targetWidth - fullLaneWidth) * shrinkProgress}px`;
}

function createNote(noteData, { hidden = false } = {}) {
  const note = noteElementPool.pop() || document.createElement("div");
  note.className = "note";
  note.removeAttribute("style");
  note.replaceChildren();
  if (hidden) {
    note.style.visibility = "hidden";
    note.style.top = spawnY + "px";
  }

  if (noteData.type === "dual") {
    note.classList.add("dual");
  }

  if (boss4ChaosIntroMode && noteData.type === "tap") {
    note.classList.add("boss4FirstPlayTap");
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
    const minLane = Math.min(...noteData.lanes);
    const maxLane = Math.max(...noteData.lanes);
    const laneSpan = maxLane - minLane + 1;
    const noteWidth = laneSpan * 100 - 20;
    noteData.boss4DualTargetLeft = minLane * 100 + 10;
    noteData.boss4DualTargetWidth = noteWidth;
    note.style.width = (isBoss4ContractingDual(noteData) ? 480 : noteWidth) + "px";

    if (chapter4StoryChallenge) {
      const symbol = document.createElement("span");
      symbol.className = "storyChallengeDualSymbol";
      symbol.textContent = laneSpan === 1 ? "♪" : "♬";
      symbol.style.fontSize = (24 + laneSpan * 24) + "px";
      note.appendChild(symbol);
    }
  }

  if (noteData.type === "tap" || noteData.type === "dual") {
  note.style.transform = "translateY(-50%)";
}

  noteData.element = note;

  const laneIndex = noteData.lanes ? noteData.lanes[0] : noteData.lane;

    const game = document.getElementById("game");

  note.style.left = isBoss4ContractingDual(noteData)
    ? "10px"
    : (laneIndex * 100 + 10) + "px";
  game.appendChild(note);
}

function releaseNoteElement(noteData) {
  const element = noteData?.element;
  if (!element) return;
  element.remove();
  element.className = "note";
  element.removeAttribute("style");
  noteData.element = null;
  if (noteElementPool.length < maxPooledNoteElements) {
    noteElementPool.push(element);
  }
}

function burstStoryChallengeDualSymbol(noteData) {
  if (!chapter4StoryChallenge || noteData?.type !== "dual") return;

  const symbol = noteData.element?.querySelector(".storyChallengeDualSymbol");
  if (!symbol) return;

  const rect = symbol.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "storyChallengeNoteBurst";
  burst.style.left = (rect.left + rect.width / 2) + "px";
  burst.style.top = (rect.top + rect.height / 2) + "px";

  const ghost = document.createElement("span");
  ghost.className = "storyChallengeNoteBurstGhost";
  ghost.textContent = symbol.textContent;
  ghost.style.fontSize = getComputedStyle(symbol).fontSize;
  burst.appendChild(ghost);

  const laneSpan = Math.max(...noteData.lanes) - Math.min(...noteData.lanes) + 1;
  const particleCount = 12 + laneSpan * 3;
  for (let index = 0; index < particleCount; index++) {
    const particle = document.createElement("span");
    particle.className = "storyChallengeNoteBurstParticle";
    const angle = (Math.PI * 2 * index / particleCount) + (Math.random() - 0.5) * 0.28;
    const distance = 42 + laneSpan * 9 + Math.random() * 38;
    particle.style.setProperty("--burst-x", (Math.cos(angle) * distance) + "px");
    particle.style.setProperty("--burst-y", (Math.sin(angle) * distance) + "px");
    particle.style.setProperty("--burst-size", (4 + Math.random() * 7) + "px");
    particle.style.setProperty("--burst-delay", (Math.random() * 45) + "ms");
    burst.appendChild(particle);
  }

  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 760);
}

function pruneInactiveNotes() {
  for (let index = notes.length - 1; index >= 0; index--) {
    if (!notes[index].active) notes.splice(index, 1);
  }
}

function createDamageNote(noteData, { hidden = false } = {}) {
  if (noteData.type === "damageLong") {
    createDamageLongNote(noteData);
    if (hidden && noteData.element) noteData.element.style.visibility = "hidden";
    return;
  }

  const note = document.createElement("div");
  if (noteData.type === "musicNote") {
    note.className = "musicCollectNote";
    note.textContent = noteData.symbol;
    if (hidden) note.style.visibility = "hidden";
    note.style.fontSize = noteData.size + "px";
    note.style.left = (noteData.x * 500) + "px";
    note.style.top = spawnY + "px";
    noteData.element = note;
    document.getElementById("game").appendChild(note);
    return;
  }
  note.classList.add("damageNote", noteData.shape || "circle");
  if (hidden) note.style.visibility = "hidden";
  note.style.width = noteData.size + "px";
  note.style.height = (noteData.shape === "diamond" ? noteData.size * 1.32 : noteData.size) + "px";
  note.style.left = (noteData.x * 500) + "px";
  note.style.top = spawnY + "px";
  noteData.element = note;
  document.getElementById("game").appendChild(note);
}

let damageMarbleFilterCount = 0;

function addDamageMarbleFilter(svg) {
  const svgNs = "http://www.w3.org/2000/svg";
  const filterId = `damageMarble-${++damageMarbleFilterCount}`;
  const defs = document.createElementNS(svgNs, "defs");
  const filter = document.createElementNS(svgNs, "filter");
  filter.id = filterId;
  filter.setAttribute("x", "-25%");
  filter.setAttribute("y", "-25%");
  filter.setAttribute("width", "150%");
  filter.setAttribute("height", "150%");

  const turbulence = document.createElementNS(svgNs, "feTurbulence");
  turbulence.setAttribute("type", "fractalNoise");
  turbulence.setAttribute("baseFrequency", "0.012 0.045");
  turbulence.setAttribute("numOctaves", "3");
  turbulence.setAttribute("seed", String(damageMarbleFilterCount));
  turbulence.setAttribute("result", "noise");

  const flow = document.createElementNS(svgNs, "animate");
  flow.setAttribute("attributeName", "baseFrequency");
  flow.setAttribute("values", "0.014 0.042;0.017 0.037;0.013 0.045;0.014 0.042");
  flow.setAttribute("dur", "2.4s");
  flow.setAttribute("repeatCount", "indefinite");
  turbulence.appendChild(flow);

  const color = document.createElementNS(svgNs, "feColorMatrix");
  color.setAttribute("in", "noise");
  color.setAttribute("type", "matrix");
  color.setAttribute(
    "values",
    "1.15 0 0 0 0.18  0 0.28 0 0 0.01  0 0 1.45 0 0.28  0 0 0 1 0"
  );
  color.setAttribute("result", "purpleNoise");

  const mask = document.createElementNS(svgNs, "feComposite");
  mask.setAttribute("in", "purpleNoise");
  mask.setAttribute("in2", "SourceGraphic");
  mask.setAttribute("operator", "in");
  mask.setAttribute("result", "marble");

  const blend = document.createElementNS(svgNs, "feBlend");
  blend.setAttribute("in", "SourceGraphic");
  blend.setAttribute("in2", "marble");
  blend.setAttribute("mode", "screen");

  filter.append(turbulence, color, mask, blend);
  defs.appendChild(filter);
  svg.appendChild(defs);
  return filterId;
}

function createDamageLongNote(noteData) {
  const game = document.getElementById("game");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  const marbleFilterId = addDamageMarbleFilter(svg);
  svg.classList.add("damageLongShape");
  polygon.setAttribute("filter", `url(#${marbleFilterId})`);
  svg.appendChild(polygon);
  noteData.element = svg;
  noteData.polygon = polygon;
  game.appendChild(svg);
}

function getDamageLongPointEdges(point) {
  const width = Math.max(1, Math.min(10, Number(point.width || 2)));
  const left = Math.max(0, Math.min(10 - width, point.x * 10)) * 50;
  const right = left + width * 50;
  return {
    left,
    right,
    center: (left + right) / 2,
    y: getYFromTime(point.hitTime)
  };
}

function applyDamageCurve(t, curve) {
  if (curve === "accelerate") return t * t;
  if (curve === "decelerate") return 1 - Math.pow(1 - t, 2);
  if (curve === "sine") {
    return 0.5 + Math.asin(2 * t - 1) / Math.PI;
  }
  if (curve === "cosine") {
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }
  return t;
}

function buildDamageLongEdgePoints(points, getEdges) {
  if (points.length <= 1) return points.map(getEdges);

  const sampled = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = getEdges(points[i]);
    const end = getEdges(points[i + 1]);
    const steps = Math.max(8, Math.ceil(Math.abs(end.y - start.y) / 24));

    for (let step = 0; step <= steps; step++) {
      if (i > 0 && step === 0) continue;

      const t = step / steps;
      const curvedT = applyDamageCurve(t, points[i].curve);
      sampled.push({
        left: start.left + (end.left - start.left) * curvedT,
        right: start.right + (end.right - start.right) * curvedT,
        center: start.center + (end.center - start.center) * curvedT,
        y: start.y + (end.y - start.y) * t
      });
    }
  }

  return sampled;
}

function updateDamageLongNote(noteData) {
  const edges = buildDamageLongEdgePoints(noteData.points, getDamageLongPointEdges);
  noteData.currentEdges = edges;
  const polygonPoints = [
    ...edges.map(point => `${point.left},${point.y}`),
    ...edges.slice().reverse().map(point => `${point.right},${point.y}`)
  ];
  noteData.polygon.setAttribute("points", polygonPoints.join(" "));

  const anyVisible = edges.some(point => point.y < 700);

  if (!anyVisible) {
    noteData.active = false;
    noteData.element.remove();
    if (bulletChallenge) {
      checkClear();
    }
  }
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function heartHitsDamageLong(note) {
  const heartY = heartCenterY;
  const heartVisualSize = 52;
  const edges = note.currentEdges || buildDamageLongEdgePoints(note.points, getDamageLongPointEdges);

  for (let i = 0; i < edges.length - 1; i++) {
    const widthPx = Math.abs(edges[i].right - edges[i].left);
    const distance = pointToSegmentDistance(
      heartX,
      heartY,
      edges[i].center,
      edges[i].y,
      edges[i + 1].center,
      edges[i + 1].y
    );

    const damageRadius = Math.max(0, widthPx / 2 - damageHitboxInsetPx);
    if (distance <= damageRadius + heartVisualSize * 0.28) {
      return true;
    }
  }

  return false;
}

function isHeartDodgeModeActive() {
  return bulletChallenge || boss3BulletPhaseActive;
}

function updateHeartFromPointer(clientX) {
  if (!isHeartDodgeModeActive() || !heartPlayer) return;
  if (heartControlsLocked) {
    showHeartResistance();
    return;
  }

  const gameRect = document.getElementById("game").getBoundingClientRect();
  heartX = Math.max(17, Math.min(483, clientX - gameRect.left));
  heartPlayer.style.left = heartX + "px";
}

function queueHeartPointerUpdate(clientX) {
  pendingHeartClientX = clientX;
  if (heartMoveFrame !== null) return;

  heartMoveFrame = requestAnimationFrame(() => {
    heartMoveFrame = null;
    if (pendingHeartClientX === null) return;
    updateHeartFromPointer(pendingHeartClientX);
    pendingHeartClientX = null;
  });
}

function showHeartResistance() {
  if (!heartPlayer || heartResistanceActive) return;
  heartResistanceActive = true;
  heartPlayer.classList.add("resisting");
  setTimeout(() => {
    heartPlayer.classList.remove("resisting");
    heartResistanceActive = false;
  }, 180);
}

function updateHeartFromKeyboard(now) {
  if (!isHeartDodgeModeActive() || !heartPlayer) return;
  if (heartControlsLocked) {
    if (keys.ArrowLeft || keys.ArrowRight) showHeartResistance();
    return;
  }

  const direction = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  if (direction === 0) {
    lastHeartKeyboardMoveAt = now;
    return;
  }

  if (lastHeartKeyboardMoveAt === null) {
    lastHeartKeyboardMoveAt = now;
    return;
  }

  const elapsedSeconds = Math.min(0.05, Math.max(0, now - lastHeartKeyboardMoveAt) / 1000);
  lastHeartKeyboardMoveAt = now;
  const heartKeyboardSpeed = 620;
  heartX = Math.max(17, Math.min(483, heartX + direction * heartKeyboardSpeed * elapsedSeconds));
  heartPlayer.style.left = heartX + "px";
}

function applyBulletDamage() {
  if (!isHeartDodgeModeActive() || life <= 0) return;

  const now = performance.now();
  if (now - lastBulletDamageAt < bulletInvincibleMs) return;

  lastBulletDamageAt = now;
  damageTakenDuringPlay += bulletDamage;
  life -= bulletDamage;
  if (life < 0) life = 0;
  applyEmergencyHealSkill();

  document.body.classList.remove("bulletDamageShake");
  void document.body.offsetWidth;
  document.body.classList.add("bulletDamageShake");
  setTimeout(() => document.body.classList.remove("bulletDamageShake"), 180);

  flashDamageVignette();

  if (heartPlayer) {
    heartPlayer.classList.add("invincible");
    setTimeout(() => heartPlayer.classList.remove("invincible"), bulletInvincibleMs);
  }

  bulletHitSE.currentTime = 0;
  bulletHitSE.play().catch(() => {});

  updateLifeBar();
  checkFailure();
}

function collectMusicNote(note) {
  if (!note.active) return;
  note.active = false;
  note.collected = true;
  note.element?.classList.add("collected");
  setTimeout(() => note.element?.remove(), 220);

  showJudgeText("Perfect!", "#FFD84A");
  score += perfectScore + 1;
  yellowPerfectCount++;
  combo++;
  maxCombo = Math.max(maxCombo, combo);
  applyJudgementRecoverySkill("yellowPerfect");
  updateComboText(combo + " Combo");
  updateComboGlow();
  updateJudgeCounters();
  updateScore();
  checkClear();
}

function checkDamageNoteCollision() {
  if (!isHeartDodgeModeActive() || !heartPlayer || life <= 0) return;

  const heartY = heartCenterY;
  const heartHalfSize = 26;
  for (const note of damageNotes) {
    if (!note.active) continue;

    if (note.type === "musicNote" && Number.isFinite(note.y)) {
      const noteRadius = Math.max(18, Number(note.size || 42) * 0.42);
      const noteX = note.x * 500;
      if (Math.hypot(heartX - noteX, heartY - note.y) <= heartHalfSize + noteRadius) {
        collectMusicNote(note);
      }
      continue;
    }

    if (note.type === "damageLong") {
      if (heartHitsDamageLong(note)) {
        applyBulletDamage();
        return;
      }
    } else if (Number.isFinite(note.y)) {
      const noteWidth = Number(note.size || 42);
      const noteHeight = note.shape === "diamond" ? noteWidth * 1.32 : noteWidth;
      const hitHalfWidth = Math.max(0, noteWidth / 2 - damageHitboxInsetPx);
      const hitHalfHeight = Math.max(0, noteHeight / 2 - damageHitboxInsetPx);
      const noteX = note.x * 500;

      if (
        Math.abs(heartX - noteX) < heartHalfSize + hitHalfWidth &&
        Math.abs(heartY - note.y) < heartHalfSize + hitHalfHeight
      ) {
        applyBulletDamage();
        return;
      }
    }
  }
}

// ---- ゲームループ ----
function judgeLongNoteEnd(note) {
  if (note.endJudged) return;
  note.endJudged = true;

  if (note.holdResult === "miss") return;

  const holdKey = keys[laneKeys[note.lane]];
  if (!holdKey) {
    applyMiss();
    return;
  }

  if (note.holdResult === "perfect") {
    showJudgeText("Perfect!", "#FFD84A", note.lane);
    score += perfectScore + 1;
    yellowPerfectCount++;
    applyJudgementRecoverySkill("yellowPerfect");
  } else {
    showJudgeText("Good!", "#88FF88", note.lane);
    score += goodScore;
    goodCount++;
    applySong19GoodDamage();
    applyJudgementRecoverySkill("good");
  }

  combo++;
  maxCombo = Math.max(maxCombo, combo);
  updateComboText(combo + " Combo");
  updateScore();
}

function triggerSong19LongCut(currentMs) {
  if (currentSong !== "song19" || song19LongCutTriggered) return;

  const cutTime = getNoteTime(54, [0, 1]) + offset;
  if (currentMs < cutTime) return;

  song19LongCutTriggered = true;
  let removedLongNote = false;

  for (const note of notes) {
    if (
      note.active &&
      note.type === "long" &&
      note.holding &&
      note.hitTime <= cutTime &&
      note.endTime > cutTime
    ) {
      judgeLongNoteEnd(note);
      note.active = false;
      releaseNoteElement(note);
      removedLongNote = true;
    }
  }

  if (removedLongNote) checkClear();
}

function isBoss3Measure29CutLong(note) {
  return note?.boss3CutAtMeasure29 === true;
}

function triggerBoss3OpeningLongEnd(currentMs) {
  if (currentSong !== "boss3") return;
  const cutTime = getNoteTime(29, [0, 1]) + offset;
  if (currentMs < cutTime) return;

  let removed = false;
  for (const note of notes) {
    if (!note.active || !isBoss3Measure29CutLong(note)) continue;
    judgeLongNoteEnd(note);
    note.active = false;
    releaseNoteElement(note);
    removed = true;
  }
  if (removed) {
    checkClear();
  }
}

function updateBoss3HoverTapEffect(currentMs) {
  if (currentSong !== "boss3") return;
  const appearTime = getNoteTime(29, [0, 1]) + offset;
  const disappearTime = getNoteTime(31, [0, 1]) + offset;
  const game = document.getElementById("game");

  if (!boss3HoverTapsShown && currentMs >= appearTime) {
    boss3HoverTapsShown = true;
    for (const lane of [1, 3]) {
      const tap = document.createElement("div");
      tap.className = "boss3HoverTap";
      tap.style.left = `${lane * 100 + 10}px`;
      tap.innerHTML = '<span class="boss3HoverTapCore"></span>';
      game?.appendChild(tap);
      requestAnimationFrame(() => tap.classList.add("active"));
    }
  }

  if (!boss3HoverTapsRemoved && currentMs >= disappearTime) {
    boss3HoverTapsRemoved = true;
    const taps = [...document.querySelectorAll(".boss3HoverTap")];
    taps.forEach(tap => tap.classList.add("exiting"));
    setTimeout(() => taps.forEach(tap => tap.remove()), 260);
  }
}

function triggerBoss3Background2Transition(currentMs) {
  if (!boss3Intro || currentSong !== "boss3" || boss3Background2TransitionStarted) return;
  const transitionTime = getNoteTime(29, [0, 1]) + offset;
  if (currentMs < transitionTime) return;

  boss3Background2TransitionStarted = true;
  document.body.classList.add("boss3Background2Wiping");
  document.body.classList.add("boss3Background2HudCovered");
  document.querySelectorAll(".lifeHealParticle").forEach(particle => particle.remove());
  // clip-path の合成レイヤーを作る前にHUDを描画ツリーから確実に外す。
  // animation側の短いdelay中も初期フレームを保持し、同一フレームでの再合成を避ける。
  void document.body.offsetHeight;
  // 画面上辺の中央を起点にし、最も遠い左右下端を余裕をもって覆う。
  // 画面対角線より十分に大きくし、円周が見えなくなるまで確実に画面外へ送る。
  const radius = Math.hypot(window.innerWidth, window.innerHeight) * 1.8 + 300;

  const wipe = document.createElement("div");
  wipe.id = "boss3Background2Wipe";
  document.body.prepend(wipe);

  const noiseRing = document.createElement("div");
  noiseRing.id = "boss3Background2NoiseRing";
  wipe.after(noiseRing);

  const animation = wipe.animate(
    [
      { clipPath: "circle(0px at 50% 0%)" },
      { clipPath: `circle(${radius * 0.24}px at 50% 0%)`, offset: 0.24 },
      { clipPath: `circle(${radius * 0.62}px at 50% 0%)`, offset: 0.62 },
      { clipPath: `circle(${radius}px at 50% 0%)` }
    ],
    {
      duration: BOSS3_BACKGROUND_WIPE_DURATION_MS,
      delay: 80,
      easing: "linear",
      fill: "both"
    }
  );

  noiseRing.animate(
    [
      { width: "0px", height: "0px", opacity: 0 },
      { width: `${radius * 0.48}px`, height: `${radius * 0.48}px`, opacity: 0.95, offset: 0.24 },
      { width: `${radius * 1.24}px`, height: `${radius * 1.24}px`, opacity: 1, offset: 0.62 },
      { width: `${radius * 2}px`, height: `${radius * 2}px`, opacity: 0.9 }
    ],
    {
      duration: BOSS3_BACKGROUND_WIPE_DURATION_MS,
      delay: 80,
      easing: "linear",
      fill: "both"
    }
  );

  animation.finished
    .catch(() => {})
    .then(() => {
      // 巨大clip-pathは常駐させず、クリップなしの静止背景へ引き継ぐ。
      const staticBackground = document.createElement("div");
      staticBackground.id = "boss3Background2Static";
      wipe.after(staticBackground);
      document.body.style.backgroundImage = "url('songs/boss3/background2.png')";
      document.body.classList.add("boss3Background2Applied");
      document.body.classList.add("boss3Background2HudCovered");
      noiseRing.animate(
        [{ opacity: 0.9 }, { opacity: 0 }],
        { duration: 220, easing: "ease-out", fill: "forwards" }
      );
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            document.body.classList.remove("boss3Background2Wiping");
            wipe.remove();
            noiseRing.remove();
          }, 220);
        });
      });
    });
}

function triggerBoss4FirstBackgroundTransition(currentMs) {
  if (!boss4ChaosIntroMode) return;

  const revealMeasures = [10, 14];
  const darkenMeasures = [12, 16];
  const nextRevealMeasure = revealMeasures[boss4BackgroundRevealIndex];
  const fadeInTime = Number.isFinite(nextRevealMeasure)
    ? getNoteTime(nextRevealMeasure, [0, 1]) + offset
    : Infinity;
  if (currentMs >= fadeInTime) {
    boss4BackgroundRevealIndex++;
    document.body.classList.remove("boss4BackgroundDarkened", "boss4BackgroundApplied");
    document.body.classList.add("boss4BackgroundWiping");
    const wipe = document.createElement("div");
    wipe.id = "boss4BackgroundWipe";
    document.body.prepend(wipe);

    const wipeAnimation = wipe.animate(
      [
        { opacity: 0, transform: "scale(1.48)", filter: "blur(13px) contrast(1.9) saturate(0.25) hue-rotate(48deg) brightness(0.35)" },
        { opacity: 0.46, transform: "scale(1.16)", filter: "blur(6px) contrast(1.65) saturate(1.8) hue-rotate(-24deg) brightness(0.76)", offset: 0.3 },
        { opacity: 0.78, transform: "scale(0.94)", filter: "blur(2px) contrast(1.38) saturate(1.5) hue-rotate(8deg) brightness(1.2)", offset: 0.58 },
        { opacity: 0.92, transform: "scale(1.1)", filter: "blur(1px) contrast(1.22) saturate(1.3) brightness(1.1)", offset: 0.76 },
        { opacity: 0.97, transform: "scale(0.985)", filter: "blur(0.3px) contrast(1.08) saturate(1.1) brightness(1.03)", offset: 0.9 },
        { opacity: 1, transform: "scale(1)", filter: "blur(0) contrast(1) saturate(1) hue-rotate(0) brightness(1)" }
      ],
      { duration: 1400, easing: "cubic-bezier(0.2, 0.68, 0.25, 1)", fill: "both" }
    );

    wipeAnimation.finished.catch(() => {}).then(() => {
      document.body.style.backgroundImage = "url('songs/boss4/background.png')";
      document.body.classList.add("boss4BackgroundApplied");
      document.body.classList.remove("boss4BackgroundWiping");
      wipe.remove();
    });
  }

  const nextDarkenMeasure = darkenMeasures[boss4BackgroundDarkenIndex];
  const darkenTime = Number.isFinite(nextDarkenMeasure)
    ? getNoteTime(nextDarkenMeasure, [0, 1]) + offset
    : Infinity;
  if (currentMs >= darkenTime) {
    boss4BackgroundDarkenIndex++;
    const darken = document.createElement("div");
    darken.id = "boss4BackgroundDarken";
    document.body.prepend(darken);
    document.body.classList.add("boss4BackgroundDarkening");
    const darkenAnimation = darken.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 760, easing: "ease-in", fill: "both" }
    );
    darkenAnimation.finished.catch(() => {}).then(() => {
      document.body.style.backgroundImage = "none";
      document.body.classList.remove("boss4BackgroundWiping", "boss4BackgroundApplied", "boss4BackgroundDarkening");
      document.body.classList.add("boss4BackgroundDarkened");
      document.getElementById("boss4BackgroundWipe")?.remove();
      darken.remove();
    });
  }
}

function triggerBoss4Background2Transition(currentMs) {
  if (!boss4ChaosIntroMode || boss4Background2Triggered) return;
  if (currentMs < getNoteTime(26, [0, 1]) + offset) return;

  boss4Background2Triggered = true;
  document.body.classList.add("boss4Background2Wiping");
  const radius = Math.hypot(window.innerWidth / 2, window.innerHeight) + 12;
  const wipe = document.createElement("div");
  wipe.id = "boss4Background2Wipe";
  document.body.prepend(wipe);

  const animation = wipe.animate(
    [
      { clipPath: "circle(0px at 50% 0%)" },
      { clipPath: `circle(${radius}px at 50% 0%)` }
    ],
    { duration: 1050, delay: 50, easing: "cubic-bezier(0.22, 0.65, 0.3, 1)", fill: "both" }
  );

  animation.finished.catch(() => {}).then(() => {
    document.body.style.backgroundImage = "url('songs/boss4/background2.png')";
    document.body.classList.remove("boss4BackgroundDarkened", "boss4Background2Wiping");
    document.body.classList.add("boss4Background2Applied");
    wipe.remove();
  });
}

function updateBoss4ChromaticAberration(currentMs) {
  if (!boss4ChaosIntroMode || boss4ChromaticCursor >= boss4ChromaticTimes.length) return;

  while (
    boss4ChromaticCursor < boss4ChromaticTimes.length
    && currentMs >= boss4ChromaticTimes[boss4ChromaticCursor]
  ) {
    boss4ChromaticCursor++;
    let effect = document.getElementById("boss4ChromaticAberration");
    if (!effect) {
      effect = document.createElement("div");
      effect.id = "boss4ChromaticAberration";
      effect.setAttribute("aria-hidden", "true");
      document.body.prepend(effect);
    }
    effect.classList.remove("active");
    void effect.offsetWidth;
    effect.classList.add("active");
  }
}

function spawnBoss4RedLightLine(layer) {
  const line = document.createElement("span");
  const directionSlot = boss4RedLightLineSequenceIndex % 10;
  const goesRight = directionSlot % 2 === 0;
  const angleBand = Math.floor(directionSlot / 2);
  boss4RedLightLineSequenceIndex++;
  const angle = goesRight
    ? 25 + angleBand * 8 + Math.random() * 8
    : 115 + angleBand * 8 + Math.random() * 8;

  line.className = "boss4RedLightLine";
  line.style.setProperty("--boss4-red-line-angle", `${angle}deg`);
  line.style.setProperty("--boss4-red-line-length", `${90 + Math.random() * 110}px`);
  line.style.setProperty("--boss4-red-line-travel", `${135 + Math.random() * 20}vmax`);
  line.style.setProperty("--boss4-red-line-duration", `${1400 + Math.random() * 500}ms`);
  line.style.setProperty("--boss4-red-line-opacity", `${0.78 + Math.random() * 0.22}`);
  layer.appendChild(line);
  line.addEventListener("animationend", () => line.remove(), { once: true });
}

function updateBoss4RedLightLines(currentMs) {
  if (!boss4ChaosIntroMode) return;
  const startTime = getNoteTime(82, [0, 1]) + offset;
  const endTime = getNoteTime(114, [0, 1]) + offset;
  const shouldGenerate = currentMs >= startTime && currentMs < endTime;
  let layer = document.getElementById("boss4RedLightLines");

  if (!shouldGenerate) {
    boss4RedLightLinesActive = false;
    return;
  }

  if (!layer) {
    layer = document.createElement("div");
    layer.id = "boss4RedLightLines";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  if (!boss4RedLightLinesActive) {
    boss4RedLightLinesActive = true;
    boss4NextRedLightLineAt = currentMs;
    boss4RedLightLineSequenceIndex = Math.floor(Math.random() * 10);
  }
  if (currentMs < boss4NextRedLightLineAt) return;
  spawnBoss4RedLightLine(layer);
  boss4NextRedLightLineAt = currentMs + 45 + Math.random() * 75;
}

function ensureBoss4Background3Video() {
  let video = document.getElementById("boss4Background3Video");
  if (video) return video;

  video = document.createElement("video");
  video.id = "boss4Background3Video";
  video.src = "songs/boss4/background3.mp4";
  video.preload = "auto";
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.setAttribute("aria-hidden", "true");
  document.body.prepend(video);
  video.load();
  return video;
}

function ensureBoss4ReverseCrackLayer() {
  let layer = document.getElementById("boss4ReverseCracks");
  if (layer) return layer;

  layer = document.createElement("div");
  layer.id = "boss4ReverseCracks";
  layer.setAttribute("aria-hidden", "true");

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 1000 600");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("boss4ReverseCrackSvg");
  const crackPaths = [
    "M0 92 L72 128 L118 91 L174 157 L232 129 L292 198 L344 176",
    "M0 455 L66 418 L126 462 L177 391 L238 420 L300 352 L346 371",
    "M72 128 L48 190 L93 233", "M174 157 L151 224 L198 259",
    "M238 420 L214 487 L267 526", "M300 352 L327 300 L308 263",
    "M1000 92 L928 128 L882 91 L826 157 L768 129 L708 198 L656 176",
    "M1000 455 L934 418 L874 462 L823 391 L762 420 L700 352 L654 371",
    "M928 128 L952 190 L907 233", "M826 157 L849 224 L802 259",
    "M762 420 L786 487 L733 526", "M700 352 L673 300 L692 263"
  ];
  crackPaths.forEach((pathData, index) => {
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", pathData);
    path.setAttribute("pathLength", "1");
    path.classList.add("boss4ReverseCrackPath");
    path.style.setProperty("--crack-delay", `${(index % 6) * 90}ms`);
    path.style.setProperty("--crack-width", `${index % 6 < 2 ? 3.2 : 1.8}px`);
    svg.appendChild(path);
  });
  layer.appendChild(svg);

  document.body.appendChild(layer);
  return layer;
}

async function warmBoss4Background3Video() {
  if (!boss4ChaosIntroMode) return;
  const video = ensureBoss4Background3Video();

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("loadeddata", finish);
        video.removeEventListener("error", finish);
        resolve();
      };
      video.addEventListener("loadeddata", finish, { once: true });
      video.addEventListener("error", finish, { once: true });
      setTimeout(finish, 5000);
    });
  }

  try {
    await video.play();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  } catch (error) {
    console.warn("boss4 background3 warm-up skipped:", error);
  }
  video.pause();
  video.currentTime = 0;
}

function prepareBoss4GameplayLayers() {
  if (!boss4ChaosIntroMode) return;

  if (!document.getElementById("boss4ChromaticAberration")) {
    const chromatic = document.createElement("div");
    chromatic.id = "boss4ChromaticAberration";
    chromatic.setAttribute("aria-hidden", "true");
    document.body.prepend(chromatic);
  }

  if (!document.getElementById("boss4RedLightLines")) {
    const redLights = document.createElement("div");
    redLights.id = "boss4RedLightLines";
    redLights.setAttribute("aria-hidden", "true");
    document.body.appendChild(redLights);
  }

  if (!document.getElementById("boss4LowerPinkGlow")) {
    const lowerGlow = document.createElement("div");
    lowerGlow.id = "boss4LowerPinkGlow";
    lowerGlow.setAttribute("aria-hidden", "true");
    document.body.appendChild(lowerGlow);
  }

  ensureBoss4ReverseCrackLayer();

  while (noteElementPool.length < maxPooledNoteElements) {
    noteElementPool.push(document.createElement("div"));
  }

  // 背景疑似要素とレーンを導入画面の裏で一度レイアウトし、初回描画を前倒しする。
  void document.getElementById("boss4ChromaticAberration")?.offsetHeight;
  void document.getElementById("boss4LowerPinkGlow")?.offsetHeight;
  void document.getElementById("boss4ReverseCracks")?.offsetHeight;
  void document.getElementById("game")?.offsetHeight;
}

function updateBoss4LowerPinkGlow(currentMs) {
  if (!boss4ChaosIntroMode) return;
  const glow = document.getElementById("boss4LowerPinkGlow");
  if (!glow) return;

  const startTime = getNoteTime(106, [0, 1]) + offset;
  const endTime = getNoteTime(114, [0, 1]) + offset;
  const shouldGlow = currentMs >= startTime && currentMs < endTime;

  if (!shouldGlow) {
    if (boss4LowerPinkGlowActive) {
      boss4LowerPinkGlowActive = false;
      glow.classList.remove("active");
      glow.replaceChildren();
    }
    return;
  }

  if (!boss4LowerPinkGlowActive) {
    boss4LowerPinkGlowActive = true;
    boss4NextPinkParticleAt = currentMs;
    glow.classList.add("active");
  }

  if (currentMs < boss4NextPinkParticleAt) return;
  const particleCount = Math.random() < 0.38 ? 2 : 1;
  for (let index = 0; index < particleCount; index++) {
    const particle = document.createElement("span");
    const size = 3 + Math.pow(Math.random(), 1.45) * 17;
    particle.className = "boss4PinkGlowParticle";
    particle.style.setProperty("--pink-particle-x", `${2 + Math.random() * 96}%`);
    particle.style.setProperty("--pink-particle-size", `${size}px`);
    particle.style.setProperty("--pink-particle-rise", `${120 + Math.random() * 230}px`);
    particle.style.setProperty("--pink-particle-drift", `${-55 + Math.random() * 110}px`);
    particle.style.setProperty("--pink-particle-duration", `${1150 + Math.random() * 1450}ms`);
    particle.style.setProperty("--pink-particle-opacity", `${0.45 + Math.random() * 0.5}`);
    glow.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
  boss4NextPinkParticleAt = currentMs + 55 + Math.random() * 70;
}

function updateBoss4ReverseBackgroundSequence(currentMs) {
  if (!boss4ChaosIntroMode) return;

  if (!boss4ReverseBackgroundTriggered && currentMs >= getNoteTime(114, [0, 1]) + offset) {
    boss4ReverseBackgroundTriggered = true;
    boss4RedLightLinesActive = false;
    document.getElementById("boss4RedLightLines")?.replaceChildren();

    const darken = document.createElement("div");
    darken.id = "boss4ReverseBackgroundDarken";
    darken.setAttribute("aria-hidden", "true");
    document.body.prepend(darken);
    requestAnimationFrame(() => darken.classList.add("active"));

    const cracks = ensureBoss4ReverseCrackLayer();
    cracks.classList.remove("frozen", "releasing");
    requestAnimationFrame(() => cracks.classList.add("active"));

  }

  const cracks = document.getElementById("boss4ReverseCracks");
  const stopTime = getNoteTime(116, [3, 4]) + offset;
  const resumeTime = getNoteTime(117, [1, 4]) + offset;
  if (cracks?.classList.contains("active") && currentMs >= stopTime && currentMs < resumeTime) {
    cracks.classList.add("frozen");
  }
  if (
    cracks?.classList.contains("active") &&
    !cracks.classList.contains("releasing") &&
    currentMs >= resumeTime
  ) {
    cracks.classList.add("releasing");
    setTimeout(() => cracks.remove(), 560);
  }

  if (!boss4Background3Triggered && currentMs >= getNoteTime(117, [1, 2]) + offset) {
    boss4Background3Triggered = true;
    const redLightLayer = document.getElementById("boss4RedLightLines");
    redLightLayer?.replaceChildren();
    document.getElementById("boss4ChromaticAberration")?.remove();
    document.getElementById("boss4BackgroundWipe")?.remove();
    document.getElementById("boss4BackgroundDarken")?.remove();
    document.getElementById("boss4Background2Wipe")?.remove();
    const video = ensureBoss4Background3Video();
    video.currentTime = 0;
    video.play().catch(error => console.warn("boss4 background3 playback failed:", error));

    const flash = document.getElementById("song11WhiteFlash");
    if (flash) {
      flash.classList.remove("show");
      void flash.offsetWidth;
      flash.classList.add("show");
    }

    setTimeout(() => {
      document.body.style.backgroundImage = "none";
      document.body.classList.add("boss4Background3Applied");
      video.classList.add("active");
      const darken = document.getElementById("boss4ReverseBackgroundDarken");
      darken?.classList.remove("active");
      setTimeout(() => darken?.remove(), 320);
    }, 120);
  }
}

function saveBoss4InitialPlayResult(saveData) {
  if (!saveData.boss4) saveData.boss4 = {};
  if (!saveData.boss4[currentDifficulty]) saveData.boss4[currentDifficulty] = {};

  const record = saveData.boss4[currentDifficulty];
  const finalScore = Math.round(score);
  const previousBestScore = Number(record.bestScore || 0);
  const chartInfo = songInfo.charts?.[currentDifficulty];

  record.played = true;
  record.level = Number(chartInfo?.level || record.level || 0);
  if (life > 0) record.cleared = true;

  if (finalScore > previousBestScore) {
    updateRank();
    record.bestScore = finalScore;
    record.bestRank = rankText.textContent;
  }

  if (!saveData.profile) saveData.profile = {};
  saveData.profile.rate = calculateRateFromSaveData(saveData);
  unlockRateTitles(saveData, saveData.profile.rate);
}

function updateBoss4FinalStoryTransition(currentMs) {
  if (!boss4ChaosIntroMode) return;

  if (!boss4FinalDarknessTriggered && currentMs >= getNoteTime(138, [0, 1]) + offset) {
    boss4FinalDarknessTriggered = true;
    boss4StoryTransitionStarted = true;
    const darkness = document.createElement("div");
    darkness.id = "boss4FinalDarkness";
    darkness.setAttribute("aria-hidden", "true");
    document.body.appendChild(darkness);

    const radius = Math.hypot(window.innerWidth / 2, window.innerHeight) + 40;
    const animation = darkness.animate(
      [
        { clipPath: "circle(0px at 50% 0%)" },
        { clipPath: `circle(${radius}px at 50% 0%)` }
      ],
      {
        duration: Math.max(1, getNoteTime(150, [0, 1]) - getNoteTime(138, [0, 1])),
        easing: "cubic-bezier(.22, .65, .3, 1)",
        fill: "forwards"
      }
    );

    animation.finished.catch(() => {}).then(() => {
      animation.cancel();
      darkness.style.clipPath = "none";
      darkness.classList.add("fullDark");
      document.getElementById("boss4Background3Video")?.pause();
      pauseMusicPlayback();
      const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
      const savedMaximum = Number(saveData.boss4MaxUnlockedDifficulty);
      const previousMaximum = Number.isInteger(savedMaximum)
        ? Math.max(-1, Math.min(2, savedMaximum))
        : -1;
      saveData.boss4MaxUnlockedDifficulty = Math.max(previousMaximum, currentDifficulty);
      saveData.boss4Unlocked = true;
      if (!saveData.storyFlags) saveData.storyFlags = {};
      saveData.storyFlags.boss4PuzzleStage = 3;
      saveData.storyFlags.boss4PuzzleTransitionPending = false;
      saveBoss4InitialPlayResult(saveData);
      localStorage.setItem("rhythmGame", JSON.stringify(saveData));
      setTimeout(() => {
        location.href = "story.html?episode=chapter4_episode11&source=boss4Event";
      }, 2000);
    });
  }
}

function triggerBoss3Background3Transition(currentMs) {
  if (currentSong !== "boss3" || boss3Background3TransitionStarted) return;
  const transitionTime = getNoteTime(79, [0, 1]) + offset;
  if (currentMs < transitionTime) return;

  boss3Background3TransitionStarted = true;

  // song11と同じ白フラッシュを再利用し、その裏で背景を切り替える。
  const flash = document.getElementById("song11WhiteFlash");
  if (flash) {
    flash.classList.remove("show");
    void flash.offsetWidth;
    flash.classList.add("show");
  }

  document.body.style.backgroundImage = "url('songs/boss3/background3.png')";
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  document.body.style.backgroundRepeat = "no-repeat";

  // 通常プレイでは白フラッシュと背景変更だけを共通演出として使用する。
  if (!boss3Intro) return;

  // 66小節目以降に実際に使っている分岐譜面の難易度・レベルを表示する。
  const branchDifficultyIndex = Number.isInteger(boss3BranchDifficultyIndex)
    ? boss3BranchDifficultyIndex
    : getBoss3BranchDifficultyIndex();
  const branchChart = songInfo.charts?.[branchDifficultyIndex];
  const difficultyElement = document.getElementById("songDifficulty");
  if (branchChart && difficultyElement) {
    difficultyElement.textContent =
      `${branchChart.difficulty} Lv.${getDisplayedChartLevel(branchChart.level)}`;
    difficultyElement.style.display = "";
    difficultyElement.style.background = "";
    difficultyElement.style.webkitBackgroundClip = "";
    difficultyElement.style.webkitTextFillColor = "";
    difficultyElement.style.color = "cyan";

    const branchDifficulty = String(branchChart.difficulty || "").toLowerCase();
    if (branchDifficulty === "expert") {
      difficultyElement.style.color = "#FF4444";
    } else if (branchDifficulty === "fracture") {
      difficultyElement.style.background = "linear-gradient(90deg, #FFB7C5, #B7E0FF)";
      difficultyElement.style.webkitBackgroundClip = "text";
      difficultyElement.style.webkitTextFillColor = "transparent";
    }
  }

  // background2用の前景レイヤーを外し、初回演出で隠していたHUDをすべて戻す。
  document.getElementById("boss3Background2Wipe")?.remove();
  document.getElementById("boss3Background2NoiseRing")?.remove();
  document.getElementById("boss3Background2Static")?.remove();
  document.body.classList.add("boss3Background3Applied");
  document.body.classList.remove(
    "boss3Background2Wiping",
    "boss3Background2Applied",
    "boss3Background2HudCovered",
    "boss3IntroMode"
  );
}

function updateBoss3TempoWarp(currentMs) {
  if (!boss3Intro || currentSong !== "boss3" || boss3TempoWarpFinished) return;

  const startTime = getNoteTime(114, [0, 1]) + offset;
  const peakTime = getNoteTime(117, [1, 4]) + offset;
  const finishTime = getNoteTime(118, [0, 1]) + offset;
  if (currentMs < startTime) return;

  const warp = document.getElementById("boss3TempoWarp");
  if (!warp) {
    boss3TempoWarpFinished = true;
    return;
  }

  if (!boss3TempoWarpStarted) {
    boss3TempoWarpStarted = true;
    document.body.classList.add("boss3TempoWarpActive");
  }

  const rising = Math.max(0, Math.min(1, (currentMs - startTime) / Math.max(1, peakTime - startTime)));
  const fade = currentMs <= peakTime
    ? 1
    : Math.max(0, 1 - (currentMs - peakTime) / Math.max(1, finishTime - peakTime));
  const strength = rising * fade;
  const pulse = Math.sin(currentMs * (0.008 + rising * 0.016));

  warp.style.setProperty("--boss3-warp-opacity", String((0.14 + strength * 0.64) * fade));
  warp.style.setProperty("--boss3-warp-scale", String(1 + strength * 0.024 + pulse * strength * 0.0035));
  warp.style.setProperty("--boss3-warp-ring-opacity", String(0.1 + strength * 0.68));
  warp.style.setProperty("--boss3-warp-ring-scale", String(1.008 + strength * 0.032 + pulse * 0.0055));
  warp.style.setProperty("--boss3-warp-edge-opacity", String(strength * 0.82));
  warp.style.setProperty("--boss3-warp-pulse-scale", String(1 + pulse * strength * 0.015));

  if (currentMs >= finishTime) {
    boss3TempoWarpFinished = true;
    document.body.classList.remove("boss3TempoWarpActive");
    warp.removeAttribute("style");
  }
}

function prepareBoss3FinalWhiteMistEffect(targetCount = 28) {
  if (!boss3Intro || currentSong !== "boss3") return;
  const mist = document.getElementById("boss3FinalWhiteMist");
  if (!mist || mist.childElementCount >= targetCount) return;

  const fragment = document.createDocumentFragment();
  const maximumSideOffset = Math.max(34, window.innerWidth / 2 - 274);
  for (let index = mist.childElementCount; index < targetCount; index++) {
    const particle = document.createElement("span");
    const side = index % 2 === 0 ? "left" : "right";
    particle.className = `boss3WhiteMistParticle boss3FinalMistParticle-${side}`;
    particle.style.setProperty("--mist-side-offset", `${32 + Math.random() * Math.max(2, maximumSideOffset - 32)}px`);
    particle.style.setProperty("--mist-size", `${7 + Math.random() * 17}px`);
    particle.style.setProperty("--mist-blur", `${1 + Math.random() * 3}px`);
    particle.style.setProperty("--mist-duration", `${2.8 + Math.random() * 2.5}s`);
    particle.style.setProperty("--mist-delay", `${Math.random() * -4.5}s`);
    const outwardDrift = 12 + Math.random() * 40;
    particle.style.setProperty("--mist-drift", `${side === "left" ? -outwardDrift : outwardDrift}px`);
    particle.style.setProperty("--mist-opacity", `${0.28 + Math.random() * 0.42}`);
    fragment.appendChild(particle);
  }
  mist.appendChild(fragment);
}

function triggerBoss3FinalWhiteMist(currentMs) {
  if (!boss3Intro || currentSong !== "boss3" || boss3FinalWhiteMistShown) return;
  const startTime = getNoteTime(94, [0, 1]) + offset;
  if (currentMs < startTime) return;

  boss3FinalWhiteMistShown = true;
  document.getElementById("boss3FinalWhiteMist")?.classList.add("active");
}

function installHeartPointerControls() {
  if (heartPointerControlsInstalled) return;
  heartPointerControlsInstalled = true;
  const moveEventName = window.PointerEvent ? "pointermove" : "mousemove";
  window.addEventListener(moveEventName, event => {
    queueHeartPointerUpdate(event.clientX);
  }, { passive: true });
}

function updateBoss3HeartDrop(currentMs) {
  if (!boss3Intro || currentSong !== "boss3" || boss3HeartDropStarted) return;
  const dropTime = getNoteTime(29, [1, 2]) + offset;
  if (currentMs < dropTime) return;

  boss3HeartDropStarted = true;
  heartControlsLocked = true;
  heartX = 250;
  heartPlayer.style.left = `${heartX}px`;
  heartPlayer.classList.remove("hidden", "boss3HeartLanded");
  heartPlayer.classList.add("boss3HeartDropping");
  installHeartPointerControls();
  void heartPlayer.offsetHeight;
  heartPlayer.classList.add("boss3HeartLanded");

  setTimeout(() => {
    heartPlayer.classList.add("boss3HeartLandingFlash");
    judgeLineElement.classList.remove("boss3HeartImpact");
    void judgeLineElement.offsetWidth;
    judgeLineElement.classList.add("boss3HeartImpact");
    setTimeout(() => heartPlayer.classList.remove("boss3HeartLandingFlash"), 380);
    setTimeout(() => judgeLineElement.classList.remove("boss3HeartImpact"), 420);
  }, 510);

  setTimeout(() => {
    heartPlayer.classList.remove("boss3HeartDropping", "boss3HeartLanded");
    boss3BulletPhaseActive = true;
    heartControlsLocked = false;
    lastHeartKeyboardMoveAt = null;
  }, 800);
}

function updateBoss3HeartFade(currentMs) {
  if (!boss3Intro || currentSong !== "boss3" || boss3HeartFadeStarted) return;
  const fadeTime = getNoteTime(48, [1, 2]) + offset;
  if (currentMs < fadeTime) return;

  boss3HeartFadeStarted = true;
  boss3BulletPhaseActive = false;
  heartControlsLocked = true;
  pendingHeartClientX = null;
  lastHeartKeyboardMoveAt = null;
  heartPlayer.classList.remove("invincible", "finalBarrageHit");
  heartPlayer.classList.add("boss3HeartFadingOut");
  setTimeout(() => {
    heartPlayer.classList.add("hidden");
    heartPlayer.classList.remove("boss3HeartFadingOut");
  }, 520);
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (paused) return;
  if (!started) {
    updateHeartFromKeyboard(performance.now());
    return;
  }
  updateHeartFromKeyboard(performance.now());

  const currentMs = getCurrentMs();
  updateSong35FinalTrialCountdown(currentMs);
  updateSong35FinalTrialDistortion(currentMs);
  triggerSong35FinalPuzzle(currentMs);
  checkSong11BgEvent(currentMs);
  checkSong35BgEvent(currentMs);
  updateSong35LightLines(currentMs);
  updateTimedHealSkill(currentMs);
  triggerChapter4MissionComplete(currentMs);
  updateRushMode(currentMs);
  updateBoss4SecondTrialAtmosphere(currentMs);
  triggerSong19LongCut(currentMs);
  triggerBoss3OpeningLongEnd(currentMs);
  updateBoss3HoverTapEffect(currentMs);
  triggerBoss3Background2Transition(currentMs);
  triggerBoss4FirstBackgroundTransition(currentMs);
  triggerBoss4Background2Transition(currentMs);
  updateBoss4ChromaticAberration(currentMs);
  updateBoss4RedLightLines(currentMs);
  updateBoss4LowerPinkGlow(currentMs);
  updateBoss4ReverseBackgroundSequence(currentMs);
  updateBoss4LateWarp(currentMs);
  updateBoss4FinalStoryTransition(currentMs);
  triggerBoss3Background3Transition(currentMs);
  triggerBoss3FinalWhiteMist(currentMs);
  updateBoss3TempoWarp(currentMs);
  updateBoss3HeartDrop(currentMs);
  updateBoss3HeartFade(currentMs);
  const rawMs = getRawCurrentMs();

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

  if (!musicStarted && rawMs >= 0) {
    startPreparedMusicPlayback();
  }

  while (
    chartSpawnCursor < chartSpawnQueue.length &&
    currentMs >= chartSpawnQueue[chartSpawnCursor].spawnTime
  ) {
    const noteData = chartSpawnQueue[chartSpawnCursor++];
    if (noteData.spawned) continue;
    noteData.active = true;
    noteData.holding = false;
    noteData.holdResult = null;
    noteData.endJudged = false;
    if (noteData.element) {
      noteData.element.style.visibility = "visible";
    } else {
      createNote(noteData);
    }
    notes.push(noteData);
    noteData.spawned = true;
  }

  while (
    damageSpawnCursor < damageSpawnQueue.length &&
    currentMs >= damageSpawnQueue[damageSpawnCursor].spawnTime
  ) {
    const noteData = damageSpawnQueue[damageSpawnCursor++];
    if (noteData.spawned) continue;
    noteData.active = true;
    if (noteData.element) {
      noteData.element.style.visibility = "visible";
    } else {
      createDamageNote(noteData);
    }
    noteData.spawned = true;
  }

  for (let note of notes) {
    if (!note.active) continue;

    note.y = getYFromTime(note.hitTime, currentMs);

if (note.type === "long") {
  note.element.style.top = (note.y + longStartVisualOffsetPx) + "px";
} else {
  note.element.style.top = note.y + "px";
}

updateBoss4ContractingDual(note);

// ロングノーツの処理
 if (note.type === "long") {

 // 始点を過ぎても押されていない → ミス確定
 if (!note.holding && note.holdResult === null && currentMs > note.hitTime + longStartMissAfterMs) {
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
    spawnParticles(note.lane, "#FFFFDD");
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
  // 描画速度に左右されない固定時間で終点を判定する。
  if (!note.endJudged && currentMs >= note.endTime - longEndJudgeEarlyMs) {
    judgeLongNoteEnd(note);
  }

  // 削除は見た目上の終点が判定ラインを超えたら。
  const visualEndY = parseFloat(note.element.style.top) - note.element.offsetHeight;

  if (visualEndY > judgeY) {
    note.active = false;
    releaseNoteElement(note);
    checkClear();
  }
}
continue;}
    // tap / dual のミス判定
    if (
      (note.type === "tap" || note.type === "dual") &&
      currentMs > note.hitTime + tapMissAfterMs
    ) {
      applyMiss();
      note.active = false;
      releaseNoteElement(note);
      checkClear();
    }
  }
  pruneInactiveNotes();
  if (damageNotes.length > 0) {
    for (let note of damageNotes) {
      if (!note.active) continue;

      if (note.type === "damageLong") {
        updateDamageLongNote(note);
        continue;
      }

      const y = getYFromTime(note.hitTime, currentMs);
      note.y = y;
      note.element.style.top = y + "px";

      if (y > 700) {
        note.active = false;
        note.element.remove();
        if (note.type === "musicNote" && !note.collected) applyMiss();
        if (bulletChallenge) {
          checkClear();
        }
      }
    }

    if (isHeartDodgeModeActive()) {
      checkDamageNoteCollision();
    }
  }

  updateCover();
  tryShowScheduledResult(currentMs);
}

function tryShowScheduledResult(currentMs = getCurrentMs()) {
  // 初回boss4イベントは150小節目の暗転からストーリーへ直接接続する。
  if (boss4ChaosIntroMode) return;
  const musicPlaybackEnded = musicEndedAtPerformance !== null || isMusicPlaybackEnded();
  if (!normalClearReady || showResult.called) return;

  const chartEndTime = getChartEndTime();
  const resultDelayDeadline = chartEndTime + resultDelayAfterLastNoteMs;
  const musicDurationMs = decodedMusicBuffer
    ? decodedMusicBuffer.duration * 1000
    : (Number.isFinite(music.duration) ? music.duration * 1000 : Infinity);
  const usesResultDelay = resultDelayDeadline < musicDurationMs;
  const resultFadeStartTime = resultDelayDeadline - resultFadeDurationMs;

  if (usesResultDelay && currentMs >= resultFadeStartTime) {
    if (!resultDelayFadeActive) {
      resultDelayFadeActive = true;
      resultDelayFadeStartVolume = decodedMusicBuffer && decodedMusicGain && decodedMusicContext
        ? decodedMusicGain.gain.value
        : music.volume;
      if (decodedMusicBuffer && decodedMusicGain && decodedMusicContext) {
        decodedMusicGain.gain.cancelScheduledValues(decodedMusicContext.currentTime);
      }
    }

    const fadeProgress = Math.min(1, Math.max(0,
      (currentMs - resultFadeStartTime) / resultFadeDurationMs
    ));
    const fadedVolume = resultDelayFadeStartVolume * (1 - fadeProgress);
    if (decodedMusicBuffer && decodedMusicGain) {
      decodedMusicGain.gain.value = fadedVolume;
    } else {
      music.volume = fadedVolume;
    }
  }

  const fiveSecondsAfterLastNote = currentMs >= resultDelayDeadline;
  if (fiveSecondsAfterLastNote || musicPlaybackEnded) {
    showResult();
  }
}

function checkClear() {
if (bulletChallenge) {
  if (bulletChallengeCleared) return;

  const rhythmDone =
    chart.length === 0 ||
    (chartSpawnCursor >= chartSpawnQueue.length && !notes.some(note => note.active));
  const damageDone =
    damageNotes.length === 0 ||
    damageNotes.every(note => note.spawned && !note.active);

  if (!rhythmDone || !damageDone) return;
  bulletChallengeCleared = true;
  if (enemyLife > 0) {
    showBulletEnemyFailure();
  } else {
    startBulletFinalEvent();
  }
  return;
}

if (getTotalJudgementNoteCount() === 0) return;
if (chartSpawnCursor < chartSpawnQueue.length) return;
if (notes.some(note => note.active)) return;

if (chapter4StoryChallenge && chapter4DualNoteGoodCount < chapter4DualNoteQuota) {
  showChapter4DualNoteFailure();
  return;
}

  if (yellowPerfectCount === getTotalJudgementNoteCount()) {
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
normalClearReady = true;
tryShowScheduledResult();
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

      const scoreRatio = bestScore / 1000000;
      const rateConstant = Math.round(
        level * Math.pow(scoreRatio, 6) / Math.pow(0.95, 5) * 0.8 * 1000
      ) / 1000;
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

function unlockRateTitles(saveData, rate) {
  if (!saveData.unlockedTitles || typeof saveData.unlockedTitles !== "object" || Array.isArray(saveData.unlockedTitles)) {
    saveData.unlockedTitles = {};
  }

  for (const definition of titleDefinitions.rateTitles) {
    const id = String(definition?.id || "").trim();
    const name = String(definition?.name || "").trim();
    const requiredRate = Number(definition?.requiredRate);
    if (!id || !name || !Number.isFinite(requiredRate)) {
      console.warn("[称号] titles.json のレート称号定義が正しくありません。", definition);
      continue;
    }
    if (requiredRate <= 0 || rate < requiredRate || saveData.unlockedTitles[id]) continue;

    saveData.unlockedTitles[id] = {
      name,
      category: "rate",
      background: definition.background || "yellow",
      requiredRate,
      acquisitionText: definition.acquisitionText || `RATE ${requiredRate.toFixed(1)}以上に到達`,
      unlockedAt: Date.now()
    };
  }
}

function unlockSpecialTitle(saveData, condition) {
  const definition = titleDefinitions.specialTitles.find(title => title?.condition === condition);
  if (!definition) return;
  const id = String(definition.id || "").trim();
  const name = String(definition.name || "").trim();
  if (!id || !name) {
    console.warn("[称号] titles.json の特殊称号定義が正しくありません。", definition);
    return;
  }
  if (!saveData.unlockedTitles || typeof saveData.unlockedTitles !== "object" || Array.isArray(saveData.unlockedTitles)) {
    saveData.unlockedTitles = {};
  }
  if (saveData.unlockedTitles[id]) return;

  saveData.unlockedTitles[id] = {
    name,
    category: "special",
    background: definition.background || "purple",
    condition,
    acquisitionText: definition.acquisitionText || "特殊条件を達成",
    unlockedAt: Date.now()
  };
}

function unlockRecordTitle(saveData, condition) {
  const definition = titleDefinitions.recordTitles.find(title => title?.condition === condition);
  if (!definition) return;
  const id = String(definition.id || "").trim();
  const name = String(definition.name || "").trim();
  if (!id || !name) return;
  if (!saveData.unlockedTitles || typeof saveData.unlockedTitles !== "object" || Array.isArray(saveData.unlockedTitles)) {
    saveData.unlockedTitles = {};
  }
  if (saveData.unlockedTitles[id]) return;

  saveData.unlockedTitles[id] = {
    name,
    category: "record",
    background: definition.background || "green",
    condition,
    acquisitionText: definition.acquisitionText || "プレイ実績条件を達成",
    unlockedAt: Date.now()
  };
}

function unlockGameStartSpecialTitles() {
  const saveData = getSaveData();
  const partnerId = saveData.profile?.partner || "breaka";
  if (partnerId !== "canon" || (currentSong !== "boss" && currentSong !== "song3")) return;

  unlockSpecialTitle(saveData, "playCanonForbiddenSong");
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
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

function evaluateMapMissionConditions(piece) {
  const conditions = piece?.conditions || {};
  const failures = [];
  const finalScore = Math.round(score);
  const currentRank = rankText.textContent;
  const rankOrder = ["F", "D", "C", "B", "B+", "A", "A+", "S", "S+", "S++", "SS"];

  if (conditions.minRank !== undefined) {
    const requiredRank = String(conditions.minRank).toUpperCase();
    const requiredRankIndex = rankOrder.indexOf(requiredRank);
    if (requiredRankIndex === -1 || rankOrder.indexOf(currentRank) < requiredRankIndex) {
      failures.push(`RANK ${requiredRank}以上`);
    }
  }
  if (conditions.minScore !== undefined && finalScore < Number(conditions.minScore)) {
    failures.push(`SCORE ${Number(conditions.minScore).toLocaleString()}以上`);
  }
  if (conditions.fullCombo === true && missCount !== 0) {
    failures.push("FULL COMBO");
  }
  if (conditions.allPerfect === true && (missCount !== 0 || goodCount !== 0)) {
    failures.push("ALL PERFECT");
  }
  if (conditions.maxMisses !== undefined && missCount > Number(conditions.maxMisses)) {
    failures.push(`MISS ${Number(conditions.maxMisses)}以下`);
  }
  if (conditions.maxCombo !== undefined && maxCombo < Number(conditions.maxCombo)) {
    failures.push(`MAX COMBO ${Number(conditions.maxCombo)}以上`);
  }

  return failures;
}

async function loadTitleDefinitions() {
  try {
    const response = await fetch("titles.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    titleDefinitions = {
      rateTitles: Array.isArray(data.rateTitles) ? data.rateTitles : [],
      recordTitles: Array.isArray(data.recordTitles) ? data.recordTitles : [],
      specialTitles: Array.isArray(data.specialTitles) ? data.specialTitles : []
    };
  } catch (error) {
    console.error("称号定義の読み込みに失敗しました。", error);
    titleDefinitions = { rateTitles: [], recordTitles: [], specialTitles: [] };
  }
}

function addMapStaminaReward(saveData, amount) {
  const rewardAmount = Math.max(0, Math.floor(Number(amount || 0)));
  if (rewardAmount <= 0) return;
  const now = Date.now();
  const maxStamina = 6;
  const recoveryIntervalMs = 15 * 60 * 1000;
  const saved = saveData.mapStamina;
  let value = Number.isFinite(Number(saved?.value))
    ? Math.max(0, Math.min(maxStamina, Math.floor(Number(saved.value))))
    : maxStamina;
  let updatedAt = Number.isFinite(Number(saved?.updatedAt)) ? Number(saved.updatedAt) : now;

  if (value < maxStamina) {
    const recovered = Math.floor(Math.max(0, now - updatedAt) / recoveryIntervalMs);
    value = Math.min(maxStamina, value + recovered);
    updatedAt += recovered * recoveryIntervalMs;
  }
  value = Math.min(maxStamina, value + rewardAmount);
  if (value === maxStamina) updatedAt = now;
  saveData.mapStamina = { value, updatedAt };
}

function recordMapPieceClear(saveData) {
  if (!mapMode || !activeMapPiece || !currentMapId) return;

  if (!saveData.mapProgress) saveData.mapProgress = {};
  if (!saveData.mapProgress[currentMapId]) {
    saveData.mapProgress[currentMapId] = { clearedPieces: [], failedPieces: {}, shards: 0 };
  }

  const progress = saveData.mapProgress[currentMapId];
  if (!Array.isArray(progress.clearedPieces)) progress.clearedPieces = [];
  if (!progress.failedPieces || typeof progress.failedPieces !== "object") progress.failedPieces = {};
  if (progress.clearedPieces.includes(activeMapPiece.id)) return;

  progress.clearedPieces.push(activeMapPiece.id);
  delete progress.failedPieces[activeMapPiece.id];
  if (Object.prototype.hasOwnProperty.call(activeMapPiece.reward || {}, "shards")) {
    progress.shards = Number(progress.shards || 0) + Number(activeMapPiece.reward.shards || 0);
  }
  if (Object.prototype.hasOwnProperty.call(activeMapPiece.reward || {}, "stamina")) {
    addMapStaminaReward(saveData, activeMapPiece.reward.stamina);
  }
  mapPieceWasNewlyCleared = true;
}

function getMapPieceFailureCount(saveData) {
  return Number(saveData.mapProgress?.[currentMapId]?.failedPieces?.[currentMapPieceId] || 0);
}

function recordMapPieceFailure(saveData) {
  if (!mapMode || !activeMapPiece || !currentMapId) return;
  if (!saveData.mapProgress) saveData.mapProgress = {};
  if (!saveData.mapProgress[currentMapId]) {
    saveData.mapProgress[currentMapId] = { clearedPieces: [], failedPieces: {}, shards: 0 };
  }
  const progress = saveData.mapProgress[currentMapId];
  if (!progress.failedPieces || typeof progress.failedPieces !== "object") progress.failedPieces = {};
  const currentFailures = Number(progress.failedPieces[activeMapPiece.id] || 0);
  progress.failedPieces[activeMapPiece.id] = Math.min(2, currentFailures + 1);
}

function mapRestoreEdgeCurve(startX, startY, endX, endY, normalX, normalY, direction) {
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

function mapRestoreBoundaryDirection(primaryIndex, secondaryIndex) {
  return (primaryIndex + secondaryIndex) % 2 === 0 ? 1 : -1;
}

function createMapRestorePath(piece, gridSize) {
  const firstCell = piece.cells[0];
  const row = Math.floor((firstCell - 1) / gridSize);
  const startColumn = (firstCell - 1) % gridSize;
  const span = piece.cells.length;
  const endColumn = startColumn + span;
  let path = `M ${startColumn} ${row}`;

  for (let column = startColumn; column < endColumn; column++) {
    path += row === 0
      ? ` L ${column + 1} ${row}`
      : ` ${mapRestoreEdgeCurve(column, row, column + 1, row, 0, -1, -mapRestoreBoundaryDirection(row - 1, column))}`;
  }
  path += endColumn === gridSize
    ? ` L ${endColumn} ${row + 1}`
    : ` ${mapRestoreEdgeCurve(endColumn, row, endColumn, row + 1, 1, 0, mapRestoreBoundaryDirection(row, endColumn - 1))}`;
  for (let column = endColumn; column > startColumn; column--) {
    path += row + 1 === gridSize
      ? ` L ${column - 1} ${row + 1}`
      : ` ${mapRestoreEdgeCurve(column, row + 1, column - 1, row + 1, 0, 1, mapRestoreBoundaryDirection(row, column - 1))}`;
  }
  path += startColumn === 0
    ? ` L ${startColumn} ${row}`
    : ` ${mapRestoreEdgeCurve(startColumn, row + 1, startColumn, row, -1, 0, -mapRestoreBoundaryDirection(row, startColumn - 1))}`;
  return `${path} Z`;
}

function showMapPieceRestoreEffect() {
  if (!mapPieceWasNewlyCleared || !activeMapData || !activeMapPiece) return;

  const overlay = document.getElementById("mapPieceRestoreOverlay");
  const svg = document.getElementById("mapPieceRestoreSvg");
  if (!overlay || !svg) return;

  const namespace = "http://www.w3.org/2000/svg";
  const gridSize = Number(activeMapData.gridSize);
  const firstCell = activeMapPiece.cells[0];
  const row = Math.floor((firstCell - 1) / gridSize);
  const column = (firstCell - 1) % gridSize;
  const span = activeMapPiece.cells.length;
  svg.setAttribute("viewBox", `${column - 0.2} ${row - 0.2} ${span + 0.4} 1.4`);
  svg.innerHTML = "";

  const defs = document.createElementNS(namespace, "defs");
  const pattern = document.createElementNS(namespace, "pattern");
  pattern.id = "mapPieceRestorePattern";
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", String(gridSize));
  pattern.setAttribute("height", String(gridSize));
  const image = document.createElementNS(namespace, "image");
  image.setAttribute("href", activeMapData.completedImage);
  image.setAttribute("width", String(gridSize));
  image.setAttribute("height", String(gridSize));
  image.setAttribute("preserveAspectRatio", "xMidYMid slice");
  pattern.appendChild(image);
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", createMapRestorePath(activeMapPiece, gridSize));
  path.setAttribute("fill", "url(#mapPieceRestorePattern)");
  path.setAttribute("stroke", "rgba(225, 241, 255, 0.96)");
  path.setAttribute("stroke-width", "0.025");
  svg.appendChild(path);

  const shardReward = Number(activeMapPiece.reward?.shards || 0);
  const staminaReward = Number(activeMapPiece.reward?.stamina || 0);
  document.getElementById("mapPieceRestoreRewardValue").textContent = staminaReward > 0
    ? `+${shardReward}　❤ スタミナ +${staminaReward}`
    : `+${shardReward}`;
  overlay.classList.add("visible");
  setTimeout(() => overlay.classList.remove("visible"), 5600);
}

document.getElementById("mapPieceRestoreOverlay")?.addEventListener("click", (event) => {
  event.currentTarget.classList.remove("visible");
});

function showMapAttemptFailureEffect() {
  if (!mapAttemptFailed) return;
  const overlay = document.getElementById("mapAttemptFailureOverlay");
  const reasons = document.getElementById("mapAttemptFailureReasons");
  if (!overlay || !reasons) return;
  reasons.textContent = mapAttemptFailureReasons.join(" / ");
  overlay.classList.add("visible");
  setTimeout(() => overlay.classList.remove("visible"), 5600);
}

document.getElementById("mapAttemptFailureOverlay")?.addEventListener("click", (event) => {
  event.currentTarget.classList.remove("visible");
});

function showMapMissionFailure(failures) {
  enterChallengeFailure(`ミッション失敗\n未達成：${failures.join(" / ")}`);
}

// 楽曲実績称号は各曲の info.json に次の形式で追加する。
// "achievementTitles": [
//   { "id": "stable-id", "name": "称号名", "difficulty": "EXPERT", "condition": "fc", "acquisitionText": "任意の表示文" },
//   { "id": "another-id", "name": "別の称号名", "difficulty": ["BASIC", "EXPERT"], "condition": "ap" }
// ]
// id は称号名を変更しても変えないこと。
// difficulty は単一の文字列、または複数難易度の配列で指定できる。
// condition: play（プレイ）/ clear（クリア）/ fc / ap / up
// 配列に複数記述すれば、1曲から複数の称号を獲得できる。
function unlockSongAchievementTitles(saveData, chartInfo) {
  const definitions = songInfo?.achievementTitles;
  if (definitions === undefined) return [];
  if (!Array.isArray(definitions)) {
    console.warn(`[称号] ${currentSong}/info.json の achievementTitles は配列で指定してください。`);
    return [];
  }

  const difficulty = String(chartInfo?.difficulty || "").toLowerCase();
  const conditions = {
    play: true,
    clear: life > 0,
    fc: life > 0 && missCount === 0,
    ap: life > 0 && missCount === 0 && goodCount === 0,
    up: life > 0 && yellowPerfectCount === getTotalJudgementNoteCount()
  };

  if (!saveData.unlockedTitles || typeof saveData.unlockedTitles !== "object" || Array.isArray(saveData.unlockedTitles)) {
    saveData.unlockedTitles = {};
  }

  const newlyUnlocked = [];
  definitions.forEach((definition, index) => {
    if (!definition || typeof definition !== "object") {
      console.warn(`[称号] ${currentSong}/info.json achievementTitles[${index}] の形式が正しくありません。`);
      return;
    }

    const name = String(definition.name || "").trim();
    const definitionId = String(definition.id || `achievement-${index + 1}`).trim();
    const difficultyValues = Array.isArray(definition.difficulty)
      ? definition.difficulty
      : [definition.difficulty];
    const targetDifficulties = difficultyValues
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    const condition = String(definition.condition || "").toLowerCase();
    if (!definitionId || !name || targetDifficulties.length === 0 || !Object.hasOwn(conditions, condition)) {
      console.warn(`[称号] ${currentSong}/info.json achievementTitles[${index}] は id / name / difficulty / condition を正しく指定してください。`);
      return;
    }
    if (!targetDifficulties.includes(difficulty) || !conditions[condition]) return;

    const titleId = `song:${currentSong}:${definitionId}`;
    if (saveData.unlockedTitles[titleId]) return;

    saveData.unlockedTitles[titleId] = {
      name,
      category: "songRecord",
      background: "red",
      songId: currentSong,
      difficulties: [...new Set(targetDifficulties)].map(value => value.toUpperCase()),
      achievedDifficulty: chartInfo.difficulty,
      condition,
      acquisitionText: String(definition.acquisitionText || "").trim(),
      unlockedAt: Date.now()
    };
    newlyUnlocked.push(titleId);
  });

  return newlyUnlocked;
}

function corruptBoss4PuzzleTrialResultText() {
  const corruptedCharacters = Array.from("縺譁螟莠滉九荳蜊謇髫蛯鬥謖�□▒▓");
  const processedTextNodes = new WeakSet();
  const corruptTextNode = node => {
    if (!node?.nodeValue || processedTextNodes.has(node) || !node.nodeValue.trim()) return;
    processedTextNodes.add(node);
    node.nodeValue = Array.from(node.nodeValue, character => {
      if (/\s/u.test(character)) return character;
      return corruptedCharacters[Math.floor(Math.random() * corruptedCharacters.length)];
    }).join("");
  };
  const corruptTree = root => {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      corruptTextNode(root);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) corruptTextNode(walker.currentNode);
  };

  const roots = [resultScreen, document.getElementById("playProfileArea")].filter(Boolean);
  roots.forEach(corruptTree);
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(corruptTree);
    }
  });
  roots.forEach(root => observer.observe(root, { childList: true, subtree: true }));
  document.body.classList.add("boss4PuzzleTrialResultCorrupted");
}

function showResult() {
  if (showResult.called) return; // 2重呼び出し防止
  showResult.called = true;
  if (boss4SecondTrialGameplayActive) {
    document.body.classList.remove("boss4SecondTrialGameplay");
    document.getElementById("boss4SecondTrialMelodyLayer")?.replaceChildren();
  }
  if (song35FinalTrialDistortionActive) {
    document.body.classList.remove("song35FinalTrialWarp");
  }
  if (boss4ChaosIntroMode) {
    document.body.classList.remove("boss4LateWarp", "song35FinalTrialWarpFading");
    const backgroundVideo = document.getElementById("boss4Background3Video");
    if (backgroundVideo) backgroundVideo.pause();
  }
  if (secretBossTriggered && !secretBossUnlocked) {
  blackOverlay.classList.add("dark");

  setTimeout(() => {
    location.href = `boss_intro.html?difficulty=${currentDifficulty}`;
  }, 3000);

  return;
  }
  updateRank();
  const finalScore = Math.round(score);
  const playRewardRatio = Math.max(0, finalScore / 1000000);
  const playRewardPercent = Math.floor(playRewardRatio * 100);
  const playShardReward = Math.floor(20 * playRewardRatio * playRewardRatio);
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const boss4PuzzleWasStarted = saveData.storyFlags?.boss4PuzzleStarted === true;

  if (mapMode && activeMapPiece) {
    const missionFailures = evaluateMapMissionConditions(activeMapPiece);
    const clearFailures = life <= 0 ? ["楽曲クリア失敗"] : [];
    const rawFailures = [...clearFailures, ...missionFailures];
    const forceUnlock = getMapPieceFailureCount(saveData) >= 2;
    mapAttemptFailed = rawFailures.length > 0 && !forceUnlock;
    mapAttemptFailureReasons = rawFailures;

    if (mapAttemptFailed) {
      recordMapPieceFailure(saveData);
    } else {
      recordMapPieceClear(saveData);
    }
  }

  // 自己ベスト取得・更新
if (!saveData[currentSong]) saveData[currentSong] = {};
if (!saveData[currentSong][currentDifficulty]) saveData[currentSong][currentDifficulty] = {};
const prev = saveData[currentSong][currentDifficulty];
const wasPlayed = prev.played === true;
prev.played = true;
const oldRate = Number(saveData.profile?.rate || 0);
const suppressChallengeScoreSave = boss3Intro && currentSong === "boss3";
const isNewBest = !suppressChallengeScoreSave && finalScore > (prev.bestScore || 0);
const currentChart = songInfo.charts[currentDifficulty];

prev.level = Number(currentChart.level || 0);

  if (isNewBest) prev.bestScore = finalScore;
  prev.level = Number(currentChart.level || 0);
  if (life > 0) prev.cleared = true;
  if (missCount === 0) prev.fullCombo = true;
  if (missCount === 0 && goodCount === 0) prev.allPerfect = true;
  if (yellowPerfectCount === getTotalJudgementNoteCount()) prev.ultimatePerfect = true;

  unlockSongAchievementTitles(saveData, currentChart);

  // ランクを取得
  const currentRank = rankText.textContent;
  if (!suppressChallengeScoreSave && (!prev.bestRank || finalScore >= (prev.bestScore || 0))) {
    prev.bestRank = currentRank;
  }

  if (currentSong === SECRET_BOSS_SONG && bossChallenge) {
  saveData.secretBossUnlocked = true;
}

if (currentSong === "song9" && storyChallenge && life > 0) {
  saveData.song9Unlocked = true;

  if (!saveData.storyFlags) {
    saveData.storyFlags = {};
  }

  saveData.storyFlags.song9ChallengeCleared = true;
}

if (chapter4StoryChallenge && life > 0) {
  if (!saveData.storyFlags) {
    saveData.storyFlags = {};
  }
  saveData.song33Unlocked = true;
  saveData.storyFlags.chapter4Episode6ChallengeCleared = true;
}

if (currentSong === "song35" && life > 0) {
  if (!saveData.storyFlags) {
    saveData.storyFlags = {};
  }
  saveData.storyFlags.boss4PuzzleStarted = true;
  if (song35StoryChallenge && !boss4PuzzleWasStarted) {
    saveData.storyFlags.boss4PuzzleIntroPending = true;
  }
}

if (currentSong === "song35") {
  if (!saveData.storyFlags) {
    saveData.storyFlags = {};
  }
  saveData.storyFlags.lyraSkillLocked = true;
}

const boss4PuzzleStage = Number(saveData.storyFlags?.boss4PuzzleStage || 0);
const goodOrLowerCount = goodCount + missCount;
const isAllPerfectMinusOne = goodOrLowerCount === 1;
const isUltimatePerfectMinusOne = perfectCount === 1 && goodOrLowerCount === 0;
const boss4FirstTrialCompleted =
  boss4PuzzleWasStarted &&
  boss4PuzzleStage === 0 &&
  saveData.storyFlags?.boss4PuzzleTransitionPending !== true &&
  life > 0 &&
  (isAllPerfectMinusOne || isUltimatePerfectMinusOne);
if (boss4FirstTrialCompleted) {
  saveData.storyFlags.boss4PuzzleTransitionPending = true;
}
const boss4SecondTrialCompleted =
  boss4PuzzleWasStarted &&
  boss4PuzzleStage === 1 &&
  saveData.storyFlags?.boss4PuzzleTransitionPending !== true &&
  Number(saveData.settings?.musicVolume ?? 70) === 0;
if (boss4SecondTrialCompleted) {
  saveData.storyFlags.boss4PuzzleTransitionPending = true;
  if (!saveData.settings) saveData.settings = {};
  saveData.settings.musicVolume = 70;
}
const boss4PuzzleTrialResultCorrupted =
  boss4FirstTrialCompleted || boss4SecondTrialCompleted;

if (boss2Challenge && life > 0) {
  saveData.boss2Unlocked = true;
}

if (boss3Challenge && currentSong === "song19" && life > 0) {
  const savedMaximum = Number(saveData.song19MaxClearedDifficulty);
  const previousMaximum = Number.isInteger(savedMaximum) ? savedMaximum : -1;
  const maximumClearedDifficulty = Math.max(previousMaximum, currentDifficulty);

  saveData.boss3UnlockChallengeActive = false;
  saveData.boss3UnlockChallengePending = maximumClearedDifficulty < 2;
  saveData.boss3UnlockChallengeFailed = false;
  saveData.boss3UnlockChallengeCleared = maximumClearedDifficulty >= 2;
  saveData.song19MaxClearedDifficulty = maximumClearedDifficulty;
}

if (boss3Intro && currentSong === "boss3") {
  saveData.boss3Unlocked = true;
  saveData.song19Unlocked = true;
}

const newRate = calculateRateFromSaveData(saveData);
const rateGain = Math.round((newRate - oldRate) * 10) / 10;

if (!saveData.profile) saveData.profile = {};
saveData.profile.rate = newRate;
unlockRateTitles(saveData, newRate);
if (bulletChallenge && life > 0 && enemyLife <= 0 && damageTakenDuringPlay === 0) {
  unlockSpecialTitle(saveData, "bulletNoDamage");
}
if (life > 0 && missCount === 1) {
  unlockSpecialTitle(saveData, "clearWithOneMiss");
}
const totalJudgementNotes = getTotalJudgementNoteCount();
if (
  totalJudgementNotes > 0 &&
  missCount === totalJudgementNotes &&
  yellowPerfectCount === 0 &&
  perfectCount === 0 &&
  goodCount === 0
) {
  unlockSpecialTitle(saveData, "allNotesMissed");
}
if (yellowPerfectCount === getTotalJudgementNoteCount()) {
  unlockRecordTitle(saveData, "anyUltimatePerfect");
}

saveData.playShards = Number(saveData.playShards || 0) + playShardReward;

  localStorage.setItem("rhythmGame", JSON.stringify(saveData));

const partnerId = saveData.profile?.partner || "breaka";
const partner = partners[partnerId] || partners.breaka;

const resultProfileNameEl = document.getElementById("playProfileName");
if (resultProfileNameEl) {
  resultProfileNameEl.textContent = saveData.profile.username || "Player";
  applyRateRankMark(resultProfileNameEl, newRate, saveData.profile.username);
}

const resultRateEl = document.getElementById("playProfileRate");
if (resultRateEl) {
  resultRateEl.textContent = "RATE " + Number(newRate || 0).toFixed(1);
  applyRateColor(resultRateEl, newRate);
}

const resultRateGainEl = document.getElementById("playRateGain");
if (resultRateGainEl) {
  const hasRateGain = rateGain > 0;
  resultRateGainEl.textContent = hasRateGain ? "+" + rateGain.toFixed(1) : "";
  resultRateGainEl.classList.toggle("visible", hasRateGain);
}

const resultProfileTitleEl = document.getElementById("playProfileTitle");
if (resultProfileTitleEl) {
  setPlayProfileTitleText(resultProfileTitleEl, saveData.profile.title || "新米プレイヤー");
  applyPlayProfileTitleAppearance(
    resultProfileTitleEl,
    saveData.profile.titleBackground || "yellow",
    saveData.profile.titleId || saveData.profile.title
  );
  applyPlayFractureTitleBadge(
    resultProfileTitleEl,
    saveData.unlockedTitles?.[saveData.profile.titleId]
  );
}

const resultProfileIcon = document.getElementById("playPartnerIcon");
if (resultProfileIcon) {
  resultProfileIcon.src = partner.icon;
  const scale = partner.iconScale || 1.0;
  resultProfileIcon.style.width = (72 * scale) + "px";
  resultProfileIcon.style.height = (72 * scale) + "px";
}

const resultPartnerImage = document.getElementById("resultPartnerImage");
resultPartnerImage.src = partner.full;
const resultScale = partner.resultScale || 1.0;
resultPartnerImage.style.transform = `scale(${resultScale})`;
const resultBottom = Number(partner.resultBottom);
resultPartnerImage.style.bottom =
  `${Number.isFinite(resultBottom) ? resultBottom : 20}px`;

  // リザルト画面に値をセット
  resultTitle.textContent = songInfo.title;
  resultArtist.textContent = songInfo.artist;
resultDifficulty.textContent =
  currentChart.difficulty + " Lv." + getDisplayedChartLevel(currentChart.level);
resultDifficulty.hidden = boss3Intro && currentSong === "boss3";

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
  resultPlayRewardRate.textContent = `${playRewardPercent}%`;
  resultPlayRewardAmount.textContent = `×${playShardReward}`;
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
} else if (yellowPerfectCount === getTotalJudgementNoteCount()) {
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

  const totalCombo = getTotalJudgementNoteCount();
  const achievementRate = totalCombo > 0
    ? Math.min(100, (maxCombo / totalCombo) * 100)
    : 0;
  resultAchievementGauge.style.setProperty("--achievement-rate", achievementRate + "%");
  resultAchievementGauge.setAttribute("aria-valuenow", achievementRate.toFixed(1));
  resultAchievementRate.textContent = "Max Combo:" + maxCombo;

  setTimeout(() => {
    document.getElementById("songInfo").style.display = "none";
    document.body.classList.add("resultProfileVisible");
    if (boss4PuzzleTrialResultCorrupted) {
      retryButton.disabled = true;
      resultBGM.playbackRate = 0.6;
      resultBGM.preservesPitch = false;
      corruptBoss4PuzzleTrialResultText();
    } else {
      resultBGM.playbackRate = 1;
    }
    resultScreen.classList.add("visible");
  if (mapMode) {
    retryButton.disabled = true;
    setTimeout(mapAttemptFailed ? showMapAttemptFailureEffect : showMapPieceRestoreEffect, 1400);
  }
  if (storyChallenge) {
    retryButton.disabled = true;
  }
  if (boss3Challenge && currentSong === "song19" && life > 0) {
    retryButton.disabled = true;
  }
  if (boss3Intro && currentSong === "boss3") {
    retryButton.disabled = true;
  }
  if (boss4ChaosIntroMode) {
    retryButton.disabled = true;
  }
  setTimeout(() => {
    resultScreen.classList.add("fadeIn");
  }, 100);
  pauseMusicPlayback(); // プレイ中の曲を止める
  resultBGM.play(); // リザルトBGMを流す
  
  const { expGain, levelUps } = applyPartnerExp();
  const notify = document.getElementById("partnerExpNotify");
  notify.innerHTML = "";

  //ストーリー
  const storyUnlockNotice = document.getElementById("storyUnlockNotice");

  // 一時的に解禁通知を非表示にする（解禁・保存処理には影響しない）。
  if (storyUnlockNotice) {
    storyUnlockNotice.textContent = "";
    storyUnlockNotice.classList.remove("visible");
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

async function startGamePlay({ immediate = false } = {}) {

  if (!gameAssetsReady || started || starting) return;

  if (song35StoryChallenge) {
    const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
    saveData.song35Unlocked = true;
    localStorage.setItem("rhythmGame", JSON.stringify(saveData));
  }

  starting = true;
  pauseMusicPlayback({ reset: true });

  // 音源の準備中に譜面時計を進めると、0秒で音源時計へ切り替わる際に
  // 最初のノーツだけ一瞬停止して見える。譜面を動かす前に準備を完了させる。
  if (!immediate) await primeMusicPlayback();

  started = true;
  musicStarted = false;
  musicEndedAtPerformance = null;
  musicEndedAtMs = 0;
  normalClearReady = false;
  resultDelayFadeActive = false;
  resultDelayFadeStartVolume = 1;

  // startDelayMs がある場合は、その時間だけ待ってからプリロール開始。
  gameStartTime = performance.now() + Math.max(0, startDelayMs) - (immediate ? prerollMs : 0);
  if (song35FinalTrialDistortionActive) {
    comboText.classList.remove("glowing", "bounce");
    updateSong35FinalTrialCountdown(getCurrentMs());
  }

  if (immediate && startDelayMs <= 0) {
    musicStarted = true;
    playMusicPlayback(0);
  }

  startText.style.display = "none";

  starting = false;
}

function disposeStoryChallengeIntro() {
  const intro = document.getElementById("storyChallengeIntro");
  if (!intro) return;
  const partnerImage = document.getElementById("storyChallengePartner");
  partnerImage?.removeAttribute("src");
  intro.remove();
}

function waitForBoss3Intro(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForBoss3MusicPosition(measure, division, leadMs = 0) {
  // 描画・音声再生の処理が実際に画面へ反映されるまでの時間を見込み、
  // 指定位置よりわずかに前から演出処理を始められるようにする。
  const targetMs = getNoteTime(measure, division) - Math.max(0, leadMs);
  return new Promise(resolve => {
    const check = () => {
      if (!boss3IntroActive || getRawCurrentMs() >= targetMs) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function startBoss3WhiteMistEffect(targetCount = 24) {
  const mist = document.getElementById("boss3IntroWhiteMist");
  if (!mist) return;

  const missingCount = Math.max(0, targetCount - mist.childElementCount);
  for (let index = 0; index < missingCount; index++) {
    const particle = document.createElement("span");
    particle.className = "boss3WhiteMistParticle";
    particle.style.setProperty("--mist-left", `${4 + Math.random() * 92}%`);
    particle.style.setProperty("--mist-size", `${5 + Math.random() * 15}px`);
    particle.style.setProperty("--mist-blur", `${1 + Math.random() * 4}px`);
    particle.style.setProperty("--mist-duration", `${2.6 + Math.random() * 2.4}s`);
    particle.style.setProperty("--mist-delay", `${Math.random() * -4}s`);
    particle.style.setProperty("--mist-drift", `${-45 + Math.random() * 90}px`);
    particle.style.setProperty("--mist-opacity", `${0.3 + Math.random() * 0.48}`);
    mist.appendChild(particle);
  }
}

function addBoss3Crack(startX, startY, endX, endY, seedOffset = 0) {
  const svg = document.getElementById("boss3CrackLayer");
  if (!svg) return [];
  const svgNs = "http://www.w3.org/2000/svg";

  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  const normalX = -dy / length;
  const normalY = dx / length;
  const points = [];

  for (let step = 0; step <= 14; step++) {
    const t = step / 14;
    const edgePoint = step === 0 || step === 14;
    const offset = edgePoint ? 0 : Math.sin(step * 4.37 + seedOffset) * (18 + step % 3 * 9);
    points.push([
      startX + dx * t + normalX * offset,
      startY + dy * t + normalY * offset
    ]);
  }

  const mainPath = document.createElementNS(svgNs, "path");
  mainPath.classList.add("boss3CrackPath", "boss3CrackMain");
  mainPath.setAttribute("d", "M " + points.map(point => point.join(" ")).join(" L "));
  svg.appendChild(mainPath);

  for (let step = 2; step <= 12; step += 2) {
    const origin = points[step];
    const direction = step % 4 === 0 ? 1 : -1;
    const branchLength = 55 + (step % 5) * 16;
    const branch = document.createElementNS(svgNs, "path");
    branch.classList.add("boss3CrackPath");
    branch.setAttribute(
      "d",
      `M ${origin[0]} ${origin[1]} L ${origin[0] + normalX * branchLength * direction + dx / length * 24} ${origin[1] + normalY * branchLength * direction + dy / length * 24}`
    );
    branch.style.animationDelay = (step * 0.012) + "s";
    svg.appendChild(branch);
  }

  return points;
}

function createBoss3ShardRandom(seed = 0x3b055) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function clipBoss3ShardCell(polygon, seed, neighbor) {
  if (polygon.length === 0) return polygon;
  const normalX = neighbor.x - seed.x;
  const normalY = neighbor.y - seed.y;
  const limit = (
    neighbor.x * neighbor.x + neighbor.y * neighbor.y -
    seed.x * seed.x - seed.y * seed.y
  ) / 2;
  const inside = point => point.x * normalX + point.y * normalY <= limit + 0.0001;
  const intersection = (start, end) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const denominator = dx * normalX + dy * normalY;
    if (Math.abs(denominator) < 0.000001) return start;
    const t = (limit - start.x * normalX - start.y * normalY) / denominator;
    return { x: start.x + dx * t, y: start.y + dy * t };
  };
  const clipped = [];

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const previous = polygon[(i + polygon.length - 1) % polygon.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);

    if (currentInside) {
      if (!previousInside) clipped.push(intersection(previous, current));
      clipped.push(current);
    } else if (previousInside) {
      clipped.push(intersection(previous, current));
    }
  }

  return clipped;
}

function buildBoss3Shards(crackPaths = [], { fast = false } = {}) {
  const layer = document.getElementById("boss3ShardLayer");
  if (!layer || layer.childElementCount > 0) return;

  const random = createBoss3ShardRandom();
  const seeds = [];
  const shardRings = [
    { radius: 0, count: 1 },
    { radius: 7, count: 7 },
    { radius: 16, count: 10 },
    { radius: 29, count: 15 },
    { radius: 46, count: 22 }
  ];

  // 中央から外へ広がる不均等な環状配置。格子由来の縦横線を完全になくす。
  shardRings.forEach((ring, ringIndex) => {
    if (ring.radius === 0) {
      seeds.push({ x: 50 + (random() - 0.5) * 1.8, y: 50 + (random() - 0.5) * 1.8 });
      return;
    }

    const ringRotation = random() * Math.PI * 2;
    for (let index = 0; index < ring.count; index++) {
      const angleStep = Math.PI * 2 / ring.count;
      const angle = ringRotation + index * angleStep + (random() - 0.5) * angleStep * 0.58;
      const radius = ring.radius * (0.8 + random() * 0.38);
      seeds.push({
        x: Math.max(0.7, Math.min(99.3, 50 + Math.cos(angle) * radius)),
        y: Math.max(0.7, Math.min(99.3, 50 + Math.sin(angle) * radius))
      });
    }
  });

  // 四隅に巨大な矩形セルができないよう、角にも不均等な補助点を置く。
  [
    [4, 5], [95, 3], [97, 94], [5, 97]
  ].forEach(([x, y]) => {
    seeds.push({ x: x + (random() - 0.5) * 3, y: y + (random() - 0.5) * 3 });
  });

  // 各ヒビの両側へ対になる分割点を置き、破片の境界をヒビの軌跡へ沿わせる。
  crackPaths.forEach(points => {
    for (let index = 1; index < points.length; index += 2) {
      const previous = points[index - 1];
      const current = points[index];
      const dx = current[0] - previous[0];
      const dy = current[1] - previous[1];
      const length = Math.hypot(dx, dy) || 1;
      const midpointX = (previous[0] + current[0]) / 20;
      const midpointY = (previous[1] + current[1]) / 20;
      const normalX = -dy / length;
      const normalY = dx / length;
      const separation = 1.45;

      seeds.push({
        x: Math.max(0.3, Math.min(99.7, midpointX + normalX * separation)),
        y: Math.max(0.3, Math.min(99.7, midpointY + normalY * separation))
      });
      seeds.push({
        x: Math.max(0.3, Math.min(99.7, midpointX - normalX * separation)),
        y: Math.max(0.3, Math.min(99.7, midpointY - normalY * separation))
      });
    }
  });

  seeds.forEach((seed, shardIndex) => {
    let polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];

    for (const neighbor of seeds) {
      if (neighbor === seed) continue;
      polygon = clipBoss3ShardCell(polygon, seed, neighbor);
      if (polygon.length === 0) break;
    }
    if (polygon.length < 3) return;

    const minX = Math.min(...polygon.map(point => point.x));
    const maxX = Math.max(...polygon.map(point => point.x));
    const minY = Math.min(...polygon.map(point => point.y));
    const maxY = Math.max(...polygon.map(point => point.y));
    const width = Math.max(0.1, maxX - minX);
    const height = Math.max(0.1, maxY - minY);
    const localPoints = polygon.map(point =>
      `${((point.x - minX) / width * 100).toFixed(2)}% ${((point.y - minY) / height * 100).toFixed(2)}%`
    );
    const centerX = (minX + maxX) / 2 - 50;
    const centerY = (minY + maxY) / 2 - 50;
    let outwardX = centerX * (1.25 + random() * 0.55);
    let outwardY = centerY * (1.25 + random() * 0.55);

    if (Math.hypot(outwardX, outwardY) < 12) {
      const angle = random() * Math.PI * 2;
      outwardX = Math.cos(angle) * (48 + random() * 28);
      outwardY = Math.sin(angle) * (48 + random() * 28);
    }

    const shard = document.createElement("div");
    shard.className = "boss3GlassShard";
    shard.style.left = minX + "%";
    shard.style.top = minY + "%";
    shard.style.width = width + "%";
    shard.style.height = height + "%";
    shard.style.clipPath = `polygon(${localPoints.join(", ")})`;
    shard.style.setProperty("--shard-x", outwardX + "vw");
    shard.style.setProperty("--shard-y", outwardY + "vh");
    shard.style.setProperty(
      "--shard-rotate",
      ((shardIndex % 2 ? 1 : -1) * (38 + random() * 118)).toFixed(1) + "deg"
    );
    shard.style.setProperty("--shard-rotate-x", ((random() - 0.5) * 150).toFixed(1) + "deg");
    shard.style.setProperty("--shard-rotate-y", ((random() - 0.5) * 170).toFixed(1) + "deg");
    shard.style.setProperty("--shard-z", (70 + random() * 260).toFixed(0) + "px");
    shard.style.setProperty("--shard-glint-angle", (35 + random() * 110).toFixed(0) + "deg");
    shard.style.setProperty("--shard-glint-opacity", (0.12 + random() * 0.3).toFixed(2));
    shard.style.setProperty("--shard-duration", (fast ? 0.42 + random() * 0.12 : 1.5 + random() * 0.5).toFixed(2) + "s");
    const distanceFromCenter = Math.hypot(centerX, centerY);
    // 中央の破砕から外周へ、割れと飛散がひと続きで伝わるように遅延させる。
    const radialDelay = fast
      ? Math.min(0.11, distanceFromCenter / 50 * 0.09)
      : Math.min(0.58, distanceFromCenter / 50 * 0.52);
    shard.style.setProperty("--shard-delay", (radialDelay + random() * 0.025).toFixed(3) + "s");
    shard.style.setProperty("--shard-scale", (0.58 + random() * 0.3).toFixed(2));
    layer.appendChild(shard);

    // 破片のclip-pathに切られない、独立した強い星型反射。
    if (shardIndex % 5 === 2 || shardIndex % 5 === 4) {
      const edgePoint = polygon[Math.floor(random() * polygon.length)];
      const sparkle = document.createElement("span");
      sparkle.className = "boss3ShardSparkle";
      sparkle.style.left = minX + "%";
      sparkle.style.top = minY + "%";
      sparkle.style.width = width + "%";
      sparkle.style.height = height + "%";
      sparkle.style.setProperty("--sparkle-left", ((edgePoint.x - minX) / width * 100).toFixed(2) + "%");
      sparkle.style.setProperty("--sparkle-top", ((edgePoint.y - minY) / height * 100).toFixed(2) + "%");
      [
        "--shard-x", "--shard-y", "--shard-z", "--shard-rotate",
        "--shard-rotate-x", "--shard-rotate-y", "--shard-scale",
        "--shard-delay", "--shard-duration"
      ].forEach(property => {
        sparkle.style.setProperty(property, shard.style.getPropertyValue(property));
      });
      layer.appendChild(sparkle);
    }
  });
}

async function runBoss3IntroSequence() {
  if (!boss3IntroActive || boss3IntroRunning) return;
  boss3IntroRunning = true;
  const overlay = document.getElementById("boss3IntroOverlay");
  const tapToStart = document.getElementById("boss3TapToStart");
  boss3StartSE.currentTime = 0;
  boss3StartSE.play().catch(() => {});
  tapToStart?.classList.add("leaving");
  setTimeout(() => tapToStart?.remove(), 550);
  overlay?.classList.add("sceneVisible");

  // 背景の1.2秒フェードを完了させてから、音源と譜面時間を同時に開始する。
  await waitForBoss3Intro(BOSS3_INTRO_MUSIC_DELAY_MS);
  startGamePlay({ immediate: true });

  const crackSound = new Audio("sounds/crack.mp3");
  const crackPaths = [];
  // 音源を1.5秒遅らせたぶん各演出を先行させ、従来の体感タイミングを維持する。
  // 既存の描画反映用100msも加えるため、合計1.6秒前から処理する。
  const visualLeadMs = BOSS3_INTRO_MUSIC_DELAY_MS + 100;

  await waitForBoss3MusicPosition(2, [0, 1], visualLeadMs);
  overlay?.classList.add("characterAVisible");
  startBoss3WhiteMistEffect(8);
  overlay?.classList.add("subtleWhiteMistVisible");

  await waitForBoss3MusicPosition(3, [3, 4], visualLeadMs);
  overlay?.classList.add("characterBVisible");

  await waitForBoss3MusicPosition(5, [1, 2], visualLeadMs);
  startBoss3WhiteMistEffect(24);
  overlay?.classList.add("whiteMistVisible");
  overlay?.classList.add("arcAVisible");

  await waitForBoss3MusicPosition(7, [1, 4], visualLeadMs);
  overlay?.classList.add("arcBVisible");

  await waitForBoss3MusicPosition(8, [2, 3], visualLeadMs);
  overlay?.classList.add("sceneFadingOut");

  await waitForBoss3MusicPosition(9, [0, 1], visualLeadMs);
  crackSound.currentTime = 0;
  crackSound.play().catch(() => {});
  crackPaths.push(addBoss3Crack(-20, 245, 1020, 710, 0.08));

  await waitForBoss3MusicPosition(9, [3, 16], visualLeadMs);
  crackSound.currentTime = 0;
  crackSound.play().catch(() => {});
  crackPaths.push(addBoss3Crack(920, -20, 75, 1020, 0.34));

  await waitForBoss3MusicPosition(9, [6, 16], visualLeadMs);
  const shatterSound = new Audio("sounds/canon_glow_start.mp3");
  shatterSound.play().catch(() => {});
  buildBoss3Shards(crackPaths, { fast: true });
  document.body.classList.add("boss3ShatterZoom");
  overlay?.classList.add("shattering");
  setTimeout(() => document.body.classList.remove("boss3ShatterZoom"), 650);

  // 粉砕と同時に譜面を見せ、入力も通常プレイへ戻す。
  document.body.classList.remove("boss3IntroMode");
  boss3IntroActive = false;
  await waitForBoss3Intro(560);

  overlay?.classList.add("hidden");
}

document.getElementById("boss3IntroOverlay")?.addEventListener("click", runBoss3IntroSequence, { once: true });

// ---- キー入力 ----
function setupBulletChallenge() {
  if (!bulletChallenge || !heartPlayer) return;

  heartPlayer.classList.remove("hidden");
  comboText.style.display = "none";
  fastLateText.style.display = "none";
  document.getElementById("enemyLifeArea")?.classList.remove("hidden");
  enemyLife = maxEnemyLife;
  document.getElementById("enemyMissionComplete")?.classList.add("hidden");
  updateEnemyLifeBar();
  updateHeartFromPointer(window.innerWidth / 2);

  const tutorialOverlay = document.getElementById("bulletTutorialOverlay");
  if (tutorialOverlay) {
    bulletTutorialActive = true;
    tutorialOverlay.classList.remove("hidden", "closing");
  }

  // mousemove と pointermove の二重発火を避け、1描画につき位置更新を1回にまとめる。
  installHeartPointerControls();
}

function dismissBulletTutorial() {
  if (!bulletTutorialActive) return;
  bulletTutorialActive = false;
  const tutorialOverlay = document.getElementById("bulletTutorialOverlay");
  if (!tutorialOverlay) return;
  tutorialOverlay.classList.add("closing");
  setTimeout(() => {
    tutorialOverlay.classList.add("hidden");
    tutorialOverlay.classList.remove("closing");
  }, 300);
}

document.getElementById("bulletTutorialOverlay")?.addEventListener("click", dismissBulletTutorial);

document.addEventListener("keydown", async (e) => {
  const inputKey = normalizeInputKey(e);
  const targetLane = getLaneFromInput(e);
  const isHeartArrow = isHeartDodgeModeActive() && (inputKey === "ArrowLeft" || inputKey === "ArrowRight");

  if (!gameAssetsReady) {
    if (inputKey === " ") e.preventDefault();
    return;
  }

  if (boss3IntroActive) {
    e.preventDefault();
    return;
  }

  if (bulletTutorialActive) {
    if (inputKey === " " || inputKey === "Enter") {
      e.preventDefault();
      dismissBulletTutorial();
    }
    return;
  }

  if (paused) return;

  if (isHeartArrow) e.preventDefault();

  // 自動リピートだけを除外し、数字列とテンキーは同じ入力として扱う。
  if (e.repeat) return;
  keys[inputKey] = true;

  if (isHeartArrow) return;

  if (storyChallengeIntroPending && inputKey === " ") {
    e.preventDefault();
    return;
  }

  if (boss4ChaosStartInputLocked && inputKey === " ") {
    e.preventDefault();
    return;
  }

    if (storyChallengeIntroActive && inputKey === " ") {
  e.preventDefault();

  const intro = document.getElementById("storyChallengeIntro");
  if (intro) {
    intro.classList.add("hidden");
  }

  storyChallengeIntroActive = false;

  setTimeout(() => {
    disposeStoryChallengeIntro();
    startGamePlay();
  }, 450);

  return;
}

  // ゲーム開始
  if (inputKey === " " && !started && !starting) {
    e.preventDefault();
    startGamePlay();
    return;
  }

  if (!targetLane) return;
  e.preventDefault();
  const judgedMs = getCurrentMs();

  // 押したレーンを光らせる
  const laneElement = document.getElementById(targetLane);
  const flash = laneElement.querySelector(".flash");
  flash.style.opacity = "1";
  setTimeout(() => { flash.style.opacity = "0"; }, 100);

  // グローエフェクト（キーを叩いた時に常に発生）
spawnLaneGlow(Number(targetLane.replace("lane", "")), "white");

  // dualノーツ発光/効果音
 for (let note of notes) {
  if (!note.active) continue;
  if (note.type !== "dual") continue;
  const hit = note.lanes.some(lane => "lane" + lane === targetLane);
  if (!hit) continue;

  // タイミングが合っているかも確認
  const dualDiff = Math.abs(judgedMs - note.hitTime);
  if (dualDiff > 140) continue;

  for (let lane of note.lanes) {
    const dualLane = document.getElementById("lane" + lane);
    const dualFlash = dualLane.querySelector(".flash");
    dualFlash.style.opacity = "1";
    setTimeout(() => { dualFlash.style.opacity = "0"; }, 100);
    spawnLaneGlow(lane, "#66DDFF", 0.6);
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

const diff = Math.abs(judgedMs - note.hitTime);

    // ロングノーツの始点判定
if (note.type === "long") {
  if (judgedMs < note.hitTime - 140) {
  continue;
}
  if (diff < 60) {
    note.holdResult = "perfect";
    note.holding = true;
    showJudgeText("Perfect!","#FFD84A", laneIndex);
    fastLateText.textContent = "";
spawnParticles(laneIndex, "#FFE87C");
    break;
  } else if (diff < 120) {
    note.holdResult = "good";
    note.holding = true;
    showJudgeText("Good!","#88FF88", laneIndex);
    fastLateText.textContent = judgedMs < note.hitTime ? "Fast" : "Late";
    if (judgedMs < note.hitTime) {
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
  showJudgeText("Perfect!","#FFD84A", laneIndex);
    if (note.type === "dual") {
  }
  fastLateText.textContent = "";
  combo++;
  maxCombo = Math.max(maxCombo, combo);
  yellowPerfectCount++
  applyJudgementRecoverySkill("yellowPerfect");
  score += perfectScore + 1;
  updateScore();
  updateComboText(combo + " Combo");
  damageEnemyFromDual(note);
  countChapter4DualNote(note);
  note.active = false;
  burstStoryChallengeDualSymbol(note);
  releaseNoteElement(note);
  checkClear();
spawnParticles(laneIndex, "#FFE87C");
  break;
} else if (diff < 60) {
  showJudgeText("Perfect!","white", laneIndex);
    if (note.type === "dual") {
  }
  fastLateText.textContent = judgedMs < note.hitTime ? "Fast" : "Late";
  combo++;
  maxCombo = Math.max(maxCombo, combo);
    perfectCount++;
    applyJudgementRecoverySkill("perfect");
  if (judgedMs < note.hitTime) {
    fastCount++;
  } else {
    lateCount++;
  }
  score += perfectScore;
  updateScore();
  updateComboText(combo + " Combo");
  damageEnemyFromDual(note);
  countChapter4DualNote(note);
  note.active = false;
  burstStoryChallengeDualSymbol(note);
  releaseNoteElement(note);
  checkClear();
spawnParticles(laneIndex, "#FFE87C");
  break;
} else if (diff < 120) {
  showJudgeText("Good!","#88FF88", laneIndex);
    if (note.type === "dual") {
  }
  fastLateText.textContent = judgedMs < note.hitTime ? "Fast" : "Late";
  combo++;
  maxCombo = Math.max(maxCombo, combo);
  goodCount++
  applySong19GoodDamage();
  applyJudgementRecoverySkill("good");
  if (judgedMs < note.hitTime) {
    fastCount++;
  } else {
    lateCount++;
  }
  score += goodScore;
  updateScore();
  updateComboText(combo + " Combo");
  damageEnemyFromDual(note);
  countChapter4DualNote(note);
  note.active = false;
  burstStoryChallengeDualSymbol(note);
  releaseNoteElement(note);
  checkClear();
  spawnParticles(laneIndex, "white");
  break;
} else if (diff < 150) {
  showJudgeText("Miss...", "#FF4444");
  fastLateText.textContent = judgedMs < note.hitTime ? "Fast" : "Late";
  if (judgedMs < note.hitTime) {
    fastCount++;
  } else {
    lateCount++;
  }
  applyMiss(false); // showJudgeTextをスキップ
  note.active = false;
  burstStoryChallengeDualSymbol(note);
  releaseNoteElement(note);
  checkClear();
  break;
}
  }
});

document.addEventListener("keyup", (e) => {
  const inputKey = normalizeInputKey(e);
  keys[inputKey] = false;
});

window.addEventListener("blur", () => {
  for (const key of Object.keys(keys)) {
    keys[key] = false;
  }
});

function getChartEndTime() {
  let endTime = 0;

  for (const note of chart) {
    const noteEnd = note.endTime || note.hitTime;
    if (noteEnd > endTime) {
      endTime = noteEnd;
    }
  }

  return endTime;
}

function mirrorLane(lane) {
  const laneNumber = Number(lane);

  if (laneNumber === 0) return 4;
  if (laneNumber === 1) return 3;
  if (laneNumber === 2) return 2;
  if (laneNumber === 3) return 1;
  if (laneNumber === 4) return 0;

  return laneNumber;
}

function applyMirrorChartSkill() {
  if (!activePartnerSkill) return;
  if (activePartnerSkill.type !== "mirrorChart") return;

  for (const note of chart) {
    if (note.lanes) {
      note.lanes = note.lanes.map(lane => mirrorLane(lane));
      note.lanes.sort((a, b) => a - b);
    }

    if (note.lane !== undefined) {
      note.lane = mirrorLane(note.lane);
    }
  }
}

function setupPartnerSkill() {
  activePartnerSkill = getCurrentPartnerSkill();
  timedHealTriggers = [];
  timedHealUsed = [];
  emergencyHealUsed = false;

  if (!activePartnerSkill) return;

  if (activePartnerSkill.type === "mirrorChart") {
    applyMirrorChartSkill();
  }

  // 初回boss3では回復自体が不要。特に曲長1/3地点（15小節目先頭付近）の
  // タイマーを作らないことで、そのフレームでの回復DOM生成を根元からなくす。
  if (activePartnerSkill.type === "timedHeal" && !isBoss3UnlockPlay()) {
    const chartEndTime = getChartEndTime();
    const count = Number(activePartnerSkill.count || 0);

    for (let i = 1; i <= count; i++) {
      timedHealTriggers.push(chartEndTime * i / (count + 1));
      timedHealUsed.push(false);
    }
  }
}
function checkSong11BgEvent(currentMs) {
  if (currentSong !== "song11") return;
  if (song11BgEventTriggered) return;
  if (song11BgEventTime === null) return;
  if (currentMs < song11BgEventTime) return;

  song11BgEventTriggered = true;

  const flash = document.getElementById("song11WhiteFlash");
  if (flash) {
    flash.classList.remove("show");
    void flash.offsetWidth;
    flash.classList.add("show");
  }

  document.body.style.backgroundImage = "url('songs/song11/song11_bg_after.jpg')";
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  document.body.style.backgroundRepeat = "no-repeat";
}

function checkSong35BgEvent(currentMs) {
  if (!song35StoryChallenge || song35BgEventTriggered) return;
  if (song35BgEventTime === null || currentMs < song35BgEventTime) return;

  song35BgEventTriggered = true;

  const flash = document.getElementById("song11WhiteFlash");
  if (flash) {
    flash.classList.remove("show");
    void flash.offsetWidth;
    flash.classList.add("show");
  }

  document.body.style.backgroundImage = "url('songs/song35/background.png')";
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  document.body.style.backgroundRepeat = "no-repeat";
  document.body.classList.remove("song35EventMinimalHud");
}

function isSong35FinalPuzzleReady() {
  if (currentSong !== "song35") return false;
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const savedMaximum = Number(saveData.boss4MaxUnlockedDifficulty);
  const maximumUnlockedDifficulty = Number.isInteger(savedMaximum)
    ? Math.max(-1, Math.min(2, savedMaximum))
    : -1;
  return saveData.storyFlags?.boss4PuzzleStarted === true
    && Number(saveData.storyFlags?.boss4PuzzleStage || 0) === 3
    && saveData.storyFlags?.boss4PuzzleTransitionPending !== true
    && currentDifficulty > maximumUnlockedDifficulty;
}

function rampSong35PuzzleNoise(durationMs) {
  const startedAt = performance.now();
  const update = now => {
    const progress = Math.min(1, (now - startedAt) / durationMs);
    song35PuzzleNoise.volume = progress;
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function scheduleSong35PuzzleJolts(durationMs) {
  const endsAt = performance.now() + durationMs - 180;

  const scheduleNext = () => {
    const delay = 330 + Math.random() * 820;
    setTimeout(() => {
      if (!song35FinalPuzzleTriggered || performance.now() >= endsAt) return;

      const root = document.documentElement;
      const strength = 3 + Math.random() * 6;
      const joltX = (Math.random() < 0.5 ? -1 : 1) * strength;
      const joltY = (Math.random() - 0.5) * strength;
      root.style.setProperty("--song35-jolt-x", `${joltX}px`);
      root.style.setProperty("--song35-jolt-y", `${joltY}px`);
      root.style.setProperty("--song35-jolt-return-x", `${joltX * -0.45}px`);
      root.style.setProperty("--song35-jolt-return-y", `${joltY * -0.45}px`);
      root.style.setProperty("--song35-jolt-settle-x", `${joltX * 0.18}px`);
      root.style.setProperty("--song35-jolt-settle-y", `${joltY * 0.18}px`);
      root.classList.remove("song35PuzzleJolt");
      void root.offsetWidth;
      root.classList.add("song35PuzzleJolt");
      setTimeout(() => root.classList.remove("song35PuzzleJolt"), 130);
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

function startSong35FinalPuzzleEffect(buildupDuration) {
  if (song35FinalPuzzleTriggered) return;
  song35FinalPuzzleTriggered = true;
  heartControlsLocked = true;
  document.body.classList.add("song35FinalPuzzleActive");
  const noiseOverlay = document.getElementById("song35PuzzleNoiseOverlay");
  noiseOverlay?.style.setProperty("--song35-noise-build-duration", `${buildupDuration}ms`);
  noiseOverlay?.classList.add("active");
  scheduleSong35PuzzleJolts(buildupDuration);

  song35PuzzleNoise.currentTime = 0;
  song35PuzzleNoise.volume = 0;
  song35PuzzleNoise.play().then(() => {
    rampSong35PuzzleNoise(buildupDuration);
  }).catch(error => console.warn("song35 puzzle noise playback failed:", error));

  fadeOutAudio(music, buildupDuration);
  setTimeout(() => {
    document.getElementById("blackOverlay")?.classList.add("tvBlackoutComplete");
    noiseOverlay?.classList.add("blackoutComplete");
    document.documentElement.classList.remove("song35PuzzleJolt");
    song35PuzzleNoise.pause();
    song35PuzzleNoise.currentTime = 0;
    song35PuzzleNoise.volume = 0;
    paused = true;
    setTimeout(() => {
      issueBoss4AccessTicket(currentDifficulty, true);
      location.href = `game.html?song=boss4&difficulty=${currentDifficulty}&boss4ChaosIntro=1`;
    }, 700);
  }, buildupDuration);
}

async function playBoss4ChaosIntro() {
  const intro = document.getElementById("boss4ChaosIntro");
  const text = document.getElementById("boss4ChaosText");
  if (!intro || !text) return;

  const target = "CHAOS UNBOUNDED";
  const glitchCharacters = "DISTORTION01#%&/\\+-<>";
  const setChaosText = value => {
    text.textContent = value;
    text.dataset.noiseText = value;
    text.classList.remove("characterNoise");
    void text.offsetWidth;
    text.classList.add("characterNoise");
  };
  const pulseHeartDistortion = (secondary = false) => {
    intro.classList.remove("heartPulse", "heartPulseSecondary");
    void intro.offsetWidth;
    intro.classList.add(secondary ? "heartPulseSecondary" : "heartPulse");
  };
  const startHeartDistortion = () => {
    const runBeatPair = () => {
      pulseHeartDistortion(false);
      boss4HeartDistortionTimer = setTimeout(() => {
        pulseHeartDistortion(true);
        boss4HeartDistortionTimer = setTimeout(runBeatPair, 690);
      }, 260);
    };
    runBeatPair();
  };
  const stopHeartDistortion = () => {
    if (boss4HeartDistortionTimer) clearTimeout(boss4HeartDistortionTimer);
    boss4HeartDistortionTimer = null;
    intro.classList.remove("heartPulse", "heartPulseSecondary");
  };
  intro.classList.add("active");
  boss4HeartSE.currentTime = 0;
  boss4HeartSE.play().catch(error => console.warn("boss4 heart playback failed:", error));
  startHeartDistortion();

  await new Promise(resolve => setTimeout(resolve, 450));
  const startedAt = performance.now();
  const transformDuration = 2200;
  await new Promise(resolve => {
    const update = now => {
      const progress = Math.min(1, (now - startedAt) / transformDuration);
      const fixedCount = Math.floor(progress * target.length);
      setChaosText(Array.from(target, (character, index) => {
        if (index < fixedCount || character === " ") return character;
        return glitchCharacters[Math.floor(Math.random() * glitchCharacters.length)];
      }).join(""));
      if (progress < 1) {
        setTimeout(() => requestAnimationFrame(update), 65);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(update);
  });

  setChaosText(target);
  intro.classList.add("switchNoise");
  setTimeout(() => intro.classList.remove("switchNoise"), 260);
  boss4HeartSE.pause();
  boss4HeartSE.currentTime = 0;
  stopHeartDistortion();
  boss4ViolinSE.currentTime = 0;
  boss4ViolinSE.play().catch(error => console.warn("boss4 violin playback failed:", error));
  text.classList.add("confirmed");

  await new Promise(resolve => setTimeout(resolve, 2050));
  text.classList.add("released");

  await new Promise(resolve => setTimeout(resolve, 900));
  boss4ViolinSE.pause();
  boss4ViolinSE.currentTime = 0;
  await new Promise(resolve => setTimeout(resolve, 420));

  document.body.classList.add("boss4ChaosGameplay", "boss4LineWaiting");
  intro.classList.remove("active");
  document.body.classList.remove("boss4ChaosSequence");
  requestAnimationFrame(() => document.body.classList.add("boss4LineReveal"));

  await new Promise(resolve => setTimeout(resolve, 850));
  document.body.classList.remove("boss4LineWaiting", "boss4LineReveal");
  document.body.classList.add("boss4ComboReveal");
  comboText.style.display = "block";
  comboText.textContent = "0 Combo";
  fastLateText.style.display = "block";
  result.style.display = "block";
  await new Promise(resolve => setTimeout(resolve, 650));
  document.body.classList.remove("boss4ComboReveal");
  boss4ChaosStartInputLocked = false;
  startGamePlay();
}

function triggerSong35FinalPuzzle(currentMs) {
  if (song35FinalPuzzleTriggered || song35FinalPuzzleTriggerTime === null) return;
  if (currentMs < song35FinalPuzzleTriggerTime) return;

  // 125小節目にライフが残っている場合だけ、最終演出へ入る。
  if (life <= 0 || !isSong35FinalPuzzleReady()) {
    song35FinalPuzzleTriggerTime = null;
    return;
  }

  const blackoutTime = getNoteTime(129, [0, 1]) + offset;
  startSong35FinalPuzzleEffect(Math.max(500, blackoutTime - song35FinalPuzzleTriggerTime));
}

// TODO(boss4): boss4完成後、Ctrl+Shift+C の演出確認ショートカットを削除する。
window.addEventListener("keydown", event => {
  if (
    currentSong !== "song35" ||
    song35StoryChallenge ||
    !event.ctrlKey ||
    !event.shiftKey ||
    event.code !== "KeyC"
  ) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const previewDuration = Math.max(
    500,
    getNoteTime(129, [0, 1]) - getNoteTime(125, [0, 1])
  );
  startSong35FinalPuzzleEffect(previewDuration);
}, { capture: true });

function spawnSong35LightLine(layer) {
  const line = document.createElement("span");
  const directionSlot = song35LightLineSequenceIndex % 10;
  const goesRight = directionSlot % 2 === 0;
  const angleBand = Math.floor(directionSlot / 2);
  song35LightLineSequenceIndex++;
  const angle = goesRight
    ? 25 + angleBand * 8 + Math.random() * 8
    : 115 + angleBand * 8 + Math.random() * 8;

  line.className = "song35LightLine";
  line.style.setProperty("--light-line-angle", `${angle}deg`);
  line.style.setProperty("--light-line-length", `${90 + Math.random() * 110}px`);
  line.style.setProperty("--light-line-travel", `${135 + Math.random() * 20}vmax`);
  line.style.setProperty("--light-line-duration", `${1400 + Math.random() * 500}ms`);
  line.style.setProperty("--light-line-opacity", `${0.78 + Math.random() * 0.22}`);
  layer.appendChild(line);
  line.addEventListener("animationend", () => line.remove(), { once: true });
}

function updateSong35LightLines(currentMs) {
  if (!song35StoryChallenge) return;

  const startTime = getNoteTime(27, [0, 1]) + offset;
  const endTime = getNoteTime(35, [0, 1]) + offset;
  const shouldPlay = currentMs >= startTime && currentMs < endTime;
  let layer = document.getElementById("song35LightLines");
  let backgroundGlow = document.getElementById("song35BackgroundGlow");

  if (!shouldPlay) {
    if (song35LightLinesActive) {
      song35LightLinesActive = false;
      backgroundGlow?.classList.remove("active");
    }
    return;
  }

  if (!backgroundGlow) {
    backgroundGlow = document.createElement("div");
    backgroundGlow.id = "song35BackgroundGlow";
    backgroundGlow.setAttribute("aria-hidden", "true");
    document.body.appendChild(backgroundGlow);
  }

  if (!layer) {
    layer = document.createElement("div");
    layer.id = "song35LightLines";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }

  if (!song35LightLinesActive) {
    song35LightLinesActive = true;
    song35NextLightLineAt = currentMs;
    song35LightLineSequenceIndex = Math.floor(Math.random() * 10);
    layer.classList.add("active");
    backgroundGlow.classList.add("active");
  }

  if (currentMs < song35NextLightLineAt) return;
  spawnSong35LightLine(layer);
  song35NextLightLineAt = currentMs + 45 + Math.random() * 75;
}

// ---- 起動 ----
async function startGame() {
  if (!boss4AccessAuthorized) return;
  await Promise.all([loadSongInfo(), loadTitleDefinitions()]);

  if (song35StoryChallenge) {
    disposeStoryChallengeIntro();
  }

  await Promise.all([
    loadChart(),
    preloadCurrentGameImages(),
    preloadMusicForPlayback(),
    loadMapMissionContext()
  ]);
  unlockGameStartSpecialTitles();
  setupBulletChallenge();

  if (currentSong === "song11") {
  song11BgEventTime = getNoteTime(36, [0, 1]) + offset;
  song11BgEventTriggered = false;
} else {
  song11BgEventTime = null;
  song11BgEventTriggered = false;
}

  if (song35StoryChallenge) {
    song35BgEventTime = getNoteTime(92, [3, 4]) + offset;
    song35BgEventTriggered = false;
  } else {
    song35BgEventTime = null;
    song35BgEventTriggered = false;
  }

  song35FinalPuzzleTriggerTime = isSong35FinalPuzzleReady()
    ? getNoteTime(125, [0, 1]) + offset
    : null;
  song35FinalPuzzleTriggered = false;
  boss4BackgroundRevealIndex = 0;
  boss4BackgroundDarkenIndex = 0;
  boss4Background2Triggered = false;
  boss4ChromaticTimes = boss4ChaosIntroMode
    ? Array.from({ length: 48 }, (_, index) => 66 + index)
        .flatMap(measure => [
          getNoteTime(measure, [0, 1]) + offset,
          getNoteTime(measure, [1, 2]) + offset
        ])
    : [];
  boss4ChromaticCursor = 0;
  boss4RedLightLinesActive = false;
  boss4NextRedLightLineAt = 0;
  boss4RedLightLineSequenceIndex = 0;
  boss4LowerPinkGlowActive = false;
  boss4NextPinkParticleAt = 0;
  boss4ReverseBackgroundTriggered = false;
  boss4Background3Triggered = false;
  boss4FinalDarknessTriggered = false;
  boss4StoryTransitionStarted = false;
  boss4LateWarpLastUpdateAt = -Infinity;
  boss4LateWarpFinished = false;
  if (boss4ChaosIntroMode) ensureBoss4Background3Video();
  boss4ReverseChartTiming = currentSong === "boss4"
    ? {
        reverseStartMs: getNoteTime(114, [0, 1]) + offset,
        stopMs: getNoteTime(116, [3, 4]) + offset,
        resumeMs: getNoteTime(117, [1, 4]) + offset,
        // 114小節目頭のノーツは通常判定。無音区間後の譜面から逆走対象にする。
        firstHitMs: getNoteTime(117, [1, 2]) + offset,
        // 129小節目の最後までを含め、130小節目以降は通常譜面に戻す。
        lastHitExclusiveMs: getNoteTime(130, [0, 1]) + offset
      }
    : null;

  setupPartnerSkill();
  prepareGameplaySpawnQueues();
  updateLifeBar();
  if (song35FinalTrialDistortionActive) {
    comboText.classList.remove("glowing", "bounce");
    updateSong35FinalTrialCountdown(0);
  }
  if (boss3Intro) {
    prepareBoss3FinalWhiteMistEffect();
    placeBoss3HudAtViewportRoot();
    startText.style.display = "none";
    document.body.classList.add("boss3UnlockMinimalHud");
    document.body.classList.add("boss3IntroMode");
    document.getElementById("boss3IntroOverlay")?.classList.remove("hidden", "shattering");
  }
  if (!gameLoopStarted) {
  gameLoopStarted = true;
  gameLoop();
}

  if (boss4ChaosIntroMode) {
    prepareBoss4GameplayLayers();
    await warmBoss4Background3Video();
  }

  gameAssetsReady = true;
  hideAssetLoadingScreen();

  if (boss4ChaosIntroMode) {
    playBoss4ChaosIntro();
  } else if (autoStart) {
    setTimeout(() => startGamePlay(), 800);
  }

  setTimeout(() => {
    fadeOverlay.classList.add("fadeIn");

    if (storyChallenge && !skipStoryIntro && !song35StoryChallenge) {
  setTimeout(() => {
    storyChallengeIntroPending = false;
    storyChallengeIntroActive = true;

    const intro = document.getElementById("storyChallengeIntro");
    if (intro) {
      intro.classList.remove("hidden");
    }
  }, 500);
}
  }, 100);
}

function goToSelect() {
  resultBGM.pause();
  resultBGM.currentTime = 0;
  blackOverlay.classList.add("dark");
  setTimeout(() => {
    const latestSaveData = getSaveData();
    const boss4PuzzleTransitionPending =
      latestSaveData.storyFlags?.boss4PuzzleTransitionPending === true;
    const outcomeQuery = mapAttemptFailed && currentMapPieceId
      ? `&failed=${encodeURIComponent(currentMapPieceId)}`
      : mapPieceWasNewlyCleared && currentMapPieceId
      ? `&restored=${encodeURIComponent(currentMapPieceId)}`
      : "";
    location.href = boss4PuzzleTransitionPending
      ? "select.html?song=song35"
      : boss3Intro && currentSong === "boss3"
      ? "story.html?episode=chapter3_episode13"
      : boss3Challenge
      ? "story.html?episode=chapter3_episode12"
      : mapMode && currentMapId
      ? `unlock-map.html?map=${encodeURIComponent(currentMapId)}${outcomeQuery}`
      : `select.html?song=${currentSong}&difficulty=${currentDifficulty}`;
  }, 600);
}

retryButton.addEventListener("click", () => {
  resultBGM.pause();
  resultBGM.currentTime = 0;
  blackOverlay.classList.add("dark");
  setTimeout(() => {
    if (currentSong === "boss4") issueBoss4AccessTicket(currentDifficulty, boss4ChaosIntroMode);
    location.reload();
  }, 600);
});

pauseButton.addEventListener("click", () => {
  pauseButton.blur();
  if (bulletPauseLocked || paused || showResult.called) return;

  paused = true;
  pauseStartedAt = performance.now();
  for (const key of Object.keys(keys)) keys[key] = false;

  if (musicStarted) {
    pauseMusicPlayback();
  }

  pauseScreen.classList.add("visible");
  setTimeout(() => {
    pauseScreen.classList.add("fadeIn");
  }, 100);
});

const pauseRetryButton = document.getElementById("pauseRetry");
if (mapMode) {
  pauseRetryButton.disabled = true;
}

pauseRetryButton.addEventListener("click", () => {
  if (mapMode) return;
  if (currentSong === "boss4") issueBoss4AccessTicket(currentDifficulty, boss4ChaosIntroMode);
  location.reload();
});

document.getElementById("selectButton").addEventListener("click", () => {
  if (boss4ChaosIntroMode) {
    resultBGM.pause();
    resultBGM.currentTime = 0;
    blackOverlay.classList.add("dark");
    setTimeout(() => {
      location.href = "story.html?episode=chapter4_episode11&source=boss4Event";
    }, 600);
    return;
  }
  const boss4PuzzleTransitionPending =
    getSaveData().storyFlags?.boss4PuzzleTransitionPending === true;
  if (song35StoryChallenge && !boss4PuzzleTransitionPending) {
    resultBGM.pause();
    resultBGM.currentTime = 0;
    blackOverlay.classList.add("dark");
    setTimeout(() => {
      location.href = "title.html?chaosAwakens=1";
    }, 600);
    return;
  }
  goToSelect();
});

document.getElementById("pauseBack").addEventListener("click", () => {
  if (song19StoryChallenge || (boss3Intro && currentSong === "boss3")) {
    resultBGM.pause();
    resultBGM.currentTime = 0;
    blackOverlay.classList.add("dark");
    setTimeout(() => {
      location.href = "story.html";
    }, 600);
    return;
  }
  goToSelect();
});

document.getElementById("pauseContinue").addEventListener("click", () => {
  if (!paused) return;

  if (started) {
    const pausedDuration = performance.now() - pauseStartedAt;
    gameStartTime += pausedDuration;
    if (musicEndedAtPerformance !== null) {
      musicEndedAtPerformance += pausedDuration;
    }
  }

  paused = false;

  if (musicStarted && !isMusicPlaybackEnded()) {
    playMusicPlayback();
  }

  pauseScreen.classList.remove("fadeIn");
  setTimeout(() => {
    pauseScreen.classList.remove("visible");
  }, 300);
});

document.getElementById("bulletEnemyRetry")?.addEventListener("click", () => {
  location.reload();
});

document.getElementById("bulletEnemyBack")?.addEventListener("click", () => {
  goToSelect();
});

document.addEventListener("wheel", (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
  }
}, { passive: false });

function debugForceClear() {
  if (!started || paused || showResult.called) return;

  if (life <= 0) {
    for (const note of notes) {
      releaseNoteElement(note);
      note.active = false;
    }
    for (const noteData of chart) {
      releaseNoteElement(noteData);
      noteData.spawned = true;
      noteData.active = false;
    }
    for (const note of damageNotes) {
      note.element?.remove();
      note.active = false;
      note.spawned = true;
    }
    comboText.style.display = "none";
    showResult();
    return;
  }

  if (bulletChallenge) {
    for (const note of notes) {
      releaseNoteElement(note);
      note.active = false;
    }

    for (const note of chart) {
      releaseNoteElement(note);
      note.spawned = true;
      note.active = false;
    }

    for (const note of damageNotes) {
      note.element?.remove();
      note.active = false;
      note.spawned = true;
    }

    enemyLife = 0;
    updateEnemyLifeBar();
    document.getElementById("enemyMissionComplete")?.classList.remove("hidden");
    bulletChallengeCleared = true;
    startBulletFinalEvent();
    return;
  }

  // 残っているノーツを全部消す
  for (const note of notes) {
    releaseNoteElement(note);
    note.active = false;
  }

  // 未生成ノーツも生成済み扱いにする
  for (const noteData of chart) {
    releaseNoteElement(noteData);
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

const PLAY_PROFILE_TITLE_BACKGROUNDS = ["green", "yellow", "blue", "purple", "red"];
const PLAY_SPECIAL_PROFILE_TITLE_CLASSES = {
  "rate:crimson-transcender": "titleSpecial-crimson",
  "紅蓮の超越者": "titleSpecial-crimson",
  "rate:sakura-virtuoso": "titleSpecial-sakura",
  "桜華の極奏者": "titleSpecial-sakura",
  "rate:realm-ruler": "titleSpecial-realm",
  "音界の支配者": "titleSpecial-realm"
};

function applyPlayProfileTitleAppearance(element, background, titleId = "") {
  if (!element) return;
  for (const color of PLAY_PROFILE_TITLE_BACKGROUNDS) {
    element.classList.remove(`titleBackground-${color}`);
  }
  for (const className of Object.values(PLAY_SPECIAL_PROFILE_TITLE_CLASSES)) {
    element.classList.remove(className);
  }
  const normalized = PLAY_PROFILE_TITLE_BACKGROUNDS.includes(background) ? background : "yellow";
  element.classList.add(`titleBackground-${normalized}`);
  const specialClass = PLAY_SPECIAL_PROFILE_TITLE_CLASSES[titleId];
  if (specialClass) element.classList.add(specialClass);
}

function applyPlayFractureTitleBadge(element, title) {
  const condition = String(title?.condition || "").toLowerCase();
  const difficulties = Array.isArray(title?.difficulties)
    ? title.difficulties
    : title?.difficulty
      ? [title.difficulty]
      : [];
  const eligible = title?.category === "songRecord"
    && ["fc", "ap", "up"].includes(condition)
    && difficulties.length > 0
    && difficulties.every(value => String(value || "").trim().toLowerCase() === "fracture");
  if (!element) return;
  const text = element.querySelector(".profileTitleMarqueeText");
  text?.querySelector(".titleFractureBadgeMark")?.remove();
  if (!text || !eligible) return;
  const badge = document.createElement("span");
  badge.className = "titleFractureBadgeMark";
  badge.setAttribute("aria-hidden", "true");
  text.prepend(badge);
}

function setPlayProfileTitleText(element, text) {
  if (!element) return;
  const span = document.createElement("span");
  span.className = "profileTitleMarqueeText";
  span.textContent = text;
  element.replaceChildren(span);
  element.classList.remove("profileTitleMarqueeActive");
  element.style.removeProperty("--profile-title-scroll-distance");

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const style = getComputedStyle(element);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const availableWidth = Math.max(0, element.clientWidth - horizontalPadding);
    const distance = Math.ceil(span.scrollWidth - availableWidth);
    if (distance <= 1) return;
    element.style.setProperty("--profile-title-scroll-distance", `${distance}px`);
    element.classList.add("profileTitleMarqueeActive");
  }));
}

function loadPlayProfilePanel() {
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  const profile = saveData.profile || {};

  const partnerId = profile.partner || "breaka";
  const partner = partners[partnerId] || partners.breaka;

  const nameEl = document.getElementById("playProfileName");
  const rateEl = document.getElementById("playProfileRate");
  const rateGainEl = document.getElementById("playRateGain");
  const titleEl = document.getElementById("playProfileTitle");
  const iconEl = document.getElementById("playPartnerIcon");

  if (nameEl) {
    nameEl.textContent = profile.username || "Player";
    applyRateRankMark(nameEl, profile.rate, profile.username);
  }

  if (rateEl) {
    rateEl.textContent = "RATE " + Number(profile.rate || 0).toFixed(1);
    applyRateColor(rateEl, profile.rate);
  }
  if (rateGainEl) {
    rateGainEl.textContent = "";
    rateGainEl.classList.remove("visible");
  }
  if (titleEl) {
    setPlayProfileTitleText(titleEl, profile.title || "新米プレイヤー");
    applyPlayProfileTitleAppearance(
      titleEl,
      profile.titleBackground || "yellow",
      profile.titleId || profile.title
    );
    applyPlayFractureTitleBadge(titleEl, saveData.unlockedTitles?.[profile.titleId]);
  }
if (iconEl) {
  iconEl.src = partner.icon;
  const scale = partner.iconScale || 1.0;
  iconEl.style.width = (72 * scale) + "px";
  iconEl.style.height = (72 * scale) + "px";

  const skillLine = document.getElementById("playSkillLine");
const skillLineText = document.getElementById("playSkillLineText");

const skillEnabled = isPartnerSkillEnabled();
const skill = partnerId === "Lyra" && isLyraSkillLocked(saveData)
  ? null
  : partner.skill;
const skillLineName = document.getElementById("playSkillLineName");

if (skillLine && skillLineText && skillLineName) {
  if (skillEnabled && skill) {
    skillLine.classList.remove("hidden");
    skillLineName.textContent = " " + (skill.name || "Partner Skill");
  } else {
    skillLine.classList.add("hidden");
    skillLineName.textContent = "";
  }
}}}

window.addEventListener("DOMContentLoaded", () => {
  loadPlayProfilePanel();
  startGame().catch(error => {
    console.error("Failed to load the game screen:", error);
    hideAssetLoadingScreen();
  });
});
