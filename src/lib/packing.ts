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

export interface Shelf {
  y: number;
  height: number;
  startX: number;
  endX: number;
  cursorX: number;
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

  // Sort pieces by height descending, then width descending
  allPieces.sort((a, b) => b.height - a.height || b.width - a.width);

  const placed: PlacedPiece[] = [];
  const remainingPieces = [...allPieces];

  let currentSheet = 1;
  const MAX_SHEETS = 200;

  while (remainingPieces.length > 0 && currentSheet <= MAX_SHEETS) {
    const placedOnSheet: PlacedPiece[] = [];
    const shelves: Shelf[] = [];

    const tryPlacePiece = (piece: Piece): boolean => {
      const pW = piece.width;
      const pH = piece.height;

      // 1. Try to fit in an existing shelf on this sheet
      for (const shelf of shelves) {
        if (pH <= shelf.height && (shelf.cursorX + pW) <= shelf.endX) {
          const px = shelf.cursorX;
          const py = shelf.y;

          const collision = placedOnSheet.some(other => 
            !(px >= other.x + other.width + KERF ||
              px + pW + KERF <= other.x ||
              py >= other.y + other.height + KERF ||
              py + pH + KERF <= other.y)
          );

          if (!collision && (px + pW) <= sheetWidth && (py + pH) <= sheetHeight) {
            placedOnSheet.push({ ...piece, x: px, y: py, sheet: currentSheet });
            shelf.cursorX += pW + KERF;
            return true;
          }
        }
      }

      // 2. If no existing shelf fit, try opening a new shelf at the bottom of the tallest placed piece
      let newY = 0;
      for (const p of placedOnSheet) {
        if (p.x < pW + KERF) {
          newY = Math.max(newY, p.y + p.height + KERF);
        }
      }

      if (newY + pH <= sheetHeight && pW <= sheetWidth) {
        const collision = placedOnSheet.some(other => 
          !(0 >= other.x + other.width + KERF ||
            pW + KERF <= other.x ||
            newY >= other.y + other.height + KERF ||
            newY + pH + KERF <= other.y)
        );

        if (!collision) {
          shelves.push({
            y: newY,
            height: pH,
            startX: 0,
            endX: sheetWidth,
            cursorX: pW + KERF,
          });
          placedOnSheet.push({ ...piece, x: 0, y: newY, sheet: currentSheet });
          return true;
        }
      }

      // 3. Try sub-shelves under shorter placed pieces
      const candidateYLevels = new Set<number>();
      for (const p of placedOnSheet) {
        const bottomY = p.y + p.height + KERF;
        if (bottomY + pH <= sheetHeight) {
          candidateYLevels.add(bottomY);
        }
      }

      const sortedYLevels = Array.from(candidateYLevels).sort((a, b) => a - b);
      for (const candY of sortedYLevels) {
        for (let testX = 0; testX + pW <= sheetWidth; testX += 10) {
          const collision = placedOnSheet.some(other => 
            !(testX >= other.x + other.width + KERF ||
              testX + pW + KERF <= other.x ||
              candY >= other.y + other.height + KERF ||
              candY + pH + KERF <= other.y)
          );

          if (!collision && testX + pW <= sheetWidth && candY + pH <= sheetHeight) {
            shelves.push({
              y: candY,
              height: pH,
              startX: testX,
              endX: sheetWidth,
              cursorX: testX + pW + KERF,
            });
            placedOnSheet.push({ ...piece, x: testX, y: candY, sheet: currentSheet });
            return true;
          }
        }
      }

      return false;
    };

    let placedInThisPass = 0;
    let i = 0;
    while (i < remainingPieces.length) {
      if (tryPlacePiece(remainingPieces[i])) {
        placedInThisPass++;
        remainingPieces.splice(i, 1);
      } else {
        i++;
      }
    }

    if (placedOnSheet.length > 0) {
      placed.push(...placedOnSheet);
    }

    if (placedInThisPass === 0) {
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
