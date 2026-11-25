import { AI_PROFILES, BUFFER_ROWS, COLS, PIECE_SHAPES, TOTAL_ROWS } from './constants';
import { getGhostY, getPieceCells, getTotalIncomingGarbage, isValidPosition, spawnPiece } from './engine';
import { ActivePiece, AIDifficulty, AIPlan, CellValue, PieceType, PlayerBoardState } from './types';

function cloneGrid(grid: CellValue[][]): CellValue[][] {
  return grid.map((row) => [...row]);
}

function evaluateGrid(
  grid: CellValue[][],
  clearedLines: number,
  bombsDetonated: number,
  combo: number,
  incomingGarbage: number,
  wellBonusWeight: number,
  attackWeight: number
): number {
  const colHeights = new Array<number>(COLS).fill(0);
  let holes = 0;
  let coveredCells = 0;

  for (let c = 0; c < COLS; c++) {
    let foundBlock = false;
    let blocksAbove = 0;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (grid[r][c] !== null) {
        if (!foundBlock) {
          colHeights[c] = TOTAL_ROWS - r;
          foundBlock = true;
        }
        blocksAbove++;
      } else if (foundBlock) {
        holes++;
        coveredCells += Math.min(blocksAbove, 4);
      }
    }
  }

  let aggregateHeight = 0;
  let maxHeight = 0;
  for (let c = 0; c < COLS; c++) {
    aggregateHeight += colHeights[c];
    if (colHeights[c] > maxHeight) maxHeight = colHeights[c];
  }

  let bumpiness = 0;
  const highDanger = maxHeight >= 12 || incomingGarbage >= 3;
  const bumpLimit = wellBonusWeight > 0 && !highDanger ? COLS - 2 : COLS - 1;
  for (let c = 0; c < bumpLimit; c++) {
    bumpiness += Math.abs(colHeights[c] - colHeights[c + 1]);
  }

  // Reward keeping a clean 1-wide well in col 9 for Quad Smashes when stack is safe
  let wellScore = 0;
  if (wellBonusWeight > 0 && !highDanger) {
    const minOther = Math.min(...colHeights.slice(0, COLS - 1));
    const diff = minOther - colHeights[COLS - 1];
    if (diff >= 2 && diff <= 6) {
      wellScore = diff * wellBonusWeight;
    }
  }

  // Strong reward for detonating Garbage Bomb Blocks & chain blasts!
  const bombReward = bombsDetonated > 0 ? (6.5 + bombsDetonated * 5.2) * (highDanger ? 1.45 : 1) : 0;

  // Line clear rewards tuned for competitive attacks & counters
  let lineReward = 0;
  if (clearedLines === 1) {
    lineReward = highDanger || combo >= 1 ? (2.8 + combo * 1.4) * attackWeight : -0.4;
  } else if (clearedLines === 2) {
    lineReward = (4.6 + combo * 1.8) * attackWeight;
  } else if (clearedLines === 3) {
    lineReward = (8.4 + combo * 2.2) * attackWeight;
  } else if (clearedLines === 4) {
    lineReward = (18.5 + combo * 2.5) * attackWeight;
  }

  const heightDangerPenalty = maxHeight > 14 ? (maxHeight - 14) * 5.2 : 0;

  return (
    lineReward +
    bombReward +
    wellScore -
    aggregateHeight * 0.48 -
    holes * 6.8 -
    coveredCells * 0.55 -
    bumpiness * 0.34 -
    heightDangerPenalty
  );
}

function simulatePlacement(
  grid: CellValue[][],
  type: PieceType,
  rotation: 0 | 1 | 2 | 3,
  x: number
): { valid: boolean; scoreGrid: CellValue[][]; clearedLines: number; bombsDetonated: number } {
  const piece: ActivePiece = { type, rotation, x, y: BUFFER_ROWS - 2 };
  if (!isValidPosition(grid, piece)) {
    return { valid: false, scoreGrid: grid, clearedLines: 0, bombsDetonated: 0 };
  }
  const landingY = getGhostY(grid, piece);
  const landed: ActivePiece = { ...piece, y: landingY };
  const nextGrid = cloneGrid(grid);
  const placedCells = getPieceCells(landed);

  for (const [cx, cy] of placedCells) {
    if (cy >= 0 && cy < TOTAL_ROWS && cx >= 0 && cx < COLS) {
      nextGrid[cy][cx] = type;
    }
  }

  // Regular full rows (exclude garbage bomb rows containing 'B')
  const fullRows: number[] = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    if (nextGrid[r].every((cell) => cell !== null) && !nextGrid[r].includes('B')) {
      fullRows.push(r);
    }
  }

  // Bomb triggers & vertical chain detonation
  const bombCleared = new Set<number>();
  const queue: Array<[number, number]> = [];
  const trigger = (bx: number, by: number) => {
    if (by < 0 || by >= TOTAL_ROWS || bx < 0 || bx >= COLS) return;
    if (nextGrid[by][bx] !== 'B' || bombCleared.has(by)) return;
    bombCleared.add(by);
    queue.push([bx, by]);
  };

  for (const [px, py] of placedCells) {
    if (py + 1 < TOTAL_ROWS && nextGrid[py + 1][px] === 'B') {
      trigger(px, py + 1);
    }
  }
  for (const r of fullRows) {
    for (const adjR of [r + 1, r - 1]) {
      if (adjR >= 0 && adjR < TOTAL_ROWS) {
        for (let c = 0; c < COLS; c++) {
          if (nextGrid[adjR][c] === 'B') trigger(c, adjR);
        }
      }
    }
  }
  while (queue.length > 0) {
    const [bx, by] = queue.shift()!;
    if (by + 1 < TOTAL_ROWS && nextGrid[by + 1][bx] === 'B') {
      trigger(bx, by + 1);
    }
  }

  const allRemoved = new Set<number>([...fullRows, ...bombCleared]);
  if (allRemoved.size > 0) {
    const kept = nextGrid.filter((_, idx) => !allRemoved.has(idx));
    while (kept.length < TOTAL_ROWS) {
      kept.unshift(Array<CellValue>(COLS).fill(null));
    }
    return {
      valid: true,
      scoreGrid: kept,
      clearedLines: fullRows.length,
      bombsDetonated: bombCleared.size,
    };
  }

  return { valid: true, scoreGrid: nextGrid, clearedLines: 0, bombsDetonated: 0 };
}

function findBestForPiece(
  grid: CellValue[][],
  type: PieceType,
  combo: number,
  incomingGarbage: number,
  noise: number,
  wellBonus: number,
  attackWeight: number
): { rotation: 0 | 1 | 2 | 3; x: number; score: number } {
  const rotationCount = type === 'O' ? 1 : type === 'I' || type === 'S' || type === 'Z' ? 2 : 4;
  let best = { rotation: 0 as 0 | 1 | 2 | 3, x: 3, score: -Infinity };

  for (let r = 0; r < rotationCount; r++) {
    const rot = r as 0 | 1 | 2 | 3;
    const shape = PIECE_SHAPES[type][rot];
    const minC = Math.min(...shape.map(([cx]) => cx));
    const maxC = Math.max(...shape.map(([cx]) => cx));

    for (let x = -minC; x <= COLS - 1 - maxC; x++) {
      const sim = simulatePlacement(grid, type, rot, x);
      if (!sim.valid) continue;
      let score = evaluateGrid(
        sim.scoreGrid,
        sim.clearedLines,
        sim.bombsDetonated,
        combo,
        incomingGarbage,
        wellBonus,
        attackWeight
      );
      if (noise > 0) {
        score += (Math.random() - 0.5) * noise;
      }
      if (score > best.score) {
        best = { rotation: rot, x, score };
      }
    }
  }

  return best;
}

export function computeAIPlan(board: PlayerBoardState, difficulty: AIDifficulty): AIPlan {
  const profile = AI_PROFILES[difficulty];
  const incoming = getTotalIncomingGarbage(board);

  const primary = findBestForPiece(
    board.grid,
    board.active.type,
    board.combo,
    incoming,
    profile.noise,
    profile.wellBonus,
    profile.attackWeight
  );

  if (profile.useHold && !board.holdUsed) {
    const holdCandidateType = board.hold ?? board.queue[0];
    if (holdCandidateType && holdCandidateType !== board.active.type) {
      const alt = findBestForPiece(
        board.grid,
        holdCandidateType,
        board.combo,
        incoming,
        profile.noise * 0.8,
        profile.wellBonus,
        profile.attackWeight
      );
      if (alt.score > primary.score + 1.1) {
        return {
          targetRotation: alt.rotation,
          targetX: alt.x,
          useHold: true,
          executedHold: false,
        };
      }
    }
  }

  if (primary.score === -Infinity) {
    const fallback = spawnPiece(board.active.type);
    return {
      targetRotation: fallback.rotation,
      targetX: fallback.x,
      useHold: false,
      executedHold: false,
    };
  }

  return {
    targetRotation: primary.rotation,
    targetX: primary.x,
    useHold: false,
    executedHold: false,
  };
}
