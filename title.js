const titleBGM = new Audio("sounds/title_bgm.mp3");
titleBGM.loop = true;
titleBGM.volume = 0.45;
const song19IntroSE = new Audio("sounds/song19intro.mp3");
song19IntroSE.preload = "auto";
song19IntroSE.volume = 0.9;
const challengeStartSE = new Audio("sounds/startsound.mp3");
challengeStartSE.preload = "auto";
challengeStartSE.volume = 0.8;

let leaving = false;
let endingDemoRunning = false;
let endingTyping = false;
let endingFullText = "";
let endingTimer = null;

const params = new URLSearchParams(window.location.search);
const endingDemo = params.get("endingDemo") === "1";
const boss3Retry = params.get("boss3Retry") === "1";
const fromSong18 = params.get("fromSong18") === "1";

function getSaveData() {
  return JSON.parse(localStorage.getItem("rhythmGame") || "{}");
}

function setSaveData(saveData) {
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
}

function consumeBoss3TitleDifficultySelection() {
  const saveData = getSaveData();
  if (
    !fromSong18 ||
    saveData.boss3UnlockChallengePending !== true ||
    saveData.boss3TitleDifficultySelectionSeen === true
  ) {
    return false;
  }
  saveData.boss3TitleDifficultySelectionSeen = true;
  setSaveData(saveData);
  return true;
}

function applyTitleBackground() {
  const saveData = getSaveData();
  const clearedDemo = saveData.storyFlags?.demoEndingSeen === true;
  const chapter3CreditsSeen = saveData.storyFlags?.chapter3CreditsSeen === true;

  const bg = chapter3CreditsSeen
    ? "assets/title/title_bg_3.png"
    : clearedDemo
      ? "assets/title/title_bg_after_demo.jpg"
      : "assets/title/title_bg.jpg";

  document.body.style.backgroundImage =
    `linear-gradient(rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.48)), url("${bg}")`;
}

function unlockAudio() {
  const silent = new Audio("sounds/silent.mp3"); // 無音ファイル
  silent.play().catch(() => {});
}
window.addEventListener("load", unlockAudio);


function playTitleBGM() {
  titleBGM.play().catch(() => {
    document.addEventListener("click", () => {
      titleBGM.play();
    }, { once: true });
  });
}

function getSong19MaxClearedDifficulty() {
  const saveData = getSaveData();
  const savedMaximum = Number(saveData.song19MaxClearedDifficulty);
  if (Number.isInteger(savedMaximum)) return Math.max(-1, Math.min(2, savedMaximum));
  if (saveData.boss3UnlockChallengeCleared === true) {
    return Math.max(0, Math.min(2, Number(saveData.boss3UnlockChallengeDifficulty) || 0));
  }
  return -1;
}

function prepareBoss3DifficultyChoices() {
  const maximumClearedDifficulty = getSong19MaxClearedDifficulty();
  document.querySelectorAll(".boss3DifficultyDiamond").forEach(button => {
    const difficulty = Number(button.dataset.difficulty);
    const canSkip = difficulty <= maximumClearedDifficulty;
    button.classList.toggle("skip", canSkip);
    const label = button.querySelector(".boss3DifficultyLabel");
    if (label) label.textContent = canSkip ? "SKIP▷" : "";
    button.setAttribute("aria-label", canSkip
      ? `${["BASIC", "EXPERT", "FRACTURE"][difficulty]}をスキップしてストーリーへ進む`
      : ["BASIC", "EXPERT", "FRACTURE"][difficulty]);
  });
}

function showBoss3DifficultyChoice(delayMs) {
  document.body.classList.add("boss3DifficultySelecting");
  prepareBoss3DifficultyChoices();
  setTimeout(() => {
    document.getElementById("boss3DifficultySelector")?.classList.add("visible");
    song19IntroSE.currentTime = 0;
    song19IntroSE.play().catch(error => {
      console.warn("song19intro play failed:", error);
    });
  }, delayMs);
}

function typeEndingText(text, onDone) {
  const el = document.getElementById("endingDemoText");
  if (!el) return;

  endingFullText = text;
  endingTyping = true;
  el.textContent = "";
  el.classList.add("visible");

  let index = 0;

  clearInterval(endingTimer);
  endingTimer = setInterval(() => {
    el.textContent += text[index];
    index++;

    if (index >= text.length) {
      clearInterval(endingTimer);
      endingTimer = null;
      endingTyping = false;
      if (onDone) onDone();
    }
  }, 45);
}

function showNormalTitle() {
  endingDemoRunning = false;

  const fade = document.getElementById("titleFadeOverlay");
  const logo = document.getElementById("titleLogo");
  const startText = document.getElementById("titleStartText");
  const endingText = document.getElementById("endingDemoText");

  if (endingText) {
    endingText.classList.remove("visible");
    endingText.textContent = "";
  }

  if (logo) logo.style.display = "";
  if (startText) startText.style.display = "";

  requestAnimationFrame(() => {
    fade.classList.add("fadeIn");
  });
}

function runEndingDemoSequence() {
  endingDemoRunning = true;

  const saveData = getSaveData();
  if (!saveData.storyFlags) saveData.storyFlags = {};
  saveData.storyFlags.demoEndingSeen = true;
  setSaveData(saveData);

  applyTitleBackground();

  const logo = document.getElementById("titleLogo");
  const startText = document.getElementById("titleStartText");

  if (logo) logo.style.display = "none";
  if (startText) startText.style.display = "none";

  playTitleBGM();

  const message =
    "Chapter1をプレイしていただきありがとうございます！\n" +
    "chapter2もぜひ！\n" +
    "感想や要望があれば教えていただけると励みになります！";

  setTimeout(() => {
    typeEndingText(message, () => {
      setTimeout(() => {
        showNormalTitle();
      }, 5000);
    });
  }, 3000);
}

window.addEventListener("DOMContentLoaded", () => {
  applyTitleBackground();

  const fade = document.getElementById("titleFadeOverlay");

  if (endingDemo) {
    // 暗転したままBGMだけ先に流し、少し待ってから文字表示
    fade.classList.remove("fadeIn");
    runEndingDemoSequence();
    return;
  }

  // 3-12から明示的に再挑戦した場合は、初回限定のtitle導線とは別扱い。
  if (boss3Retry && getSaveData().boss3UnlockChallengePending === true) {
    leaving = true;
    fade.classList.remove("fadeIn");
    showBoss3DifficultyChoice(850);
    return;
  }

  requestAnimationFrame(() => {
    fade.classList.add("fadeIn");
  });

  playTitleBGM();
});

document.getElementById("titleScreen").addEventListener("click", () => {
  if (leaving || endingDemoRunning) return;
  leaving = true;

  const fade = document.getElementById("titleFadeOverlay");

  titleBGM.pause();
  fade.classList.remove("fadeIn");
  fade.classList.add("fadeOut");

  if (consumeBoss3TitleDifficultySelection()) {
    showBoss3DifficultyChoice(1700);
    return;
  }

  setTimeout(() => {
    location.href = "select.html";
  }, 900);
});

let boss3DifficultyCommitted = false;

function playChallengeStartSoundToEnd(timeoutMs = 5000) {
  return new Promise(resolve => {
    let settled = false;
    let timeoutId = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      challengeStartSE.removeEventListener("ended", finish);
      challengeStartSE.removeEventListener("error", finish);
      resolve();
    };

    timeoutId = setTimeout(finish, timeoutMs);
    challengeStartSE.addEventListener("ended", finish, { once: true });
    challengeStartSE.addEventListener("error", finish, { once: true });
    challengeStartSE.currentTime = 0;
    challengeStartSE.play().catch(finish);
  });
}

document.querySelectorAll(".boss3DifficultyDiamond").forEach(button => {
  button.addEventListener("click", async () => {
    if (!document.getElementById("boss3DifficultySelector")?.classList.contains("visible")) return;
    if (boss3DifficultyCommitted) return;
    const difficulty = Number(button.dataset.difficulty);
    if (![0, 1, 2].includes(difficulty)) return;
    boss3DifficultyCommitted = true;

    const saveData = getSaveData();
    saveData.boss3UnlockChallengePending = false;
    const skipSong19 = button.classList.contains("skip");
    const destination = skipSong19
      ? "story.html?episode=chapter3_episode12"
      : `game.html?song=song19&difficulty=${difficulty}&storyChallenge=1&skipStoryIntro=1&boss3Challenge=1`;

    if (skipSong19) {
      saveData.boss3UnlockChallengeActive = false;
    } else {
      saveData.boss3UnlockChallengeActive = true;
      saveData.boss3UnlockChallengeDifficulty = difficulty;
    }
    setSaveData(saveData);

    document.getElementById("boss3DifficultySelector")?.classList.add("leaving");
    if (!skipSong19) {
      await playChallengeStartSoundToEnd();
    }
    location.href = destination;
  });
});

// ---- メニュー ----
const menuButton = document.getElementById("menuButton");
const menuOverlay = document.getElementById("menuOverlay");
const menuPopup = document.getElementById("menuPopup");
const creditButton = document.getElementById("creditButton");
const resetButton = document.getElementById("resetButton");
const creditOverlay = document.getElementById("creditOverlay");
const creditPopup = document.getElementById("creditPopup");
const creditClose = document.getElementById("creditClose");
const playerNameInput = document.getElementById("playerNameInput");
const playerNameSaveButton = document.getElementById("playerNameSaveButton");
const playerNameStatus = document.getElementById("playerNameStatus");
const developerUnlockName = "かいはつしゃ";
const developerNames = new Set(["ガラスニキ", "がらすにき", "glassniki"]);

function loadPlayerNameSetting() {
  const saveData = getSaveData();
  playerNameInput.value = saveData.profile?.username || "Player";
  playerNameStatus.textContent = "";
  playerNameStatus.classList.remove("error");
}

function savePlayerName() {
  const username = playerNameInput.value.trim();

  if (!username) {
    playerNameStatus.textContent = "名前を入力してください";
    playerNameStatus.classList.add("error");
    playerNameInput.focus();
    return;
  }

  const saveData = getSaveData();
  const currentUsername = saveData.profile?.username || "";

  if (developerNames.has(username) && currentUsername !== developerUnlockName) {
    playerNameStatus.textContent = "この名前は使用できません";
    playerNameStatus.classList.add("error");
    playerNameInput.focus();
    return;
  }

  if (!saveData.profile) saveData.profile = {};
  saveData.profile.username = username;
  setSaveData(saveData);

  playerNameInput.value = username;
  playerNameStatus.textContent = "保存しました";
  playerNameStatus.classList.remove("error");
}

menuButton.addEventListener("click", () => {
  loadPlayerNameSetting();
  menuOverlay.classList.remove("hidden");
  menuPopup.classList.remove("hidden");
});

playerNameSaveButton.addEventListener("click", savePlayerName);

playerNameInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  savePlayerName();
});

menuOverlay.addEventListener("click", () => {
  menuOverlay.classList.add("hidden");
  menuPopup.classList.add("hidden");
});

creditButton.addEventListener("click", () => {
  menuOverlay.classList.add("hidden");
  menuPopup.classList.add("hidden");
  creditOverlay.classList.remove("hidden");
  creditPopup.classList.remove("hidden");
});

creditClose.addEventListener("click", () => {
  creditOverlay.classList.add("hidden");
  creditPopup.classList.add("hidden");
});

creditOverlay.addEventListener("click", () => {
  creditOverlay.classList.add("hidden");
  creditPopup.classList.add("hidden");
});

resetButton.addEventListener("click", () => {
  if (confirm("本当にすべてのデータをリセットしますか？この操作は取り消せません。")) {

    const initialData = {
      storyFlags: {
        demoEndingSeen: false
      }
    };

    localStorage.setItem("rhythmGame", JSON.stringify(initialData));
    location.reload();
  }
});
