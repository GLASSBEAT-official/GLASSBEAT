const titleBGM = new Audio("sounds/title_bgm.mp3");
titleBGM.loop = true;
titleBGM.volume = 0.45;

let leaving = false;
let endingDemoRunning = false;
let endingTyping = false;
let endingFullText = "";
let endingTimer = null;

const params = new URLSearchParams(window.location.search);
const endingDemo = params.get("endingDemo") === "1";

function getSaveData() {
  return JSON.parse(localStorage.getItem("rhythmGame") || "{}");
}

function setSaveData(saveData) {
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
}

function applyTitleBackground() {
  const saveData = getSaveData();
  const clearedDemo = saveData.storyFlags?.demoEndingSeen === true;

  const bg = clearedDemo
    ? "assets/title/title_bg_after_demo.jpg"
    : "assets/title/title_bg.jpg";

  document.body.style.backgroundImage =
    `linear-gradient(rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.48)), url("${bg}")`;
}

function playTitleBGM() {
  titleBGM.play().catch(() => {
    document.addEventListener("click", () => {
      titleBGM.play();
    }, { once: true });
  });
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
    "デモ版をプレイしていただきありがとうございます！\n" +
    "続きは鋭意制作中です！\n" +
    "感想や要望があればぜひお聞かせください！";

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

  setTimeout(() => {
    location.href = "select.html";
  }, 900);
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

menuButton.addEventListener("click", () => {
  menuOverlay.classList.remove("hidden");
  menuPopup.classList.remove("hidden");
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
