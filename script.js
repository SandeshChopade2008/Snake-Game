/* =========================================================
   SNAKE GAME
   -----------------------------------------------------------
   The board is a grid of GRID_SIZE x GRID_SIZE cells.
   Every position (snake segments, food) is stored as grid
   coordinates like { x: 5, y: 8 }, NOT pixel values.
   The CSS then turns those grid coordinates into percentages,
   so the board can resize without any math in JavaScript.
   ========================================================= */

// ---------- CONSTANTS ----------
const GRID_SIZE = 20;              // the board is 20 cells wide and 20 cells tall
const CELL_PERCENT = 100 / GRID_SIZE; // width/height of one cell, as a percentage

const STARTING_SPEED_MS = 150;     // how long (ms) between moves when the game starts
const MIN_SPEED_MS = 70;           // the game never gets faster than this
const SPEED_STEP_MS = 4;           // speed increase (in ms removed) per food eaten

const BEST_SCORE_KEY = "snakeBestScore"; // localStorage key

// ---------- DOM ELEMENTS ----------
const gameBoard = document.getElementById("game-board");
const currentScoreEl = document.getElementById("current-score");
const bestScoreEl = document.getElementById("best-score");
const finalScoreEl = document.getElementById("final-score");

const startOverlay = document.getElementById("start-overlay");
const gameOverOverlay = document.getElementById("game-over-overlay");
const pauseOverlay = document.getElementById("pause-overlay");

const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const pauseButton = document.getElementById("pause-button");

// ---------- GAME STATE ----------
// All the "moving parts" of the game live in these variables.
let snake = [];                 // array of { x, y } cells, snake[0] is the head
let direction = { x: 1, y: 0 }; // the direction the snake is actually moving
let nextDirection = { x: 1, y: 0 }; // the direction requested by the player (applied next tick)

let food = { x: 0, y: 0 };

let score = 0;
let bestScore = loadBestScore();

let currentSpeed = STARTING_SPEED_MS;

let isRunning = false;   // true once "Start" or "Play Again" has been pressed
let isPaused = false;    // true while the pause overlay is showing

// gameId lets us tell an "old" game loop to stop scheduling itself.
// Every time a new game starts, we increment this number. A pending
// setTimeout from a previous game checks this value before doing
// anything, so restarting quickly can never create two loops at once.
let gameId = 0;
let loopTimeoutId = null;

// ---------- STARTUP ----------
bestScoreEl.textContent = bestScore;
setupInputListeners();

// =========================================================
// GAME LIFECYCLE (start / restart / pause / game over)
// =========================================================

function startGame() {
    // A fresh game gets a new id, invalidating any leftover
    // timers from a previous game that might still be pending.
    gameId += 1;
    const thisGameId = gameId;

    resetGameState();
    render();

    hideOverlay(startOverlay);
    hideOverlay(gameOverOverlay);
    hideOverlay(pauseOverlay);

    isRunning = true;
    isPaused = false;
    pauseButton.disabled = false;
    pauseButton.textContent = "Pause";

    scheduleNextTick(thisGameId);
}

function resetGameState() {
    // Put the snake back in the middle of the board, three
    // segments long, moving to the right.
    const centerX = Math.floor(GRID_SIZE / 2);
    const centerY = Math.floor(GRID_SIZE / 2);

    snake = [
        { x: centerX, y: centerY },
        { x: centerX - 1, y: centerY },
        { x: centerX - 2, y: centerY }
    ];

    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };

    score = 0;
    currentScoreEl.textContent = score;

    currentSpeed = STARTING_SPEED_MS;

    food = generateFood();
}

function endGame() {
    isRunning = false;
    isPaused = false;

    if (loopTimeoutId !== null) {
        clearTimeout(loopTimeoutId);
        loopTimeoutId = null;
    }

    pauseButton.disabled = true;

    finalScoreEl.textContent = score;
    showOverlay(gameOverOverlay);
}

function togglePause() {
    if (!isRunning) return; // nothing to pause before the game has started

    if (isPaused) {
        // Resume
        isPaused = false;
        hideOverlay(pauseOverlay);
        pauseButton.textContent = "Pause";
        scheduleNextTick(gameId);
    } else {
        // Pause
        isPaused = true;
        if (loopTimeoutId !== null) {
            clearTimeout(loopTimeoutId);
            loopTimeoutId = null;
        }
        showOverlay(pauseOverlay);
        pauseButton.textContent = "Resume";
    }
}

// =========================================================
// GAME LOOP
// =========================================================

function scheduleNextTick(thisGameId) {
    loopTimeoutId = setTimeout(() => runTick(thisGameId), currentSpeed);
}

function runTick(thisGameId) {
    // If a newer game has started since this timer was scheduled,
    // do nothing. This is what stops "double loops" from ever happening.
    if (thisGameId !== gameId) return;
    if (!isRunning || isPaused) return;

    const isAlive = moveSnake();
    render();

    if (!isAlive) {
        endGame();
        return;
    }

    scheduleNextTick(thisGameId);
}

// =========================================================
// MOVEMENT
// =========================================================

function moveSnake() {
    // Apply the most recently requested direction.
    direction = nextDirection;

    const currentHead = snake[0];
    const newHead = {
        x: currentHead.x + direction.x,
        y: currentHead.y + direction.y
    };

    if (hitsWall(newHead)) {
        return false; // the snake died
    }

    const willEatFood = newHead.x === food.x && newHead.y === food.y;

    // If the snake is NOT about to eat, its tail cell will move out of the
    // way this same tick, so moving into that cell is legal. We only check
    // the tail as an obstacle when the snake is about to grow (tail stays put).
    const obstacleCells = willEatFood ? snake : snake.slice(0, -1);

    if (hitsSnake(newHead, obstacleCells)) {
        return false; // the snake died
    }

    snake.unshift(newHead); // add the new head to the front

    if (willEatFood) {
        increaseScore();
        increaseSpeed();
        food = generateFood();
        // Note: we do NOT remove the tail here, so the snake grows by one cell.
    } else {
        snake.pop(); // remove the tail so the snake appears to "move"
    }

    return true; // the snake is still alive
}

function hitsWall(position) {
    return (
        position.x < 0 ||
        position.x >= GRID_SIZE ||
        position.y < 0 ||
        position.y >= GRID_SIZE
    );
}

function hitsSnake(position, cells = snake) {
    return cells.some(segment => segment.x === position.x && segment.y === position.y);
}

// =========================================================
// FOOD
// =========================================================

function generateFood() {
    let candidate;

    do {
        candidate = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE)
        };
    } while (hitsSnake(candidate)); // keep rolling until it's on an empty cell

    return candidate;
}

// =========================================================
// SCORE
// =========================================================

function increaseScore() {
    score += 1;
    currentScoreEl.textContent = score;

    if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = bestScore;
        saveBestScore(bestScore);
    }
}

function increaseSpeed() {
    currentSpeed = Math.max(MIN_SPEED_MS, currentSpeed - SPEED_STEP_MS);
}

function loadBestScore() {
    const saved = localStorage.getItem(BEST_SCORE_KEY);
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? parsed : 0;
}

function saveBestScore(value) {
    localStorage.setItem(BEST_SCORE_KEY, String(value));
}

// =========================================================
// RENDERING
// =========================================================

function render() {
    gameBoard.innerHTML = "";

    snake.forEach((segment, index) => {
        const isHead = index === 0;
        gameBoard.appendChild(
            createCellElement(segment, isHead ? "snake-head" : "snake-segment")
        );
    });

    gameBoard.appendChild(createCellElement(food, "food"));
}

function createCellElement(position, className) {
    const cell = document.createElement("div");
    cell.className = `cell ${className}`;

    cell.style.left = position.x * CELL_PERCENT + "%";
    cell.style.top = position.y * CELL_PERCENT + "%";
    cell.style.width = CELL_PERCENT + "%";
    cell.style.height = CELL_PERCENT + "%";

    return cell;
}

// =========================================================
// OVERLAY HELPERS
// =========================================================

function showOverlay(overlayEl) {
    overlayEl.classList.remove("hidden");
}

function hideOverlay(overlayEl) {
    overlayEl.classList.add("hidden");
}

// =========================================================
// INPUT
// =========================================================

function setupInputListeners() {
    startButton.addEventListener("click", startGame);
    restartButton.addEventListener("click", startGame);
    pauseButton.addEventListener("click", togglePause);

    document.addEventListener("keydown", handleKeydown);
}

function handleKeydown(event) {
    // Space toggles pause, but only once a game is in progress.
    if (event.key === " ") {
        event.preventDefault(); // stop the page from scrolling
        togglePause();
        return;
    }

    if (!isRunning || isPaused) return;

    const requestedDirection = getDirectionFromKey(event.key);
    if (!requestedDirection) return;

    if (isOppositeDirection(requestedDirection, direction)) {
        return; // ignore attempts to reverse straight into the snake's own body
    }

    nextDirection = requestedDirection;
}

function getDirectionFromKey(key) {
    switch (key) {
        case "ArrowUp":
        case "w":
        case "W":
            return { x: 0, y: -1 };
        case "ArrowDown":
        case "s":
        case "S":
            return { x: 0, y: 1 };
        case "ArrowLeft":
        case "a":
        case "A":
            return { x: -1, y: 0 };
        case "ArrowRight":
        case "d":
        case "D":
            return { x: 1, y: 0 };
        default:
            return null;
    }
}

function isOppositeDirection(a, b) {
    return a.x === -b.x && a.y === -b.y;
}