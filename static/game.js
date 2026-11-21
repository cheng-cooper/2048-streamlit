const size = 4;
const gameRequest = globalThis.request2048 || fetch;
const board = document.querySelector("#board");
const scoreDisplay = document.querySelector("#score");
const gameStatus = document.querySelector("#game-status");
const roundResult = document.querySelector("#round-result");
const resultTitle = document.querySelector("#result-title");
const resultMetrics = document.querySelector("#result-metrics");
const endButton = document.querySelector("#end-round");
const rankingStatus = document.querySelector("#ranking-status");
const ranking = document.querySelector("#ranking");
const rankingDialog = document.querySelector("#ranking-dialog");
const save = document.querySelector("#save");
const saveStatus = document.querySelector("#save-status");
const nickname = document.querySelector("#name");
const startForm = document.querySelector("#start-game");
const restartButton = document.querySelector("#restart");
const homeButton = document.querySelector("#return-home");
const welcome = document.querySelector("#welcome");
const game = document.querySelector("#game");
const directionButtons = document.querySelectorAll("[data-direction]");
const rankingButtons = document.querySelectorAll("[data-ranking]");
const clearRankingNote = document.querySelector("#clear-ranking-note");
const elapsedDisplay = document.querySelector("#elapsed");
const stepsDisplay = document.querySelector("#steps");
const cells = Array.from({ length: size ** 2 }, () => board.appendChild(document.createElement("div")));
const directions = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
let player, tiles, score, outcome, pointerStart;
let saving = false;
let saved = false;
let finishSlide;
let steps, startedAt, elapsedMs, clock;
let activeRanking = "scores";
let rankingData;
let rankingTimer;
let rankingLoading = false;
let rankingRevision = 0;

function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

function updateClock() {
    const milliseconds = outcome ? elapsedMs : Math.floor(performance.now() - startedAt);
    elapsedDisplay.textContent = formatTime(milliseconds);
}

function addTile() {
    const empty = tiles.flatMap((tile, index) => tile === 0 ? [index] : []);
    if (empty.length) {
        tiles[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
    }
}

function render() {
    cells.forEach((cell, index) => {
        const tile = tiles[index];
        cell.textContent = tile || "";
        cell.dataset.value = tile;
    });
    scoreDisplay.textContent = score;
    stepsDisplay.textContent = steps;
    updateClock();
    const showResult = Boolean(outcome) && roundResult.hidden;
    roundResult.hidden = !outcome;
    endButton.disabled = Boolean(outcome);
    restartButton.disabled = saving;
    homeButton.disabled = saving;
    directionButtons.forEach(button => { button.disabled = Boolean(outcome); });
    if (outcome) {
        const messages = {
            won: "達成 2048！",
            blocked: "棋盤已無法移動。",
            stopped: "你已結束本局。",
        };
        gameStatus.textContent = messages[outcome];
        resultMetrics.textContent = `分數 ${score.toLocaleString("zh-TW")} · 時間 ${formatTime(elapsedMs)} · ${steps} 步`;
    }
    if (showResult && !game.hidden && !rankingDialog.open) resultTitle.focus();
    if (showResult && outcome !== "stopped") void submitRound();
}

function endRound(result) {
    if (!player || outcome) return;
    outcome = result;
    elapsedMs = Math.max(1, Math.floor(performance.now() - startedAt));
    clearInterval(clock);
}

function restart() {
    finishSlide?.();
    if (saving) return;
    tiles = Array(size ** 2).fill(0);
    score = 0;
    steps = 0;
    startedAt = performance.now();
    elapsedMs = 0;
    clearInterval(clock);
    clock = setInterval(updateClock, 100);
    outcome = undefined;
    saved = false;
    pointerStart = null;
    save.hidden = true;
    saveStatus.textContent = "";
    addTile();
    addTile();
    render();
}

function cellIndex(line, offset, direction) {
    switch (direction) {
        case "left": return line * size + offset;
        case "right": return line * size + size - 1 - offset;
        case "up": return offset * size + line;
        case "down": return (size - 1 - offset) * size + line;
    }
}

function canMove() {
    return tiles.some((tile, index) =>
        tile === 0 ||
        (index % size < size - 1 && tile === tiles[index + 1]) ||
        (index < size * (size - 1) && tile === tiles[index + size])
    );
}

function slideTiles(movements) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !cells[0].animate) {
        render();
        return;
    }

    const bounds = board.getBoundingClientRect();
    const positions = cells.map(cell => cell.getBoundingClientRect());
    const effects = movements.map(({ from, to }) => {
        const origin = positions[from];
        const target = positions[to];
        const tile = cells[from].cloneNode(true);
        tile.className = "sliding-tile";
        tile.setAttribute("aria-hidden", "true");
        Object.assign(tile.style, {
            left: `${origin.left - bounds.left}px`,
            top: `${origin.top - bounds.top}px`,
            width: `${origin.width}px`,
            height: `${origin.height}px`,
        });
        board.appendChild(tile);
        const animation = tile.animate(
            [{ transform: "translate(0, 0)" },
             { transform: `translate(${target.left - origin.left}px, ${target.top - origin.top}px)` }],
            { duration: 130, easing: "ease-out", fill: "forwards" },
        );
        return { tile, animation };
    });
    board.classList.add("sliding");

    const complete = () => {
        if (finishSlide !== complete) return;
        finishSlide = undefined;
        effects.forEach(({ tile, animation }) => {
            animation.cancel();
            tile.remove();
        });
        board.classList.remove("sliding");
        render();
    };
    finishSlide = complete;
    Promise.allSettled(effects.map(({ animation }) => animation.finished)).then(complete);
}

function move(direction) {
    finishSlide?.();
    if (!player || outcome) return;
    const movements = [];
    for (let line = 0; line < size; line++) {
        const indices = Array.from({ length: size }, (_, offset) => cellIndex(line, offset, direction));
        const occupied = indices.filter(index => tiles[index]);
        const merged = [];
        for (let offset = 0; offset < occupied.length; offset++) {
            const to = indices[merged.length];
            let tile = tiles[occupied[offset]];
            movements.push({ from: occupied[offset], to });
            if (tile === tiles[occupied[offset + 1]]) {
                tile *= 2;
                score += tile;
                offset++;
                movements.push({ from: occupied[offset], to });
            }
            merged.push(tile);
        }
        indices.forEach((index, offset) => {
            tiles[index] = merged[offset] ?? 0;
        });
    }
    const changed = movements.some(({ from, to }) => from !== to);
    if (changed) {
        steps++;
        addTile();
    }
    if (tiles.includes(2048)) endRound("won");
    else if (!canMove()) endRound("blocked");
    if (changed) slideTiles(movements);
    else render();
}

async function loadRanking(entry) {
    const revision = entry ? ++rankingRevision : rankingRevision;
    const response = await gameRequest("/api/leaderboard", entry && {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "無法讀取排行榜。");
    if (revision !== rankingRevision) return;
    rankingData = data;
    renderRanking();
}

async function refreshRanking() {
    if (!rankingDialog.open || document.hidden || saving || rankingLoading) return;
    rankingLoading = true;
    try {
        await loadRanking();
    } catch {
        rankingStatus.textContent = "暫時無法更新排行榜，稍後會自動重試。";
    } finally {
        rankingLoading = false;
    }
}

function renderRanking() {
    if (!rankingData) return;
    const entries = rankingData[activeRanking];
    ranking.replaceChildren(...entries.map(({ name, score, account, elapsed_ms, steps }) => {
        const item = document.createElement("li");
        const points = document.createElement("strong");
        points.textContent = elapsed_ms === undefined
            ? steps === undefined ? score.toLocaleString("zh-TW") : `${steps.toLocaleString("zh-TW")} 步`
            : formatTime(elapsed_ms);
        item.append(document.createTextNode(account ? `${name}（帳號）` : `${name}（訪客）`), points);
        return item;
    }));
    rankingStatus.textContent = entries.length ? "" : "目前還沒有紀錄。";
}

nickname?.addEventListener("input", () => nickname.setCustomValidity(""));
startForm.addEventListener("submit", event => {
    event.preventDefault();
    const name = startForm.dataset.account || nickname.value.trim();
    if (!name) {
        nickname.setCustomValidity("請輸入暱稱。");
        nickname.reportValidity();
        return;
    }
    player = name;
    document.querySelector("#player").textContent = player;
    welcome.hidden = true;
    game.hidden = false;
    restart();
    restartButton.focus();
});
document.querySelectorAll("[data-account-action]").forEach(form => {
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const status = form.querySelector("[role='status']");
        const button = form.querySelector("button");
        button.disabled = true;
        status.textContent = "";
        try {
            const response = await gameRequest(`/api/account/${form.dataset.accountAction}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(Object.fromEntries(new FormData(form))),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            if (!globalThis.request2048) window.location.reload();
        } catch (error) {
            status.textContent = error.message || "操作失敗，請稍後再試。";
        } finally {
            button.disabled = false;
        }
    });
});
restartButton.addEventListener("click", restart);
homeButton.addEventListener("click", () => {
    finishSlide?.();
    if (!player || saving) return;
    game.hidden = true;
    clearInterval(clock);
    player = undefined;
    pointerStart = null;
    welcome.hidden = false;
    document.querySelector("#welcome-title").focus();
});
endButton.addEventListener("click", () => {
    finishSlide?.();
    endRound("stopped");
    render();
});
document.querySelector("#open-ranking").addEventListener("click", () => {
    rankingDialog.showModal();
    clearInterval(rankingTimer);
    void refreshRanking();
    rankingTimer = setInterval(refreshRanking, 5000);
});
rankingDialog.addEventListener("close", () => clearInterval(rankingTimer));
document.addEventListener("visibilitychange", refreshRanking);
rankingDialog.addEventListener("click", event => {
    if (event.target !== rankingDialog) return;
    const { left, right, top, bottom } = rankingDialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom) {
        rankingDialog.close();
    }
});
rankingButtons.forEach(button => {
    button.addEventListener("click", () => {
        activeRanking = button.dataset.ranking;
        clearRankingNote.hidden = activeRanking === "scores";
        rankingButtons.forEach(option => option.setAttribute("aria-pressed", option === button));
        renderRanking();
    });
});
directionButtons.forEach(button => {
    button.addEventListener("click", () => move(button.dataset.direction));
});
document.addEventListener("keydown", event => {
    const direction = directions[event.key];
    if (!player || rankingDialog.open || !direction || event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    move(direction);
});
board.addEventListener("pointerdown", event => {
    if (!event.isPrimary) return;
    pointerStart = { x: event.clientX, y: event.clientY };
    board.setPointerCapture(event.pointerId);
});
board.addEventListener("pointercancel", () => { pointerStart = null; });
board.addEventListener("pointerup", event => {
    if (!event.isPrimary || !pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});
async function submitRound() {
    if (!player || !outcome || outcome === "stopped" || saving || saved) return;
    const entry = { name: player, score, account: startForm.dataset.account || null };
    if (outcome === "won") entry.clear = { elapsed_ms: elapsedMs, steps };
    saving = true;
    save.hidden = true;
    saveStatus.textContent = "登記中…";
    render();
    try {
        await loadRanking(entry);
        saved = true;
        saveStatus.textContent = "已登記本局成績。";
    } catch (error) {
        saveStatus.textContent = `登記失敗：${error.message}`;
        save.hidden = false;
    } finally {
        saving = false;
        render();
    }
}
save.addEventListener("click", submitRound);
