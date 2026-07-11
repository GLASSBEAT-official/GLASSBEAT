const setupScreen = document.getElementById("setupScreen");
const tutorialScreen = document.getElementById("tutorialScreen");
const usernameInput = document.getElementById("usernameInput");
const nameNextButton = document.getElementById("nameNextButton");

const tutorialImage = document.getElementById("tutorialImage");
const tutorialTitle = document.getElementById("tutorialTitle");
const tutorialText = document.getElementById("tutorialText");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");

let tutorialIndex = 0;

const tutorials = [
  {
    image: "images/tutorial1.png",
    title: "ノーツをタイミングよく叩こう",
    text: "ノーツが判定ラインに重なった瞬間に、対応するキーを押します。\nキーの配置は、設定で変更可能です。"
  },
  {
    image: "images/tutorial2.png",
    title: "ロングノーツは押し続けよう",
    text: "ロングノーツは始点で押して、終点までキーを離さないようにします。"
  },
  {
    image: "images/tutorial3.png",
    title: "デュアルノーツはどれか1つのレーンを叩こう",
    text: "またがっているレーンなら、どこを押しても判定されます"
  },
   {
    image: "images/tutorial5.png",
    title: "楽曲終了時にライフが残っていたらクリア！",
    text: "ミスが出るとライフが減っていきます。"
  },
  {
    image: "images/tutorial4.png",
    title: "パートナーを設定してみよう",
    text: "初期状態では、3人のパートナーを選択可能です。\n選曲画面左下のアイコンを押してください。"
  }
  
  
];

function getSaveData() {
  return JSON.parse(localStorage.getItem("rhythmGame") || "{}");
}

function saveProfile(username, tutorialDone) {
  const saveData = getSaveData();

  saveData.profile = {
    ...(saveData.profile || {}),
    username,
    partner: saveData.profile?.partner || null,
    rate: saveData.profile?.rate || 0,
    tutorialDone
  };

  localStorage.setItem("rhythmGame", JSON.stringify(saveData));
}

function showTutorial() {
  const tutorial = tutorials[tutorialIndex];

  tutorialImage.src = tutorial.image;
  tutorialTitle.textContent = tutorial.title;
  tutorialText.textContent = tutorial.text;

  if (tutorialIndex === 0) {
  prevButton.classList.add("disabled");
} else {
  prevButton.classList.remove("disabled");
}

  if (tutorialIndex === tutorials.length - 1) {
  nextButton.textContent = "はじめる";
  nextButton.classList.add("startMode");
} else {
  nextButton.textContent = "次へ";
  nextButton.classList.remove("startMode");
}

}

nameNextButton.addEventListener("click", () => {
  const username = usernameInput.value.trim();

  if (!username) {
    usernameInput.focus();
    return;
  }

  saveProfile(username, false);

  setupScreen.classList.remove("active");
  tutorialScreen.classList.add("active");

  showTutorial();
});

prevButton.addEventListener("click", () => {
  if (tutorialIndex > 0) {
    tutorialIndex--;
    showTutorial();
  }
});

nextButton.addEventListener("click", () => {
  if (tutorialIndex < tutorials.length - 1) {
    tutorialIndex++;
    showTutorial();
    return;
  }

  const saveData = getSaveData();
  const username = saveData.profile?.username || "Player";

  saveProfile(username, true);

  location.href = "select.html";
});

const bgm = document.getElementById("bgm");

// ページ読み込み後に再生
window.addEventListener("load", () => {
  bgm.volume = 0.5; // 音量調整（0〜1）
  bgm.play();
});