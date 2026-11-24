const $ = id => document.getElementById(id);

// ===================== GAME STATE =====================
let players = 4;
let turn = 0;
let dice = 0;
let rolling = false;
let positions = [];          // positions[player][token] = -1 (yard) | 0..51 (main) | 100..105 (home) | 106 (finished)
let consecutiveSixes = 0;
let lastDice = 0;
let installPrompt = null;
let gameOver = false;

const names  = ['Red', 'Green', 'Yellow', 'Blue'];
const colors = ['red', 'green', 'yellow', 'blue'];
const turnColors = ['#e85a50', '#55a875', '#f3c64e', '#5597d4'];

// ===================== BOARD PATHS =====================
// 52-square main path (clockwise). Red starts at index 0.
const MAIN_PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],                 // Red entry →
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],           // up left
  [0,7],[0,8],                                   // top
  [1,8],[2,8],[3,8],[4,8],[5,8],                 // down right
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],      // right
  [7,14],[8,14],                                 // bottom-right corner
  [8,13],[8,12],[8,11],[8,10],[8,9],             // left
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],      // down
  [14,7],[14,6],                                 // bottom
  [13,6],[12,6],[11,6],[10,6],[9,6],             // up
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],           // left
  [7,0],[6,0]                                    // up to Red start
]; // 52 squares

// Starting index on MAIN_PATH for each color
const START_INDEX = [0, 13, 26, 39]; // Red, Green, Yellow, Blue

// Home stretch (6 squares) leading into the center
const HOME_PATH = [
  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],         // Red
  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],         // Green
  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],     // Yellow
  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]      // Blue
];

// Safe squares (global main-path indices)
const SAFE_MAIN = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Yard positions for tokens still at home
const YARD = [
  [[1,1],[1,4],[4,1],[4,4]],
  [[1,10],[1,13],[4,10],[4,13]],
  [[10,10],[10,13],[13,10],[13,13]],
  [[10,1],[10,4],[13,1],[13,4]]
];

// ===================== HELPERS =====================
function isHomeStretch(pos) { return pos >= 100 && pos <= 105; }
function isFinished(pos)    { return pos === 106; }

function getBoardCoords(player, pos) {
  if (pos < 0 || isFinished(pos)) return null;
  if (isHomeStretch(pos)) return HOME_PATH[player][pos - 100];
  const globalIdx = (START_INDEX[player] + pos) % 52;
  return MAIN_PATH[globalIdx];
}

function getGlobalMainIndex(player, pos) {
  if (pos < 0 || pos >= 52) return -1;
  return (START_INDEX[player] + pos) % 52;
}

function isSafe(player, pos) {
  if (pos < 0 || isHomeStretch(pos) || isFinished(pos)) return true;
  if (pos === 0) return true; // own starting square
  return SAFE_MAIN.has(getGlobalMainIndex(player, pos));
}

// ===================== DRAW =====================
function draw() {
  const board = $('board');
  board.innerHTML = '';

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const el = document.createElement('div');
      el.className = 'cell';

      if (r < 6 && c < 6) el.classList.add('home-red');
      else if (r < 6 && c > 8) el.classList.add('home-green');
      else if (r > 8 && c > 8) el.classList.add('home-yellow');
      else if (r > 8 && c < 6) el.classList.add('home-blue');
      else if (r === 6 || r === 8 || c === 6 || c === 8) el.classList.add('path');

      if (r >= 6 && r <= 8 && c >= 6 && c <= 8) el.classList.add('center');

      // Home stretch tints
      if (r === 7 && c >= 1 && c <= 5) el.classList.add('stretch-red');
      if (c === 7 && r >= 1 && r <= 5) el.classList.add('stretch-green');
      if (r === 7 && c >= 9 && c <= 13) el.classList.add('stretch-yellow');
      if (c === 7 && r >= 9 && r <= 13) el.classList.add('stretch-blue');

      board.appendChild(el);
    }
  }

  // Safe stars
  SAFE_MAIN.forEach(idx => {
    const [r, c] = MAIN_PATH[idx];
    const cell = board.children[r * 15 + c];
    if (cell) {
      const star = document.createElement('span');
      star.className = 'safe-star';
      star.textContent = '★';
      cell.appendChild(star);
    }
  });

  // Tokens on board / home stretch
  positions.forEach((tokens, p) => {
    tokens.forEach((pos, t) => {
      if (pos < 0 || isFinished(pos)) return;
      const coords = getBoardCoords(p, pos);
      if (!coords) return;
      const [r, c] = coords;
      const cell = board.children[r * 15 + c];
      if (!cell) return;

      const piece = document.createElement('div');
      piece.className = 'piece ' + colors[p];
      piece.title = `${names[p]} #${t + 1}`;
      const existing = cell.querySelectorAll('.piece').length;
      if (existing) piece.style.transform = `translate(${existing * 5}px,${existing * 5}px) scale(0.82)`;
      cell.appendChild(piece);
    });
  });

  // Tokens in yard
  positions.forEach((tokens, p) => {
    tokens.forEach((pos, t) => {
      if (pos >= 0) return;
      const [r, c] = YARD[p][t];
      const cell = board.children[r * 15 + c];
      if (!cell) return;
      const piece = document.createElement('div');
      piece.className = 'piece ' + colors[p];
      piece.title = `${names[p]} #${t + 1} (yard)`;
      cell.appendChild(piece);
    });
  });
}

// ===================== GAME LOGIC =====================
function status(msg) {
  $('message').textContent = msg;
}

function updateTurnHighlight() {
  $('turnName').textContent = names[turn];
  $('turnName').style.color = turnColors[turn];
}

function init() {
  players = +$('players').value;
  turn = 0;
  dice = 0;
  lastDice = 0;
  consecutiveSixes = 0;
  gameOver = false;
  positions = Array.from({ length: players }, () => [-1, -1, -1, -1]);

  $('home').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('tokens').innerHTML = '';
  $('roll').disabled = false;

  draw();
  status('Roll a 6 to bring a token out of the yard.');
  updateTurnHighlight();
}

function getValidMoves(player, diceValue) {
  const tokens = positions[player];
  const moves = [];

  tokens.forEach((pos, i) => {
    if (isFinished(pos)) return;

    // Yard → need 6
    if (pos < 0) {
      if (diceValue === 6) moves.push({ token: i, type: 'enter' });
      return;
    }

    // Main path
    if (pos < 52) {
      const newPos = pos + diceValue;
      if (newPos > 51) {
        const homeSteps = newPos - 51; // 1..6
        if (homeSteps <= 6) {
          moves.push({ token: i, type: 'toHome', homeIndex: 99 + homeSteps });
        }
        return;
      }
      moves.push({ token: i, type: 'main', newPos });
      return;
    }

    // Home stretch
    if (isHomeStretch(pos)) {
      const steps = pos - 100;
      const target = steps + diceValue;
      if (target === 6) moves.push({ token: i, type: 'finish' });
      else if (target < 6) moves.push({ token: i, type: 'home', newPos: 100 + target });
    }
  });

  return moves;
}

function applyMove(player, move) {
  const tokens = positions[player];
  let captured = false;
  let finishedToken = false;

  if (move.type === 'enter') {
    tokens[move.token] = 0;
  } else if (move.type === 'main') {
    tokens[move.token] = move.newPos;
  } else if (move.type === 'toHome') {
    tokens[move.token] = move.homeIndex;
  } else if (move.type === 'home') {
    tokens[move.token] = move.newPos;
  } else if (move.type === 'finish') {
    tokens[move.token] = 106;
    finishedToken = true;
  }

  // Capture (only on main path, not on safe squares)
  const newPos = tokens[move.token];
  if (newPos >= 0 && newPos < 52 && !isSafe(player, newPos)) {
    const myGlobal = getGlobalMainIndex(player, newPos);
    for (let p = 0; p < players; p++) {
      if (p === player) continue;
      positions[p].forEach((pos, t) => {
        if (pos >= 0 && pos < 52 && getGlobalMainIndex(p, pos) === myGlobal) {
          positions[p][t] = -1;
          captured = true;
        }
      });
    }
  }

  return { captured, finishedToken };
}

function checkWin(player) {
  return positions[player].every(isFinished);
}

function nextTurn(extraTurn) {
  dice = 0;
  lastDice = 0;
  $('tokens').innerHTML = '';
  $('roll').disabled = false;

  if (extraTurn) {
    status(`${names[turn]} gets another turn!`);
    return;
  }

  consecutiveSixes = 0;
  turn = (turn + 1) % players;
  updateTurnHighlight();
  status(`Next turn: ${names[turn]}. Roll the dice.`);
}

function roll() {
  if (rolling || dice !== 0 || gameOver) return;

  rolling = true;
  $('roll').disabled = true;
  dice = 1 + Math.floor(Math.random() * 6);
  lastDice = dice;

  // 3D dice animation
  const cube = $('cube');
  const rx = 720 + (dice === 2 ? 90 : dice === 5 ? -90 : 0);
  const ry = 720 + (dice === 3 ? 90 : dice === 4 ? -90 : dice === 6 ? 180 : 0);
  cube.style.transform = `translateZ(-24px) rotateX(${rx}deg) rotateY(${ry}deg)`;

  setTimeout(() => {
    rolling = false;
    afterRoll();
  }, 400);
}

function afterRoll() {
  // Three consecutive sixes → skip turn
  if (dice === 6) {
    consecutiveSixes++;
    if (consecutiveSixes >= 3) {
      status(`${names[turn]} rolled three 6s in a row — turn skipped!`);
      consecutiveSixes = 0;
      nextTurn(false);
      return;
    }
  } else {
    consecutiveSixes = 0;
  }

  const moves = getValidMoves(turn, dice);

  if (moves.length === 0) {
    status(`${names[turn]} rolled ${dice}. No valid moves.`);
    nextTurn(dice === 6);
    return;
  }

  status(`${names[turn]} rolled ${dice}. Choose a token to move.`);

  const container = $('tokens');
  container.innerHTML = '';

  moves.forEach(m => {
    const btn = document.createElement('button');
    let label = `Token ${m.token + 1}`;
    if (m.type === 'enter')        label += ' → Enter board';
    else if (m.type === 'finish')  label += ' → FINISH!';
    else if (m.type === 'toHome' || m.type === 'home') label += ' → Home path';
    btn.textContent = label;
    btn.onclick = () => executeMove(m);
    container.appendChild(btn);
  });
}

function executeMove(move) {
  if (gameOver) return;

  const result = applyMove(turn, move);
  draw();
  $('tokens').innerHTML = '';

  const originalDice = lastDice;
  dice = 0;
  lastDice = 0;

  if (checkWin(turn)) {
    gameOver = true;
    status(`🏆 ${names[turn]} wins the game! All 4 tokens are home.`);
    $('roll').disabled = true;
    return;
  }

  let msg = `${names[turn]} moved token ${move.token + 1}.`;
  if (result.finishedToken) msg += ' Token finished!';
  if (result.captured) msg += ' Capture! Opponent sent back to yard.';
  status(msg);

  // Extra turn on 6 or on capture
  const extra = (originalDice === 6) || result.captured;
  nextTurn(extra);
}

// ===================== UI / PWA =====================
function openDownload() {
  $('downloadModal').classList.remove('hidden');
}

function updatePwaLink() {
  const u = $('publicUrl').value.trim();
  $('pwaLink').href = 'https://www.pwabuilder.com/reportcard?site=' + encodeURIComponent(u || location.href);
}

// Event bindings
$('start').onclick = init;
$('roll').onclick = roll;
$('menuBtn').onclick = () => $('pauseModal').classList.remove('hidden');
$('closePause').onclick = $('resume').onclick = () => $('pauseModal').classList.add('hidden');
$('restart').onclick = () => { $('pauseModal').classList.add('hidden'); init(); };
$('leave').onclick = () => {
  $('pauseModal').classList.add('hidden');
  $('game').classList.add('hidden');
  $('home').classList.remove('hidden');
};
['getApp', 'homeDownload', 'pauseDownload'].forEach(id => $(id).onclick = openDownload);
$('closeDownload').onclick = () => $('downloadModal').classList.add('hidden');
$('publicUrl').oninput = updatePwaLink;
$('copyUrl').onclick = async () => {
  const u = $('publicUrl').value.trim() || location.href;
  try {
    await navigator.clipboard.writeText(u);
    $('installHelp').textContent = 'URL copied.';
  } catch {
    $('installHelp').textContent = u;
  }
};
$('installBtn').onclick = async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  } else {
    $('installHelp').textContent = 'On Android Chrome use ⋮ → Install app / Add to Home screen.';
  }
};

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

updatePwaLink();
