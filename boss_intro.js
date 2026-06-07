const params = new URLSearchParams(window.location.search);
let selectedDifficulty = Number(params.get("difficulty")) || 0;

const BOSS_ID = "boss";
const INTRO_AUDIO = `songs/${BOSS_ID}/intro.wav`;
const AUDIO_START_MS = 2000;

const TYPE_TEXT = "And So, a New Journey Begins.";
const TYPE_INTERVAL_MS = 180;

// ここはあとで音源を聴きながら調整
const TEXT_START_MS = 2000;
const WHITE_FLASH_MS = 8500;
const PANEL_SHOW_MS = 9250;
const FORCE_START_MS = 28000;

const introBg = document.getElementById("introBg");
const darkLayer = document.getElementById("darkLayer");
const noiseLayer = document.getElementById("noiseLayer");
const whiteFlash = document.getElementById("whiteFlash");
const burstFlash = document.getElementById("burstFlash");
const introText = document.getElementById("introText");
const bossPanel = document.getElementById("bossPanel");
const bossTitle = document.getElementById("bossTitle");
const bossArtist = document.getElementById("bossArtist");
const buttonsEl = document.getElementById("bossDifficultyButtons");
const startNoise = document.getElementById("startNoise");
const startDark = document.getElementById("startDark");

const introAudio = new Audio(INTRO_AUDIO);

async function loadBossInfo() {
  const response = await fetch(`songs/${BOSS_ID}/info.json`);
  const info = await response.json();

  bossTitle.textContent = info.title;
  bossArtist.textContent = info.artist;

  if (selectedDifficulty >= info.charts.length) {
    selectedDifficulty = info.charts.length - 1;
  }

  buttonsEl.innerHTML = "";

  info.charts.forEach((chart, index) => {
  const btn = document.createElement("button");
  btn.classList.add("diffBtn", "diff-" + chart.difficulty.toLowerCase());

  if (index === selectedDifficulty) {
    btn.classList.add("selected");
  }

  btn.innerHTML = `
    <div class="diffFrame">
      <div class="diffBar"></div>
      <div class="diffName">${chart.difficulty}</div>
    </div>
    <div class="diffLevel">${chart.level}</div>
  `;

  // fractureのレベル数字だけ特別スタイル
  if (chart.difficulty.toLowerCase() === "fracture") {
    const levelEl = btn.querySelector(".diffLevel");
    levelEl.style.letterSpacing = "3px";
    levelEl.style.fontSize = "40px";
  }

  btn.addEventListener("click", () => {
    selectedDifficulty = index;
    document.querySelectorAll(".diffBtn").forEach((b, i) => {
      b.classList.toggle("selected", i === index);
    });
  });
    buttonsEl.appendChild(btn);
  });
}

function typeIntroText() {
  introText.textContent = "";

  [...TYPE_TEXT].forEach((char, index) => {
    setTimeout(() => {
      introText.textContent += char;
    }, index * TYPE_INTERVAL_MS);
  });
}

function flashWhite() {
  whiteFlash.classList.add("active");

  setTimeout(() => {
    whiteFlash.classList.remove("active");
    burstFlash.classList.remove("active");
    void burstFlash.offsetWidth;
    burstFlash.classList.add("active");
  }, 650);
}

function showBossPanel() {
  introText.classList.add("hiddenText");
  introBg.classList.add("visible");
  darkLayer.classList.add("fade");
  noiseLayer.classList.add("active");

  bossPanel.classList.remove("hidden");

  requestAnimationFrame(() => {
    bossPanel.classList.add("visible");
  });

  setTimeout(() => {
    noiseLayer.classList.remove("active");
  }, 900);
}

function forceStartBoss() {
  startNoise.classList.add("active");
  startDark.classList.add("active");

  setTimeout(() => {
    location.href =
      `index.html?song=${BOSS_ID}&difficulty=${selectedDifficulty}&bossChallenge=1&autoStart=1`;
  }, 2500);
}

async function startIntro() {
  await loadBossInfo();

  setTimeout(() => {
  introAudio.currentTime = 0;
  introAudio.play().catch(e => {
    console.error("intro play failed:", e);
  });
}, AUDIO_START_MS);

  setTimeout(() => {
    typeIntroText();
  }, TEXT_START_MS);

  setTimeout(() => {
    flashWhite();
  }, WHITE_FLASH_MS);

  setTimeout(() => {
    showBossPanel();
  }, PANEL_SHOW_MS);

  setTimeout(() => {
    forceStartBoss();
  }, FORCE_START_MS);
}

startIntro();