// スタッフロールの文章はこの配列を編集してください。
// title が役職・見出し、names がその下に表示する文章です。
const STAFF_ROLL_SECTIONS = [
  {
    title: "GLASSBEAT",
    names: ["Chapter 1～3"]
  },

  {
    title: "MUSIC",
    names: ["EN_OKAWA","MFP","YaGiYa music",
      "魔王魂","mn free music","さんうさぎ","M-ART","Regu","龍崎一","kuku",
      "UcchiiØ-うっちーぜろ-","Tak_mfk","gooset","Peritune","nons works",
      "流星のサイトシーイング","Hareno","Kyatto","Popoti","えだまめ88",
      "リイカ","zippy","keogh","O_koge",
    ]
  },
  {title: "BGM",
    names: ["佐土原隼人","hitoshi by Senses Circuit","Tak_mfk","shimtone","Low"]
  },
  {title:"sound",
    names:["効果音ラボ","音人","pixabay","ニコニ・コモンズ"]
  },
  {title: "Ending Theme",
    names: ["「Coolness」by Fukagawa"]
  },
  {
    title: "TEST PLAY",
    names: ["かつらにき", "いかっち"]
  },
  {
    title: "DEVELOPMENT",
    names: ["glassniki"]
  },
  {
    title: "SPECIAL THANKS",
    names: ["O_koge","KT","Nagi","Castor","Lume","And You"]
  },
  {
    title: "",
    names: ["Thank you for playing！"]
  }
];

const creditsTrack = document.getElementById("creditsTrack");
const creditsFade = document.getElementById("creditsFade");
const creditsSkip = document.getElementById("creditsSkip");
const creditsBgm = new Audio("sounds/chapter3end.mp3");

creditsBgm.loop = true;
creditsBgm.volume = 0.45;

let creditsStarted = false;
let creditsFinished = false;
let creditsAnimation = null;
let creditsBgmStarted = false;
const CREDITS_EXIT_FADE_MS = 3200;

function renderStaffRoll() {
  const fragment = document.createDocumentFragment();
  STAFF_ROLL_SECTIONS.forEach(section => {
    const sectionElement = document.createElement("section");
    sectionElement.className = "creditsSection";

    if (section.title) {
      const title = document.createElement("h2");
      title.className = "creditsTitle";
      title.textContent = section.title;
      sectionElement.appendChild(title);
    }

    (section.names || []).forEach(text => {
      const name = document.createElement("p");
      name.className = "creditsName";
      name.textContent = text;
      sectionElement.appendChild(name);
    });
    fragment.appendChild(sectionElement);
  });

  // 最後のメッセージに続けてGlassBeatロゴも同じトラック上を流す。
  const logoSection = document.createElement("section");
  logoSection.className = "creditsLogoSection";
  const logo = document.createElement("img");
  logo.className = "creditsLogo";
  logo.src = "assets/title/logo.png";
  logo.alt = "GlassBeat";
  logoSection.appendChild(logo);
  fragment.appendChild(logoSection);

  creditsTrack.replaceChildren(fragment);
}

function finishCredits() {
  if (creditsFinished) return;
  creditsFinished = true;
  const saveData = JSON.parse(localStorage.getItem("rhythmGame") || "{}");
  if (!saveData.storyFlags) saveData.storyFlags = {};
  saveData.storyFlags.chapter3CreditsSeen = true;
  saveData.song26Unlocked = true;
  localStorage.setItem("rhythmGame", JSON.stringify(saveData));

  // cancelするとtransformが初期位置へ戻り、暗転直前に全文が再表示されるため、
  // 現在位置を保ったまま停止する。
  creditsAnimation?.pause();
  creditsFade.classList.remove("visible");
  creditsFade.classList.add("leaving");

  const initialVolume = creditsBgm.volume;
  const fadeStartedAt = performance.now();
  const fadeBgm = now => {
    const progress = Math.min(1, (now - fadeStartedAt) / CREDITS_EXIT_FADE_MS);
    creditsBgm.volume = initialVolume * (1 - progress);
    if (progress < 1) {
      requestAnimationFrame(fadeBgm);
    } else {
      creditsBgm.pause();
    }
  };
  requestAnimationFrame(fadeBgm);

  setTimeout(() => {
    location.href = "title.html";
  }, CREDITS_EXIT_FADE_MS + 120);
}

function startRoll() {
  if (creditsStarted) return;
  creditsStarted = true;
  document.body.classList.add("creditsRolling");
  requestAnimationFrame(() => {
    const lastContent = creditsTrack.lastElementChild;
    const lastContentBottom = lastContent
      ? lastContent.offsetTop + lastContent.offsetHeight
      : creditsTrack.scrollHeight;
    // 上端のマスクでロゴがほぼ消えた時点から暗転へ入る。track下部の余白は待たない。
    const endOffset = Math.max(0, lastContentBottom - window.innerHeight * 0.08);
    const travelDistance = window.innerHeight + endOffset;
    const duration = Math.max(30000, travelDistance / 42 * 1000);
    creditsAnimation = creditsTrack.animate(
      [
        { transform: `translateY(${window.innerHeight}px)` },
        { transform: `translateY(-${endOffset}px)` }
      ],
      { duration, easing: "linear", fill: "forwards" }
    );
    creditsAnimation.finished.then(finishCredits).catch(() => {});
  });
}

function tryStartCreditsBgm() {
  if (creditsBgmStarted) return;
  creditsBgm.play()
    .then(() => {
      creditsBgmStarted = true;
    })
    .catch(() => {});
}

function beginCredits() {
  startRoll();
  tryStartCreditsBgm();
}

renderStaffRoll();
requestAnimationFrame(() => creditsFade.classList.add("visible"));
beginCredits();

// 自動再生が制限された環境では、最初のユーザー操作でBGMだけ再試行する。
document.addEventListener("pointerdown", tryStartCreditsBgm, { once: true });
creditsSkip.addEventListener("click", finishCredits);
document.addEventListener("keydown", event => {
  tryStartCreditsBgm();
  if (event.code === "Escape") finishCredits();
});
