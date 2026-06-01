export const CARD_DEFS = {
  1: {
    value: 1,
    name: "少年",
    count: 2,
    text: "2枚目が捨て札に出たら革命（公開処刑）",
    artPath: "./assets/cards/card-1.svg"
  },
  2: {
    value: 2,
    name: "兵士",
    count: 2,
    text: "相手の手札数字を予想。的中で脱落",
    artPath: "./assets/cards/card-2.svg"
  },
  3: {
    value: 3,
    name: "占い師",
    count: 2,
    text: "相手の手札を見る",
    artPath: "./assets/cards/card-3.svg"
  },
  4: {
    value: 4,
    name: "乙女",
    count: 2,
    text: "次の自分の手番まで加護",
    artPath: "./assets/cards/card-4.svg"
  },
  5: {
    value: 5,
    name: "死神",
    count: 2,
    text: "相手に1枚引かせ、2枚から1枚を捨てさせる",
    artPath: "./assets/cards/card-5.svg"
  },
  6: {
    value: 6,
    name: "貴族",
    count: 1,
    text: "手札の数字比べ。低い方が脱落",
    artPath: "./assets/cards/card-6.svg"
  },
  7: {
    value: 7,
    name: "賢者",
    count: 2,
    text: "手札を調整する",
    artPath: "./assets/cards/card-7.svg"
  },
  8: {
    value: 8,
    name: "精霊",
    count: 2,
    text: "相手と手札を交換",
    artPath: "./assets/cards/card-8.svg"
  },
  9: {
    value: 9,
    name: "皇帝",
    count: 1,
    text: "相手の手札を公開し、相手に1枚引かせる",
    artPath: "./assets/cards/card-9.svg"
  },
  10: {
    value: 10,
    name: "英雄",
    count: 1,
    text: "自分では捨てられない。捨てさせられた時は転生判定",
    artPath: "./assets/cards/card-10.svg"
  }
};

export function buildDeck() {
  const deck = [];

  for (const def of Object.values(CARD_DEFS)) {
    for (let i = 0; i < def.count; i += 1) {
      deck.push({ ...def });
    }
  }

  return shuffle(deck);
}

function shuffle(cards) {
  const arr = [...cards];

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}
