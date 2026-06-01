import { CARD_DEFS, buildDeck } from "./cards.js";

function otherPlayerIndex(index) {
  return index === 0 ? 1 : 0;
}

export function createGame() {
  return {
    players: [
      { name: "あなた", isHuman: true, hand: [], discard: [], eliminated: false, protected: false },
      { name: "CPU", isHuman: false, hand: [], discard: [], eliminated: false, protected: false }
    ],
    deck: [],
    reincarnationCard: null,
    currentPlayer: 0,
    winner: null,
    turnCount: 0,
    waitingForAction: false,
    log: []
  };
}

export function startNewGame(state) {
  state.players.forEach((p) => {
    p.hand = [];
    p.discard = [];
    p.eliminated = false;
    p.protected = false;
  });

  state.deck = buildDeck();
  state.reincarnationCard = state.deck.pop() ?? null;
  state.currentPlayer = Math.floor(Math.random() * 2);
  state.winner = null;
  state.turnCount = 1;
  state.waitingForAction = true;
  state.log = [];

  draw(state, 0);
  draw(state, 1);
  draw(state, state.currentPlayer);

  pushLog(state, "ゲーム開始");
  pushLog(state, "転生札を1枚伏せました");
  pushLog(state, `${state.players[state.currentPlayer].name}の先攻です`);
}

export function getPublicState(state) {
  return {
    players: state.players.map((p) => ({
      name: p.name,
      isHuman: p.isHuman,
      handCount: p.hand.length,
      topCardName: p.hand[0]?.name ?? null,
      protected: p.protected,
      eliminated: p.eliminated
    })),
    deckCount: state.deck.length,
    currentPlayer: state.currentPlayer,
    winner: state.winner,
    turnCount: state.turnCount,
    waitingForAction: state.waitingForAction,
    log: [...state.log]
  };
}

export function getPlayerHand(state, playerIndex) {
  return state.players[playerIndex]?.hand.map((c) => ({ ...c })) ?? [];
}

export function getHumanHand(state) {
  return getPlayerHand(state, 0);
}

export function exportGameState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function importGameState(state, snapshot) {
  const cloned = JSON.parse(JSON.stringify(snapshot));
  state.players = cloned.players;
  state.deck = cloned.deck;
  state.reincarnationCard = cloned.reincarnationCard;
  state.currentPlayer = cloned.currentPlayer;
  state.winner = cloned.winner;
  state.turnCount = cloned.turnCount;
  state.waitingForAction = cloned.waitingForAction;
  state.log = cloned.log;
}

export function playCard(state, playerIndex, handIndex, ask) {
  if (state.winner !== null || !state.waitingForAction) {
    return;
  }

  if (state.currentPlayer !== playerIndex) {
    return;
  }

  const player = state.players[playerIndex];
  if (player.eliminated) {
    return;
  }

  const card = player.hand[handIndex];
  if (!card) {
    return;
  }

  if (card.value === 10 && player.hand.some((c, idx) => idx !== handIndex && c.value !== 10)) {
    pushLog(state, "英雄(10)は自分から捨てられません");
    return;
  }

  player.hand.splice(handIndex, 1);
  player.discard.push(card);
  pushLog(state, `${player.name}が ${card.value}:${card.name} を使用`);

  resolveCard(state, playerIndex, card, ask);
  if (state.winner !== null) {
    state.waitingForAction = false;
    return;
  }

  if (checkDeckEnd(state)) {
    state.waitingForAction = false;
    return;
  }

  nextTurn(state);
}

function nextTurn(state) {
  const next = otherPlayerIndex(state.currentPlayer);
  state.currentPlayer = next;
  state.turnCount += 1;

  const current = state.players[state.currentPlayer];
  current.protected = false;

  draw(state, state.currentPlayer);
  state.waitingForAction = true;

  pushLog(state, `${current.name}のターン`);
}

function resolveCard(state, playerIndex, card, ask) {
  const targetIndex = otherPlayerIndex(playerIndex);
  const player = state.players[playerIndex];
  const target = state.players[targetIndex];

  switch (card.value) {
    case 1: {
      const oneCount = countDiscardValue(state, 1);
      if (oneCount >= 2) {
        pushLog(state, "少年の革命が発動(公開処刑)");
        resolvePublicExecution(state, targetIndex, ask, "革命");
      } else {
        pushLog(state, "効果なし");
      }
      break;
    }
    case 10:
      pushLog(state, "英雄は効果を持ちません");
      break;
    case 2: {
      if (target.protected) {
        pushLog(state, "相手は加護中のため無効");
        break;
      }
      const raw = ask("兵士: 相手の手札数字を予想してください (1-10)", "5");
      const guess = Number(raw);
      const actual = target.hand[0]?.value;
      if (!Number.isInteger(guess) || guess < 1 || guess > 10) {
        pushLog(state, "予想が無効だったため不発");
        break;
      }
      if (actual === guess) {
        eliminate(state, targetIndex, "兵士の予想が的中");
      } else {
        pushLog(state, `予想外れ (${guess})`);
      }
      break;
    }
    case 3: {
      if (target.protected) {
        pushLog(state, "相手は加護中のため無効");
        break;
      }
      const seen = target.hand[0];
      if (!seen) {
        pushLog(state, "相手の手札がありません");
        break;
      }
      pushLog(state, `${player.name}は相手手札を確認: ${seen.value}:${seen.name}`);
      break;
    }
    case 4:
      player.protected = true;
      pushLog(state, `${player.name}は加護状態になった`);
      break;
    case 5: {
      if (target.protected) {
        pushLog(state, "相手は加護中のため無効");
        break;
      }
      draw(state, targetIndex);

      if (target.hand.length === 0) {
        pushLog(state, "相手の手札がありません");
        break;
      }

      const discardedIndex = Math.floor(Math.random() * target.hand.length);
      const discarded = target.hand.splice(discardedIndex, 1)[0];
      if (!discarded) {
        pushLog(state, "相手の手札がありません");
        break;
      }
      target.discard.push(discarded);
      pushLog(state, `${target.name}は裏向きで1枚捨てた`);
      if (discarded.value === 10) {
        if (!tryHeroRevival(state, targetIndex, "死神で英雄を捨てた")) {
          eliminate(state, targetIndex, "英雄を捨てた");
        }
      }
      break;
    }
    case 6: {
      if (target.protected) {
        pushLog(state, "相手は加護中のため無効");
        break;
      }
      const a = player.hand[0]?.value ?? 0;
      const b = target.hand[0]?.value ?? 0;
      if (a === b) {
        pushLog(state, `数字比べは引き分け (${a} vs ${b})`);
      } else if (a > b) {
        eliminate(state, targetIndex, `数字比べ ${a} vs ${b}`);
      } else {
        eliminate(state, playerIndex, `数字比べ ${a} vs ${b}`);
      }
      break;
    }
    case 7: {
      const drawn = [];
      for (let i = 0; i < 2; i += 1) {
        const c = state.deck.pop();
        if (c) {
          drawn.push(c);
        }
      }
      if (drawn.length === 0) {
        pushLog(state, "山札不足のため不発");
        break;
      }
      const candidates = [...player.hand, ...drawn];
      const guide = candidates.map((c, i) => `${i + 1}:${c.value}-${c.name}`).join(" / ");
      const raw = ask(`賢者: 残すカードを選択 (${guide})`, "1");
      let pick = Number(raw) - 1;
      if (!Number.isInteger(pick) || pick < 0 || pick >= candidates.length) {
        pick = 0;
      }
      player.hand = [candidates[pick]];
      const rest = candidates.filter((_, i) => i !== pick);
      while (rest.length > 0) {
        const idx = Math.floor(Math.random() * rest.length);
        state.deck.unshift(rest.splice(idx, 1)[0]);
      }
      pushLog(state, `${player.name}は手札を調整した`);
      break;
    }
    case 8: {
      if (target.protected) {
        pushLog(state, "相手は加護中のため無効");
        break;
      }
      const temp = player.hand;
      player.hand = target.hand;
      target.hand = temp;
      pushLog(state, "互いの手札を交換");
      break;
    }
    case 9: {
      if (target.protected) {
        pushLog(state, "相手は加護中のため無効");
        break;
      }
      resolvePublicExecution(state, targetIndex, ask, "皇帝");
      break;
    }
    default:
      break;
  }
}

function checkDeckEnd(state) {
  if (state.deck.length > 0) {
    return false;
  }

  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length !== 2) {
    return false;
  }

  const v0 = alive[0].hand[0]?.value ?? 0;
  const v1 = alive[1].hand[0]?.value ?? 0;

  if (v0 === v1) {
    state.winner = "draw";
    pushLog(state, `山札切れで引き分け (${v0} vs ${v1})`);
  } else {
    const winner = v0 > v1 ? alive[0] : alive[1];
    state.winner = winner.name;
    pushLog(state, `山札切れ: ${alive[0].name}(${v0}) vs ${alive[1].name}(${v1})`);
    pushLog(state, `${winner.name}の勝利`);
  }

  return true;
}

function eliminate(state, playerIndex, reason) {
  const p = state.players[playerIndex];
  p.eliminated = true;
  pushLog(state, `${p.name}が脱落 (${reason})`);

  const alive = state.players.filter((x) => !x.eliminated);
  if (alive.length === 1) {
    state.winner = alive[0].name;
    pushLog(state, `${alive[0].name}の勝利`);
  } else if (alive.length === 0) {
    state.winner = "draw";
    pushLog(state, "両者脱落で引き分け");
  }
}

function tryHeroRevival(state, playerIndex, reason) {
  const p = state.players[playerIndex];
  if (!p || p.eliminated) {
    return false;
  }

  if (!state.reincarnationCard) {
    return false;
  }

  p.hand = [state.reincarnationCard];
  state.reincarnationCard = null;
  pushLog(state, `${p.name}は転生札で復活 (${reason})`);
  return true;
}

function resolvePublicExecution(state, targetIndex, ask, sourceName) {
  const target = state.players[targetIndex];
  draw(state, targetIndex);

  if (target.hand.length <= 1) {
    pushLog(state, `${sourceName}: 山札不足で公開処刑は不発`);
    return;
  }

  const openInfo = target.hand.map((c, i) => `${i + 1}:${c.value}-${c.name}`).join(" / ");
  pushLog(state, `${sourceName}: ${target.name}の手札公開 -> ${openInfo}`);

  const dropIndex = chooseDiscardIndex(state, targetIndex, ask);
  const dropped = target.hand.splice(dropIndex, 1)[0];
  target.discard.push(dropped);
  pushLog(state, `${target.name}は ${dropped.value}:${dropped.name} を捨てた`);

  if (dropped.value === 10) {
    eliminate(state, targetIndex, `${sourceName}で英雄を捨てた`);
  }
}

function chooseDiscardIndex(state, targetIndex, ask) {
  const target = state.players[targetIndex];
  if (!target || target.hand.length <= 1) {
    return 0;
  }

  if (!target.isHuman) {
    let drop = 0;
    let minValue = target.hand[0].value;
    for (let i = 1; i < target.hand.length; i += 1) {
      if (target.hand[i].value < minValue) {
        minValue = target.hand[i].value;
        drop = i;
      }
    }
    return drop;
  }

  const guide = target.hand.map((c, i) => `${i + 1}:${c.value}-${c.name}`).join(" / ");
  const raw = ask(`公開処刑: 捨てるカード番号を選択 (${guide})`, "1");
  const idx = Number(raw) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= target.hand.length) {
    return 0;
  }
  return idx;
}

function countDiscardValue(state, value) {
  let count = 0;
  state.players.forEach((p) => {
    p.discard.forEach((c) => {
      if (c.value === value) {
        count += 1;
      }
    });
  });
  return count;
}

function draw(state, playerIndex) {
  const c = state.deck.pop();
  if (c) {
    state.players[playerIndex].hand.push(c);
  }
}

function pushLog(state, text) {
  state.log.push(text);
  if (state.log.length > 200) {
    state.log = state.log.slice(-200);
  }
}

export function cpuChooseAction(state) {
  const cpu = state.players[1];
  if (!cpu || cpu.hand.length === 0) {
    return 0;
  }

  // ざっくり戦略: 低い数字を優先して使用。
  let minIndex = 0;
  let minValue = cpu.hand[0].value;
  for (let i = 1; i < cpu.hand.length; i += 1) {
    if (cpu.hand[i].value < minValue) {
      minValue = cpu.hand[i].value;
      minIndex = i;
    }
  }
  return minIndex;
}

export function cpuAsk(message, fallback = "1") {
  if (message.includes("予想")) {
    return String(1 + Math.floor(Math.random() * 10));
  }
  if (message.includes("残すカード")) {
    return fallback;
  }
  return fallback;
}

export function humanAsk(message, fallback = "") {
  try {
    if (typeof window.prompt === "function") {
      return window.prompt(message, fallback) ?? fallback;
    }
  } catch {
    // Some embedded browsers disable prompt.
  }
  return fallback;
}

export function getCardDefs() {
  return CARD_DEFS;
}
