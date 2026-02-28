/* =============================================
   CUSTOM CHESS - script.js
   Modes: normal | gawaras | openworld | spektator | perang | custom | pvp | puasa

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

   MODE CUSTOM:
   - Ukuran papan bebas (lebar & tinggi independen, 4–20)
   - Pengganda bidak inti (Raja, Ratu, Benteng, Kuda, Uskup) 1–100x
   - Pengganda pion 1–100x
   - Kemenangan: Raja musuh semua tereliminasi

   MODE PVP:
   - Setiap bidak punya nyawa: Raja=20, Ratu=15, Benteng=30, Kuda=13, Uskup=10, Pion=3
   - Saat menyerang: nyawa target -1, penyerang terpental ke kotak terjauh
   - Jika nyawa habis (≤0), bidak hilang dari papan
   - Jika Raja habis nyawa → game over

   MODE PUASA:
   - Semua bidak hanya bisa melangkah 1 kotak tanpa terkecuali
   ============================================= */

'use strict';

// =============================================
// CONSTANTS
// =============================================

const PIECE_SYMBOLS = {
    white: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
    black: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }
};

// PvP mode: HP per piece type
const PVP_HP = { K: 20, Q: 15, R: 30, N: 13, B: 10, P: 3 };

const OW_ROWS = 10;
const OW_COLS = 12;

// =============================================
// GAME STATE
// =============================================

let gameState = {
    currentState: [],
    initialState: [],
    currentPlayer: 'white',
    gameMode: null, // 'normal'|'gawaras'|'openworld'|'spektator'|'perang'|'custom'|'pvp'|'puasa'
    boardSize: 8,
    boardCols: 8,  // for custom mode: independent col count
    boardRows: 8,  // for custom mode: independent row count
    selectedCell: null,
    validMoves: [],
    lastMove: null,
    gameOver: false,
    inCheck: false,
    checkPos: null,
    camera: { row: 0, col: 0 },
    scrollInterval: null,
    boardRevealed: true,
    warFlashCells: [],
    // Custom mode settings
    customConfig: { cols: 8, rows: 8, coreMult: 1, pawnMult: 1 },
    // PvP: HP map, key = "row,col" pointing to current HP
    pvpHP: {},
};

// =============================================
// HELPERS
// =============================================

function mkPiece(type, color) { return { type, color }; }

function cloneBoard(b) { return b.map(r => r.map(c => c ? {...c } : null)); }

function inBounds(r, c, rows, cols) {
    // Support both old (r,c,size) and new (r,c,rows,cols) signatures
    if (cols === undefined) { cols = rows; } // backward compat
    return r >= 0 && r < rows && c >= 0 && c < cols;
}

function isWar() { return gameState.gameMode === 'perang'; }
function isPvP() { return gameState.gameMode === 'pvp'; }
function isPuasa() { return gameState.gameMode === 'puasa'; }

// Get board dimensions
function getBoardDims() {
    if (gameState.gameMode === 'custom') {
        return { rows: gameState.boardRows, cols: gameState.boardCols };
    }
    return { rows: gameState.boardSize, cols: gameState.boardSize };
}

function inBoundsGs(r, c) {
    const { rows, cols } = getBoardDims();
    return r >= 0 && r < rows && c >= 0 && c < cols;
}

// =============================================
// PvP HP HELPERS
// =============================================

function pvpKey(r, c) { return `${r},${c}`; }

function pvpGetHP(r, c) {
    const k = pvpKey(r, c);
    return gameState.pvpHP[k] !== undefined ? gameState.pvpHP[k] : 0;
}

function pvpSetHP(r, c, hp) {
    gameState.pvpHP[pvpKey(r, c)] = hp;
}

function pvpDeleteHP(r, c) {
    delete gameState.pvpHP[pvpKey(r, c)];
}

function pvpMoveHP(fromR, fromC, toR, toC) {
    const hp = pvpGetHP(fromR, fromC);
    pvpDeleteHP(fromR, fromC);
    pvpSetHP(toR, toC, hp);
}

// Initialize HP for a whole board
function pvpInitHP(board) {
    gameState.pvpHP = {};
    const { rows, cols } = getBoardDims();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const p = board[r][c];
            if (p) pvpSetHP(r, c, PVP_HP[p.type] || 1);
        }
    }
}

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

/**
 * Build a custom board with given dimensions and piece multipliers.
 * Core pieces (R,N,B,Q,K) are repeated coreMult times on back row(s).
 * Pawns fill pawnMult rows.
 */
function buildCustomBoard(rows, cols, coreMult, pawnMult) {
    const board = Array.from({ length: rows }, () => Array(cols).fill(null));
    const baseBack = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

    // Build core pieces array repeated
    let coreArr = [];
    for (let i = 0; i < coreMult; i++) coreArr = coreArr.concat(baseBack);

    // Place core pieces on back rows (fill as many rows as needed)
    const placeBack = (color, startRow, direction) => {
        let remaining = [...coreArr];
        let rowOffset = 0;
        while (remaining.length > 0) {
            const rowIdx = startRow + rowOffset * direction;
            if (rowIdx < 0 || rowIdx >= rows) break;
            const toPlace = remaining.splice(0, cols);
            for (let c = 0; c < toPlace.length; c++) {
                board[rowIdx][c] = mkPiece(toPlace[c], color);
            }
            rowOffset++;
        }
        return rowOffset; // how many rows used
    };

    const blackCoreRows = placeBack('black', 0, 1);
    const whiteCoreRows = placeBack('white', rows - 1, -1);

    // Pawns: pawnMult total pawns per side = cols * pawnMult (spread into rows of cols)
    const totalPawns = cols * pawnMult;
    const pawnRowsNeeded = Math.ceil(totalPawns / cols);

    const placePawns = (color, startRow, direction) => {
        let placed = 0;
        for (let pr = 0; pr < pawnRowsNeeded && placed < totalPawns; pr++) {
            const rowIdx = startRow + pr * direction;
            if (rowIdx < 0 || rowIdx >= rows) break;
            for (let c = 0; c < cols && placed < totalPawns; c++) {
                if (!board[rowIdx][c]) {
                    board[rowIdx][c] = mkPiece('P', color);
                    placed++;
                }
            }
        }
    };

    placePawns('black', blackCoreRows, 1);
    placePawns('white', rows - 1 - whiteCoreRows, -1);

    return board;
}

// =============================================
// MOVE GENERATION
// =============================================

/**
 * Pseudo-legal moves (ignore check legality).
 * In war mode, Rooks are immune to capture and King moves 2 steps.
 * In puasa mode, all pieces can only move 1 square.
 */
function getPseudoMoves(board, row, col, sizeOrRows, cols) {
    const piece = board[row][col];
    if (!piece) return [];
    const moves = [];
    const { type, color } = piece;
    const opp = color === 'white' ? 'black' : 'white';
    const war = isWar();
    const puasa = isPuasa();

    // Determine board dimensions
    let numRows, numCols;
    if (cols !== undefined) {
        numRows = sizeOrRows;
        numCols = cols;
    } else {
        numRows = sizeOrRows;
        numCols = sizeOrRows;
    }

    const ib = (r, c) => r >= 0 && r < numRows && c >= 0 && c < numCols;

    const slide = (dr, dc) => {
        let r = row + dr, c = col + dc;
        // In puasa mode, only slide 1 step
        const maxSteps = puasa ? 1 : Infinity;
        let steps = 0;
        while (ib(r, c) && steps < maxSteps) {
            const t = board[r][c];
            if (t) {
                if (t.color === opp && !(war && t.type === 'R')) {
                    moves.push({ row: r, col: c, isCapture: true });
                }
                break;
            }
            moves.push({ row: r, col: c, isCapture: false });
            r += dr; c += dc;
            steps++;
        }
    };

    switch (type) {
        case 'P': {
            const dir = color === 'white' ? -1 : 1;
            // Pawn start row — generalized
            let pawnStart;
            if (gameState.gameMode === 'openworld') {
                pawnStart = color === 'white' ? 88 : 11;
            } else if (gameState.gameMode === 'custom') {
                // white pawn start: row just above white core rows
                // Approximate: row = numRows - 1 - (coreRows) - (first pawn row offset)
                // Just allow double move from initial state row
                pawnStart = -1; // disable double move in custom for simplicity
            } else {
                pawnStart = color === 'white' ? 6 : 1;
            }
            const r1 = row + dir;
            if (ib(r1, col) && !board[r1][col]) {
                moves.push({ row: r1, col, isCapture: false });
                const r2 = row + 2 * dir;
                if (!puasa && row === pawnStart && ib(r2, col) && !board[r2][col])
                    moves.push({ row: r2, col, isCapture: false });
            }
            for (const dc of [-1, 1]) {
                const rr = row + dir, cc = col + dc;
                if (!ib(rr, cc)) continue;
                const t = board[rr][cc];
                if (t && t.color === opp) {
                    if (!(war && t.type === 'R'))
                        moves.push({ row: rr, col: cc, isCapture: true });
                }
            }
            break;
        }
        case 'R':
            slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1);
            break;
        case 'B':
            slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1);
            break;
        case 'Q':
            slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1);
            slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1);
            break;
        case 'N': {
            if (puasa) {
                // In puasa mode, knight also moves only 1 square (like a king)
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (!dr && !dc) continue;
                        const r = row + dr, c = col + dc;
                        if (!ib(r, c)) continue;
                        const t = board[r][c];
                        if (!t) moves.push({ row: r, col: c, isCapture: false });
                        else if (t.color === opp && !(war && t.type === 'R'))
                            moves.push({ row: r, col: c, isCapture: true });
                    }
                }
            } else {
                const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                for (const [dr, dc] of jumps) {
                    const r = row + dr, c = col + dc;
                    if (!ib(r, c)) continue;
                    const t = board[r][c];
                    if (!t) moves.push({ row: r, col: c, isCapture: false });
                    else if (t.color === opp && !(war && t.type === 'R'))
                        moves.push({ row: r, col: c, isCapture: true });
                }
            }
            break;
        }
        case 'K': {
            const maxSteps = war ? 2 : 1;
            const added = new Set();
            for (let dr = -maxSteps; dr <= maxSteps; dr++) {
                for (let dc = -maxSteps; dc <= maxSteps; dc++) {
                    if (!dr && !dc) continue;
                    if (Math.abs(dr) > maxSteps || Math.abs(dc) > maxSteps) continue;
                    const r = row + dr, c = col + dc;
                    if (!ib(r, c)) continue;
                    const key = `${r},${c}`;
                    if (added.has(key)) continue;
                    if (war && (Math.abs(dr) === 2 || Math.abs(dc) === 2)) {
                        const mr = row + Math.sign(dr), mc = col + Math.sign(dc);
                        if (ib(mr, mc) && board[mr][mc] && board[mr][mc].color === color) continue;
                    }
                    const t = board[r][c];
                    if (!t) { moves.push({ row: r, col: c, isCapture: false }); added.add(key); }
                    else if (t.color === opp) {
                        if (!(war && t.type === 'R')) { moves.push({ row: r, col: c, isCapture: true }); added.add(key); }
                    }
                }
            }
            break;
        }
    }
    return moves;
}

// =============================================
// CHECK DETECTION
// =============================================

function isKingAttacked(board, color, numRows, numCols) {
    if (numCols === undefined) numCols = numRows;
    let kr = -1, kc = -1;
    outer: for (let r = 0; r < numRows; r++)
        for (let c = 0; c < numCols; c++) {
            const p = board[r][c];
            if (p && p.type === 'K' && p.color === color) { kr = r; kc = c; break outer; }
        }
    if (kr < 0) return false;

    const opp = color === 'white' ? 'black' : 'white';
    for (let r = 0; r < numRows; r++)
        for (let c = 0; c < numCols; c++) {
            const p = board[r][c];
            if (!p || p.color !== opp) continue;
            if (getPseudoMoves(board, r, c, numRows, numCols).some(m => m.row === kr && m.col === kc))
                return true;
        }
    return false;
}

function getValidMoves(board, row, col, numRows, numCols) {
    if (numCols === undefined) numCols = numRows;
    const piece = board[row][col];
    if (!piece) return [];

    // PvP mode: capture moves are handled differently (no need to filter by check for captures)
    // But still need to prevent moves that leave king in check
    const legal = [];
    for (const move of getPseudoMoves(board, row, col, numRows, numCols)) {
        const tb = cloneBoard(board);
        tb[move.row][move.col] = tb[row][col];
        tb[row][col] = null;
        if (!isKingAttacked(tb, piece.color, numRows, numCols)) legal.push(move);
    }
    return legal;
}

function hasLegalMoves(board, color, numRows, numCols) {
    if (numCols === undefined) numCols = numRows;
    for (let r = 0; r < numRows; r++)
        for (let c = 0; c < numCols; c++) {
            const p = board[r][c];
            if (!p || p.color !== color) continue;
            if (getValidMoves(board, r, c, numRows, numCols).length > 0) return true;
        }
    return false;
}

function evaluateState(board, color, numRows, numCols) {
    if (numCols === undefined) numCols = numRows;
    const attacked = isKingAttacked(board, color, numRows, numCols);
    const hasMove = hasLegalMoves(board, color, numRows, numCols);
    if (attacked && !hasMove) return 'checkmate';
    if (!attacked && !hasMove) return 'stalemate';
    if (attacked) return 'check';
    return null;
}

function findKing(board, color, numRows, numCols) {
    if (numCols === undefined) numCols = numRows;
    for (let r = 0; r < numRows; r++)
        for (let c = 0; c < numCols; c++) {
            const p = board[r][c];
            if (p && p.type === 'K' && p.color === color) return { row: r, col: c };
        }
    return null;
}

// Custom mode: check if all kings of a color are gone
function allKingsGone(board, color, numRows, numCols) {
    if (numCols === undefined) numCols = numRows;
    for (let r = 0; r < numRows; r++)
        for (let c = 0; c < numCols; c++) {
            const p = board[r][c];
            if (p && p.type === 'K' && p.color === color) return false;
        }
    return true;
}

// =============================================
// WAR MODE: SPECIAL AFTER-MOVE EFFECTS
// =============================================

function applyWarEffects(board, piece, fromRow, fromCol, toRow, toCol, numRows, numCols) {
    if (numCols === undefined) numCols = numRows;
    if (!isWar()) return [];
    const opp = piece.color === 'white' ? 'black' : 'white';
    const flashCells = [];
    const ib = (r, c) => r >= 0 && r < numRows && c >= 0 && c < numCols;

    switch (piece.type) {
        case 'N': {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (!dr && !dc) continue;
                    const r = toRow + dr, c = toCol + dc;
                    if (!ib(r, c)) continue;
                    const t = board[r][c];
                    if (t && t.color === opp && t.type !== 'R') {
                        board[r][c] = null;
                        flashCells.push({ row: r, col: c, flashType: 'aoe' });
                    } else if (!t) {
                        flashCells.push({ row: r, col: c, flashType: 'aoe' });
                    }
                }
            }
            break;
        }
        case 'B': {
            const dr = toRow > fromRow ? 1 : -1;
            const dc = toCol > fromCol ? 1 : -1;
            const sweepDirs = [[dr, dc], [dr, -dc]];
            for (const [sdr, sdc] of sweepDirs) {
                const r = toRow + sdr, c = toCol + sdc;
                if (!ib(r, c)) continue;
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
        case 'Q': {
            const rawDr = toRow - fromRow;
            const rawDc = toCol - fromCol;
            const dr = rawDr === 0 ? 0 : (rawDr > 0 ? 1 : -1);
            const dc = rawDc === 0 ? 0 : (rawDc > 0 ? 1 : -1);
            let arcDirs;
            if (dr !== 0 && dc !== 0) {
                arcDirs = [[dr, dc], [dr, 0], [0, dc]];
            } else if (dr !== 0) {
                arcDirs = [[dr, -1], [dr, 0], [dr, 1]];
            } else {
                arcDirs = [[-1, dc], [0, dc], [1, dc]];
            }
            for (const [adr, adc] of arcDirs) {
                const r = toRow + adr, c = toCol + adc;
                if (!ib(r, c)) continue;
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
        default:
            break;
    }
    return flashCells;
}

// =============================================
// PvP MODE: BOUNCE LOGIC
// =============================================

/**
 * Find the farthest empty cell for the bouncing attacker.
 * The attacker at (fromRow,fromCol) attacked (toRow,toCol) but target survived.
 * Attacker is hurled away from the target (opposite direction).
 *
 * We clear the attacker's origin cell conceptually during the scan so it
 * doesn't block its own bounce path.
 */
function findBounceDest(board, fromRow, fromCol, toRow, toCol, numRows, numCols) {
    if (numCols === undefined) numCols = numRows;
    const ib = (r, c) => r >= 0 && r < numRows && c >= 0 && c < numCols;

    // Unit direction away from target
    const rawR = fromRow - toRow;
    const rawC = fromCol - toCol;
    const normR = rawR === 0 ? 0 : (rawR > 0 ? 1 : -1);
    const normC = rawC === 0 ? 0 : (rawC > 0 ? 1 : -1);

    // Guard: no direction (shouldn't happen)
    if (normR === 0 && normC === 0) return { row: fromRow, col: fromCol };

    // Scan starting from the cell BEYOND fromRow,fromCol (the attacker's own
    // square is vacated during bounce, so skip it and search further out).
    let bestR = fromRow;
    let bestC = fromCol;
    let r = fromRow + normR;
    let c = fromCol + normC;

    while (ib(r, c)) {
        // Treat the attacker's own origin cell as empty (it's leaving)
        const cellContent = (r === fromRow && c === fromCol) ? null : board[r][c];
        if (!cellContent) {
            bestR = r;
            bestC = c;
        } else {
            break;
        }
        r += normR;
        c += normC;
    }

    return { row: bestR, col: bestC };
}

// =============================================
// RESPAWN (Ga Waras)
// =============================================

function findRespawnPosition(piece) {
    const board = gameState.currentState;
    const { rows, cols } = getBoardDims();
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
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited.has(`${nr},${nc}`))
                queue.push({ row: nr, col: nc });
        }
    }
    return null;
}

// =============================================
// GAME INIT
// =============================================

function initGame(mode) {
    let size, rows, cols;

    if (mode === 'openworld') {
        size = 100; rows = 100; cols = 100;
    } else if (mode === 'custom') {
        const cfg = gameState.customConfig;
        rows = cfg.rows; cols = cfg.cols; size = Math.max(rows, cols);
    } else {
        size = 8; rows = 8; cols = 8;
    }

    const sc = Math.floor((size - OW_COLS) / 2);

    gameState.gameMode = mode;
    gameState.boardSize = size;
    gameState.boardRows = rows;
    gameState.boardCols = cols;
    gameState.currentPlayer = 'white';
    gameState.selectedCell = null;
    gameState.validMoves = [];
    gameState.lastMove = null;
    gameState.gameOver = false;
    gameState.inCheck = false;
    gameState.checkPos = null;
    gameState.boardRevealed = true;
    gameState.warFlashCells = [];
    gameState.pvpHP = {};
    gameState.camera = {
        row: mode === 'openworld' ? 83 : 0,
        col: mode === 'openworld' ? Math.max(0, sc) : 0
    };

    let initial;
    if (mode === 'custom') {
        const cfg = gameState.customConfig;
        initial = buildCustomBoard(rows, cols, cfg.coreMult, cfg.pawnMult);
    } else {
        initial = buildInitialBoard(size);
    }
    gameState.initialState = cloneBoard(initial);
    gameState.currentState = cloneBoard(initial);

    if (mode === 'pvp') {
        pvpInitHP(gameState.currentState);
    }

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
        boardRows,
        boardCols,
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
    const pvp = gameMode === 'pvp';

    const numRows = (gameMode === 'custom') ? boardRows : boardSize;
    const numCols = (gameMode === 'custom') ? boardCols : boardSize;

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
        visRows = numRows;
        visCols = numCols;
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

    const validSet = new Set(validMoves.map(m => `${m.row},${m.col}`));
    const captureSet = new Set(validMoves.filter(m => m.isCapture).map(m => `${m.row},${m.col}`));
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

            if (captureSet.has(key)) cls += ' valid-capture';
            else if (validSet.has(key)) cls += (war ? ' war-valid-move' : ' valid-move');

            if (lastMove) {
                const { from, to } = lastMove;
                if ((from.row === r && from.col === c) || (to.row === r && to.col === c)) cls += ' last-move';
            }

            if (checkPos && checkPos.row === r && checkPos.col === c) cls += ' in-check';

            if (flashMap.has(key)) {
                const ft = flashMap.get(key);
                if (ft === 'aoe') cls += ' war-aoe';
                if (ft === 'sweep') cls += ' war-sweep';
                if (ft === 'arc') cls += ' war-arc';
            }

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

                // PvP: show HP bar
                if (pvp) {
                    const hp = pvpGetHP(r, c);
                    const maxHp = PVP_HP[piece.type] || 1;
                    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
                    const hpBar = document.createElement('div');
                    hpBar.className = 'pvp-hp-bar';
                    const hpFill = document.createElement('div');
                    hpFill.className = 'pvp-hp-fill';
                    hpFill.style.width = pct + '%';
                    // Color based on HP
                    if (pct > 60) hpFill.style.background = '#00FF88';
                    else if (pct > 30) hpFill.style.background = '#FFB700';
                    else hpFill.style.background = '#FF4560';
                    hpBar.appendChild(hpFill);

                    const hpText = document.createElement('div');
                    hpText.className = 'pvp-hp-text';
                    hpText.textContent = hp;

                    pieceEl.appendChild(hpBar);
                    pieceEl.appendChild(hpText);
                }

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

    if (warFlashCells.length > 0) {
        setTimeout(() => { gameState.warFlashCells = []; renderBoard(); }, 500);
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
    const { boardRows, boardCols, boardSize, gameMode } = gameState;
    const numRows = gameMode === 'custom' ? boardRows : boardSize;
    const numCols = gameMode === 'custom' ? boardCols : boardSize;
    gameState.selectedCell = { row, col };
    gameState.validMoves = getValidMoves(gameState.currentState, row, col, numRows, numCols);
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
    const { boardRows, boardCols, boardSize } = gameState;
    const numRows = mode === 'custom' ? boardRows : boardSize;
    const numCols = mode === 'custom' ? boardCols : boardSize;
    const war = mode === 'perang';
    const pvp = mode === 'pvp';
    const custom = mode === 'custom';

    const moving = board[fromRow][fromCol];
    const captured = board[toRow][toCol] ? {...board[toRow][toCol]} : null;

    // ── PvP MODE: special capture / bounce logic ──
    if (pvp && captured) {
        // Reduce target HP by 1
        const targetHP = pvpGetHP(toRow, toCol) - 1;

        if (targetHP <= 0) {
            // Target dies: remove it
            pvpDeleteHP(toRow, toCol);
            board[toRow][toCol] = null;

            // Check if a King died
            if (captured.type === 'K') {
                // Move attacker in
                board[toRow][toCol] = moving;
                pvpMoveHP(fromRow, fromCol, toRow, toCol);
                board[fromRow][fromCol] = null;

                gameState.lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };
                gameState.selectedCell = null;
                gameState.validMoves = [];
                renderBoard();
                updateCheckAlert('checkmate');
                setTimeout(() => showGameOver(gameState.currentPlayer), 900);
                gameState.gameOver = true;
                return;
            }

            // Attacker moves in normally
            board[toRow][toCol] = moving;
            pvpMoveHP(fromRow, fromCol, toRow, toCol);
            board[fromRow][fromCol] = null;
        } else {
            // Target survives: update HP
            pvpSetHP(toRow, toCol, targetHP);

            // Calculate bounce BEFORE modifying the board.
            // board[fromRow][fromCol] still holds the attacker so scan is accurate.
            const bounce = findBounceDest(board, fromRow, fromCol, toRow, toCol, numRows, numCols);

            // Move attacker on the board
            if (bounce.row === fromRow && bounce.col === fromCol) {
                // No free cell found — attacker stays put (already in correct cell)
                // Nothing to do; board is unchanged for the attacker
            } else {
                board[bounce.row][bounce.col] = moving;
                board[fromRow][fromCol] = null;
                pvpMoveHP(fromRow, fromCol, bounce.row, bounce.col);
            }

            gameState.lastMove = { from: { row: fromRow, col: fromCol }, to: { row: bounce.row, col: bounce.col } };
            gameState.selectedCell = null;
            gameState.validMoves = [];

            // Show bounce alert
            updateCheckAlert('pvp-bounce');
            renderBoard();
            animatePieceMove(bounce.row, bounce.col);
            switchTurn();
            return;
        }
    } else {
        // Normal move (no PvP special handling)
        board[toRow][toCol] = moving;
        board[fromRow][fromCol] = null;
        // PvP: carry HP to new position (no HP change — just moving)
        if (pvp) pvpMoveHP(fromRow, fromCol, toRow, toCol);
    }

    // Pawn promotion → Queen
    if (moving.type === 'P') {
        if (moving.color === 'white' && toRow === 0) {
            board[toRow][toCol] = mkPiece('Q', 'white');
            if (pvp) pvpSetHP(toRow, toCol, PVP_HP['Q']);
        }
        if (moving.color === 'black' && toRow === numRows - 1) {
            board[toRow][toCol] = mkPiece('Q', 'black');
            if (pvp) pvpSetHP(toRow, toCol, PVP_HP['Q']);
        }
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
        warFlash = applyWarEffects(board, moving, fromRow, fromCol, toRow, toCol, numRows, numCols);
        gameState.warFlashCells = warFlash;

        const oppColor = moving.color === 'white' ? 'black' : 'white';
        if (!findKing(board, oppColor, numRows, numCols)) {
            renderBoard();
            updateCheckAlert('checkmate');
            setTimeout(() => showGameOver(moving.color), 600);
            gameState.gameOver = true;
            return;
        }
    } else {
        gameState.warFlashCells = [];
    }

    // ── CUSTOM MODE: win condition = all enemy kings gone ──
    if (custom) {
        const oppColor = moving.color === 'white' ? 'black' : 'white';
        if (allKingsGone(board, oppColor, numRows, numCols)) {
            renderBoard();
            animatePieceMove(toRow, toCol);
            updateCheckAlert('checkmate');
            setTimeout(() => showGameOver(moving.color), 900);
            gameState.gameOver = true;
            return;
        }
        // In custom mode skip standard check/stalemate for simplicity (multiple kings complicate it)
        renderBoard();
        animatePieceMove(toRow, toCol);
        updateCheckAlert(null);
        switchTurn();
        return;
    }

    // ── PvP MODE: win condition = King is dead (handled above) or no kings left ──
    if (pvp) {
        const oppColor = moving.color === 'white' ? 'black' : 'white';
        if (!findKing(board, oppColor, numRows, numCols)) {
            renderBoard();
            animatePieceMove(toRow, toCol);
            updateCheckAlert('checkmate');
            setTimeout(() => showGameOver(moving.color), 900);
            gameState.gameOver = true;
            return;
        }
        // No check detection in PvP (HP mechanic replaces it)
        renderBoard();
        animatePieceMove(toRow, toCol);
        updateCheckAlert(null);
        switchTurn();
        return;
    }

    // Standard evaluate
    const opp = gameState.currentPlayer === 'white' ? 'black' : 'white';
    const status = evaluateState(board, opp, numRows, numCols);

    if (status === 'checkmate') {
        gameState.inCheck = true;
        gameState.checkPos = findKing(board, opp, numRows, numCols);
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
        gameState.checkPos = findKing(board, opp, numRows, numCols);
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
        el.classList.remove('checkmate', 'war-event', 'pvp-event');
        return;
    }
    el.classList.remove('hidden');

    const oppName = gameState.currentPlayer === 'white' ? 'HITAM' : 'PUTIH';

    if (status === 'check') {
        el.classList.remove('checkmate', 'war-event', 'pvp-event');
        textEl.textContent = `⚠ SKAK! Raja ${oppName} terancam!`;
    } else if (status === 'checkmate') {
        el.classList.add('checkmate');
        el.classList.remove('war-event', 'pvp-event');
        textEl.textContent = `☠ SKAKMAT! Raja ${oppName} tidak bisa lari!`;
    } else if (status === 'stalemate') {
        el.classList.remove('checkmate', 'war-event', 'pvp-event');
        textEl.textContent = `🤝 STALEMATE! Permainan berakhir seri!`;
    } else if (status === 'war-event') {
        el.classList.add('war-event');
        el.classList.remove('checkmate', 'pvp-event');
        textEl.textContent = `💥 EFEK PERANG!`;
    } else if (status === 'pvp-bounce') {
        el.classList.add('pvp-event');
        el.classList.remove('checkmate', 'war-event');
        textEl.textContent = `🏓 BIDAK TERPENTAL! Target hanya kehilangan 1 nyawa!`;
        // Auto-hide after 2s
        setTimeout(() => updateCheckAlert(null), 2000);
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
        case 'up': gameState.camera.row = Math.max(0, gameState.camera.row - 1); break;
        case 'down': gameState.camera.row = Math.min(boardSize - OW_ROWS, gameState.camera.row + 1); break;
        case 'left': gameState.camera.col = Math.max(0, gameState.camera.col - 1); break;
        case 'right': gameState.camera.col = Math.min(boardSize - OW_COLS, gameState.camera.col + 1); break;
    }
    renderBoard();
}

function startScroll(dir) {
    stopScroll();
    scrollCamera(dir);
    gameState.scrollInterval = setInterval(() => scrollCamera(dir), 110);
}

function stopScroll() {
    if (gameState.scrollInterval) { clearInterval(gameState.scrollInterval); gameState.scrollInterval = null; }
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
    let tx0 = 0, ty0 = 0;
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

function showCustomSetup() {
    showScreen('screen-custom');
}

function startCustomGame() {
    const cols = parseInt(document.getElementById('inp-cols').value);
    const rows = parseInt(document.getElementById('inp-rows').value);
    const coreMult = parseInt(document.getElementById('inp-core').value);
    const pawnMult = parseInt(document.getElementById('inp-pawn').value);
    gameState.customConfig = { cols, rows, coreMult, pawnMult };
    startGame('custom');
}

function startGame(mode) {
    showScreen('screen-game');

    const sidebar = document.getElementById('ow-sidebar');
    sidebar.classList.toggle('hidden', mode !== 'openworld');

    const warLegend = document.getElementById('war-legend');
    warLegend.classList.toggle('hidden', mode !== 'perang');

    const pvpLegend = document.getElementById('pvp-legend');
    pvpLegend.classList.toggle('hidden', mode !== 'pvp');

    const puasaLegend = document.getElementById('puasa-legend');
    puasaLegend.classList.toggle('hidden', mode !== 'puasa');

    const labels = {
        normal: 'NORMAL', gawaras: 'GA WARAS', openworld: 'OPEN WORLD',
        spektator: 'SPEKTATOR', perang: '⚔ PERANG', custom: '🛠 CUSTOM',
        pvp: '❤ PVP', puasa: '🐢 PUASA'
    };
    const modeEl = document.getElementById('mode-label');
    modeEl.textContent = labels[mode] || mode;
    modeEl.classList.toggle('war', mode === 'perang');
    modeEl.classList.toggle('pvp-label', mode === 'pvp');
    modeEl.classList.toggle('puasa-label', mode === 'puasa');
    modeEl.classList.toggle('custom-label', mode === 'custom');

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
