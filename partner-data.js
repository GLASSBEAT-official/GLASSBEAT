// パートナーの追加・設定変更はこの定義だけを編集する。
window.partners = {
  breaka: {
    name: "ブレイカ",
    icon: "images/partners/breaka_icon.png",
    full: "images/partners/breaka_full.png",
    iconScale: 1.0,
    fullScale: 1.1,
    resultBottom: 20,
    messages: [
      "どうも。よろしくね。",
      "まあ、せいぜい頑張りなよ。",
      "...眠いな...",
      "私と話してても面白くないよ。",
      "そんなに触りたいの？"
    ],
    expTable: [
      100, 120, 150, 180, 220, 270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170, 1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120, 3370, 3630, 3900, 4180
    ],
    skill: {
      type: "timedHeal",
      count: 2,
      amount: 500,
      name: "ヒールソング",
      description: "楽曲中に2回、ライフを500回復する"
    }
  },
  canon: {
    name: "カノン",
    icon: "images/partners/canon_icon.png",
    full: "images/partners/canon_full.png",
    eventFull: "images/partners/canon_event.png",
    iconScale: 0.80,
    fullScale: 0.9,
    resultScale: 0.85,
    resultBottom: 0,
    messages: [
      "プレイヤーさん！やっほー！",
      "一緒に歌うの楽しみだな～",
      "わたしのうち、花屋さんやってるんだよね！",
      "きみはどんな歌が好き？",
      "それじゃあ、頑張ろうね！"
    ],
    expTable: [
      100, 120, 150, 180, 220, 270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170, 1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120, 3370, 3630, 3900, 4180
    ],
    skill: null
  },
  katy: {
    name: "ケイティ",
    icon: "images/partners/katy_icon.png",
    full: "images/partners/katy_full.png",
    iconScale: 0.82,
    fullScale: 1.05,
    resultBottom: 20,
    messages: [
      "英語の先生をやっています。",
      "一緒に楽しみましょう。",
      "トライアスロンが趣味なの。",
      "こう見えて体育会系なんですよ？",
      "Please call me Katy!"
    ],
    expTable: [
      100, 120, 150, 180, 220, 270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170, 1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120, 3370, 3630, 3900, 4180
    ],
    skill: {
      type: "judgementRecovery",
      minJudge: "perfect",
      amount: 1,
      name: "Keep Going!",
      description: "Perfectを出すたびにライフをわずかに回復"
    }
  },
  isabel: {
    name: "イザベル",
    icon: "images/partners/isabel_icon.png",
    full: "images/partners/isabel_full.png",
    iconScale: 1.0,
    fullScale: 1.0,
    resultScale: 0.85,
    resultBottom: -20,
    unlock: {
      type: "storyRead",
      storyId: "chapter2_episode7"
    },
    messages: [
      "これからよろしくね。",
      "あなたの演奏、期待してるよ。",
      "難しくても、諦めないで。",
      "…わたしのこと？まあ、おいおいね。"
    ],
    expTable: [
      100, 120, 150, 180, 220, 270, 330, 400, 480, 570,
      670, 780, 900, 1030, 1170, 1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120, 3370, 3630, 3900, 4180
    ],
    skill: {
      type: "mirrorChart",
      name: "鏡写しの音色",
      description: "譜面の配置を左右反転する"
    }
  },
  kai: {
    name: "カイ",
    icon: "images/partners/kai_icon.png",
    full: "images/partners/kai_full.png",
    iconScale: 0.82,
    fullScale: 1.0,
    resultScale: 0.90,
    resultBottom: -20,
    unlock: {
      type: "storyRead",
      storyId: "chapter4_episode0"
    },
    messages: [
      "僕の名前はカイ。よろしく。",
      "朝は苦手でさ。いつもお母さんに起こされるよ。",
      "イザベルさん？ちょっと怖いけど、優しい人だと思う。",
      "教会の鐘って、近くで聞くと意外とうるさいんだ。",
      "歌の練習、一緒に頑張ろう。"
    ],
    expTable: [
      110, 140, 180, 220, 270, 330, 400, 480, 570, 670,
      780, 900, 1030, 1170, 1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120, 3370, 3630, 3900, 4180, 4400
    ],
    skill: {
      type: "timedHeal",
      count: 3,
      amount: 210,
      amountPerLevel: 10,
      name: "癒しの聖歌",
      description: "楽曲中に3回、ライフを{amount}回復する\nレベルが1上がるごとに回復量＋10"
    }
  },
  Lyra: {
    name: "リラ",
    icon: "images/partners/lyra_icon.png",
    full: "images/partners/lyra_full.png",
    iconScale: 0.82,
    fullScale: 1.0,
    resultScale: 0.90,
    resultBottom: -20,
    unlock: {
      type: "storyRead",
      storyId: "chapter4_episode3"
    },
    messages: [
      "特に言うことはないわ。",
      "名前？見ればわかるでしょ。",
      "歌？まあ、嫌いじゃないわよ。"
    ],
    expTable: [
      110, 140, 180, 220, 270, 330, 400, 480, 570, 670,
      780, 900, 1030, 1170, 1320, 1480, 1650, 1830, 2020,
      2220, 2430, 2650, 2880, 3120, 3370, 3630, 3900, 4180, 4400
    ],
    skill: {
      type: "emergencyHeal",
      threshold: 200,
      amount: 1000,
      name: "起死回生",
      description: "残りライフが200を切ったとき、一度だけライフを1000回復する"
    }
  }
};

window.getPartnerSkillAmount = function getPartnerSkillAmount(partnerId, level = 1) {
  const skill = window.partners?.[partnerId]?.skill;
  if (!skill) return 0;
  const normalizedLevel = Math.max(1, Math.min(30, Number(level) || 1));
  return Number(skill.amount || 0) + Number(skill.amountPerLevel || 0) * (normalizedLevel - 1);
};

window.getPartnerSkillDescription = function getPartnerSkillDescription(partnerId, level = 1) {
  const skill = window.partners?.[partnerId]?.skill;
  if (!skill) return "";
  return String(skill.description || "").replaceAll(
    "{amount}",
    String(window.getPartnerSkillAmount(partnerId, level))
  );
};
