// ---------- Config ----------
const DEFAULT_API_BASE = localStorage.getItem("apiBase") || "http://localhost:8000";

// ---------- DOM ----------
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");

const btnStart = document.getElementById("btnStart");
const btnPause = document.getElementById("btnPause");
const btnRefresh = document.getElementById("btnRefresh");
const apiBaseInput = document.getElementById("apiBase");
const leaderboardEl = document.getElementById("leaderboard");

const modal = document.getElementById("modal");
const finalScoreEl = document.getElementById("finalScore");
const mUser = document.getElementById("mUser");
const mPass = document.getElementById("mPass");
const mEmail = document.getElementById("mEmail");
const btnSave = document.getElementById("btnSave");
const btnSkip = document.getElementById("btnSkip");
const msgEl = document.getElementById("msg");

const linkUser = document.getElementById("linkUser");
const linkPass = document.getElementById("linkPass");
const linkEmail = document.getElementById("linkEmail");
const btnLinkEmail = document.getElementById("btnLinkEmail");
const recoverEmail = document.getElementById("recoverEmail");
const btnRecoverId = document.getElementById("btnRecoverId");
const resetEmail = document.getElementById("resetEmail");
const btnRequestReset = document.getElementById("btnRequestReset");

// ---------- Helpers ----------
function apiBase() {
  const v = (apiBaseInput.value || DEFAULT_API_BASE).trim().replace(/\/+$/, "");
  return v;
}
apiBaseInput.value = DEFAULT_API_BASE;

async function apiGet(path) {
  const res = await fetch(apiBase() + path);
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}
async function apiPost(path, body) {
  const res = await fetch(apiBase() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

// ---------- Tetris ----------
const COLS = 10;
const ROWS = 20;
const BLOCK = 30; // px
const board = newBoard();

function newBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

const SHAPES = {
  I: [[1,1,1,1]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1]],
  S: [[0,1,1],[1,1,0]],
  Z: [[1,1,0],[0,1,1]],
  J: [[1,0,0],[1,1,1]],
  L: [[0,0,1],[1,1,1]],
};

const PIECES = Object.keys(SHAPES);

function rotate(matrix) {
  // clockwise
  const h = matrix.length;
  const w = matrix[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[x][h - 1 - y] = matrix[y][x];
    }
  }
  return out;
}

function randomPiece() {
  const key = PIECES[Math.floor(Math.random() * PIECES.length)];
  return { key, shape: SHAPES[key].map(r => r.slice()), x: 3, y: 0 };
}

function collides(b, piece) {
  const { shape, x: px, y: py } = piece;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[0].length; x++) {
      if (!shape[y][x]) continue;
      const bx = px + x;
      const by = py + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && b[by][bx]) return true;
    }
  }
  return false;
}

function merge(b, piece) {
  const { shape, x: px, y: py } = piece;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[0].length; x++) {
      if (!shape[y][x]) continue;
      const by = py + y;
      const bx = px + x;
      if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
        b[by][bx] = 1;
      }
    }
  }
}

function clearLines(b) {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (b[y].every(v => v === 1)) {
      b.splice(y, 1);
      b.unshift(Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }
  return cleared;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // grid
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const filled = board[y][x];
      ctx.fillStyle = filled ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.07)";
      ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK - 1, BLOCK - 1);
    }
  }

  // piece
  if (current) {
    const { shape, x: px, y: py } = current;
    ctx.fillStyle = "rgba(110,200,255,.95)";
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[0].length; x++) {
        if (!shape[y][x]) continue;
        const by = py + y;
        const bx = px + x;
        if (by >= 0) ctx.fillRect(bx * BLOCK, by * BLOCK, BLOCK - 1, BLOCK - 1);
      }
    }
  }
}

let current = null;
let running = false;
let paused = false;

let score = 0;
let lines = 0;
let level = 1;

let dropCounter = 0;
let lastTime = 0;

function updateHud() {
  scoreEl.textContent = String(score);
  linesEl.textContent = String(lines);
  levelEl.textContent = String(level);
}

function resetGame() {
  for (let y = 0; y < ROWS; y++) board[y].fill(0);
  current = randomPiece();
  score = 0; lines = 0; level = 1;
  dropCounter = 0; lastTime = 0;
  updateHud();
  draw();
}

function dropInterval() {
  // levelが上がるほど速い
  return Math.max(90, 700 - (level - 1) * 55);
}

function gameOver() {
  running = false;
  paused = false;
  finalScoreEl.textContent = String(score);
  msgEl.textContent = "";
  modal.classList.remove("hidden");
}

function hardDrop() {
  if (!current) return;
  while (!collides(board, { ...current, y: current.y + 1 })) {
    current.y++;
    score += 2;
  }
  lockPiece();
}

function lockPiece() {
  merge(board, current);

  const cleared = clearLines(board);
  if (cleared > 0) {
    lines += cleared;
    // スコア：シンプル
    score += [0, 100, 300, 500, 800][cleared] * level;
    level = 1 + Math.floor(lines / 10);
  }

  current = randomPiece();
  if (collides(board, current)) {
    draw();
    updateHud();
    gameOver();
    return;
  }

  updateHud();
}

function step(time = 0) {
  if (!running) return;
  if (paused) {
    requestAnimationFrame(step);
    return;
  }

  const dt = time - lastTime;
  lastTime = time;
  dropCounter += dt;

  if (dropCounter > dropInterval()) {
    dropCounter = 0;
    if (!collides(board, { ...current, y: current.y + 1 })) {
      current.y++;
      score += 1;
    } else {
      lockPiece();
    }
  }

  draw();
  requestAnimationFrame(step);
}

function actLeft() {
  const next = { ...current, x: current.x - 1 };
  if (!collides(board, next)) current.x--;
}
function actRight() {
  const next = { ...current, x: current.x + 1 };
  if (!collides(board, next)) current.x++;
}
function actDown() {
  const next = { ...current, y: current.y + 1 };
  if (!collides(board, next)) { current.y++; score += 1; }
  else lockPiece();
}
function actRotate() {
  const rotated = rotate(current.shape);
  const next = { ...current, shape: rotated };
  if (!collides(board, next)) current.shape = rotated;
  else if (!collides(board, { ...next, x: next.x - 1 })) { current.x--; current.shape = rotated; }
  else if (!collides(board, { ...next, x: next.x + 1 })) { current.x++; current.shape = rotated; }
}
function actDrop(e) {
  if (e) e.preventDefault();
  hardDrop();
}
function actPause() {
  paused = !paused;
}

// Controls
window.addEventListener("keydown", (e) => {
  if (!running) return;

  if (e.key === "p" || e.key === "P") {
    actPause();
    return;
  }
  if (paused) return;

  if (e.key === "ArrowLeft") actLeft();
  else if (e.key === "ArrowRight") actRight();
  else if (e.key === "ArrowDown") actDown();
  else if (e.key === "ArrowUp") actRotate();
  else if (e.key === " ") actDrop(e);
});

// ---------- Leaderboard ----------
async function refreshLeaderboard() {
  localStorage.setItem("apiBase", apiBase());
  try {
    const data = await apiGet("/api/leaderboard?game=tetris&limit=50");
    leaderboardEl.innerHTML = "";
    for (const item of data.items) {
      const li = document.createElement("li");
      const dt = new Date(item.created_at);
      li.textContent = `${item.username} — ${item.score} (${dt.toLocaleString()})`;
      leaderboardEl.appendChild(li);
    }
  } catch (err) {
    leaderboardEl.innerHTML = `<li>取得失敗: ${String(err)}</li>`;
  }
}

// ---------- Modal actions ----------
btnSave.addEventListener("click", async () => {
  const username = mUser.value.trim();
  const password = mPass.value;
  const email = mEmail.value.trim() || null;

  if (username.length < 2 || username.length > 20) {
    msgEl.textContent = "IDは2〜20文字にしてください。";
    return;
  }
  if (password.length < 6) {
    msgEl.textContent = "PWは6文字以上にしてください。";
    return;
  }

  try {
    await apiPost("/api/score/submit", {
      game: "tetris",
      score,
      username,
      password,
      email,
    });
    msgEl.textContent = "保存しました！ランキング更新します…";
    modal.classList.add("hidden");
    await refreshLeaderboard();
  } catch (err) {
    msgEl.textContent = "保存失敗: " + String(err);
  }
});

btnSkip.addEventListener("click", async () => {
  modal.classList.add("hidden");
  await refreshLeaderboard();
});

// ---------- Account extras ----------
btnLinkEmail.addEventListener("click", async () => {
  try {
    await apiPost("/api/auth/link_email", {
      username: linkUser.value.trim(),
      password: linkPass.value,
      email: linkEmail.value.trim(),
    });
    alert("メール登録しました。");
  } catch (err) {
    alert("失敗: " + String(err));
  }
});

btnRecoverId.addEventListener("click", async () => {
  try {
    await apiPost("/api/auth/recover_id", { email: recoverEmail.value.trim() });
    alert("（登録があれば）ID確認メールを送信しました。");
  } catch (err) {
    alert("失敗: " + String(err));
  }
});

btnRequestReset.addEventListener("click", async () => {
  try {
    await apiPost("/api/auth/request_reset", { email: resetEmail.value.trim() });
    alert("（登録があれば）PWリセットメールを送信しました。");
  } catch (err) {
    alert("失敗: " + String(err));
  }
});

// ---------- Start/Pause ----------
btnStart.addEventListener("click", async () => {
  if (!running) {
    modal.classList.add("hidden");
    resetGame();
    running = true;
    paused = false;
    requestAnimationFrame(step);
  }
});
btnPause.addEventListener("click", () => {
  if (!running) return;
  paused = !paused;
});

btnRefresh.addEventListener("click", refreshLeaderboard);

// boot
resetGame();
refreshLeaderboard();
