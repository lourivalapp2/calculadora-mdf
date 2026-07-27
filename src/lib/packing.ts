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

  // Sort by area descending, then height descending
  allPieces.sort((a, b) => (b.width * b.height) - (a.width * a.height) || b.height - a.height);

  let placed: PlacedPiece[] = [];
  let notPlaced: Piece[] = [];
  
  let currentSheet = 1;
  let shelfY = 0;
  let shelfHeight = 0;
  let cursorX = 0;

  for (const piece of allPieces) {
    const pWidth = piece.width;
    const pHeight = piece.height;

    // Check if it fits in the current shelf
    if (cursorX + pWidth > sheetWidth) {
      // Need a new shelf
      cursorX = 0;
      shelfY += shelfHeight + KERF;
      shelfHeight = 0;
    }

    // Check if it fits in the current sheet
    if (shelfY + pHeight > sheetHeight) {
      // Need a new sheet
      currentSheet++;
      shelfY = 0;
      cursorX = 0;
      shelfHeight = 0;
    }

    // Try to place the piece
    if (shelfY + pHeight <= sheetHeight && cursorX + pWidth <= sheetWidth) {
      placed.push({ ...piece, x: cursorX, y: shelfY, sheet: currentSheet });
      cursorX += pWidth + KERF;
      shelfHeight = Math.max(shelfHeight, pHeight);
    } else {
      // Try to place on a fresh sheet if current position failed
      currentSheet++;
      shelfY = 0;
      cursorX = 0;
      shelfHeight = 0;
      if (shelfY + pHeight <= sheetHeight && cursorX + pWidth <= sheetWidth) {
        placed.push({ ...piece, x: cursorX, y: shelfY, sheet: currentSheet });
        cursorX += pWidth + KERF;
        shelfHeight = Math.max(shelfHeight, pHeight);
      } else {
        notPlaced.push(piece);
      }
    }
  }

  const sheetsUsed = placed.length > 0 ? Math.max(...placed.map(p => p.sheet)) : 0;

  return { placed, notPlaced, sheetsUsed };
}
