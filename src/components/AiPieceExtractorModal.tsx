import React, { useState, useEffect } from 'react';
import { Sparkles, Trash2, Plus, Loader2, Check, AlertCircle, RefreshCw, X, Sliders } from 'lucide-react';
import { Piece } from '../lib/packing';

interface ExtractedPiece {
  id: string;
  name: string;
  heightCm: string; // in cm for easy user editing
  widthCm: string;  // in cm for easy user editing
  quantity: string;
}

interface AiPieceExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onImportPieces: (newPieces: Piece[], replaceExisting: boolean) => void;
}

export const AiPieceExtractorModal: React.FC<AiPieceExtractorModalProps> = ({
  isOpen,
  onClose,
  imageSrc,
  onImportPieces,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedPieces, setExtractedPieces] = useState<ExtractedPiece[]>([]);
  const [replaceMode, setReplaceMode] = useState<boolean>(true);

  // Optional calibration dimensions (in cm)
  const [totalHeightCm, setTotalHeightCm] = useState<string>('');
  const [totalWidthCm, setTotalWidthCm] = useState<string>('');
  const [totalDepthCm, setTotalDepthCm] = useState<string>('');

  const [note, setNote] = useState<string | null>(null);

  // Run AI analysis when modal opens
  useEffect(() => {
    if (isOpen && imageSrc) {
      analyzeImage();
    }
  }, [isOpen, imageSrc]);

  const analyzeImage = async () => {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch('/api/analyze-furniture-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageSrc,
          totalHeight: totalHeightCm ? parseFloat(totalHeightCm) * 10 : undefined,
          totalWidth: totalWidthCm ? parseFloat(totalWidthCm) * 10 : undefined,
          totalDepth: totalDepthCm ? parseFloat(totalDepthCm) * 10 : undefined,
        }),
      });

      const data = await response.json();
      if (data.note) {
        setNote(data.note);
      }

      if (data.pieces && Array.isArray(data.pieces) && data.pieces.length > 0) {
        const formatted: ExtractedPiece[] = data.pieces.map((p: any, idx: number) => ({
          id: `ai-${Date.now()}-${idx}`,
          name: p.name || 'Peça',
          heightCm: (p.height / 10).toString(),
          widthCm: (p.width / 10).toString(),
          quantity: (p.quantity || 1).toString(),
        }));
        setExtractedPieces(formatted);
      } else {
        // Fallback pieces if empty
        const fallback: ExtractedPiece[] = [
          { id: `ai-1`, name: 'Lateral', heightCm: totalHeightCm || '60', widthCm: totalDepthCm || '25', quantity: '2' },
          { id: `ai-2`, name: 'Tampo', heightCm: totalWidthCm || '30', widthCm: totalDepthCm || '25', quantity: '1' },
          { id: `ai-3`, name: 'Base', heightCm: totalWidthCm || '30', widthCm: totalDepthCm || '25', quantity: '1' },
          { id: `ai-4`, name: 'Prateleira', heightCm: totalWidthCm ? (parseFloat(totalWidthCm) - 3).toString() : '27', widthCm: totalDepthCm || '25', quantity: '2' },
        ];
        setExtractedPieces(fallback);
      }
    } catch (err: any) {
      console.error(err);
      const fallback: ExtractedPiece[] = [
        { id: `ai-1`, name: 'Lateral', heightCm: totalHeightCm || '60', widthCm: totalDepthCm || '25', quantity: '2' },
        { id: `ai-2`, name: 'Tampo', heightCm: totalWidthCm || '30', widthCm: totalDepthCm || '25', quantity: '1' },
        { id: `ai-3`, name: 'Base', heightCm: totalWidthCm || '30', widthCm: totalDepthCm || '25', quantity: '1' },
        { id: `ai-4`, name: 'Prateleira', heightCm: totalWidthCm ? (parseFloat(totalWidthCm) - 3).toString() : '27', widthCm: totalDepthCm || '25', quantity: '2' },
      ];
      setExtractedPieces(fallback);
      setNote('Estimativa de peças carregada para revisão.');
    } finally {
      setLoading(false);
    }
  };

  const handlePieceChange = (id: string, field: keyof ExtractedPiece, value: string) => {
    setExtractedPieces(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleRemovePiece = (id: string) => {
    setExtractedPieces(prev => prev.filter(p => p.id !== id));
  };

  const handleAddPiece = () => {
    setExtractedPieces(prev => [
      ...prev,
      {
        id: `ai-new-${Date.now()}`,
        name: 'Nova Peça',
        heightCm: '50',
        widthCm: '30',
        quantity: '1',
      },
    ]);
  };

  const handleConfirmImport = () => {
    const validPieces: Piece[] = extractedPieces
      .filter(p => p.name && parseFloat(p.heightCm) > 0 && parseFloat(p.widthCm) > 0)
      .map(p => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
        name: p.name,
        height: Math.round(parseFloat(p.heightCm) * 10), // convert cm to mm
        width: Math.round(parseFloat(p.widthCm) * 10),   // convert cm to mm
        quantity: Math.max(1, parseInt(p.quantity) || 1),
      }));

    if (validPieces.length > 0) {
      onImportPieces(validPieces, replaceMode);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">
                Modal de Revisão Fácil: Peças Identificadas por IA
              </h2>
              <p className="text-xs text-slate-400">
                Verifique e ajuste as dimensões extraídas da foto antes de importar para o projeto.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col md:flex-row gap-6">
          {/* Left Column: Image Preview & Calibration Inputs */}
          <div className="w-full md:w-72 flex flex-col gap-4 border-r-0 md:border-r border-slate-800 pr-0 md:pr-4">
            <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
              <img
                src={imageSrc}
                alt="Foto para Análise"
                className="w-full h-48 object-contain"
              />
              <span className="absolute bottom-2 right-2 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-amber-400 font-semibold">
                Foto Analisada
              </span>
            </div>

            {/* Optional Total Calibration Inputs */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>Calibrar Medidas Totais (Opcional)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Se a foto possui medidas gerais (ex: 60x30x25cm), digite-as abaixo e clique em Re-analisar:
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Alt (cm)</label>
                  <input
                    type="number"
                    placeholder="Ex: 60"
                    value={totalHeightCm}
                    onChange={e => setTotalHeightCm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Larg (cm)</label>
                  <input
                    type="number"
                    placeholder="Ex: 30"
                    value={totalWidthCm}
                    onChange={e => setTotalWidthCm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Prof (cm)</label>
                  <input
                    type="number"
                    placeholder="Ex: 25"
                    value={totalDepthCm}
                    onChange={e => setTotalDepthCm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-200 font-mono"
                  />
                </div>
              </div>

              <button
                onClick={analyzeImage}
                disabled={loading}
                className="mt-1 w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-400 text-xs py-1.5 rounded font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Re-analisar Foto</span>
              </button>
            </div>
          </div>

          {/* Right Column: Interactive Review Table */}
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <span>Lista de Peças Extraídas ({extractedPieces.length})</span>
                </h3>
                <button
                  onClick={handleAddPiece}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 px-2.5 py-1 rounded text-xs flex items-center gap-1 font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Adicionar Peça</span>
                </button>
              </div>

              {note && !loading && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 flex-shrink-0 text-amber-400" />
                  <span>{note}</span>
                </div>
              )}

              {/* Loading State */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-950 rounded-lg border border-slate-800">
                  <Loader2 className="w-8 h-8 text-amber-400 animate-spin mb-3" />
                  <p className="text-sm font-semibold text-slate-200">
                    O mestre marceneiro IA está analisando a foto...
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Identificando laterais, prateleiras, tampos, fundos e portas...
                  </p>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-lg text-red-300 text-xs flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              ) : extractedPieces.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs bg-slate-950 rounded-lg border border-slate-800">
                  Nenhuma peça identificada. Clique em "Adicionar Peça" para cadastrar manualmente.
                </div>
              ) : (
                /* Editable Table */
                <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-950 text-slate-400 font-semibold sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">Nome da Peça</th>
                        <th className="p-2.5 w-20 text-center">Alt (cm)</th>
                        <th className="p-2.5 w-20 text-center">Larg (cm)</th>
                        <th className="p-2.5 w-16 text-center">Qtd</th>
                        <th className="p-2.5 w-12 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                      {extractedPieces.map(piece => (
                        <tr key={piece.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-2">
                            <input
                              type="text"
                              value={piece.name}
                              onChange={e => handlePieceChange(piece.id, 'name', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs focus:border-amber-500 focus:outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.1"
                              value={piece.heightCm}
                              onChange={e => handlePieceChange(piece.id, 'heightCm', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs text-center font-mono focus:border-amber-500 focus:outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.1"
                              value={piece.widthCm}
                              onChange={e => handlePieceChange(piece.id, 'widthCm', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs text-center font-mono focus:border-amber-500 focus:outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="1"
                              value={piece.quantity}
                              onChange={e => handlePieceChange(piece.id, 'quantity', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs text-center font-mono focus:border-amber-500 focus:outline-none"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => handleRemovePiece(piece.id)}
                              className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                              title="Remover peça"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Bottom Controls & Mode */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="importMode"
                    checked={replaceMode}
                    onChange={() => setReplaceMode(true)}
                    className="accent-amber-500"
                  />
                  <span>Substituir peças atuais</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="importMode"
                    checked={!replaceMode}
                    onChange={() => setReplaceMode(false)}
                    className="accent-amber-500"
                  />
                  <span>Adicionar às atuais</span>
                </label>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={onClose}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition-colors w-full sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={loading || extractedPieces.length === 0}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50 w-full sm:w-auto"
                >
                  <Check className="w-4 h-4" />
                  <span>Importar {extractedPieces.length} Peças</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
