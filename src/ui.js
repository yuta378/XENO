export function bindUI(onNewGame, onPlayCard) {
  const nodes = {
    cpuStatus: document.getElementById("cpu-status"),
    cpuHand: document.getElementById("cpu-hand"),
    cpuProtect: document.getElementById("cpu-protect"),
    deckCount: document.getElementById("deck-count"),
    turnInfo: document.getElementById("turn-info"),
    playerStatus: document.getElementById("player-status"),
    playerProtect: document.getElementById("player-protect"),
    playerHand: document.getElementById("player-hand"),
    log: document.getElementById("log"),
    newGame: document.getElementById("new-game")
  };

  nodes.newGame.addEventListener("click", onNewGame);

  function render(state, humanHand) {
    const cpu = state.players[1];
    const me = state.players[0];

    nodes.cpuStatus.textContent = `${cpu.name} / 状態: ${cpu.eliminated ? "脱落" : "生存"}`;
    nodes.cpuHand.textContent = `手札: ${cpu.handCount > 0 ? "?" : "なし"}`;
    nodes.cpuProtect.textContent = `加護: ${cpu.protected ? "あり" : "なし"}`;

    nodes.playerStatus.textContent = `${me.name} / 状態: ${me.eliminated ? "脱落" : "生存"}`;
    nodes.playerProtect.textContent = `加護: ${me.protected ? "あり" : "なし"}`;

    nodes.deckCount.textContent = `山札: ${state.deckCount}`;
    nodes.turnInfo.textContent = `ターン: ${state.turnCount} / 手番: ${state.players[state.currentPlayer].name}`;

    nodes.playerHand.innerHTML = "";
    const hasAlternativeToHero = humanHand.some((c) => c.value !== 10);
    humanHand.forEach((card, idx) => {
      const btn = document.createElement("button");
      btn.className = "card-btn";

      const art = document.createElement("img");
      art.className = "card-art";
      art.src = card.artPath;
      art.alt = `${card.value}: ${card.name}`;

      const label = document.createElement("span");
      label.className = "card-label";
      label.textContent = `${card.value}: ${card.name}`;

      const effect = document.createElement("span");
      effect.className = "card-effect";
      effect.textContent = card.text;

      btn.appendChild(art);
      btn.appendChild(label);
      btn.appendChild(effect);

      const playable = state.winner === null && state.currentPlayer === 0 && state.waitingForAction;
      const heroLocked = card.value === 10 && hasAlternativeToHero;
      btn.disabled = !playable || heroLocked;
      btn.title = card.text;
      btn.addEventListener("click", () => onPlayCard(idx));
      nodes.playerHand.appendChild(btn);
    });

    const winnerText =
      state.winner === null ? null : state.winner === "draw" ? "引き分け" : `${state.winner}の勝利`;

    const allLogs = [...state.log];
    if (winnerText) {
      allLogs.push(`=== 終了: ${winnerText} ===`);
    }

    nodes.log.innerHTML = "";
    allLogs.slice(-80).forEach((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      if (line.includes("勝利")) {
        p.className = "info-ok";
      }
      if (line.includes("脱落")) {
        p.className = "info-danger";
      }
      nodes.log.appendChild(p);
    });

    nodes.log.scrollTop = nodes.log.scrollHeight;
  }

  return { render };
}
