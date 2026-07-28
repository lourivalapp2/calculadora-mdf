import React, { useState, useEffect } from 'react';
import { 
  X, Star, CheckSquare, Square, Save, Trash2, Award, 
  TrendingUp, Layers, Box, FileText, BarChart3, PieChart, 
  DollarSign, Calculator, RefreshCw, Check, AlertCircle, Eye, Printer,
  Sun, Calendar, Sliders
} from 'lucide-react';
import { SavedProject } from './ProjectsModal';
import { packPieces, calculatePieceEdgeTapeMeters } from '../lib/packing';
import { fetchScenariosFromCloud, saveScenariosToCloud } from '../lib/supabase';

export interface AnalysisScenario {
  id: string;
  name: string;
  createdAt: string;
  selectedProjectIds: string[];
  quantities: Record<string, number>;
  calculationMode?: 'daily' | 'monthly' | 'custom';
}

interface ExecutiveSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedProjects: SavedProject[];
  onLoadProject: (project: SavedProject) => void;
  onToggleFavoriteProject: (projectId: string) => void;
}

const LOCAL_SCENARIOS_KEY = 'mdf-analysis-scenarios-v1';

export const ExecutiveSummaryModal: React.FC<ExecutiveSummaryModalProps> = ({
  isOpen,
  onClose,
  savedProjects,
  onLoadProject,
  onToggleFavoriteProject,
}) => {
  const favoriteProjects = savedProjects.filter(p => p.isFavorite);

  // Active Selected Project IDs in the summary view
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Quantities for DRE Resumida (projId -> qty)
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Calculation Mode: 'daily' (1 dia) | 'monthly' (mês completo) | 'custom' (personalizado)
  const [calculationMode, setCalculationMode] = useState<'daily' | 'monthly' | 'custom'>('monthly');
  // Sales Scenario Mode: 'direta' | 'ml'
  const [salesChannel, setSalesChannel] = useState<'direta' | 'ml'>('ml');
  // Navigation tab: 'comparativo' | 'dre' | 'cenarios'
  const [activeTab, setActiveTab] = useState<'comparativo' | 'dre' | 'cenarios'>('comparativo');
  
  // Saved Analysis Scenarios
  const [savedScenarios, setSavedScenarios] = useState<AnalysisScenario[]>([]);
  const [newScenarioName, setNewScenarioName] = useState<string>('');
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [customFixedExpense, setCustomFixedExpense] = useState<number>(0);

  // Load Saved Scenarios from Supabase Cloud / localStorage on mount / open
  useEffect(() => {
    if (isOpen) {
      fetchScenariosFromCloud().then(scenarios => {
        if (Array.isArray(scenarios)) {
          setSavedScenarios(scenarios);
        }
      });
    }
  }, [isOpen]);

  // Sync default selection and initial quantities when modal opens
  useEffect(() => {
    if (isOpen) {
      const favIds = favoriteProjects.map(p => p.id);
      setSelectedIds(prev => (prev.length === 0 ? favIds : prev.filter(id => favIds.includes(id))));
      
      // Default to 'monthly' mode with project.furnitureQty * workDaysPerMonth
      const initialQtys: Record<string, number> = {};
      favoriteProjects.forEach(p => {
        const days = p.workDaysPerMonth || 25;
        initialQtys[p.id] = (p.furnitureQty || 1) * days;
      });
      setQuantities(initialQtys);
      setCalculationMode('monthly');
      setSalesChannel('ml');
    }
  }, [isOpen, savedProjects]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Switch Calculation Mode helper
  const setMode = (mode: 'daily' | 'monthly' | 'custom') => {
    setCalculationMode(mode);
    if (mode === 'daily') {
      const dailyQtys: Record<string, number> = {};
      favoriteProjects.forEach(p => {
        dailyQtys[p.id] = p.furnitureQty || 1;
      });
      setQuantities(dailyQtys);
    } else if (mode === 'monthly') {
      const monthlyQtys: Record<string, number> = {};
      favoriteProjects.forEach(p => {
        const days = p.workDaysPerMonth || 25;
        monthlyQtys[p.id] = (p.furnitureQty || 1) * days;
      });
      setQuantities(monthlyQtys);
    }
  };

  // Toggle selection of a project
  const toggleSelectProject = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllFavorites = () => {
    setSelectedIds(favoriteProjects.map(p => p.id));
  };

  const deselectAllFavorites = () => {
    setSelectedIds([]);
  };

  // Save Current Analysis Scenario to Cloud & Browser
  const handleSaveScenario = async () => {
    const name = newScenarioName.trim() || `Cenário ${savedScenarios.length + 1}`;
    const newScenario: AnalysisScenario = {
      id: `scen-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      selectedProjectIds: [...selectedIds],
      quantities: { ...quantities },
      calculationMode,
    };

    const updated = [newScenario, ...savedScenarios];
    setSavedScenarios(updated);
    await saveScenariosToCloud(updated);

    setActiveScenarioId(newScenario.id);
    setNewScenarioName('');
    showToast(`Cenário "${name}" salvo na nuvem e no navegador!`);
  };

  // Load a Saved Scenario
  const handleLoadScenario = (scen: AnalysisScenario) => {
    setSelectedIds(scen.selectedProjectIds || []);
    setQuantities(scen.quantities || {});
    if (scen.calculationMode) setCalculationMode(scen.calculationMode);
    setActiveScenarioId(scen.id);
    showToast(`Cenário "${scen.name}" carregado!`);
  };

  // Delete a Saved Scenario from Cloud & Browser
  const handleDeleteScenario = async (id: string) => {
    const updated = savedScenarios.filter(s => s.id !== id);
    setSavedScenarios(updated);
    await saveScenariosToCloud(updated);

    if (activeScenarioId === id) setActiveScenarioId(null);
    showToast('Cenário excluído.');
  };

  // Format currency helper BRL
  const formatBRL = (val: number) => {
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // COMPUTATION OF METRICS FOR EACH SELECTED FAVORITE PROJECT
  const selectedProjects = favoriteProjects.filter(p => selectedIds.includes(p.id));

  const projectMetrics = selectedProjects.map(proj => {
    const pieces = proj.pieces || [];
    const backPieces = proj.backPieces || [];
    const sheetW = proj.sheetWidth || 2750;
    const sheetH = proj.sheetHeight || 1750;
    const backSheetW = proj.backSheetWidth || 2750;
    const backSheetH = proj.backSheetHeight || 1850;

    const qtyPlanned = quantities[proj.id] || proj.furnitureQty || 1;

    // Batch Packing for the planned quantity (qtyPlanned) of this project
    const batchPiecesToPack = pieces.map(p => ({
      ...p,
      quantity: p.quantity * qtyPlanned,
    }));
    const packBatch = packPieces(batchPiecesToPack, sheetW, sheetH);
    const mainSheetsBatch = packBatch.sheetsUsed;

    const batchBackPiecesToPack = backPieces.map(p => ({
      ...p,
      quantity: p.quantity * qtyPlanned,
    }));
    const packBackBatch = packPieces(batchBackPiecesToPack, backSheetW, backSheetH);
    const backSheetsBatch = packBackBatch.sheetsUsed;

    // Unit sheet consumption
    const mainSheetsPerUnit = qtyPlanned > 0 ? (mainSheetsBatch / qtyPlanned) : 0;
    const backSheetsPerUnit = qtyPlanned > 0 ? (backSheetsBatch / qtyPlanned) : 0;

    // Yield: How many furniture units are made per 1 main MDF sheet
    const yieldPerSheet = mainSheetsBatch > 0 ? (qtyPlanned / mainSheetsBatch) : 0;

    // Costs Breakdown
    const costs = proj.costs || [];
    const directMaterialCostUnit = costs.reduce((sum, c) => sum + (c.unitPrice * c.quantity), 0);
    const totalEdgeTapeMetersUnit = pieces.reduce((sum, p) => sum + calculatePieceEdgeTapeMeters(p) * p.quantity, 0);

    // Sales Scenarios
    const salesScenarios = proj.salesScenarios || [];
    const directPrice = salesScenarios.find(s => s.id === 'c1')?.unitPrice || salesScenarios[0]?.unitPrice || 0;
    const mlPrice = salesScenarios.find(s => s.id === 'c2')?.unitPrice || salesScenarios[1]?.unitPrice || directPrice * 1.3;

    // Active Sales Price based on current salesChannel toggle or specific prices
    const targetPrice = salesChannel === 'ml' ? mlPrice : directPrice;

    // Rates
    const taxRate = proj.taxRate !== undefined ? proj.taxRate : 8.0;
    const mlFeeRate = proj.mlFeeRate !== undefined ? proj.mlFeeRate : 30.0;

    // DRE Unitary Calculations
    const taxAmountUnit = targetPrice * (taxRate / 100);
    const mlFeeAmountUnit = salesChannel === 'ml' ? targetPrice * (mlFeeRate / 100) : 0;
    const netRevenueUnit = targetPrice - taxAmountUnit - mlFeeAmountUnit;
    const netProfitUnit = netRevenueUnit - directMaterialCostUnit;
    const netMarginPercent = targetPrice > 0 ? (netProfitUnit / targetPrice) * 100 : 0;

    // Competitor Price Average
    const compPrices = (proj.competitorItems || []).map(c => c.price).filter(p => p > 0);
    const avgCompetitorPrice = compPrices.length > 0 
      ? compPrices.reduce((a, b) => a + b, 0) / compPrices.length 
      : 0;

    return {
      proj,
      piecesCount: pieces.length,
      mainSheetsBatch,
      backSheetsBatch,
      mainSheetsPerUnit,
      backSheetsPerUnit,
      yieldPerSheet,
      directMaterialCostUnit,
      totalEdgeTapeMetersUnit,
      directPrice,
      mlPrice,
      targetPrice,
      taxRate,
      mlFeeRate,
      taxAmountUnit,
      mlFeeAmountUnit,
      netRevenueUnit,
      netProfitUnit,
      netMarginPercent,
      avgCompetitorPrice,
      qtyPlanned,
    };
  });

  // Identify Best Margin Project (Champion 🏆)
  const sortedByMargin = [...projectMetrics].sort((a, b) => b.netMarginPercent - a.netMarginPercent);
  const bestMarginProjId = sortedByMargin.length > 0 ? sortedByMargin[0].proj.id : null;

  // CONSOLIDATED DRE CALCULATIONS (Batch Production)
  const consolidated = projectMetrics.reduce(
    (acc, item) => {
      const q = item.qtyPlanned;
      acc.totalFurnitureCount += q;
      acc.totalMainSheets += item.mainSheetsBatch;
      acc.totalBackSheets += item.backSheetsBatch;
      acc.grossRevenue += item.targetPrice * q;
      acc.taxes += item.taxAmountUnit * q;
      acc.mlFees += item.mlFeeAmountUnit * q;
      acc.directCosts += item.directMaterialCostUnit * q;
      return acc;
    },
    {
      totalFurnitureCount: 0,
      totalMainSheets: 0,
      totalBackSheets: 0,
      grossRevenue: 0,
      taxes: 0,
      mlFees: 0,
      directCosts: 0,
    }
  );

  const netRevenueConsolidated = consolidated.grossRevenue - consolidated.taxes - consolidated.mlFees;
  const netProfitConsolidated = netRevenueConsolidated - consolidated.directCosts - customFixedExpense;
  const consolidatedMarginPercent = consolidated.grossRevenue > 0 
    ? (netProfitConsolidated / consolidated.grossRevenue) * 100 
    : 0;

  // Average work days across selected projects
  const avgWorkDays = selectedProjects.length > 0
    ? Math.round(selectedProjects.reduce((sum, p) => sum + (p.workDaysPerMonth || 25), 0) / selectedProjects.length)
    : 25;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-950 border border-emerald-600 text-emerald-300 px-4 py-2.5 rounded-lg shadow-2xl text-xs font-bold flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-6xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl text-slate-950 shadow-md">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                  Resumo Gerencial & DRE Comparativa
                </h2>
                <span className="text-xs bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  ⭐ {favoriteProjects.length} Favoritos
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Compare margens de lucro, rendimento de chapas MDF e DRE consolidada de lotes de móveis.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
              title="Visualizar Impressão / Imprimir DRE Gerencial"
            >
              <Printer size={15} />
              <span className="hidden sm:inline">Imprimir / Visualizar Impressão</span>
              <span className="sm:hidden">Imprimir</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Favorite Projects Selector Bar */}
        <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <CheckSquare size={14} />
                <span>Móveis Favoritos Selecionados para Análise:</span>
              </span>
              <span className="text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                {selectedIds.length} / {favoriteProjects.length} marcados
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={selectAllFavorites}
                className="text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded font-semibold transition-colors"
              >
                Marcar Todos
              </button>
              <button
                onClick={deselectAllFavorites}
                className="text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded font-semibold transition-colors"
              >
                Desmarcar Todos
              </button>
            </div>
          </div>

          {/* List of Favorite Project Checkboxes */}
          {favoriteProjects.length === 0 ? (
            <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Nenhum projeto marcado como favorito. Marque estrelas ⭐ nos seus projetos salvos para compará-los aqui.</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-1">
              {favoriteProjects.map(proj => {
                const isSel = selectedIds.includes(proj.id);
                return (
                  <button
                    key={proj.id}
                    onClick={() => toggleSelectProject(proj.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                      isSel
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {isSel ? (
                      <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-600" />
                    )}
                    <span>{proj.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Toolbar Controls: Navigation Tabs & Sales Channel Toggle */}
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('comparativo')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'comparativo'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Resumo Comparativo</span>
            </button>

            <button
              onClick={() => setActiveTab('dre')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'dre'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>DRE Resumida Consolidada</span>
            </button>

            <button
              onClick={() => setActiveTab('cenarios')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'cenarios'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>Cenários Salvos ({savedScenarios.length})</span>
            </button>
          </div>

          {/* Sales Channel Scenario Switcher */}
          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 px-2">Cenário de Venda:</span>
            <button
              onClick={() => setSalesChannel('direta')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                salesChannel === 'direta'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              💵 Venda Direta
            </button>
            <button
              onClick={() => setSalesChannel('ml')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                salesChannel === 'ml'
                  ? 'bg-yellow-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📦 Mercado Livre
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {selectedProjects.length === 0 ? (
            <div className="py-16 text-center text-slate-500 bg-slate-950 rounded-xl border border-dashed border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center mx-auto border border-slate-800">
                <BarChart3 className="w-6 h-6" />
              </div>
              <p className="font-bold text-slate-300 text-sm">Nenhum móvel favorito selecionado para análise.</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Marque as caixas de seleção no topo para selecionar os móveis que deseja visualizar no comparativo e na DRE consolidada.
              </p>
            </div>
          ) : activeTab === 'comparativo' ? (
            /* TAB 1: COMPARATIVE SUMMARY OF FURNITURE ITEMS */
            <div className="space-y-6">
              {/* Champion Card Banner */}
              {sortedByMargin.length > 0 && (
                <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-amber-950/40 border border-emerald-500/40 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-500 text-slate-950 rounded-xl font-bold shadow-md">
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                          🏆 Campeão de Margem de Lucro
                        </span>
                        <span className="text-xs text-emerald-400 font-bold font-mono">
                          {sortedByMargin[0].netMarginPercent.toFixed(2)}% Margem Líquida
                        </span>
                      </div>
                      <h3 className="text-base font-extrabold text-slate-100 mt-0.5">
                        {sortedByMargin[0].proj.name}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Custo Materiais (1 un):</span>
                      <span className="font-bold text-slate-200">R$ {formatBRL(sortedByMargin[0].directMaterialCostUnit)}</span>
                    </div>
                    <div className="border-l border-slate-800 pl-4">
                      <span className="text-slate-400 block text-[10px]">Valor Venda ({salesChannel === 'ml' ? 'ML' : 'Direta'}):</span>
                      <span className="font-bold text-amber-400">R$ {formatBRL(sortedByMargin[0].targetPrice)}</span>
                    </div>
                    <div className="border-l border-slate-800 pl-4">
                      <span className="text-slate-400 block text-[10px]">Lucro Líquido Unit.:</span>
                      <span className="font-bold text-emerald-400">R$ {formatBRL(sortedByMargin[0].netProfitUnit)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Comparative Table */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <span>Tabela Comparativa de Móveis e Indicadores de Lucratividade</span>
                  </h3>
                  <span className="text-xs text-slate-400">
                    Exibindo <strong>{projectMetrics.length}</strong> móveis
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 font-bold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3.5">Móvel</th>
                        <th className="p-3.5 text-center">Móveis no Lote</th>
                        <th className="p-3.5 text-center">Chapas MDF (Lote)</th>
                        <th className="p-3.5 text-center">Móveis por Chapa</th>
                        <th className="p-3.5 text-right">Custo Insumos/MDF (Unit)</th>
                        <th className="p-3.5 text-right">Venda Direta</th>
                        <th className="p-3.5 text-right">Venda Mercado Livre</th>
                        <th className="p-3.5 text-right">Lucro Líq. Unitário</th>
                        <th className="p-3.5 text-center">Margem Líquida %</th>
                        <th className="p-3.5 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {projectMetrics.map(item => {
                        const isBest = item.proj.id === bestMarginProjId;
                        return (
                          <tr
                            key={item.proj.id}
                            className={`hover:bg-slate-900/60 transition-colors ${
                              isBest ? 'bg-amber-950/10' : ''
                            }`}
                          >
                            <td className="p-3.5 font-bold text-slate-100 flex items-center gap-2">
                              {isBest && (
                                <span title="Campeão de Margem" className="text-amber-400 text-sm">🏆</span>
                              )}
                              <div>
                                <div className="text-sm font-extrabold text-slate-100">{item.proj.name}</div>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {item.piecesCount} peças • {item.totalEdgeTapeMetersUnit.toFixed(1)}m fita
                                </span>
                              </div>
                            </td>

                            <td className="p-3.5 text-center font-mono font-bold text-slate-100 text-sm">
                              {item.qtyPlanned} un
                            </td>

                            <td className="p-3.5 text-center font-mono text-slate-200">
                              <span className="font-bold text-amber-400">{item.mainSheetsBatch}</span> chapa(s) MDF
                              {item.backSheetsBatch > 0 && (
                                <span className="block text-[10px] text-slate-400">
                                  + {item.backSheetsBatch} chapa fundo
                                </span>
                              )}
                            </td>

                            <td className="p-3.5 text-center font-mono text-emerald-400 font-bold text-sm">
                              {item.yieldPerSheet > 0 ? (
                                <span>{item.yieldPerSheet.toFixed(1)} un/chapa</span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>

                            <td className="p-3.5 text-right font-mono font-bold text-slate-200">
                              R$ {formatBRL(item.directMaterialCostUnit)}
                            </td>

                            <td className="p-3.5 text-right font-mono text-emerald-300 font-semibold">
                              R$ {formatBRL(item.directPrice)}
                            </td>

                            <td className="p-3.5 text-right font-mono text-yellow-300 font-semibold">
                              R$ {formatBRL(item.mlPrice)}
                            </td>

                            <td className="p-3.5 text-right font-mono font-extrabold text-emerald-400 text-sm">
                              R$ {formatBRL(item.netProfitUnit)}
                            </td>

                            <td className="p-3.5 text-center">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-extrabold border ${
                                item.netMarginPercent >= 35
                                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                                  : item.netMarginPercent >= 20
                                  ? 'bg-amber-950 border-amber-500 text-amber-300'
                                  : 'bg-red-950 border-red-500 text-red-300'
                              }`}>
                                {item.netMarginPercent.toFixed(2)}%
                              </span>
                            </td>

                            <td className="p-3.5 text-center">
                              <button
                                onClick={() => {
                                  onLoadProject(item.proj);
                                  onClose();
                                }}
                                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2.5 py-1 rounded text-[11px] transition-all active:scale-95 cursor-pointer"
                                title="Carregar este projeto no editor principal"
                              >
                                Abrir
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'dre' ? (
            /* TAB 2: CONSOLIDATED RESUMED DRE FOR BATCH PRODUCTION */
            <div className="space-y-6">
              {/* Context Banner: Calculation Period Mode Indicator */}
              <div className="bg-amber-950/30 border border-amber-500/40 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                    {calculationMode === 'daily' ? (
                      <Sun className="w-6 h-6" />
                    ) : calculationMode === 'monthly' ? (
                      <Calendar className="w-6 h-6" />
                    ) : (
                      <Sliders className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-amber-300 uppercase tracking-wider">
                      {calculationMode === 'daily'
                        ? '☀️ FATURAMENTO E DRE CALCULADOS SOBRE 1 DIA DE VENDAS (PROJETO ORIGINAL)'
                        : calculationMode === 'monthly'
                        ? `📅 FATURAMENTO E DRE CALCULADOS SOBRE MÊS COMPLETO (${avgWorkDays} DIAS ÚTEIS)`
                        : '✏️ FATURAMENTO E DRE CALCULADOS SOBRE LOTE PERSONALIZADO'}
                    </h3>
                    <p className="text-xs text-slate-300 font-mono mt-0.5">
                      Base atual: <strong>{consolidated.totalFurnitureCount} móvel(is) no total</strong> • <strong>{consolidated.totalMainSheets} chapa(s) MDF principal</strong>
                    </p>
                  </div>
                </div>

                {/* Calculation Mode Toggle Buttons */}
                <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start sm:self-center">
                  <button
                    onClick={() => setMode('daily')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      calculationMode === 'daily'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Usar a produção de 1 único dia cadastrada nos projetos originais"
                  >
                    <Sun size={14} />
                    <span>1 Dia</span>
                  </button>

                  <button
                    onClick={() => setMode('monthly')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      calculationMode === 'monthly'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Multiplicar a produção diária pelos dias úteis do mês"
                  >
                    <Calendar size={14} />
                    <span>Mês Completo</span>
                  </button>

                  <button
                    onClick={() => setMode('custom')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      calculationMode === 'custom'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Ajustar as quantidades manualmente"
                  >
                    <Sliders size={14} />
                    <span>Personalizado</span>
                  </button>
                </div>
              </div>

              {/* Quantities Planner Bar */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3 shadow-md">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-850 pb-2.5">
                  <div>
                    <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Calculator className="w-4 h-4" />
                      <span>Composição do Lote - Quantidades de Móveis para a DRE Consolidada</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Ajuste a quantidade de unidades de cada móvel para simular o faturamento e resultado total.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-300">Despesas Fixas Globais:</span>
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded px-2 py-1">
                      <span className="text-xs text-slate-400">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={customFixedExpense === 0 ? '' : customFixedExpense}
                        onChange={e => setCustomFixedExpense(parseFloat(e.target.value) || 0)}
                        placeholder="0,00"
                        className="bg-transparent text-slate-100 font-mono font-bold text-xs focus:outline-none w-24"
                      />
                    </div>
                  </div>
                </div>

                {/* Quantity Inputs Per Project */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {projectMetrics.map(item => (
                    <div
                      key={`qty-${item.proj.id}`}
                      className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-bold text-slate-200 truncate" title={item.proj.name}>
                        {item.proj.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            const current = quantities[item.proj.id] || 1;
                            if (current > 1) {
                              setQuantities({ ...quantities, [item.proj.id]: current - 1 });
                              setCalculationMode('custom');
                            }
                          }}
                          className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold text-xs flex items-center justify-center transition-colors cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.qtyPlanned}
                          onChange={e => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            setQuantities({ ...quantities, [item.proj.id]: val });
                            setCalculationMode('custom');
                          }}
                          className="w-12 text-center bg-slate-950 border border-slate-700 text-amber-400 font-mono font-bold text-xs rounded py-0.5"
                        />
                        <button
                          onClick={() => {
                            const current = quantities[item.proj.id] || 1;
                            setQuantities({ ...quantities, [item.proj.id]: current + 1 });
                            setCalculationMode('custom');
                          }}
                          className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold text-xs flex items-center justify-center transition-colors cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Consolidated Summary Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl shadow-md">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total de Móveis no Lote</span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="font-mono text-xl font-extrabold text-slate-100">
                      {consolidated.totalFurnitureCount}
                    </span>
                    <span className="text-[11px] text-slate-400">unidades</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl shadow-md">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">TOTAL DE CHAPAS MDF</span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="font-mono text-xl font-extrabold text-amber-400">
                      {consolidated.totalMainSheets}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate">
                      chapa(s) {consolidated.totalBackSheets > 0 ? `(+${consolidated.totalBackSheets} fundo)` : ''}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl shadow-md">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Faturamento Bruto Lote</span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="font-mono text-base sm:text-lg font-extrabold text-slate-100 whitespace-nowrap">
                      R$ {formatBRL(consolidated.grossRevenue)}
                    </span>
                  </div>
                </div>

                <div className={`border p-3.5 rounded-xl shadow-md transition-all ${
                  netProfitConsolidated >= 0
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                    : 'bg-red-950/40 border-red-500/50 text-red-300'
                }`}>
                  <span className="text-[10px] uppercase font-bold tracking-wider block opacity-80">Lucro Líquido Acumulado</span>
                  <div className="flex items-center justify-between gap-1.5 mt-1">
                    <span className="font-mono text-sm sm:text-base font-black whitespace-nowrap">
                      R$ {formatBRL(netProfitConsolidated)}
                    </span>
                    <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-950/60 border border-current shrink-0 whitespace-nowrap">
                      {consolidatedMarginPercent.toFixed(1)}% Margem
                    </span>
                  </div>
                </div>
              </div>

              {/* DRE RESUMIDA DETALHADA STATEMENT */}
              <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-4 shadow-xl">
                <div className="flex justify-between items-center border-b border-slate-850 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span>DRE RESUMIDA CONSOLIDADA - DEMONSTRAÇÃO DO RESULTADO DO LOTE</span>
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Período: <strong>{calculationMode === 'daily' ? '1 Dia de Vendas' : calculationMode === 'monthly' ? `${avgWorkDays} Dias Úteis (Mês)` : 'Personalizado'}</strong> ({consolidated.totalFurnitureCount} móvel(is) | {consolidated.totalMainSheets} chapa(s) MDF)
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    Canal: <strong>{salesChannel === 'ml' ? 'Mercado Livre' : 'Venda Direta'}</strong>
                  </span>
                </div>

                <div className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-200 py-1 border-b border-slate-900">
                    <span className="font-bold">(+) Faturamento Bruto Acumulado ({consolidated.totalFurnitureCount} móveis):</span>
                    <span className="font-extrabold text-slate-100 text-sm">R$ {formatBRL(consolidated.grossRevenue)}</span>
                  </div>

                  <div className="flex justify-between text-slate-400">
                    <span>(-) Impostos Totais sobre Vendas:</span>
                    <span className="text-red-400">R$ {formatBRL(consolidated.taxes)}</span>
                  </div>

                  {salesChannel === 'ml' && (
                    <div className="flex justify-between text-slate-400">
                      <span>(-) Taxas Totais Mercado Livre:</span>
                      <span className="text-red-400">R$ {formatBRL(consolidated.mlFees)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-amber-400 font-semibold border-t border-slate-900 pt-1.5">
                    <span>(=) Receita Líquida Consolidada:</span>
                    <span>R$ {formatBRL(netRevenueConsolidated)}</span>
                  </div>

                  <div className="flex justify-between text-slate-400">
                    <span>(-) Custo Total dos Materiais, MDF e Insumos (CMV Total):</span>
                    <span className="text-slate-300">R$ {formatBRL(consolidated.directCosts)}</span>
                  </div>

                  {customFixedExpense > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>(-) Despesas Fixas / Operacionais Alocadas:</span>
                      <span className="text-red-400">R$ {formatBRL(customFixedExpense)}</span>
                    </div>
                  )}

                  {/* FINAL RESULT BANNER */}
                  <div className={`p-4 rounded-xl border mt-4 transition-all ${
                    netProfitConsolidated >= 0
                      ? 'bg-gradient-to-r from-emerald-950 to-slate-900 border-emerald-500/50 text-emerald-300'
                      : 'bg-gradient-to-r from-red-950 to-slate-900 border-red-500/50 text-red-300'
                  }`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <span className="text-xs uppercase font-extrabold tracking-wider block">
                          {netProfitConsolidated >= 0 ? '🟢 LUCRO LÍQUIDO FINAL DO LOTE:' : '🔴 RESULTADO DO LOTE (PREJUÍZO):'}
                        </span>
                        <span className="text-xs opacity-80">
                          Margem Líquida Média Consolidada: <strong>{consolidatedMarginPercent.toFixed(2)}%</strong>
                        </span>
                      </div>
                      <span className="font-mono text-3xl font-black tracking-tight">
                        R$ {formatBRL(netProfitConsolidated)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Profit Contribution Visual Breakdown */}
              <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-850 pb-2">
                  <PieChart className="w-4 h-4 text-amber-400" />
                  <span>Participação dos Móveis no Faturamento e Lucro do Lote</span>
                </h3>

                <div className="space-y-4">
                  {projectMetrics.map(item => {
                    const projTotalRevenue = item.targetPrice * item.qtyPlanned;
                    const projTotalProfit = item.netProfitUnit * item.qtyPlanned;
                    const revenuePercent = consolidated.grossRevenue > 0 ? (projTotalRevenue / consolidated.grossRevenue) * 100 : 0;
                    const profitPercent = netProfitConsolidated > 0 ? (projTotalProfit / netProfitConsolidated) * 100 : 0;

                    return (
                      <div key={`breakdown-${item.proj.id}`} className="space-y-1 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-extrabold text-slate-100">
                            {item.proj.name} ({item.qtyPlanned} un | {item.mainSheetsBatch} chapa MDF)
                          </span>
                          <span className="font-mono text-slate-300 text-[11px]">
                            Faturamento: <strong>R$ {formatBRL(projTotalRevenue)}</strong> ({revenuePercent.toFixed(1)}%) | Lucro: <strong className="text-emerald-400">R$ {formatBRL(projTotalProfit)}</strong> ({profitPercent.toFixed(1)}%)
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="h-2.5 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                          <div
                            className="bg-amber-500 h-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, revenuePercent))}%` }}
                            title={`Faturamento: ${revenuePercent.toFixed(1)}%`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* TAB 3: SAVED ANALYSIS SCENARIOS */
            <div className="space-y-6">
              {/* Save Current Scenario Box */}
              <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-4 shadow-md">
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  <span>Salvar Seleção Atual como um Cenário de Análise</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Salve a combinação atual dos móveis selecionados, modo de cálculo e suas quantidades para alternar rapidamente no futuro.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <input
                    type="text"
                    value={newScenarioName}
                    onChange={e => setNewScenarioName(e.target.value)}
                    placeholder="Ex: Cenário 1 - Kit Cozinha Completa"
                    className="bg-slate-900 border border-slate-700 text-slate-100 font-bold text-xs rounded-lg px-3 py-2 w-full focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleSaveScenario}
                    disabled={selectedIds.length === 0}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salvar Cenário</span>
                  </button>
                </div>
              </div>

              {/* List of Saved Scenarios */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-850 pb-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Seus Cenários de Análise Salvos ({savedScenarios.length})</span>
                </h3>

                {savedScenarios.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    Nenhum cenário de análise salvo ainda. Digite um nome acima e clique em "Salvar Cenário".
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedScenarios.map(scen => {
                      const isActive = activeScenarioId === scen.id;
                      const dateStr = new Date(scen.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <div
                          key={scen.id}
                          className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
                            isActive
                              ? 'bg-amber-950/20 border-amber-500/50 shadow-md'
                              : 'bg-slate-900 hover:bg-slate-850 border-slate-800'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-extrabold text-slate-100">{scen.name}</h4>
                              {isActive && (
                                <span className="text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold px-2 py-0.5 rounded">
                                  Ativo
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-1 font-mono">
                              {scen.selectedProjectIds.length} móveis selecionados • Salvo em: {dateStr}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleLoadScenario(scen)}
                              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Carregar</span>
                            </button>
                            <button
                              onClick={() => handleDeleteScenario(scen.id)}
                              className="p-1.5 bg-slate-950 hover:bg-red-950/60 border border-slate-700 hover:border-red-700 text-slate-400 hover:text-red-400 rounded text-xs transition-colors cursor-pointer"
                              title="Excluir cenário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
