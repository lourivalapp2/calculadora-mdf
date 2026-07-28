import React, { useState } from 'react';
import { FolderOpen, Plus, Trash2, Check, X, Clock, Box, Copy, Layers, Star } from 'lucide-react';
import { Piece } from '../lib/packing';
import { CostItem } from '../App';

export interface SalesScenario {
  id: string;
  name: string;
  unitPrice: number;
}

export interface FixedExpense {
  id: string;
  name: string;
  value: number;
}

export interface CompetitorItem {
  id: string;
  price: number;
  link: string;
}

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: string;
  sheetWidth: number;
  sheetHeight: number;
  furnitureQty: number;
  pieces: Piece[];
  costs: CostItem[];
  furnitureImages: string[];
  referenceLinks?: string[];
  competitorItems?: CompetitorItem[];
  backPieces?: Piece[];
  backSheetWidth?: number;
  backSheetHeight?: number;
  salesScenarios?: SalesScenario[];
  workDaysPerMonth?: number;
  taxRate?: number;
  mlFeeRate?: number;
  targetNetMargin?: number;
  includeFixedInMarkup?: boolean;
  selectedScenarioId?: string;
  fixedExpenses?: FixedExpense[];
  isFavorite?: boolean;
}

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedProjects: SavedProject[];
  currentProjectId: string | null;
  isCloudConnected?: boolean;
  onLoadProject: (project: SavedProject) => void;
  onDeleteProject: (projectId: string) => void;
  onDuplicateProject: (project: SavedProject) => void;
  onNewBlankProject: () => void;
  onToggleFavoriteProject?: (projectId: string) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  isOpen,
  onClose,
  savedProjects,
  currentProjectId,
  isCloudConnected,
  onLoadProject,
  onDeleteProject,
  onDuplicateProject,
  onNewBlankProject,
  onToggleFavoriteProject,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'favorites'>('all');

  if (!isOpen) return null;

  const favoriteProjectsCount = savedProjects.filter(p => p.isFavorite).length;
  const filteredProjects = filterTab === 'favorites' 
    ? savedProjects.filter(p => p.isFavorite) 
    : savedProjects;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 tracking-tight">
                  Meus Projetos Salvos ({savedProjects.length})
                </h2>
                {isCloudConnected ? (
                  <span className="text-[10px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-semibold px-2 py-0.5 rounded flex items-center gap-1">
                    ☁️ Supabase Cloud
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 font-semibold px-2 py-0.5 rounded">
                    💾 Armazenamento Local
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {isCloudConnected
                  ? 'Seus projetos estão sincronizados em tempo real na nuvem do Supabase.'
                  : 'Gerencie, alterne ou crie novos projetos de marcenaria salvos no navegador.'}
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

        {/* Action Toolbar */}
        <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Tabs Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                filterTab === 'all'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos ({savedProjects.length})
            </button>
            <button
              onClick={() => setFilterTab('favorites')}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${
                filterTab === 'favorites'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${favoriteProjectsCount > 0 ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span>Favoritos ({favoriteProjectsCount})</span>
            </button>
          </div>

          <button
            onClick={() => {
              onNewBlankProject();
              onClose();
            }}
            className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer ml-auto sm:ml-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Novo Projeto Limpo</span>
          </button>
        </div>

        {/* Projects List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {filteredProjects.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs bg-slate-950 rounded-lg border border-dashed border-slate-800">
              <p className="mb-2 font-semibold text-slate-400">
                {filterTab === 'favorites'
                  ? 'Nenhum projeto marcado como favorito ainda.'
                  : 'Nenhum projeto salvo ainda.'}
              </p>
              <p>
                {filterTab === 'favorites'
                  ? 'Clique no ícone de estrela ao lado de um projeto para adicioná-lo aos favoritos.'
                  : 'Digite o nome do projeto no topo e clique em "Salvar".'}
              </p>
            </div>
          ) : (
            filteredProjects.map(proj => {
              const isCurrent = proj.id === currentProjectId;
              const isFav = Boolean(proj.isFavorite);
              const dateStr = new Date(proj.updatedAt).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              const totalPiecesCount = proj.pieces.reduce((sum, p) => sum + p.quantity, 0);

              return (
                <div
                  key={proj.id}
                  className={`p-3.5 rounded-lg border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-amber-950/20 border-amber-500/50 shadow-md'
                      : isFav
                      ? 'bg-slate-950/90 border-amber-500/30'
                      : 'bg-slate-950 hover:bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {/* Star Button for Favorite */}
                      <button
                        onClick={() => onToggleFavoriteProject && onToggleFavoriteProject(proj.id)}
                        className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                          isFav ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'
                        }`}
                        title={isFav ? 'Remover dos favoritos' : 'Marcar como favorito'}
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>

                      <h3 className="text-sm font-bold text-slate-100">{proj.name}</h3>
                      {isCurrent && (
                        <span className="text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-400 font-semibold px-2 py-0.5 rounded">
                          Em Exibição
                        </span>
                      )}
                      {isFav && !isCurrent && (
                        <span className="text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          ⭐ Favorito
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap pl-7 sm:pl-7">
                      <span className="flex items-center gap-1 text-[11px]">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {dateStr}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <Box className="w-3 h-3 text-amber-500" />
                        {proj.pieces.length} tipos ({totalPiecesCount} peças no lote)
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <Layers className="w-3 h-3 text-slate-500" />
                        {proj.furnitureQty} móvel(is)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end pl-7 sm:pl-0">
                    {/* Load Project Button */}
                    <button
                      onClick={() => {
                        onLoadProject(proj);
                        onClose();
                      }}
                      className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                        isCurrent
                          ? 'bg-slate-800 text-slate-400 cursor-default'
                          : 'bg-amber-500 hover:bg-amber-400 text-black shadow-sm'
                      }`}
                      disabled={isCurrent}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isCurrent ? 'Aberto' : 'Carregar'}</span>
                    </button>

                    {/* Duplicate Project Button */}
                    <button
                      onClick={() => onDuplicateProject(proj)}
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded text-xs transition-colors"
                      title="Duplicar projeto"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Project Button */}
                    <button
                      onClick={() => onDeleteProject(proj.id)}
                      className="p-1.5 bg-slate-900 hover:bg-red-950/60 border border-slate-700 hover:border-red-700 text-slate-400 hover:text-red-400 rounded text-xs transition-colors"
                      title="Excluir projeto salvo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
