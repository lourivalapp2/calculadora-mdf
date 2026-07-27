export interface Piece {
  id: string;
  originalId?: string;
  orderIndex?: number;
  name: string;
  height: number; // in mm
  width: number;  // in mm
  quantity: number;
  ab?: number;    // optional height from the base in mm
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
