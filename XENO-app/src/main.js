import {
  createGame,
  exportGameState,
  getPlayerHand,
  getPublicState,
  humanAsk,
  importGameState,
  playCard,
  startNewGame
} from "./game.js";
import { bindUI } from "./ui.js";
import {
  auth,
  db,
  isFirebaseReady,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  onSnapshot,
  serverTimestamp,
  deleteDoc
} from "./firebase.js";

const game = createGame();

const app = {
  uid: "",
  username: "",
  roomId: "",
  role: "none",
  localPlayerIndex: 0,
  roomUnsub: null,
  roomVersion: 0,
  winnerHandled: false,
  firebaseReady: isFirebaseReady()
};

const topScreen = document.getElementById("top-screen");
const waitingScreen = document.getElementById("waiting-screen");
const battleScreen = document.getElementById("battle-screen");

const registerUsername = document.getElementById("register-username");
const registerUserBtn = document.getElementById("register-user");

const loginUserSelect = document.getElementById("login-user-select");
const reloadUsersBtn = document.getElementById("reload-users");
const loginUserBtn = document.getElementById("login-user");

const authMessage = document.getElementById("auth-message");
const matchResult = document.getElementById("match-result");
const currentUserLabel = document.getElementById("current-user");
const logoutUserBtn = document.getElementById("logout-user");

const roomIdInput = document.getElementById("room-id");
const createRoomBtn = document.getElementById("create-room");
const joinRoomBtn = document.getElementById("join-room");
const leaveRoomBtn = document.getElementById("leave-room");
const roomStatus = document.getElementById("room-status");

const ui = bindUI(handleRematch, handlePlayCard);

registerUserBtn.addEventListener("click", handleRegisterUser);
reloadUsersBtn.addEventListener("click", loadUserList);
loginUserBtn.addEventListener("click", handleLoginUserFromList);
logoutUserBtn.addEventListener("click", handleLogoutUser);
createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
leaveRoomBtn.addEventListener("click", leaveRoomAndGoTop);

if (!app.firebaseReady) {
  setAuthMessage("Firebase未設定です。firebase-config.js を設定してください。", true);
  disableAuthControls();
} else {
  onAuthStateChanged(auth, (user) => {
    app.uid = user?.uid ?? "";
    refreshTopControls();
  });

  signInAnonymously(auth)
    .then(() => {
      setAuthMessage("ユーザーを作成または一覧から選択してログインしてください。", false);
      loadUserList();
    })
    .catch((err) => {
      setAuthMessage(`Firebase接続エラー: ${toReadableAuthError(err?.code)}`, true);
      disableAuthControls();
    });
}

function handleRegisterUser() {
  if (!app.firebaseReady) {
    return;
  }

  const username = normalizeUsername(registerUsername.value);
  if (!username) {
    setAuthMessage("ユーザー名を入力してください。", true);
    return;
  }

  const userRef = doc(db, "users_public", username);
  runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.exists()) {
      throw new Error("USER_EXISTS");
    }

    tx.set(userRef, {
      username,
      createdAt: serverTimestamp()
    });
  })
    .then(() => {
      registerUsername.value = "";
      setAuthMessage(`ユーザー ${username} を作成しました。`, false);
      loadUserList(username);
    })
    .catch((err) => {
      if (err?.message === "USER_EXISTS") {
        setAuthMessage("そのユーザー名は既に使われています。", true);
        return;
      }
      setAuthMessage("ユーザー作成に失敗しました。", true);
    });
}

function loadUserList(selectName = "") {
  if (!app.firebaseReady) {
    return;
  }

  const q = query(collection(db, "users_public"), orderBy("username"));
  getDocs(q)
    .then((snap) => {
      const names = snap.docs.map((d) => d.data().username).filter(Boolean);
      renderLoginUserOptions(names, selectName);
    })
    .catch(() => {
      setAuthMessage("ユーザー一覧の取得に失敗しました。", true);
    });
}

function renderLoginUserOptions(names, selectName = "") {
  loginUserSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = names.length > 0 ? "ユーザーを選択" : "ユーザー未作成";
  loginUserSelect.appendChild(placeholder);

  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    loginUserSelect.appendChild(opt);
  });

  if (selectName && names.includes(selectName)) {
    loginUserSelect.value = selectName;
  } else {
    loginUserSelect.value = "";
  }
}

function handleLoginUserFromList() {
  const selected = normalizeUsername(loginUserSelect.value);
  if (!selected) {
    setAuthMessage("ログインするユーザーを選択してください。", true);
    return;
  }

  app.username = selected;
  currentUserLabel.textContent = `ログイン中: ${app.username}`;
  setAuthMessage(`ログイン成功: ${selected}`, false);
  matchResult.textContent = "";
  refreshTopControls();
}

function handleLogoutUser() {
  if (app.roomId) {
    disconnectRoom();
  }

  app.username = "";
  setAuthMessage("ログアウトしました。", false);
  matchResult.textContent = "";
  refreshTopControls();
  showScreen("top");

  if (auth) {
    signOut(auth)
      .then(() => signInAnonymously(auth))
      .catch(() => {
        // Ignore transient sign-out errors.
      });
  }
}

function createRoom() {
  if (!ensureLoggedIn()) {
    return;
  }

  const roomId = sanitizeRoomId(roomIdInput.value);
  if (!roomId) {
    setAuthMessage("ルームIDは1〜9で入力してください。", true);
    return;
  }

  const roomRef = doc(db, "rooms", roomId);

  runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef);
    if (snap.exists() && snap.data().status !== "finished") {
      throw new Error("ROOM_EXISTS");
    }

    tx.set(roomRef, {
      roomId,
      status: "waiting",
      hostUid: app.uid,
      hostName: app.username,
      guestUid: null,
      guestName: null,
      gameState: null,
      version: 0,
      currentTurnUid: null,
      winnerName: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  })
    .then(() => {
      app.role = "host";
      app.localPlayerIndex = 0;
      attachRoomListener(roomId);
      setRoomStatus(`ルーム ${roomId} を作成しました。参加待ちです。`);
      showScreen("waiting");
    })
    .catch((err) => {
      if (err?.message === "ROOM_EXISTS") {
        setAuthMessage(`ルーム ${roomId} はすでに使用中です。`, true);
      } else {
        setAuthMessage("ルーム作成に失敗しました。", true);
      }
    });
}

function joinRoom() {
  if (!ensureLoggedIn()) {
    return;
  }

  const roomId = sanitizeRoomId(roomIdInput.value);
  if (!roomId) {
    setAuthMessage("ルームIDは1〜9で入力してください。", true);
    return;
  }

  const roomRef = doc(db, "rooms", roomId);

  runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists()) {
      throw new Error("ROOM_NOT_FOUND");
    }

    const data = snap.data();
    if (data.status !== "waiting" || data.guestUid) {
      throw new Error("ROOM_UNAVAILABLE");
    }

    tx.update(roomRef, {
      guestUid: app.uid,
      guestName: app.username,
      status: "playing",
      updatedAt: serverTimestamp()
    });
  })
    .then(() => {
      app.role = "guest";
      app.localPlayerIndex = 1;
      attachRoomListener(roomId);
      setRoomStatus(`ルーム ${roomId} に参加しました。`);
      showScreen("waiting");
    })
    .catch((err) => {
      if (err?.message === "ROOM_NOT_FOUND") {
        setAuthMessage(`ルーム ${roomId} は存在しません。`, true);
      } else if (err?.message === "ROOM_UNAVAILABLE") {
        setAuthMessage(`ルーム ${roomId} は参加できません。`, true);
      } else {
        setAuthMessage("ルーム参加に失敗しました。", true);
      }
    });
}

function attachRoomListener(roomId) {
  detachRoomListener();

  app.roomId = roomId;
  const roomRef = doc(db, "rooms", roomId);

  app.roomUnsub = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) {
      setAuthMessage("ルームが削除されました。", true);
      leaveRoomAndGoTop();
      return;
    }

    const room = snap.data();
    app.roomVersion = room.version ?? 0;

    if (room.status === "waiting") {
      showScreen("waiting");
      setRoomStatus(`ルーム ${roomId} / 参加待ち`);
      return;
    }

    if (room.status === "playing") {
      if (room.hostUid === app.uid) {
        app.role = "host";
        app.localPlayerIndex = 0;
      }
      if (room.guestUid === app.uid) {
        app.role = "guest";
        app.localPlayerIndex = 1;
      }

      if (!room.gameState && app.role === "host") {
        startRoomGameAsHost(room);
        return;
      }

      if (room.gameState) {
        importGameState(game, room.gameState);
        showScreen("battle");
        syncBattle();
      }
      return;
    }

    if (room.status === "finished") {
      if (!app.winnerHandled) {
        app.winnerHandled = true;
        matchResult.textContent =
          room.winnerName && room.winnerName !== "draw"
            ? `対戦終了: 勝者 ${room.winnerName}`
            : "対戦終了: 引き分け";
      }
      setAuthMessage("対戦が終了しました。", false);
      leaveRoomAndGoTop(false);
    }
  });
}

function handleRematch() {
  if (!app.roomId || !ensureLoggedIn()) {
    return;
  }

  const roomRef = doc(db, "rooms", app.roomId);
  runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists()) {
      throw new Error("NO_ROOM");
    }

    const room = snap.data();
    if (room.hostUid !== app.uid) {
      throw new Error("ONLY_HOST");
    }

    const newGame = createGame();
    newGame.players[0].name = room.hostName || "ホスト";
    newGame.players[1].name = room.guestName || "ゲスト";
    newGame.players[0].isHuman = false;
    newGame.players[1].isHuman = false;
    startNewGame(newGame);

    tx.update(roomRef, {
      status: "playing",
      winnerName: null,
      gameState: exportGameState(newGame),
      version: (room.version ?? 0) + 1,
      currentTurnUid: newGame.currentPlayer === 0 ? room.hostUid : room.guestUid,
      updatedAt: serverTimestamp()
    });
  }).catch(() => {
    setAuthMessage("再戦開始に失敗しました。", true);
  });
}

function handlePlayCard(index) {
  if (!app.roomId || game.currentPlayer !== app.localPlayerIndex) {
    return;
  }

  const roomRef = doc(db, "rooms", app.roomId);
  const inputs = collectActionInputs(index);

  runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists()) {
      throw new Error("NO_ROOM");
    }

    const room = snap.data();
    if (room.status !== "playing" || !room.gameState) {
      throw new Error("NOT_PLAYING");
    }

    if ((room.version ?? 0) !== app.roomVersion) {
      throw new Error("STALE");
    }

    const myTurnUid = room.currentTurnUid;
    if (myTurnUid !== app.uid) {
      throw new Error("NOT_YOUR_TURN");
    }

    const working = createGame();
    importGameState(working, room.gameState);

    const ask = makeRoomAsk(app.localPlayerIndex, inputs);
    playCard(working, app.localPlayerIndex, index, ask);

    const nextTurnUid =
      working.winner !== null
        ? null
        : working.currentPlayer === 0
          ? room.hostUid
          : room.guestUid;

    const nextVersion = (room.version ?? 0) + 1;

    tx.update(roomRef, {
      gameState: exportGameState(working),
      version: nextVersion,
      currentTurnUid: nextTurnUid,
      status: working.winner !== null ? "finished" : "playing",
      winnerName:
        working.winner === null
          ? null
          : working.winner === "draw"
            ? "draw"
            : working.winner,
      updatedAt: serverTimestamp()
    });
  }).catch((err) => {
    if (err?.message === "NOT_YOUR_TURN") {
      setAuthMessage("あなたの手番ではありません。", true);
      return;
    }
    if (err?.message === "STALE") {
      setAuthMessage("状態が更新されたため再操作してください。", true);
      return;
    }
    setAuthMessage("行動の反映に失敗しました。", true);
  });
}

function startRoomGameAsHost(room) {
  const roomRef = doc(db, app.roomId);

  runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists()) {
      throw new Error("NO_ROOM");
    }

    const latest = snap.data();
    if (latest.gameState || latest.status !== "playing") {
      return;
    }

    const newGame = createGame();
    newGame.players[0].name = latest.hostName || room.hostName || "ホスト";
    newGame.players[1].name = latest.guestName || room.guestName || "ゲスト";
    newGame.players[0].isHuman = false;
    newGame.players[1].isHuman = false;
    startNewGame(newGame);

    tx.update(roomRef, {
      gameState: exportGameState(newGame),
      version: (latest.version ?? 0) + 1,
      currentTurnUid: newGame.currentPlayer === 0 ? latest.hostUid : latest.guestUid,
      updatedAt: serverTimestamp()
    });
  }).catch(() => {
    setAuthMessage("対戦開始処理に失敗しました。", true);
  });
}

function syncBattle() {
  ui.render(getDisplayState(), getPlayerHand(game, app.localPlayerIndex));
}

function leaveRoomAndGoTop(deleteIfHost = true) {
  const roomId = app.roomId;
  const role = app.role;

  detachRoomListener();
  app.roomId = "";
  app.role = "none";
  app.localPlayerIndex = 0;
  app.roomVersion = 0;
  app.winnerHandled = false;

  applyRoomConfig();
  applyRoomLobbyState();
  setRoomStatus("ルーム: 未接続");
  showScreen("top");
  refreshTopControls();

  if (deleteIfHost && role === "host" && roomId && app.firebaseReady) {
    deleteDoc(doc(db, "rooms", roomId)).catch(() => {
      // Ignore cleanup errors.
    });
  }
}

function disconnectRoom() {
  leaveRoomAndGoTop(false);
}

function detachRoomListener() {
  if (app.roomUnsub) {
    app.roomUnsub();
  }
  app.roomUnsub = null;
}

function getDisplayState() {
  const raw = getPublicState(game);

  if (app.localPlayerIndex === 0) {
    return raw;
  }

  return {
    ...raw,
    players: [raw.players[1], raw.players[0]],
    currentPlayer: raw.currentPlayer === 0 ? 1 : 0
  };
}

function collectActionInputs(handIndex) {
  const hand = game.players[app.localPlayerIndex]?.hand ?? [];
  const card = hand[handIndex];
  if (!card) {
    return [];
  }

  if (card.value === 2) {
    const guess = humanAsk("兵士: 相手の手札数字を予想してください (1-10)", "5");
    return [guess];
  }

  return [];
}

function makeRoomAsk(playerIndex, inputs) {
  const queue = [...inputs];
  return (message, fallback = "") => {
    if (queue.length > 0) {
      return queue.shift();
    }

    if (playerIndex === app.localPlayerIndex) {
      return humanAsk(message, fallback);
    }

    return fallback;
  };
}

function applyRoomConfig() {
  game.players[0].name = "プレイヤー1";
  game.players[0].isHuman = false;
  game.players[1].name = "プレイヤー2";
  game.players[1].isHuman = false;
}

function applyRoomLobbyState() {
  game.players.forEach((p) => {
    p.hand = [];
    p.discard = [];
    p.eliminated = false;
    p.protected = false;
  });

  game.deck = [];
  game.reincarnationCard = null;
  game.currentPlayer = 0;
  game.winner = null;
  game.turnCount = 0;
  game.waitingForAction = false;
  game.log = ["待機中: マッチングを待っています"];
}

function ensureLoggedIn() {
  if (app.username && app.uid) {
    return true;
  }

  setAuthMessage("先にログインしてください。", true);
  return false;
}

function showScreen(screen) {
  topScreen.classList.toggle("hidden", screen !== "top");
  waitingScreen.classList.toggle("hidden", screen !== "waiting");
  battleScreen.classList.toggle("hidden", screen !== "battle");
}

function refreshTopControls() {
  const loggedIn = Boolean(app.username);
  currentUserLabel.textContent = `ログイン中: ${app.username || "なし"}`;

  logoutUserBtn.disabled = !loggedIn;
  roomIdInput.disabled = !loggedIn;
  createRoomBtn.disabled = !loggedIn;
  joinRoomBtn.disabled = !loggedIn;
  loginUserBtn.disabled = false;
  reloadUsersBtn.disabled = false;
}

function disableAuthControls() {
  registerUserBtn.disabled = true;
  loginUserBtn.disabled = true;
  reloadUsersBtn.disabled = true;
  logoutUserBtn.disabled = true;
  createRoomBtn.disabled = true;
  joinRoomBtn.disabled = true;
  roomIdInput.disabled = true;
}

function setRoomStatus(text) {
  roomStatus.textContent = text;
}

function setAuthMessage(text, isError) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "#b91c1c" : "#4b5563";
}

function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 20)
    .replace(/[\s]/g, "");
}

function sanitizeRoomId(value) {
  const text = String(value ?? "").trim();
  const m = text.match(/[1-9]/);
  return m ? m[0] : "";
}

function toReadableAuthError(code) {
  if (code === "auth/operation-not-allowed") {
    return "Firebase Authenticationで匿名認証を有効化してください。";
  }
  if (code === "auth/configuration-not-found") {
    return "Authentication設定が未完了です。Firebaseで匿名認証を有効化してください。";
  }
  if (code === "auth/api-key-not-valid") {
    return "APIキーが無効です。firebase-config.js を確認してください。";
  }
  return code || "不明なエラー";
}

applyRoomConfig();
applyRoomLobbyState();
setRoomStatus("ルーム: 未接続");
showScreen("top");
refreshTopControls();
