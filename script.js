/* =============================================
   CUSTOM CHESS - script.js
   Modes: normal | gawaras | openworld | spektator | perang

   MODE PERANG special rules:
   R (Benteng) : KEBAL — tidak bisa dimakan oleh siapapun
   N (Kuda)    : LEDAK  — setelah jalan, semua bidak musuh radius 1
                          kotak dari posisi tujuan ikut terhapus
   B (Uskup)   : SAPU   — setelah jalan ke tujuan, 2 kotak serong
                          ke depan (arah gerakan) ikut tersapu
   Q (Ratu)    : TEMBAK — setelah jalan, 3 kotak (serong kiri depan,
                          lurus depan, serong kanan depan) dari posisi
                          tujuan ikut terhapus (1 langkah)
   K (Raja)    : SUPER  — bisa jalan 2 langkah ke segala arah
   ============================================= */

'use strict';

// =============================================
// CONSTANTS
// =============================================

const PIECE_SYMBOLS = {
    white: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
    black: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }
};

const OW_ROWS = 10;
const OW_COLS = 12;

// =============================================
// GAME STATE
// =============================================

let gameState = {
    currentState: [],
    initialState: [],
    currentPlayer: 'white',
    gameMode: null, // 'normal'|'gawaras'|'openworld'|'spektator'|'perang'
    boardSize: 8,
    selectedCell: null,
    validMoves: [],
    lastMove: null,
    gameOver: false,
    inCheck: false,
    checkPos: null,
    camera: { row: 0, col: 0 },
    scrollInterval: null,
    boardRevealed: true,
    // War mode: cells to flash this render cycle
    warFlashCells: [], // [{ row, col, type }]  type: 'aoe'|'sweep'|'arc'
};

// =============================================
// HELPERS
// =============================================

function mkPiece(type, color) { return { type, color }; }

function cloneBoard(b) { return b.map(r => r.map(c => c ? {...c } : null)); }

function inBounds(r, c, size) { return r >= 0 && r < size && c >= 0 && c < size; }

function isWar() { return gameState.gameMode === 'perang'; }

// =============================================
// BOARD SETUP
// =============================================

function buildInitialBoard(size) {
    const board = Array.from({ length: size }, () => Array(size).fill(null));
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

    if (size === 8) {
        for (let c = 0; c < 8; c++) {
            board[0][c] = mkPiece(back[c], 'black');
            board[1][c] = mkPiece('P', 'black');
            board[6][c] = mkPiece('P', 'white');
            board[7][c] = mkPiece(back[c], 'white');
        }
    } else {
        const sc = Math.floor((size - 8) / 2);
        for (let c = 0; c < 8; c++) {
            board[10][sc + c] = mkPiece(back[c], 'black');
            board[11][sc + c] = mkPiece('P', 'black');
            board[88][sc + c] = mkPiece('P', 'white');
            board[89][sc + c] = mkPiece(back[c], 'white');
        }
    }
    return board;
}

// =============================================
// MOVE GENERATION
// =============================================

/**
 * Pseudo-legal moves (ignore check legality).
 * In war mode, Rooks are immune to capture and King moves 2 steps.
 */
function getPseudoMoves(board, row, col, size) {
    const piece = board[row][col];
    if (!piece) return [];
    const moves = [];
    const { type, color } = piece;
    const opp = color === 'white' ? 'black' : 'white';
    const war = isWar();

    const slide = (dr, dc) => {
        let r = row + dr,
            c = col + dc;
        while (inBounds(r, c, size)) {
            const t = board[r][c];
            if (t) {
                // War: Rooks are immune — cannot be captured
                if (t.color === opp && !(war && t.type === 'R')) {
                    moves.push({ row: r, col: c, isCapture: true });
                }
                break;
            }
            moves.push({ row: r, col: c, isCapture: false });
            r += dr;
            c += dc;
        }
    };

    switch (type) {
        case 'P':
            {
                const dir = color === 'white' ? -1 : 1;
                const pawnStart = size === 8 ?
                    (color === 'white' ? 6 : 1) :
                    (color === 'white' ? 88 : 11);
                const r1 = row + dir;
                if (inBounds(r1, col, size) && !board[r1][col]) {
                    moves.push({ row: r1, col, isCapture: false });
                    const r2 = row + 2 * dir;
                    if (row === pawnStart && inBounds(r2, col, size) && !board[r2][col])
                        moves.push({ row: r2, col, isCapture: false });
                }
                for (const dc of[-1, 1]) {
                    const rr = row + dir,
                        cc = col + dc;
                    if (!inBounds(rr, cc, size)) continue;
                    const t = board[rr][cc];
                    if (t && t.color === opp) {
                        // War: Rooks immune from pawn capture too
                        if (!(war && t.type === 'R'))
                            moves.push({ row: rr, col: cc, isCapture: true });
                    }
                }
                break;
            }
        case 'R':
            slide(-1, 0);
            slide(1, 0);
            slide(0, -1);
            slide(0, 1);
            break;
        case 'B':
            slide(-1, -1);
            slide(-1, 1);
            slide(1, -1);
            slide(1, 1);
            break;
        case 'Q':
            slide(-1, 0);
            slide(1, 0);
            slide(0, -1);
            slide(0, 1);
            slide(-1, -1);
            slide(-1, 1);
            slide(1, -1);
            slide(1, 1);
            break;
        case 'N':
            {
                const jumps = [
                    [-2, -1],
                    [-2, 1],
                    [-1, -2],
                    [-1, 2],
                    [1, -2],
                    [1, 2],
                    [2, -1],
                    [2, 1]
                ];
                for (const [dr, dc] of jumps) {
                    const r = row + dr,
                        c = col + dc;
                    if (!inBounds(r, c, size)) continue;
                    const t = board[r][c];
                    if (!t) {
                        moves.push({ row: r, col: c, isCapture: false });
                    } else if (t.color === opp) {
                        // War: Rooks immune
                        if (!(war && t.type === 'R'))
                            moves.push({ row: r, col: c, isCapture: true });
                    }
                }
                break;
            }
        case 'K':
            {
                // War mode: King can move up to 2 steps (any direction)
                const maxSteps = war ? 2 : 1;
                const added = new Set();
                for (let dr = -maxSteps; dr <= maxSteps; dr++) {
                    for (let dc = -maxSteps; dc <= maxSteps; dc++) {
                        if (!dr && !dc) continue;
                        // For 2-step: must actually be within Manhattan-like range but not exceed maxSteps
                        if (Math.abs(dr) > maxSteps || Math.abs(dc) > maxSteps) continue;
                        const r = row + dr,
                            c = col + dc;
                        if (!inBounds(r, c, size)) continue;
                        const key = `${r},${c}`;
                        if (added.has(key)) continue;
                        // For war 2-step: check path isn't blocked (it's a sliding king)
                        // Simplified: check intermediate cell isn't blocking (only for pure horizontal/vertical/diagonal 2-step)
                        if (war && (Math.abs(dr) === 2 || Math.abs(dc) === 2)) {
                            const mr = row + Math.sign(dr),
                                mc = col + Math.sign(dc);
                            if (inBounds(mr, mc, size) && board[mr][mc] && board[mr][mc].color === color) continue;
                        }
                        const t = board[r][c];
                        if (!t) {
                            moves.push({ row: r, col: c, isCapture: false });
                            added.add(key);
                        } else if (t.color === opp) {
                            if (!(war && t.type === 'R'))
                                moves.push({ row: r, col: c, isCapture: true });
                            added.add(key);
                        }
                    }
                }
                break;
            }
    }
    return moves;
}

// =============================================
// CHECK DETECTION (uses standard 1-step king range for attack calc)
// =============================================

function isKingAttacked(board, color, size) {
    let kr = -1,
        kc = -1;
    outer: for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) {
            const p = board[r][c];
            if (p && p.type === 'K' && p.color === color) { kr = r;
                kc = c; break outer; }
        }
    if (kr < 0) return false;

    const opp = color === 'white' ? 'black' : 'white';
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) {
            const p = board[r][c];
            if (!p || p.color !== opp) continue;
            if (getPseudoMoves(board, r, c, size).some(m => m.row === kr && m.col === kc))
                return true;
        }
    return false;
}

function getValidMoves(board, row, col, size) {
    const piece = board[row][col];
    if (!piece) return [];
    const legal = [];
    for (const move of getPseudoMoves(board, row, col, size)) {
        const tb = cloneBoard(board);
        tb[move.row][move.col] = tb[row][col];
        tb[row][col] = null;
        if (!isKingAttacked(tb, piece.color, size)) legal.push(move);
    }
    return legal;
}

function hasLegalMoves(board, color, size) {
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) {
            const p = board[r][c];
            if (!p || p.color !== color) continue;
            if (getValidMoves(board, r, c, size).length > 0) return true;
        }
    return false;
}

function evaluateState(board, color, size) {
    const attacked = isKingAttacked(board, color, size);
    const hasMove = hasLegalMoves(board, color, size);
    if (attacked && !hasMove) return 'checkmate';
    if (!attacked && !hasMove) return 'stalemate';
    if (attacked) return 'check';
    return null;
}

function findKing(board, color, size) {
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) {
            const p = board[r][c];
            if (p && p.type === 'K' && p.color === color) return { row: r, col: c };
        }
    return null;
}

// =============================================
// WAR MODE: SPECIAL AFTER-MOVE EFFECTS
// =============================================

/**
 * Apply war-mode side effects after a piece lands at (toRow, toCol).
 * Returns array of { row, col, type } for flash animation.
 * `dr` and `dc` = direction the piece moved (fromRow→toRow etc.)
 */
function applyWarEffects(board, piece, fromRow, fromCol, toRow, toCol, size) {
    if (!isWar()) return [];
    const opp = piece.color === 'white' ? 'black' : 'white';
    const flashCells = [];

    switch (piece.type) {
        // ── KNIGHT: AOE radius 1 around landing square ──
        case 'N':
            {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (!dr && !dc) continue; // skip landing cell itself
                        const r = toRow + dr,
                            c = toCol + dc;
                        if (!inBounds(r, c, size)) continue;
                        const t = board[r][c];
                        if (t && t.color === opp && t.type !== 'R') { // Rooks immune
                            board[r][c] = null;
                            flashCells.push({ row: r, col: c, flashType: 'aoe' });
                        } else if (!t) {
                            flashCells.push({ row: r, col: c, flashType: 'aoe' });
                        }
                    }
                }
                break;
            }

            // ── BISHOP: sweep 2 forward-diagonal cells in direction of travel ──
        case 'B':
            {
                // Direction of bishop's travel
                const dr = toRow > fromRow ? 1 : -1;
                const dc = toCol > fromCol ? 1 : -1;
                // Two "forward" diagonals from landing position (continue same diagonal, and the other forward one)
                const sweepDirs = [
                    [dr, dc], // straight ahead (same diagonal)
                    [dr, -dc], // forward but other diagonal
                ];
                for (const [sdr, sdc] of sweepDirs) {
                    // Sweep 1 step ahead only (immediate next cell)
                    const r = toRow + sdr,
                        c = toCol + sdc;
                    if (!inBounds(r, c, size)) continue;
                    const t = board[r][c];
                    if (t && t.color === opp && t.type !== 'R') {
                        board[r][c] = null;
                        flashCells.push({ row: r, col: c, flashType: 'sweep' });
                    } else {
                        flashCells.push({ row: r, col: c, flashType: 'sweep' });
                    }
                }
                break;
            }

            // ── QUEEN: shoot 3 cells in front arc from landing position ──
        case 'Q':
            {
                // Determine "forward" direction: the direction the queen moved
                const rawDr = toRow - fromRow;
                const rawDc = toCol - fromCol;
                // Normalize to unit vector
                const dr = rawDr === 0 ? 0 : (rawDr > 0 ? 1 : -1);
                const dc = rawDc === 0 ? 0 : (rawDc > 0 ? 1 : -1);

                // 3 arc cells: straight ahead, diagonal left, diagonal right
                // "Left" and "right" relative to movement direction
                let arcDirs;
                if (dr !== 0 && dc !== 0) {
                    // Moving diagonally: arc is straight-dr, straight-dc, and the diagonal
                    arcDirs = [
                        [dr, dc], // straight ahead
                        [dr, 0], // same row advance, no col change
                        [0, dc], // same col advance, no row change
                    ];
                } else if (dr !== 0) {
                    // Moving vertically
                    arcDirs = [
                        [dr, -1],
                        [dr, 0],
                        [dr, 1],
                    ];
                } else {
                    // Moving horizontally
                    arcDirs = [
                        [-1, dc],
                        [0, dc],
                        [1, dc],
                    ];
                }

                for (const [adr, adc] of arcDirs) {
                    const r = toRow + adr,
                        c = toCol + adc;
                    if (!inBounds(r, c, size)) continue;
                    const t = board[r][c];
                    if (t && t.color === opp && t.type !== 'R') {
                        board[r][c] = null;
                        flashCells.push({ row: r, col: c, flashType: 'arc' });
                    } else {
                        flashCells.push({ row: r, col: c, flashType: 'arc' });
                    }
                }
                break;
            }

            // Rook (immune, no special attack), Pawn, King: no AOE effect
        default:
            break;
    }

    return flashCells;
}

// =============================================
// RESPAWN (Ga Waras)
// =============================================

function findRespawnPosition(piece) {
    const board = gameState.currentState;
    const size = gameState.boardSize;
    const init = gameState.initialState;
    const candidates = [];

    for (let r = 0; r < init.length; r++)
        for (let c = 0; c < init[r].length; c++) {
            const p = init[r][c];
            if (p && p.type === piece.type && p.color === piece.color)
                candidates.push({ row: r, col: c });
        }

    for (const pos of candidates)
        if (!board[pos.row][pos.col]) return pos;

    if (!candidates.length) return null;
    const visited = new Set();
    const queue = [candidates[0]];
    while (queue.length) {
        const { row, col } = queue.shift();
        const key = `${row},${col}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if (!board[row][col]) return { row, col };
        for (const [dr, dc] of[[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = row + dr,
                nc = col + dc;
            if (inBounds(nr, nc, size) && !visited.has(`${nr},${nc}`))
                queue.push({ row: nr, col: nc });
        }
    }
    return null;
}

// =============================================
// GAME INIT
// =============================================

function initGame(mode) {
    const size = mode === 'openworld' ? 100 : 8;
    const sc = Math.floor((size - OW_COLS) / 2);

    gameState.gameMode = mode;
    gameState.boardSize = size;
    gameState.currentPlayer = 'white';
    gameState.selectedCell = null;
    gameState.validMoves = [];
    gameState.lastMove = null;
    gameState.gameOver = false;
    gameState.inCheck = false;
    gameState.checkPos = null;
    gameState.boardRevealed = true;
    gameState.warFlashCells = [];
    gameState.camera = {
        row: mode === 'openworld' ? 83 : 0,
        col: mode === 'openworld' ? Math.max(0, sc) : 0
    };

    const initial = buildInitialBoard(size);
    gameState.initialState = cloneBoard(initial);
    gameState.currentState = cloneBoard(initial);

    renderBoard();
    updateTurnIndicator();
    updateCheckAlert(null);
}

// =============================================
// RENDER
// =============================================

function renderBoard() {
    const boardEl = document.getElementById('board');
    const {
        currentState,
        boardSize,
        gameMode,
        camera,
        selectedCell,
        validMoves,
        lastMove,
        checkPos,
        currentPlayer,
        boardRevealed,
        warFlashCells
    } = gameState;
    const war = gameMode === 'perang';

    // Viewport
    let startRow, startCol, visRows, visCols;
    if (gameMode === 'openworld') {
        visRows = OW_ROWS;
        visCols = OW_COLS;
        startRow = Math.max(0, Math.min(camera.row, boardSize - visRows));
        startCol = Math.max(0, Math.min(camera.col, boardSize - visCols));
        gameState.camera.row = startRow;
        gameState.camera.col = startCol;
    } else {
        startRow = 0;
        startCol = 0;
        visRows = boardSize;
        visCols = boardSize;
    }

    // Cell size to fill wrapper
    const wrapper = document.getElementById('board-wrapper');
    const wW = wrapper.clientWidth;
    const wH = wrapper.clientHeight;
    let cellSize = Math.floor(Math.min(wW / visCols, wH / visRows));
    if (cellSize < 1) cellSize = 1;

    boardEl.style.width = (cellSize * visCols) + 'px';
    boardEl.style.height = (cellSize * visRows) + 'px';
    boardEl.style.gridTemplateColumns = `repeat(${visCols}, ${cellSize}px)`;
    boardEl.style.gridTemplateRows = `repeat(${visRows}, ${cellSize}px)`;

    const fontSize = Math.max(10, Math.floor(cellSize * 0.7));

    // Build lookup sets
    const validSet = new Set(validMoves.map(m => `${m.row},${m.col}`));
    const captureSet = new Set(validMoves.filter(m => m.isCapture).map(m => `${m.row},${m.col}`));
    // War flash: build map key → flashType
    const flashMap = new Map(warFlashCells.map(f => [`${f.row},${f.col}`, f.flashType]));

    const frag = document.createDocumentFragment();

    for (let r = startRow; r < startRow + visRows; r++) {
        for (let c = startCol; c < startCol + visCols; c++) {
            const cellEl = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            const key = `${r},${c}`;
            const piece = currentState[r][c];

            let cls = `cell ${isLight ? 'light' : 'dark'}`;

            if (selectedCell && selectedCell.row === r && selectedCell.col === c) cls += ' selected';

            // Valid move highlight — use war style if war mode
            if (captureSet.has(key)) cls += ' valid-capture';
            else if (validSet.has(key)) cls += (war ? ' war-valid-move' : ' valid-move');

            if (lastMove) {
                const { from, to } = lastMove;
                if ((from.row === r && from.col === c) || (to.row === r && to.col === c)) cls += ' last-move';
            }

            if (checkPos && checkPos.row === r && checkPos.col === c) cls += ' in-check';

            // War flash cells
            if (flashMap.has(key)) {
                const ft = flashMap.get(key);
                if (ft === 'aoe') cls += ' war-aoe';
                if (ft === 'sweep') cls += ' war-sweep';
                if (ft === 'arc') cls += ' war-arc';
            }

            // War: rook immune overlay marker
            if (war && piece && piece.type === 'R') cls += ' immune-rook';

            cellEl.className = cls;
            cellEl.dataset.row = r;
            cellEl.dataset.col = c;
            cellEl.style.width = cellSize + 'px';
            cellEl.style.height = cellSize + 'px';
            cellEl.style.fontSize = fontSize + 'px';
            cellEl.addEventListener('click', onCellClick);

            if (piece) {
                const pieceEl = document.createElement('div');
                let pCls = `piece ${piece.color}`;
                if (war && piece.type === 'R') pCls += ' war-rook';
                pieceEl.className = pCls;
                pieceEl.textContent = PIECE_SYMBOLS[piece.color][piece.type];

                if (gameMode === 'spektator' && (!boardRevealed || piece.color !== currentPlayer))
                    pieceEl.classList.add('hidden-piece');

                cellEl.appendChild(pieceEl);
            }

            frag.appendChild(cellEl);
        }
    }

    boardEl.innerHTML = '';
    boardEl.appendChild(frag);

    if (gameMode === 'openworld') {
        const el = document.getElementById('cam-pos');
        if (el) el.textContent = `${startCol},${startRow}`;
    }

    // Clear flash cells after one render cycle
    if (warFlashCells.length > 0) {
        setTimeout(() => { gameState.warFlashCells = [];
            renderBoard(); }, 500);
    }
}

// =============================================
// INTERACTION
// =============================================

function onCellClick(e) {
    if (gameState.gameOver) return;
    if (gameState.gameMode === 'spektator' && !gameState.boardRevealed) return;

    const row = parseInt(e.currentTarget.dataset.row);
    const col = parseInt(e.currentTarget.dataset.col);
    const { currentState, currentPlayer, selectedCell, validMoves } = gameState;
    const clicked = currentState[row][col];

    if (selectedCell) {
        const target = validMoves.find(m => m.row === row && m.col === col);
        if (target) { movePiece(selectedCell.row, selectedCell.col, row, col); return; }
        if (clicked && clicked.color === currentPlayer) { selectPiece(row, col); return; }
        deselectPiece();
        return;
    }

    if (clicked && clicked.color === currentPlayer) selectPiece(row, col);
}

function selectPiece(row, col) {
    gameState.selectedCell = { row, col };
    gameState.validMoves = getValidMoves(gameState.currentState, row, col, gameState.boardSize);
    renderBoard();
}

function deselectPiece() {
    gameState.selectedCell = null;
    gameState.validMoves = [];
    renderBoard();
}

// =============================================
// MOVE PIECE
// =============================================

function movePiece(fromRow, fromCol, toRow, toCol) {
    const board = gameState.currentState;
    const mode = gameState.gameMode;
    const size = gameState.boardSize;
    const war = mode === 'perang';

    const moving = board[fromRow][fromCol];
    const captured = board[toRow][toCol] ? {...board[toRow][toCol] } : null;

    // Move the piece
    board[toRow][toCol] = moving;
    board[fromRow][fromCol] = null;

    // Pawn promotion → Queen
    if (moving.type === 'P') {
        if (moving.color === 'white' && toRow === 0) board[toRow][toCol] = mkPiece('Q', 'white');
        if (moving.color === 'black' && toRow === size - 1) board[toRow][toCol] = mkPiece('Q', 'black');
    }

    gameState.lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };
    gameState.selectedCell = null;
    gameState.validMoves = [];

    // Respawn in Ga Waras
    if (captured && mode === 'gawaras')
        setTimeout(() => respawnPiece(captured), 360);

    // ── WAR MODE: apply special effects ──
    let warFlash = [];
    if (war) {
        warFlash = applyWarEffects(board, moving, fromRow, fromCol, toRow, toCol, size);
        gameState.warFlashCells = warFlash;

        // If any flash cells removed a king (very unlikely but handle it)
        const oppColor = moving.color === 'white' ? 'black' : 'white';
        if (!findKing(board, oppColor, size)) {
            renderBoard();
            updateCheckAlert('checkmate');
            setTimeout(() => showGameOver(moving.color), 600);
            gameState.gameOver = true;
            return;
        }
    } else {
        gameState.warFlashCells = [];
    }

    // Evaluate state for OPPONENT
    const opp = gameState.currentPlayer === 'white' ? 'black' : 'white';
    const status = evaluateState(board, opp, size);

    if (status === 'checkmate') {
        gameState.inCheck = true;
        gameState.checkPos = findKing(board, opp, size);
        renderBoard();
        animatePieceMove(toRow, toCol);
        updateCheckAlert('checkmate');
        setTimeout(() => showGameOver(gameState.currentPlayer), 900);
        gameState.gameOver = true;
        return;
    }
    if (status === 'stalemate') {
        gameState.inCheck = false;
        gameState.checkPos = null;
        renderBoard();
        animatePieceMove(toRow, toCol);
        updateCheckAlert('stalemate');
        setTimeout(() => showGameOver('draw'), 900);
        gameState.gameOver = true;
        return;
    }
    if (status === 'check') {
        gameState.inCheck = true;
        gameState.checkPos = findKing(board, opp, size);
    } else {
        gameState.inCheck = false;
        gameState.checkPos = null;
    }

    renderBoard();
    animatePieceMove(toRow, toCol);
    updateCheckAlert(status);
    switchTurn();
}

// =============================================
// TURN MANAGEMENT
// =============================================

function switchTurn() {
    gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
    updateTurnIndicator();
    if (gameState.gameMode === 'spektator') {
        gameState.boardRevealed = false;
        showSpektatorPassScreen();
    }
}

function updateTurnIndicator() {
    const el = document.getElementById('turn-text');
    if (!el) return;
    if (gameState.currentPlayer === 'white') {
        el.textContent = 'GILIRAN PUTIH ♔';
        el.classList.remove('black-turn');
    } else {
        el.textContent = 'GILIRAN HITAM ♚';
        el.classList.add('black-turn');
    }
}

// =============================================
// CHECK / STATUS ALERT
// =============================================

function updateCheckAlert(status) {
    const el = document.getElementById('check-alert');
    const textEl = document.getElementById('check-alert-text');
    if (!el || !textEl) return;

    if (!status) {
        el.classList.add('hidden');
        el.classList.remove('checkmate', 'war-event');
        return;
    }
    el.classList.remove('hidden');

    const oppName = gameState.currentPlayer === 'white' ? 'HITAM' : 'PUTIH';

    if (status === 'check') {
        el.classList.remove('checkmate', 'war-event');
        textEl.textContent = `⚠ SKAK! Raja ${oppName} terancam!`;
    } else if (status === 'checkmate') {
        el.classList.add('checkmate');
        el.classList.remove('war-event');
        textEl.textContent = `☠ SKAKMAT! Raja ${oppName} tidak bisa lari!`;
    } else if (status === 'stalemate') {
        el.classList.remove('checkmate', 'war-event');
        textEl.textContent = `🤝 STALEMATE! Permainan berakhir seri!`;
    }
}

// =============================================
// SPEKTATOR PASS SCREEN
// =============================================

function showSpektatorPassScreen() {
    const player = gameState.currentPlayer;
    const name = player === 'white' ? 'PUTIH ♔' : 'HITAM ♚';

    const iconEl = document.getElementById('reveal-icon');
    const titleEl = document.getElementById('reveal-title');
    const subEl = document.getElementById('reveal-sub');

    if (iconEl) iconEl.textContent = player === 'white' ? '🙈' : '🙉';
    if (titleEl) {
        titleEl.textContent = `GILIRAN ${name}`;
        titleEl.style.color = player === 'white' ? 'var(--highlight)' : '#7ECBF0';
    }
    if (subEl) subEl.innerHTML = `Berikan HP ke <strong>Pemain ${name}</strong>`;

    showScreen('screen-reveal');
}

function revealBoard() {
    gameState.boardRevealed = true;
    showScreen('screen-game');
    renderBoard();
}

// =============================================
// ANIMATIONS
// =============================================

function animatePieceMove(row, col) {
    const cell = getCellElement(row, col);
    if (!cell) return;
    const piece = cell.querySelector('.piece');
    if (!piece) return;
    piece.classList.add('anim-move');
    piece.addEventListener('animationend', () => piece.classList.remove('anim-move'), { once: true });
}

function animatePieceRespawn(row, col) {
    const cell = getCellElement(row, col);
    if (!cell) return;
    const piece = cell.querySelector('.piece');
    if (!piece) return;
    piece.classList.add('anim-respawn');
    piece.addEventListener('animationend', () => piece.classList.remove('anim-respawn'), { once: true });
}

function getCellElement(row, col) {
    return document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

// =============================================
// RESPAWN
// =============================================

function respawnPiece(piece) {
    const pos = findRespawnPosition(piece);
    if (!pos) return;
    gameState.currentState[pos.row][pos.col] = piece;
    renderBoard();
    setTimeout(() => animatePieceRespawn(pos.row, pos.col), 30);
}

// =============================================
// OPEN WORLD CAMERA
// =============================================

function scrollCamera(dir) {
    const { boardSize } = gameState;
    switch (dir) {
        case 'up':
            gameState.camera.row = Math.max(0, gameState.camera.row - 1);
            break;
        case 'down':
            gameState.camera.row = Math.min(boardSize - OW_ROWS, gameState.camera.row + 1);
            break;
        case 'left':
            gameState.camera.col = Math.max(0, gameState.camera.col - 1);
            break;
        case 'right':
            gameState.camera.col = Math.min(boardSize - OW_COLS, gameState.camera.col + 1);
            break;
    }
    renderBoard();
}

function startScroll(dir) {
    stopScroll();
    scrollCamera(dir);
    gameState.scrollInterval = setInterval(() => scrollCamera(dir), 110);
}

function stopScroll() {
    if (gameState.scrollInterval) { clearInterval(gameState.scrollInterval);
        gameState.scrollInterval = null; }
}

function centerCamera() {
    const { currentState, boardSize, currentPlayer } = gameState;
    for (let r = 0; r < boardSize; r++)
        for (let c = 0; c < boardSize; c++) {
            const p = currentState[r][c];
            if (p && p.type === 'K' && p.color === currentPlayer) {
                gameState.camera.row = Math.max(0, Math.min(r - Math.floor(OW_ROWS / 2), boardSize - OW_ROWS));
                gameState.camera.col = Math.max(0, Math.min(c - Math.floor(OW_COLS / 2), boardSize - OW_COLS));
                renderBoard();
                return;
            }
        }
}

// =============================================
// TOUCH SWIPE (Open World)
// =============================================

(function() {
    let tx0 = 0,
        ty0 = 0;
    document.addEventListener('touchstart', e => {
        if (gameState.gameMode !== 'openworld') return;
        tx0 = e.touches[0].clientX;
        ty0 = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (gameState.gameMode !== 'openworld') return;
        const dx = e.touches[0].clientX - tx0;
        const dy = e.touches[0].clientY - ty0;
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        const s = 2;
        if (Math.abs(dx) >= Math.abs(dy)) {
            gameState.camera.col = dx < 0 ?
                Math.min(gameState.boardSize - OW_COLS, gameState.camera.col + s) :
                Math.max(0, gameState.camera.col - s);
        } else {
            gameState.camera.row = dy < 0 ?
                Math.min(gameState.boardSize - OW_ROWS, gameState.camera.row + s) :
                Math.max(0, gameState.camera.row - s);
        }
        tx0 = e.touches[0].clientX;
        ty0 = e.touches[0].clientY;
        renderBoard();
    }, { passive: true });
})();

// =============================================
// SCREEN MANAGEMENT
// =============================================

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function startGame(mode) {
    showScreen('screen-game');

    // OW sidebar
    const sidebar = document.getElementById('ow-sidebar');
    sidebar.classList.toggle('hidden', mode !== 'openworld');

    // War legend bar
    const warLegend = document.getElementById('war-legend');
    warLegend.classList.toggle('hidden', mode !== 'perang');

    // Mode label
    const labels = { normal: 'NORMAL', gawaras: 'GA WARAS', openworld: 'OPEN WORLD', spektator: 'SPEKTATOR', perang: '⚔ PERANG' };
    const modeEl = document.getElementById('mode-label');
    modeEl.textContent = labels[mode] || mode;
    modeEl.classList.toggle('war', mode === 'perang');

    initGame(mode);
}

function backToMenu() {
    stopScroll();
    gameState.gameMode = null;
    showScreen('screen-menu');
}

function playAgain() { startGame(gameState.gameMode); }

function showGameOver(winner) {
    const iconEl = document.getElementById('gameover-icon');
    const titleEl = document.getElementById('gameover-title');
    const subEl = document.getElementById('gameover-sub');

    if (winner === 'draw') {
        iconEl.textContent = '🤝';
        titleEl.textContent = 'SERI!';
        subEl.textContent = 'Stalemate — permainan berakhir imbang.';
    } else if (winner === 'white') {
        iconEl.textContent = '♔';
        titleEl.textContent = 'PUTIH MENANG!';
        subEl.textContent = 'Pemain Putih menang!';
    } else {
        iconEl.textContent = '♚';
        titleEl.textContent = 'HITAM MENANG!';
        subEl.textContent = 'Pemain Hitam menang!';
    }

    setTimeout(() => showScreen('screen-gameover'), 300);
}

// =============================================
// RESIZE
// =============================================

window.addEventListener('resize', () => {
    if (gameState.gameMode) renderBoard();
});

// =============================================
// REGISTER SERVICE WORKER (PWA)
// =============================================

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js")
            .then(() => console.log("Service Worker registered"))
            .catch(err => console.log("SW error:", err));
    });
}