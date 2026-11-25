import {
  ALL_PIECES,
  BASE_ATTACK_TABLE,
  BUFFER_ROWS,
  COLS,
  GARBAGE_TELEGRAPH_MS,
  I_KICKS,
  JLSTZ_KICKS,
  MAX_LOCK_RESETS,
  PIECE_SHAPES,
  TOTAL_ROWS,
  VISIBLE_ROWS,
} from './constants';
import {
  ActivePiece,
  CellValue,
  LockResult,
  PieceType,
  PlayerBoardState,
  PlayerId,
} from './types';

let garbageBatchCounter = 1;

export function createEmptyGrid(): CellValue[][] {
  return Array.from({ length: TOTAL_ROWS }, () => Array<CellValue>(COLS).fill(null));
}

export function shuffleBag(): PieceType[] {
  const bag = [...ALL_PIECES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function spawnPiece(type: PieceType): ActivePiece {
  // Standard spawn centered at x = 3, y = BUFFER_ROWS - 2 (rows 2..3 so bottom of piece is just at top)
  return {
    type,
    rotation: 0,
    x: 3,
    y: BUFFER_ROWS - 2,
  };
}

export function refillQueue(queue: PieceType[], bag: PieceType[]): { queue: PieceType[]; bag: PieceType[] } {
  const nextQueue = [...queue];
  let nextBag = [...bag];
  while (nextQueue.length < 7) {
    if (nextBag.length === 0) {
      nextBag = shuffleBag();
    }
    nextQueue.push(nextBag.pop()!);
  }
  return { queue: nextQueue, bag: nextBag };
}

export function createPlayerBoard(id: PlayerId, label: string): PlayerBoardState {
  const { queue, bag } = refillQueue([], []);
  const firstType = queue.shift()!;
  const filled = refillQueue(queue, bag);

  return {
    id,
    label,
    grid: createEmptyGrid(),
    active: spawnPiece(firstType),
    hold: null,
    holdUsed: false,
    queue: filled.queue,
    bag: filled.bag,
    combo: 0,
    incomingGarbage: [],
    gravityAccMs: 0,
    lockTimerMs: 0,
    lockResets: 0,
    isGrounded: false,
    stats: {
      score: 0,
      level: 1,
      kos: 0,
      linesCleared: 0,
      maxCombo: 0,
      garbageSent: 0,
      quads: 0,
      piecesPlaced: 0,
      bombChains: 0,
    },
    shakeX: 0,
    shakeY: 0,
    shakeTimerMs: 0,
    koFlashAlpha: 0,
    hardDropTrails: [],
    clearFlashes: [],
    particles: [],
  };
}

export function getPieceCells(piece: ActivePiece): Array<[number, number]> {
  const shape = PIECE_SHAPES[piece.type][piece.rotation];
  return shape.map(([cx, cy]) => [piece.x + cx, piece.y + cy]);
}

export function isValidPosition(grid: CellValue[][], piece: ActivePiece): boolean {
  const cells = getPieceCells(piece);
  for (const [x, y] of cells) {
    if (x < 0 || x >= COLS || y >= TOTAL_ROWS) return false;
    if (y >= 0 && grid[y][x] !== null) return false;
  }
  return true;
}

export function getGhostY(grid: CellValue[][], piece: ActivePiece): number {
  let y = piece.y;
  while (isValidPosition(grid, { ...piece, y: y + 1 })) {
    y++;
  }
  return y;
}

export function isPieceGrounded(grid: CellValue[][], piece: ActivePiece): boolean {
  return !isValidPosition(grid, { ...piece, y: piece.y + 1 });
}

export function tryMovePiece(board: PlayerBoardState, dx: number, dy: number, isSoftDrop = false): boolean {
  const candidate: ActivePiece = {
    ...board.active,
    x: board.active.x + dx,
    y: board.active.y + dy,
  };
  if (!isValidPosition(board.grid, candidate)) return false;

  board.active = candidate;
  const nowGrounded = isPieceGrounded(board.grid, board.active);
  if (dy === 0 && (board.isGrounded || nowGrounded) && board.lockResets < MAX_LOCK_RESETS) {
    board.lockTimerMs = 0;
    board.lockResets++;
  }
  if (dy > 0) {
    board.gravityAccMs = 0;
    if (isSoftDrop) {
      board.stats.score += 1;
    }
  }
  board.isGrounded = nowGrounded;
  return true;
}

export function tryRotatePiece(board: PlayerBoardState, dir: 1 | -1): boolean {
  if (board.active.type === 'O') return false;

  const from = board.active.rotation;
  const to = ((from + dir + 4) % 4) as 0 | 1 | 2 | 3;
  const key = `${from}>${to}`;
  const kicks = board.active.type === 'I' ? I_KICKS[key] : JLSTZ_KICKS[key];

  for (const [kx, ky] of kicks) {
    const candidate: ActivePiece = {
      ...board.active,
      rotation: to,
      x: board.active.x + kx,
      y: board.active.y + ky,
    };
    if (isValidPosition(board.grid, candidate)) {
      board.active = candidate;
      const nowGrounded = isPieceGrounded(board.grid, board.active);
      if ((board.isGrounded || nowGrounded) && board.lockResets < MAX_LOCK_RESETS) {
        board.lockTimerMs = 0;
        board.lockResets++;
      }
      board.isGrounded = nowGrounded;
      return true;
    }
  }
  return false;
}

export function tryHoldPiece(board: PlayerBoardState): boolean {
  if (board.holdUsed) return false;
  const currentType = board.active.type;

  if (board.hold === null) {
    board.hold = currentType;
    const nextType = board.queue.shift()!;
    const filled = refillQueue(board.queue, board.bag);
    board.queue = filled.queue;
    board.bag = filled.bag;
    board.active = spawnPiece(nextType);
  } else {
    const swapType = board.hold;
    board.hold = currentType;
    board.active = spawnPiece(swapType);
  }

  board.holdUsed = true;
  board.gravityAccMs = 0;
  board.lockTimerMs = 0;
  board.lockResets = 0;
  board.isGrounded = isPieceGrounded(board.grid, board.active);
  return true;
}

export function getTotalIncomingGarbage(board: PlayerBoardState): number {
  let sum = 0;
  for (const batch of board.incomingGarbage) {
    sum += batch.lines;
  }
  return sum;
}

export function enqueueGarbage(board: PlayerBoardState, lines: number): void {
  if (lines <= 0) return;
  const gapCol = Math.floor(Math.random() * COLS);
  board.incomingGarbage.push({
    id: garbageBatchCounter++,
    lines,
    gapCol,
    timerMs: GARBAGE_TELEGRAPH_MS,
  });
}

export function tickGarbageTelegraph(board: PlayerBoardState, dtMs: number): void {
  for (const batch of board.incomingGarbage) {
    if (batch.timerMs > 0) {
      batch.timerMs = Math.max(0, batch.timerMs - dtMs);
    }
  }
}

function pushGarbageRows(grid: CellValue[][], count: number, bombCol: number): boolean {
  if (count <= 0) return false;
  let overflowed = false;

  // Check if any existing blocks will be shifted above row 20 (into hidden buffer rows < BUFFER_ROWS)
  for (let r = 0; r < Math.min(BUFFER_ROWS + count, TOTAL_ROWS); r++) {
    if (grid[r].some((c) => c !== null)) {
      overflowed = true;
      break;
    }
  }

  for (let i = 0; i < count; i++) {
    grid.shift();
    const row = Array<CellValue>(COLS).fill('G');
    row[bombCol] = 'B'; // Glowing Bomb Block aligned vertically across multi-line attacks
    grid.push(row);
  }

  // Also verify no blocks currently occupy rows above the 20-row visible grid
  if (!overflowed) {
    for (let r = 0; r < BUFFER_ROWS; r++) {
      if (grid[r].some((c) => c !== null)) {
        overflowed = true;
        break;
      }
    }
  }

  return overflowed;
}

export function applyKOClear(board: PlayerBoardState): void {
  // Reset the KO'd player's board cleanly to continue the battle
  board.grid = createEmptyGrid();
  board.incomingGarbage = [];
  board.combo = 0;
  board.koFlashAlpha = 1;
  board.shakeX = 12;
  board.shakeY = 10;
  board.shakeTimerMs = 420;
}

export function lockActivePiece(board: PlayerBoardState): LockResult {
  const cells = getPieceCells(board.active);
  let lockedCompletelyAboveVisible = true;

  for (const [x, y] of cells) {
    if (y >= BUFFER_ROWS) {
      lockedCompletelyAboveVisible = false;
    }
    if (y >= 0 && y < TOTAL_ROWS && x >= 0 && x < COLS) {
      board.grid[y][x] = board.active.type;
    }
  }

  board.stats.piecesPlaced++;

  // 1. Detect regular full rows (garbage bomb rows contain 'B' and only clear via bomb detonation)
  const fullRows: number[] = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = board.grid[r];
    if (row.every((cell) => cell !== null) && !row.includes('B')) {
      fullRows.push(r);
    }
  }

  // 2. Detect triggered Bomb Blocks:
  //    Trigger A: Player lands/locks a falling piece directly on top of an exposed Bomb Block
  //    Trigger B: Player clears a line directly adjacent (above, below, or beside) to a Bomb Block
  const bombQueue: Array<[number, number]> = [];
  const bombClearedSet = new Set<number>();
  const bombCoords: Array<[number, number]> = [];

  const triggerBomb = (bx: number, by: number) => {
    if (by < 0 || by >= TOTAL_ROWS || bx < 0 || bx >= COLS) return;
    if (board.grid[by][bx] !== 'B') return;
    if (bombClearedSet.has(by)) return;
    bombClearedSet.add(by);
    bombCoords.push([bx, by]);
    bombQueue.push([bx, by]);
  };

  // Trigger A: directly below any cell of the locked piece
  for (const [px, py] of cells) {
    if (py + 1 < TOTAL_ROWS && board.grid[py + 1][px] === 'B') {
      triggerBomb(px, py + 1);
    }
  }

  // Trigger B: directly adjacent to any regularly cleared row (row below or above)
  for (const r of fullRows) {
    for (const adjR of [r + 1, r - 1]) {
      if (adjR >= 0 && adjR < TOTAL_ROWS) {
        for (let c = 0; c < COLS; c++) {
          if (board.grid[adjR][c] === 'B') {
            triggerBomb(c, adjR);
          }
        }
      }
    }
  }

  // 3. Chain Explosion Propagation: detonating a bomb triggers any bomb directly below it!
  while (bombQueue.length > 0) {
    const [bx, by] = bombQueue.shift()!;
    if (by + 1 < TOTAL_ROWS && board.grid[by + 1][bx] === 'B') {
      triggerBomb(bx, by + 1);
    }
  }

  const bombClearedRowIndices = Array.from(bombClearedSet).sort((a, b) => a - b);
  const bombsDetonated = bombClearedRowIndices.length;
  const clearedLines = fullRows.length;

  let attackSent = 0;
  let garbageCancelled = 0;
  let garbageRisen = 0;
  let isPerfectClear = false;
  let overflowed = lockedCompletelyAboveVisible;

  // Remove all regularly cleared rows AND all detonated bomb rows, dropping upper stack down safely
  const allRemovedRows = new Set<number>([...fullRows, ...bombClearedRowIndices]);
  if (allRemovedRows.size > 0) {
    const remaining = board.grid.filter((_, idx) => !allRemovedRows.has(idx));
    while (remaining.length < TOTAL_ROWS) {
      remaining.unshift(Array<CellValue>(COLS).fill(null));
    }
    board.grid = remaining;
  }

  if (bombsDetonated > 0) {
    // Score bonus for bomb & chain detonation
    const chainMultiplier = bombsDetonated >= 2 ? 1.5 : 1;
    board.stats.score += Math.round(bombsDetonated * 150 * board.stats.level * chainMultiplier);
    board.stats.linesCleared += bombsDetonated;
    board.stats.bombChains += bombsDetonated >= 2 ? bombsDetonated : 1;
    board.stats.level = Math.min(15, 1 + Math.floor(board.stats.linesCleared / 10));
    // Punchy explosion shake
    board.shakeX = Math.min(9, 3 + bombsDetonated * 1.5);
    board.shakeY = Math.min(8, 3 + bombsDetonated * 1.4);
    board.shakeTimerMs = Math.max(board.shakeTimerMs, 180 + bombsDetonated * 35);
  }

  if (clearedLines > 0) {
    board.combo++;
    if (board.combo > board.stats.maxCombo) {
      board.stats.maxCombo = board.combo;
    }
    board.stats.linesCleared += clearedLines;
    board.stats.level = Math.min(15, 1 + Math.floor(board.stats.linesCleared / 10));
    if (clearedLines === 4) {
      board.stats.quads++;
    }

    // Score calculation scaled by player level & combo
    const baseLineScore =
      clearedLines >= 4 ? 800 : clearedLines === 3 ? 500 : clearedLines === 2 ? 300 : 100;
    const comboScore = board.combo >= 2 ? 50 * board.combo * board.stats.level : 0;
    board.stats.score += baseLineScore * board.stats.level + comboScore;

    // Check Perfect Clear
    isPerfectClear = board.grid.every((row) => row.every((cell) => cell === null));
    if (isPerfectClear) {
      board.stats.score += 1500 * board.stats.level;
    }

    // Calculate raw attack: base + combo bonus (+1 for 2x, +2 for 3x, +3 for 4x...)
    const baseAttack = BASE_ATTACK_TABLE[clearedLines] ?? 4;
    const comboBonus = board.combo >= 2 ? board.combo - 1 : 0;
    const pcBonus = isPerfectClear ? 4 : 0;
    let totalAttack = baseAttack + comboBonus + pcBonus;

    // Cancel incoming garbage first (counter-attack mechanic!)
    while (totalAttack > 0 && board.incomingGarbage.length > 0) {
      const front = board.incomingGarbage[0];
      if (front.lines <= totalAttack) {
        totalAttack -= front.lines;
        garbageCancelled += front.lines;
        board.incomingGarbage.shift();
      } else {
        front.lines -= totalAttack;
        garbageCancelled += totalAttack;
        totalAttack = 0;
      }
    }

    attackSent = totalAttack;
    board.stats.garbageSent += attackSent;
  } else if (bombsDetonated === 0) {
    // No line clear and no bomb blast: reset combo and rise ready incoming garbage
    board.combo = 0;
    let risenBudget = 8; // Cap single-lock rise at 8 rows for fair gameplay
    const remainingBatches = [];

    for (const batch of board.incomingGarbage) {
      if (batch.timerMs <= 0 && risenBudget > 0) {
        const take = Math.min(batch.lines, risenBudget);
        const pushedOverflow = pushGarbageRows(board.grid, take, batch.gapCol);
        if (pushedOverflow) overflowed = true;
        garbageRisen += take;
        risenBudget -= take;
        if (batch.lines > take) {
          remainingBatches.push({ ...batch, lines: batch.lines - take });
        }
      } else {
        remainingBatches.push(batch);
      }
    }
    board.incomingGarbage = remainingBatches;
  } else {
    // Bomb detonated without a normal line clear: keep combo intact & give brief breather before next garbage rises
    if (board.grid.every((row) => row.every((cell) => cell === null))) {
      isPerfectClear = true;
    }
  }

  // Spawn next piece
  const nextType = board.queue.shift()!;
  const filled = refillQueue(board.queue, board.bag);
  board.queue = filled.queue;
  board.bag = filled.bag;
  board.active = spawnPiece(nextType);
  board.holdUsed = false;
  board.gravityAccMs = 0;
  board.lockTimerMs = 0;
  board.lockResets = 0;

  // Check if new piece overlaps existing blocks (top-out KO)
  const spawnBlocked = !isValidPosition(board.grid, board.active);
  const isKO = overflowed || spawnBlocked;

  if (isKO) {
    applyKOClear(board);
    board.active = spawnPiece(nextType);
  }

  board.isGrounded = isPieceGrounded(board.grid, board.active);

  return {
    clearedLines,
    attackSent,
    garbageCancelled,
    garbageRisen,
    combo: board.combo,
    isPerfectClear,
    isKO,
    clearedRowIndices: fullRows,
    bombsDetonated,
    bombClearedRowIndices,
    bombCoords,
  };
}

export function performHardDrop(board: PlayerBoardState): {
  distance: number;
  fromY: number;
  toY: number;
  pieceBeforeLock: ActivePiece;
  result: LockResult;
} {
  const fromY = board.active.y;
  const toY = getGhostY(board.grid, board.active);
  const distance = Math.max(0, toY - fromY);
  const pieceBeforeLock: ActivePiece = { ...board.active, y: toY };
  board.active.y = toY;
  board.stats.score += distance * 2;

  // Subtle vertical impact shake on hard drop
  if (distance > 0) {
    board.shakeY = Math.min(5, 2 + distance * 0.18);
    board.shakeTimerMs = Math.max(board.shakeTimerMs, 95);
    board.hardDropTrails.push({
      x: board.active.x,
      fromY,
      toY,
      cells: PIECE_SHAPES[board.active.type][board.active.rotation],
      colorKey: board.active.type,
      alpha: 0.72,
    });
  }

  const result = lockActivePiece(board);
  return { distance, fromY, toY, pieceBeforeLock, result };
}
