export type EdgeTapeOption = 'none' | '1L_maior' | '2L_maiores' | '1L_menor' | '2L_menores' | '3L' | '4L';

export const EDGE_TAPE_LABELS: Record<EdgeTapeOption, string> = {
  none: 'Sem Fita',
  '1L_maior': '1 Lado Maior',
  '2L_maiores': '2 Lados Maiores',
  '1L_menor': '1 Lado Menor',
  '2L_menores': '2 Lados Menores',
  '3L': '3 Lados (U)',
  '4L': '4 Lados (Total)',
};

export interface Piece {
  id: string;
  originalId?: string;
  orderIndex?: number;
  name: string;
  height: number; // in mm
  width: number;  // in mm
  quantity: number;
  ab?: number;    // optional height from the base in mm
  edgeTape?: EdgeTapeOption; // optional edge tape configuration
}

/**
 * Calculates edge tape required for a single unit of piece in linear meters.
 */
export function calculatePieceEdgeTapeMeters(piece: Piece): number {
  const opt = piece.edgeTape || 'none';
  if (opt === 'none') return 0;

  const hMeters = piece.height / 1000;
  const wMeters = piece.width / 1000;
  const maxSide = Math.max(hMeters, wMeters);
  const minSide = Math.min(hMeters, wMeters);

  switch (opt) {
    case '1L_maior':
      return maxSide;
    case '2L_maiores':
      return maxSide * 2;
    case '1L_menor':
      return minSide;
    case '2L_menores':
      return minSide * 2;
    case '3L':
      return maxSide * 2 + minSide;
    case '4L':
      return (maxSide + minSide) * 2;
    default:
      return 0;
  }
}

export interface PlacedPiece extends Piece {
  x: number;
  y: number;
  sheet: number;
}

export interface PackingResult {
  placed: PlacedPiece[];
  notPlaced: Piece[];
  sheetsUsed: number;
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const KERF = 5;

export function packPieces(pieces: Piece[], sheetWidth: number, sheetHeight: number): PackingResult {
  const allPieces: Piece[] = [];
  pieces.forEach(p => {
    for (let i = 0; i < p.quantity; i++) {
      allPieces.push({ ...p, quantity: 1, id: `${p.id}-${i}` });
    }
  });

  if (allPieces.length === 0) {
    return { placed: [], notPlaced: [], sheetsUsed: 0 };
  }

  // Sort pieces by area descending, then max dimension descending
  allPieces.sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaB !== areaA) return areaB - areaA;
    return Math.max(b.width, b.height) - Math.max(a.width, a.height);
  });

  const placed: PlacedPiece[] = [];
  const remainingPieces = [...allPieces];

  let currentSheet = 1;
  const MAX_SHEETS = 100;

  while (remainingPieces.length > 0 && currentSheet <= MAX_SHEETS) {
    let freeRects: FreeRect[] = [
      { x: 0, y: 0, width: sheetWidth, height: sheetHeight }
    ];

    let placedOnThisSheet = 0;
    let i = 0;

    while (i < remainingPieces.length) {
      const piece = remainingPieces[i];
      let bestRectIndex = -1;
      let bestShortSideFit = Infinity;
      let bestLongSideFit = Infinity;

      for (let r = 0; r < freeRects.length; r++) {
        const rect = freeRects[r];
        const wNeeded = piece.width;
        const hNeeded = piece.height;

        if (rect.width >= wNeeded && rect.height >= hNeeded) {
          const leftoverX = rect.width - wNeeded;
          const leftoverY = rect.height - hNeeded;
          const shortSideFit = Math.min(leftoverX, leftoverY);
          const longSideFit = Math.max(leftoverX, leftoverY);

          if (shortSideFit < bestShortSideFit || (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
            bestShortSideFit = shortSideFit;
            bestLongSideFit = longSideFit;
            bestRectIndex = r;
          }
        }
      }

      if (bestRectIndex >= 0) {
        const chosenRect = freeRects[bestRectIndex];
        const px = chosenRect.x;
        const py = chosenRect.y;

        placed.push({
          ...piece,
          x: px,
          y: py,
          sheet: currentSheet,
        });

        placedOnThisSheet++;
        remainingPieces.splice(i, 1);

        const placedW = piece.width + KERF;
        const placedH = piece.height + KERF;

        const newFreeRects: FreeRect[] = [];
        for (const rect of freeRects) {
          const intersects = !(
            px >= rect.x + rect.width ||
            px + placedW <= rect.x ||
            py >= rect.y + rect.height ||
            py + placedH <= rect.y
          );

          if (!intersects) {
            newFreeRects.push(rect);
            continue;
          }

          if (py > rect.y && py < rect.y + rect.height) {
            newFreeRects.push({
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: py - rect.y,
            });
          }
          if (py + placedH > rect.y && py + placedH < rect.y + rect.height) {
            newFreeRects.push({
              x: rect.x,
              y: py + placedH,
              width: rect.width,
              height: (rect.y + rect.height) - (py + placedH),
            });
          }
          if (px > rect.x && px < rect.x + rect.width) {
            newFreeRects.push({
              x: rect.x,
              y: rect.y,
              width: px - rect.x,
              height: rect.height,
            });
          }
          if (px + placedW > rect.x && px + placedW < rect.x + rect.width) {
            newFreeRects.push({
              x: px + placedW,
              y: rect.y,
              width: (rect.x + rect.width) - (px + placedW),
              height: rect.height,
            });
          }
        }

        freeRects = filterFreeRects(newFreeRects);
      } else {
        i++;
      }
    }

    if (placedOnThisSheet === 0) {
      if (remainingPieces.length > 0) {
        currentSheet++;
        const oversized = remainingPieces.some(p => p.width > sheetWidth || p.height > sheetHeight);
        if (oversized) {
          break;
        }
      } else {
        break;
      }
    }
  }

  const sheetsUsed = placed.length > 0 ? Math.max(...placed.map(p => p.sheet)) : 0;
  return { placed, notPlaced: remainingPieces, sheetsUsed };
}

function filterFreeRects(rects: FreeRect[]): FreeRect[] {
  const valid = rects.filter(r => r.width > 5 && r.height > 5);
  const result: FreeRect[] = [];

  for (let i = 0; i < valid.length; i++) {
    let isContained = false;
    for (let j = 0; j < valid.length; j++) {
      if (i === j) continue;
      const r1 = valid[i];
      const r2 = valid[j];
      if (
        r1.x >= r2.x &&
        r1.y >= r2.y &&
        r1.x + r1.width <= r2.x + r2.width &&
        r1.y + r1.height <= r2.y + r2.height
      ) {
        isContained = true;
        break;
      }
    }
    if (!isContained) {
      result.push(valid[i]);
    }
  }
  return result;
}
