import React, { useState, useEffect, useRef, useCallback } from 'react';
import { packPieces, Piece, EdgeTapeOption, EDGE_TAPE_LABELS, calculatePieceEdgeTapeMeters } from './lib/packing';
import {
  Plus,
  Trash2,
  Edit2,
  RotateCcw,
  FileText,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Download,
  Upload,
  DollarSign,
  Calculator,
  FolderOpen,
  Save,
  Layers,
  FolderKanban,
  Check,
  Eye,
  X,
  Link,
  ExternalLink,
  Star,
  BarChart3,
  ShoppingBag,
  ShoppingCart,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { FurniturePreview } from './components/FurniturePreview';
import { AiPieceExtractorModal } from './components/AiPieceExtractorModal';
import { ProjectsModal, SavedProject, SalesScenario, FixedExpense, CompetitorItem } from './components/ProjectsModal';
import { ExecutiveSummaryModal } from './components/ExecutiveSummaryModal';
import { MercadoLivreLibraryModal } from './components/MercadoLivreLibraryModal';
import { PurchaseLibraryModal } from './components/PurchaseLibraryModal';
import { PurchaseProductData } from './lib/mlScraper';
import { fetchProjectsFromCloud, saveProjectToCloud, deleteProjectFromCloud, isSupabaseConfigured } from './lib/supabase';
import { ConfirmModal } from './components/ConfirmModal';



export interface CostItem {
  id: string;
  name: string;
  unitPrice: number; // R$ unitário
  quantity: number;   // Quantidade utilizada
}

// Função para formatar valores no padrão de moeda brasileira R$ (ex: 1.000,00)
const formatBRL = (val: number): string => {
  return (val || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Função para gerar uma cor única (escura) baseada no nome
const getColorForPiece = (name: string) => {
  const darkColors = [
    '#1e3a8a', '#166534', '#991b1b', '#854d0e', '#581c87',
    '#9d174d', '#0f766e', '#1e40af', '#1f2937', '#7c2d12'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return darkColors[Math.abs(hash) % darkColors.length];
};

function CurrencyInput({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  const [isFocused, setIsFocused] = useState(false);
  const [rawText, setRawText] = useState(value === 0 ? '' : value.toString().replace('.', ','));

  useEffect(() => {
    if (!isFocused) {
      setRawText(value === 0 ? '' : value.toString().replace('.', ','));
    }
  }, [value, isFocused]);

  return (
    <div className="flex items-center justify-end gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 focus-within:border-amber-500">
      <span className="text-amber-400 font-bold text-xs font-mono">R$</span>
      <input
        type="text"
        value={isFocused ? rawText : (value === 0 ? '0,00' : formatBRL(value))}
        onFocus={() => {
          setIsFocused(true);
          setRawText(value === 0 ? '' : value.toString().replace('.', ','));
        }}
        onBlur={() => {
          setIsFocused(false);
          const clean = rawText.replace(/\./g, '').replace(',', '.');
          const val = parseFloat(clean);
          onChange(isNaN(val) ? 0 : Math.max(0, val));
        }}
        onChange={e => {
          setRawText(e.target.value);
          const clean = e.target.value.replace(/\./g, '').replace(',', '.');
          const val = parseFloat(clean);
          onChange(isNaN(val) ? 0 : Math.max(0, val));
        }}
        className="bg-transparent border-none text-slate-200 w-24 text-right focus:outline-none rounded px-0.5 font-mono text-xs font-bold"
      />
    </div>
  );
}

const defaultSalesScenarios: SalesScenario[] = [
  { id: 'c1', name: 'Cenário 1 (Varejo / Venda Direta)', unitPrice: 0 },
  { id: 'c2', name: 'Cenário 2 (Mercado Livre)', unitPrice: 0 },
  { id: 'c3', name: 'Cenário 3 (Venda Local)', unitPrice: 0 },
];

const defaultFixedExpenses: FixedExpense[] = [
  { id: 'fe-1', name: 'Aluguel da Oficina', value: 1500 },
  { id: 'fe-2', name: 'Energia Elétrica / Luz', value: 350 },
  { id: 'fe-3', name: 'Funcionários / Ajudante', value: 2000 },
];

export default function App() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [costs, setCosts] = useState<CostItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [newPiece, setNewPiece] = useState({ name: '', height: '', width: '', quantity: '1', ab: '' });
  const [newPieceEdgeTape, setNewPieceEdgeTape] = useState<EdgeTapeOption>('none');
  
  // Backing MDF States (Plano de Corte de Fundo - 3mm/6mm)
  const [backPieces, setBackPieces] = useState<Piece[]>([]);
  const [backSheetWidth, setBackSheetWidth] = useState<number>(2750);
  const [backSheetHeight, setBackSheetHeight] = useState<number>(1850);
  const [newBackPiece, setNewBackPiece] = useState({ name: '', height: '', width: '', quantity: '1' });
  const backCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Sales Scenarios State (Cenários de Venda)
  const [salesScenarios, setSalesScenarios] = useState<SalesScenario[]>(defaultSalesScenarios);

  // Monthly DRE & Business Viability States
  const [workDaysPerMonth, setWorkDaysPerMonth] = useState<number>(25);
  const [taxRate, setTaxRate] = useState<number>(8.0);
  const [mlFeeRate, setMlFeeRate] = useState<number>(30);
  const [targetNetMargin, setTargetNetMargin] = useState<number>(30);
  const [includeFixedInMarkup, setIncludeFixedInMarkup] = useState<boolean>(true);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('c2');
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(defaultFixedExpenses);
  const [hideFixedExpensesInDre, setHideFixedExpensesInDre] = useState<boolean>(true);
  const [dailySales, setDailySales] = useState<number>(1);
  const [newFixedExpense, setNewFixedExpense] = useState({ name: '', value: '' });

  // Cost Input State: Name, Unit Price, Quantity
  const [newCost, setNewCost] = useState({ name: '', unitPrice: '', quantity: '1' });
  const [furnitureQty, setFurnitureQty] = useState<number>(1);

  // Unit MDF Calculator Modal State
  const [isCalcModalOpen, setIsCalcModalOpen] = useState<boolean>(false);
  const [calcSheetPrice, setCalcSheetPrice] = useState<number>(0);
  const [calcSheetQty, setCalcSheetQty] = useState<number>(1);
  const [calcFurnitureQty, setCalcFurnitureQty] = useState<number>(1);

  const [sheetWidth, setSheetWidth] = useState(2750);
  const [sheetHeight, setSheetHeight] = useState(1850);
  const [furnitureImages, setFurnitureImages] = useState<string[]>([]);
  const [competitorItems, setCompetitorItems] = useState<CompetitorItem[]>([]);
  const [newCompetitorPrice, setNewCompetitorPrice] = useState<string>('');
  const [newCompetitorLink, setNewCompetitorLink] = useState<string>('');
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);

  const addCompetitorItem = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const priceVal = parseFloat(newCompetitorPrice.replace(',', '.')) || 0;
    let linkVal = newCompetitorLink.trim();
    if (linkVal && !/^https?:\/\//i.test(linkVal)) {
      linkVal = 'https://' + linkVal;
    }
    if (priceVal <= 0 && !linkVal) return;
    if (Array.isArray(competitorItems) && competitorItems.length >= 5) {
      alert('Você pode cadastrar no máximo 5 valores de concorrentes.');
      return;
    }

    const newItem: CompetitorItem = {
      id: `comp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      price: isNaN(priceVal) ? 0 : priceVal,
      link: linkVal,
    };

    setCompetitorItems(prev => [...(Array.isArray(prev) ? prev : []), newItem]);
    setNewCompetitorPrice('');
    setNewCompetitorLink('');
  };

  const removeCompetitorItem = (idToRemove: string) => {
    setCompetitorItems(prev => (Array.isArray(prev) ? prev.filter(item => item && item.id !== idToRemove) : []));
  };
  
  // Multi-Project Manager State
  const [projectName, setProjectName] = useState<string>('Meu Projeto de Marcenaria');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(isSupabaseConfigured());
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState<boolean>(false);
  const [isExecutiveSummaryOpen, setIsExecutiveSummaryOpen] = useState<boolean>(false);
  const [isMlLibraryOpen, setIsMlLibraryOpen] = useState<boolean>(false);
  const [isPurchaseLibraryOpen, setIsPurchaseLibraryOpen] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Custom Confirm Modal State
  const [confirmDeleteState, setConfirmDeleteState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const requestDeleteConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDeleteState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDeleteState(prev => ({ ...prev, isOpen: false }));
      },
    });
  };


  const handleImportMlProductToProject = (product: any) => {
    if (competitorItems.length >= 5) {
      alert('Seus concorrentes já possuem 5 itens cadastrados.');
      return;
    }
    const newItem: CompetitorItem = {
      id: `comp-${Date.now()}`,
      price: product.price || 0,
      link: product.url || '',
    };
    setCompetitorItems(prev => [...prev, newItem]);
    if (product.imageUrl && !furnitureImages.includes(product.imageUrl)) {
      setFurnitureImages(prev => [product.imageUrl, ...prev]);
    }
    setSaveToast(`Produto "${product.title}" importado para seu projeto!`);
    setTimeout(() => setSaveToast(null), 3500);
  };

  const handleImportPurchaseProductToProject = (product: PurchaseProductData) => {
    const newCostItem: CostItem = {
      id: `cost-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      name: product.title,
      unitPrice: product.price || 0,
      quantity: 1,
    };
    setCosts(prev => [...prev, newCostItem]);
    setSaveToast(`Item "${product.title}" lançado nos Insumos do Projeto!`);
    setTimeout(() => setSaveToast(null), 3500);
  };


  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const simulationRef = useRef<HTMLDivElement>(null);
  const get3dImageRef = useRef<(() => string | null) | null>(null);

  // Helper to safely write projects list to LocalStorage (prevent QuotaExceededError)
  const safeSaveProjectsList = (list: SavedProject[]) => {
    try {
      localStorage.setItem('mdf-saved-projects-list', JSON.stringify(list));
    } catch (e) {
      console.warn('QuotaExceededError: Salvando versão leve sem imagens pesadas...');
      const lightweightList = list.map(p => ({
        ...p,
        furnitureImages: (p.furnitureImages || []).slice(0, 1),
      }));
      try {
        localStorage.setItem('mdf-saved-projects-list', JSON.stringify(lightweightList));
      } catch (e2) {
        console.error('Erro ao salvar lista de projetos:', e2);
      }
    }
  };

  // Fetch Suggestions
  useEffect(() => {
    fetch('/api/suggestions')
      .then(res => res.json())
      .then(data => setSuggestions(data))
      .catch(console.error);
  }, []);

  // Load Saved Projects List & Active Project on App Mount (with Supabase Cloud Sync)
  useEffect(() => {
    let isMounted = true;
    fetchProjectsFromCloud().then(res => {
      if (!isMounted) return;
      setIsCloudConnected(res.isCloud);
      const loadedProjectsList = res.projects || [];
      setSavedProjects(loadedProjectsList);

      const savedCurrentId = localStorage.getItem('mdf-current-project-id');
      if (savedCurrentId) {
        const activeProj = loadedProjectsList.find(p => p.id === savedCurrentId);
        if (activeProj) {
          setCurrentProjectId(activeProj.id);
          setProjectName(activeProj.name || 'Projeto de Marcenaria');
          setPieces(activeProj.pieces ? [...activeProj.pieces] : []);
          setCosts(activeProj.costs ? [...activeProj.costs] : []);
          setSheetWidth(activeProj.sheetWidth || 2750);
          setSheetHeight(activeProj.sheetHeight || 1750);
          setFurnitureQty(activeProj.furnitureQty || 1);
          if (activeProj.furnitureImages) setFurnitureImages(activeProj.furnitureImages);
          if (activeProj.competitorItems && Array.isArray(activeProj.competitorItems)) {
            setCompetitorItems(activeProj.competitorItems);
          } else if (activeProj.referenceLinks && Array.isArray(activeProj.referenceLinks)) {
            const converted = activeProj.referenceLinks.map((link, i) => ({
              id: `comp-${Date.now()}-${i}`,
              price: 0,
              link,
            }));
            setCompetitorItems(converted);
          }
          if (activeProj.backPieces) setBackPieces(activeProj.backPieces);
          if (activeProj.backSheetWidth) setBackSheetWidth(activeProj.backSheetWidth);
          if (activeProj.backSheetHeight) setBackSheetHeight(activeProj.backSheetHeight);
          if (activeProj.salesScenarios) setSalesScenarios(activeProj.salesScenarios);
          if (activeProj.workDaysPerMonth) setWorkDaysPerMonth(activeProj.workDaysPerMonth);
          if (activeProj.taxRate !== undefined) setTaxRate(activeProj.taxRate);
          if (activeProj.mlFeeRate !== undefined) setMlFeeRate(activeProj.mlFeeRate);
          if (activeProj.targetNetMargin !== undefined) setTargetNetMargin(activeProj.targetNetMargin);
          if (activeProj.includeFixedInMarkup !== undefined) setIncludeFixedInMarkup(activeProj.includeFixedInMarkup);
          if (activeProj.selectedScenarioId) setSelectedScenarioId(activeProj.selectedScenarioId);
          if (activeProj.fixedExpenses) setFixedExpenses(activeProj.fixedExpenses);
          if (activeProj.dailySales !== undefined) setDailySales(activeProj.dailySales);
          return;
        }
      }

      // Fallback to individual keys if no current project ID
      const savedPieces = localStorage.getItem('mdf-pieces');
      const savedCosts = localStorage.getItem('mdf-costs');
      const savedWidth = localStorage.getItem('mdf-sheet-width');
      const savedHeight = localStorage.getItem('mdf-sheet-height');
      const savedQty = localStorage.getItem('mdf-furniture-qty');
      const savedImages = localStorage.getItem('mdf-furniture-images');
      const savedName = localStorage.getItem('mdf-project-name');
      const savedBackPieces = localStorage.getItem('mdf-back-pieces');
      const savedBackWidth = localStorage.getItem('mdf-back-sheet-width');
      const savedBackHeight = localStorage.getItem('mdf-back-sheet-height');
      const savedSalesScenarios = localStorage.getItem('mdf-sales-scenarios');
      const savedDays = localStorage.getItem('mdf-work-days');
      const savedTax = localStorage.getItem('mdf-tax-rate');
      const savedMlFee = localStorage.getItem('mdf-ml-fee-rate');
      const savedMargin = localStorage.getItem('mdf-target-net-margin');
      const savedIncFixed = localStorage.getItem('mdf-include-fixed-in-markup');
      const savedScenId = localStorage.getItem('mdf-selected-scenario-id');
      const savedFixed = localStorage.getItem('mdf-fixed-expenses');
      const savedDailySales = localStorage.getItem('mdf-daily-sales');
      const savedCompetitor = localStorage.getItem('mdf-competitor-items');

      if (savedName) setProjectName(savedName);
      if (savedPieces) setPieces(JSON.parse(savedPieces));
      if (savedCosts) {
        try {
          const parsed = JSON.parse(savedCosts);
          if (Array.isArray(parsed)) setCosts(parsed);
        } catch (e) {
          console.error('Error loading costs:', e);
        }
      }
      if (savedWidth) setSheetWidth(parseInt(savedWidth));
      if (savedHeight) setSheetHeight(parseInt(savedHeight));
      if (savedQty) setFurnitureQty(Math.max(1, parseInt(savedQty)));
      if (savedImages) setFurnitureImages(JSON.parse(savedImages));
      if (savedBackPieces) setBackPieces(JSON.parse(savedBackPieces));
      if (savedBackWidth) setBackSheetWidth(parseInt(savedBackWidth));
      if (savedBackHeight) setBackSheetHeight(parseInt(savedBackHeight));
      if (savedCompetitor) {
        try {
          const parsed = JSON.parse(savedCompetitor);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.map((item: any, i: number) => {
              if (typeof item === 'string') return { id: `comp-${Date.now()}-${i}`, price: 0, link: item };
              if (typeof item === 'number') return { id: `comp-${Date.now()}-${i}`, price: item, link: '' };
              return {
                id: item?.id || `comp-${Date.now()}-${i}`,
                price: typeof item?.price === 'number' ? item.price : (parseFloat(item?.price) || 0),
                link: item?.link || '',
              };
            });
            setCompetitorItems(sanitized);
          }
        } catch (e) {
          console.error('Error loading competitor items:', e);
        }
      }
      if (savedSalesScenarios) {
        try {
          const parsed = JSON.parse(savedSalesScenarios);
          if (Array.isArray(parsed) && parsed.length > 0) setSalesScenarios(parsed);
        } catch (e) {
          console.error(e);
        }
      }
      if (savedDays) setWorkDaysPerMonth(parseInt(savedDays) || 25);
      if (savedTax) setTaxRate(parseFloat(savedTax) || 4.0);
      if (savedMlFee) setMlFeeRate(parseFloat(savedMlFee) || 0);
      if (savedMargin) setTargetNetMargin(parseFloat(savedMargin) || 30);
      if (savedIncFixed !== null) setIncludeFixedInMarkup(savedIncFixed === 'true');
      if (savedScenId) setSelectedScenarioId(savedScenId);
      if (savedDailySales) setDailySales(parseInt(savedDailySales) || 1);
      if (savedFixed) {
        try {
          const parsed = JSON.parse(savedFixed);
          if (Array.isArray(parsed)) setFixedExpenses(parsed);
        } catch (e) {
          console.error(e);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-Sync Active Workspace to LocalStorage and Projects List
  useEffect(() => {
    localStorage.setItem('mdf-project-name', projectName);
    localStorage.setItem('mdf-pieces', JSON.stringify(pieces));
    localStorage.setItem('mdf-costs', JSON.stringify(costs));
    localStorage.setItem('mdf-sheet-width', sheetWidth.toString());
    localStorage.setItem('mdf-sheet-height', sheetHeight.toString());
    localStorage.setItem('mdf-furniture-qty', furnitureQty.toString());
    localStorage.setItem('mdf-furniture-images', JSON.stringify(furnitureImages));
    localStorage.setItem('mdf-competitor-items', JSON.stringify(competitorItems));
    localStorage.setItem('mdf-back-pieces', JSON.stringify(backPieces));
    localStorage.setItem('mdf-back-sheet-width', backSheetWidth.toString());
    localStorage.setItem('mdf-back-sheet-height', backSheetHeight.toString());
    localStorage.setItem('mdf-sales-scenarios', JSON.stringify(salesScenarios));
    localStorage.setItem('mdf-work-days', workDaysPerMonth.toString());
    localStorage.setItem('mdf-tax-rate', taxRate.toString());
    localStorage.setItem('mdf-ml-fee-rate', mlFeeRate.toString());
    localStorage.setItem('mdf-target-net-margin', targetNetMargin.toString());
    localStorage.setItem('mdf-include-fixed-in-markup', includeFixedInMarkup.toString());
    localStorage.setItem('mdf-selected-scenario-id', selectedScenarioId);
    localStorage.setItem('mdf-fixed-expenses', JSON.stringify(fixedExpenses));

    if (currentProjectId) {
      localStorage.setItem('mdf-current-project-id', currentProjectId);
      setSavedProjects(prevList => {
        const index = prevList.findIndex(p => p.id === currentProjectId);
        if (index !== -1) {
          const updatedProj: SavedProject = {
            ...prevList[index],
            name: projectName,
            updatedAt: new Date().toISOString(),
            sheetWidth,
            sheetHeight,
            furnitureQty,
            pieces: [...pieces],
            costs: [...costs],
            furnitureImages: [...furnitureImages],
            competitorItems: [...competitorItems],
            backPieces: [...backPieces],
            backSheetWidth,
            backSheetHeight,
            salesScenarios: [...salesScenarios],
            workDaysPerMonth,
            taxRate,
            mlFeeRate,
            targetNetMargin,
            includeFixedInMarkup,
            selectedScenarioId,
            fixedExpenses: [...fixedExpenses],
            dailySales,
          };
          const newList = [...prevList];
          newList[index] = updatedProj;
          safeSaveProjectsList(newList);
          return newList;
        }
        return prevList;
      });
    }
  }, [projectName, pieces, costs, sheetWidth, sheetHeight, furnitureQty, furnitureImages, competitorItems, backPieces, backSheetWidth, backSheetHeight, salesScenarios, workDaysPerMonth, taxRate, mlFeeRate, targetNetMargin, includeFixedInMarkup, selectedScenarioId, fixedExpenses, dailySales, currentProjectId]);

  // Explicit Save Project to Browser / Supabase Cloud (with Auto-Save support)
  const handleSaveProjectToBrowser = useCallback(async (isAutoSave: boolean = false) => {
    const projId = currentProjectId || `proj-${Date.now()}`;
    const existingProj = savedProjects.find(p => p.id === projId);

    const projectToSave: SavedProject = {
      ...(existingProj || {}),
      id: projId,
      name: projectName || 'Projeto sem nome',
      updatedAt: new Date().toISOString(),
      sheetWidth,
      sheetHeight,
      furnitureQty,
      pieces: [...pieces],
      costs: [...costs],
      furnitureImages: [...furnitureImages],
      competitorItems: [...competitorItems],
      backPieces: [...backPieces],
      backSheetWidth,
      backSheetHeight,
      salesScenarios: [...salesScenarios],
      workDaysPerMonth,
      taxRate,
      mlFeeRate,
      targetNetMargin,
      includeFixedInMarkup,
      selectedScenarioId,
      fixedExpenses: [...fixedExpenses],
      dailySales,
      isFavorite: Boolean(existingProj?.isFavorite),
    };

    setCurrentProjectId(projId);
    localStorage.setItem('mdf-current-project-id', projId);

    const result = await saveProjectToCloud(projectToSave);
    setIsCloudConnected(result.isCloud);

    setSavedProjects(prevList => {
      const exists = prevList.some(p => p.id === projId);
      let updatedList: SavedProject[];
      if (exists) {
        updatedList = prevList.map(p => (p.id === projId ? projectToSave : p));
      } else {
        updatedList = [projectToSave, ...prevList];
      }
      safeSaveProjectsList(updatedList);
      return updatedList;
    });

    if (isAutoSave) {
      setSaveToast(`⏱️ Salvamento automático efetuado! (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
    } else {
      const destinationText = result.isCloud ? 'na nuvem (Supabase)' : 'no navegador';
      setSaveToast(`Projeto "${projectToSave.name}" salvo com sucesso ${destinationText}! (${pieces.length} peças)`);
    }
    setTimeout(() => setSaveToast(null), 3500);
  }, [currentProjectId, savedProjects, projectName, sheetWidth, sheetHeight, furnitureQty, pieces, costs, furnitureImages, competitorItems, backPieces, backSheetWidth, backSheetHeight, salesScenarios, workDaysPerMonth, taxRate, mlFeeRate, targetNetMargin, includeFixedInMarkup, selectedScenarioId, fixedExpenses, dailySales]);

  // Auto-Save Interval Effect (Every 1 Minute / 60,000 ms)
  useEffect(() => {
    const timer = setInterval(() => {
      if (pieces.length > 0 || costs.length > 0 || projectName !== 'Novo Projeto de Marcenaria') {
        handleSaveProjectToBrowser(true);
      }
    }, 60000);

    return () => clearInterval(timer);
  }, [handleSaveProjectToBrowser, pieces.length, costs.length, projectName]);

  // Load Project from Browser Saved List
  const handleLoadProjectFromBrowser = (project: SavedProject) => {
    setCurrentProjectId(project.id);
    setProjectName(project.name || 'Projeto de Marcenaria');
    setPieces(project.pieces ? [...project.pieces] : []);
    setCosts(project.costs ? [...project.costs] : []);
    setSheetWidth(project.sheetWidth || 2750);
    setSheetHeight(project.sheetHeight || 1850);
    setFurnitureQty(project.furnitureQty || 1);
    setFurnitureImages(project.furnitureImages ? [...project.furnitureImages] : []);
    if (project.competitorItems && Array.isArray(project.competitorItems)) {
      setCompetitorItems([...project.competitorItems]);
    } else if (project.referenceLinks && Array.isArray(project.referenceLinks)) {
      setCompetitorItems(project.referenceLinks.map((link, i) => ({ id: `comp-${Date.now()}-${i}`, price: 0, link })));
    } else {
      setCompetitorItems([]);
    }
    setBackPieces(project.backPieces ? [...project.backPieces] : []);
    setBackSheetWidth(project.backSheetWidth || 2750);
    setBackSheetHeight(project.backSheetHeight || 1850);
    setSalesScenarios(project.salesScenarios ? [...project.salesScenarios] : defaultSalesScenarios);
    setWorkDaysPerMonth(project.workDaysPerMonth || 25);
    setTaxRate(project.taxRate !== undefined ? project.taxRate : 8.0);
    setMlFeeRate(project.mlFeeRate !== undefined ? project.mlFeeRate : 30);
    setTargetNetMargin(project.targetNetMargin !== undefined ? project.targetNetMargin : 30);
    setIncludeFixedInMarkup(project.includeFixedInMarkup !== undefined ? project.includeFixedInMarkup : true);
    setSelectedScenarioId(project.selectedScenarioId || 'c2');
    setFixedExpenses(project.fixedExpenses ? [...project.fixedExpenses] : defaultFixedExpenses);
    setDailySales(project.dailySales !== undefined ? project.dailySales : 1);
    setSelectedImageIndex(0);

    localStorage.setItem('mdf-current-project-id', project.id);
    localStorage.setItem('mdf-project-name', project.name || 'Projeto de Marcenaria');
    localStorage.setItem('mdf-pieces', JSON.stringify(project.pieces || []));
    localStorage.setItem('mdf-costs', JSON.stringify(project.costs || []));
    localStorage.setItem('mdf-sheet-width', (project.sheetWidth || 2750).toString());
    localStorage.setItem('mdf-sheet-height', (project.sheetHeight || 1750).toString());
    localStorage.setItem('mdf-furniture-qty', (project.furnitureQty || 1).toString());
    localStorage.setItem('mdf-furniture-images', JSON.stringify(project.furnitureImages || []));
    localStorage.setItem('mdf-competitor-items', JSON.stringify(project.competitorItems || []));
    localStorage.setItem('mdf-back-pieces', JSON.stringify(project.backPieces || []));
    localStorage.setItem('mdf-back-sheet-width', (project.backSheetWidth || 2750).toString());
    localStorage.setItem('mdf-back-sheet-height', (project.backSheetHeight || 1830).toString());
    localStorage.setItem('mdf-sales-scenarios', JSON.stringify(project.salesScenarios || defaultSalesScenarios));

    setSaveToast(`Projeto "${project.name}" carregado! (${(project.pieces || []).length} peças)`);
    setTimeout(() => setSaveToast(null), 3500);
  };

  // Delete Project from List & Supabase Cloud
  const handleDeleteProjectFromBrowser = async (projectId: string) => {
    await deleteProjectFromCloud(projectId);
    setSavedProjects(prevList => {
      const updated = prevList.filter(p => p.id !== projectId);
      safeSaveProjectsList(updated);
      return updated;
    });
    if (currentProjectId === projectId) {
      setCurrentProjectId(null);
      localStorage.removeItem('mdf-current-project-id');
    }
  };

  // Duplicate Project
  const handleDuplicateProject = async (project: SavedProject) => {
    const newProj: SavedProject = {
      ...project,
      id: `proj-${Date.now()}`,
      name: `${project.name} (Cópia)`,
      updatedAt: new Date().toISOString(),
      pieces: project.pieces ? [...project.pieces] : [],
      costs: project.costs ? [...project.costs] : [],
      furnitureImages: project.furnitureImages ? [...project.furnitureImages] : [],
      competitorItems: project.competitorItems ? [...project.competitorItems] : [],
    };
    await saveProjectToCloud(newProj);
    setSavedProjects(prevList => {
      const updated = [newProj, ...prevList];
      safeSaveProjectsList(updated);
      return updated;
    });
    setSaveToast(`Cópia criada: "${newProj.name}"`);
    setTimeout(() => setSaveToast(null), 3000);
  };

  // Toggle Favorite Status for Current Active Project
  const handleToggleCurrentFavorite = async () => {
    const projId = currentProjectId || `proj-${Date.now()}`;
    const existingProj = savedProjects.find(p => p.id === projId);
    const newFavStatus = existingProj ? !existingProj.isFavorite : true;

    const projectToSave: SavedProject = {
      ...(existingProj || {}),
      id: projId,
      name: projectName || 'Projeto de Marcenaria',
      updatedAt: new Date().toISOString(),
      sheetWidth,
      sheetHeight,
      furnitureQty,
      pieces: [...pieces],
      costs: [...costs],
      furnitureImages: [...furnitureImages],
      competitorItems: [...competitorItems],
      backPieces: [...backPieces],
      backSheetWidth,
      backSheetHeight,
      salesScenarios: [...salesScenarios],
      workDaysPerMonth,
      taxRate,
      mlFeeRate,
      targetNetMargin,
      includeFixedInMarkup,
      selectedScenarioId,
      fixedExpenses: [...fixedExpenses],
      isFavorite: newFavStatus,
    };

    setCurrentProjectId(projId);
    localStorage.setItem('mdf-current-project-id', projId);
    await saveProjectToCloud(projectToSave);

    setSavedProjects(prevList => {
      const exists = prevList.some(p => p.id === projId);
      let updatedList: SavedProject[];
      if (exists) {
        updatedList = prevList.map(p => (p.id === projId ? projectToSave : p));
      } else {
        updatedList = [projectToSave, ...prevList];
      }
      safeSaveProjectsList(updatedList);
      return updatedList;
    });

    setSaveToast(
      newFavStatus
        ? `Projeto "${projectToSave.name}" adicionado aos favoritos! ⭐`
        : `Projeto "${projectToSave.name}" removido dos favoritos.`
    );
    setTimeout(() => setSaveToast(null), 3000);
  };

  // Toggle Favorite Status for Any Project by ID
  const handleToggleFavoriteProject = async (projectId: string) => {
    const target = savedProjects.find(p => p.id === projectId);
    if (!target) return;

    const updated: SavedProject = {
      ...target,
      updatedAt: new Date().toISOString(),
      isFavorite: !target.isFavorite,
    };

    await saveProjectToCloud(updated);
    setSavedProjects(prevList => {
      const newList = prevList.map(p => (p.id === projectId ? updated : p));
      safeSaveProjectsList(newList);
      return newList;
    });
  };

  // Add Fixed Expense Item
  const addFixedExpense = () => {
    if (!newFixedExpense.name || !newFixedExpense.value) return;
    const value = parseFloat(newFixedExpense.value.replace(',', '.')) || 0;

    setFixedExpenses([
      ...fixedExpenses,
      {
        id: `fe-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        name: newFixedExpense.name,
        value,
      },
    ]);
    setNewFixedExpense({ name: '', value: '' });
  };

  // New Blank Project
  const handleNewBlankProject = () => {
    const newId = `proj-${Date.now()}`;
    const blankProject: SavedProject = {
      id: newId,
      name: 'Novo Projeto de Marcenaria',
      updatedAt: new Date().toISOString(),
      sheetWidth: 2750,
      sheetHeight: 1850,
      furnitureQty: 1,
      pieces: [],
      costs: [],
      furnitureImages: [],
      competitorItems: [],
      salesScenarios: defaultSalesScenarios,
      workDaysPerMonth: 25,
      taxRate: 8.0,
      mlFeeRate: 30,
      selectedScenarioId: 'c2',
      fixedExpenses: defaultFixedExpenses,
    };

    setCurrentProjectId(newId);
    setProjectName(blankProject.name);
    setPieces([]);
    setCosts([]);
    setFurnitureImages([]);
    setCompetitorItems([]);
    setSelectedImageIndex(0);
    setFurnitureQty(1);
    setSheetWidth(2750);
    setSheetHeight(1850);
    setBackSheetWidth(2750);
    setBackSheetHeight(1850);
    setSalesScenarios(defaultSalesScenarios);
    setWorkDaysPerMonth(25);
    setTaxRate(8.0);
    setMlFeeRate(30);
    setHideFixedExpensesInDre(true);
    setSelectedScenarioId('c1');
    setFixedExpenses(defaultFixedExpenses);

    setSavedProjects(prevList => {
      const updated = [blankProject, ...prevList];
      safeSaveProjectsList(updated);
      return updated;
    });

    localStorage.setItem('mdf-current-project-id', newId);
    setSaveToast('Novo projeto limpo iniciado!');
    setTimeout(() => setSaveToast(null), 3000);
  };

  const [editingPieceId, setEditingPieceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload Reference Photos
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileList = Array.from(files) as Blob[];
      const newImages: string[] = [];
      let loadedCount = 0;
      fileList.forEach((file: Blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            newImages.push(reader.result);
          }
          loadedCount++;
          if (loadedCount === fileList.length) {
            setFurnitureImages(prev => [...prev, ...newImages]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (indexToRemove: number) => {
    requestDeleteConfirm(
      'Excluir Foto de Referência',
      'Tem certeza que deseja excluir esta foto de referência do projeto?',
      () => {
        const updated = furnitureImages.filter((_, idx) => idx !== indexToRemove);
        setFurnitureImages(updated);
        if (selectedImageIndex >= updated.length) {
          setSelectedImageIndex(Math.max(0, updated.length - 1));
        }
      }
    );
  };

  const handleImportPiecesFromAi = (newPieces: Piece[], replaceExisting: boolean) => {
    if (replaceExisting) {
      setPieces(newPieces);
    } else {
      setPieces(prev => [...prev, ...newPieces]);
    }
  };

  const addBackPiece = () => {
    if (!newBackPiece.name || !newBackPiece.height || !newBackPiece.width) return;
    setBackPieces([
      ...backPieces,
      {
        id: Date.now().toString(),
        name: newBackPiece.name,
        height: parseInt(newBackPiece.height) * 10,
        width: parseInt(newBackPiece.width) * 10,
        quantity: parseInt(newBackPiece.quantity) || 1,
      },
    ]);
    setNewBackPiece({ name: '', height: '', width: '', quantity: '1' });
  };

  const handleAutoExtractBackPieces = () => {
    const extracted = pieces.filter(p => /fundo|costa|traseir|back/i.test(p.name));
    if (extracted.length === 0) {
      alert('Nenhuma peça com o nome "Fundo" ou "Costa" foi encontrada no projeto principal.');
      return;
    }
    const converted: Piece[] = extracted.map(p => ({
      id: `back-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      name: p.name,
      height: p.height,
      width: p.width,
      quantity: p.quantity,
    }));
    setBackPieces(prev => [...prev, ...converted]);
    setSaveToast(`${converted.length} peça(s) de fundo importada(s)!`);
    setTimeout(() => setSaveToast(null), 3000);
  };

  // Export Project File (.json file)
  const handleSaveProjectJson = () => {
    const projectData = {
      version: '1.0',
      name: projectName,
      timestamp: new Date().toISOString(),
      sheetWidth,
      sheetHeight,
      furnitureQty,
      pieces,
      costs,
      furnitureImages,
      competitorItems,
      backPieces,
      backSheetWidth,
      backSheetHeight,
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Load Project File (.json file)
  const handleLoadProjectJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.name) setProjectName(data.name);
        if (data.pieces && Array.isArray(data.pieces)) setPieces(data.pieces);
        if (data.costs && Array.isArray(data.costs)) {
          const loadedCosts: CostItem[] = data.costs.map((c: any, i: number) => ({
            id: c.id || `cost-${Date.now()}-${i}`,
            name: c.name || 'Insumo',
            unitPrice: c.unitPrice !== undefined ? c.unitPrice : (c.value || 0),
            quantity: c.quantity !== undefined ? c.quantity : 1,
          }));
          setCosts(loadedCosts);
        }
        if (data.sheetWidth) setSheetWidth(data.sheetWidth);
        if (data.sheetHeight) setSheetHeight(data.sheetHeight);
        if (data.furnitureQty) setFurnitureQty(data.furnitureQty);
        if (data.furnitureImages && Array.isArray(data.furnitureImages)) {
          setFurnitureImages(data.furnitureImages);
          setSelectedImageIndex(0);
        }
        if (data.competitorItems && Array.isArray(data.competitorItems)) {
          setCompetitorItems(data.competitorItems);
        } else if (data.referenceLinks && Array.isArray(data.referenceLinks)) {
          setCompetitorItems(data.referenceLinks.map((link: string, i: number) => ({ id: `comp-${Date.now()}-${i}`, price: 0, link })));
        }
        if (data.backPieces && Array.isArray(data.backPieces)) setBackPieces(data.backPieces);
        if (data.backSheetWidth) setBackSheetWidth(data.backSheetWidth);
        if (data.backSheetHeight) setBackSheetHeight(data.backSheetHeight);
        alert('Projeto carregado com sucesso!');
      } catch (err) {
        alert('Erro ao carregar o arquivo JSON do projeto.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleOpenCalcModal = () => {
    if (packingResult.sheetsUsed > 0) {
      setCalcSheetQty(packingResult.sheetsUsed);
    }
    if (furnitureQty > 0) {
      setCalcFurnitureQty(furnitureQty);
    }
    setIsCalcModalOpen(true);
  };

  const handleApplyCalcToInsumos = () => {
    const totalSheetCost = calcSheetPrice * calcSheetQty;
    const unitMdfCost = calcFurnitureQty > 0 ? totalSheetCost / calcFurnitureQty : 0;
    if (unitMdfCost <= 0) return;

    setCosts(prevCosts => {
      const index = prevCosts.findIndex(c => c.name.toUpperCase().includes('CHAPA MDF') || c.name.toUpperCase().includes('MDF'));
      if (index !== -1) {
        const updated = [...prevCosts];
        updated[index] = {
          ...updated[index],
          unitPrice: parseFloat(unitMdfCost.toFixed(2)),
          quantity: 1,
        };
        return updated;
      } else {
        return [
          {
            id: `cost-${Date.now()}`,
            name: 'CHAPA MDF',
            unitPrice: parseFloat(unitMdfCost.toFixed(2)),
            quantity: 1,
          },
          ...prevCosts,
        ];
      }
    });

    setIsCalcModalOpen(false);
    setSaveToast(`Custo da Chapa MDF (R$ ${formatBRL(unitMdfCost)}) atualizado nos Insumos!`);
    setTimeout(() => setSaveToast(null), 3500);
  };

  useEffect(() => {
    const oversize = pieces.find(p => p.width > sheetWidth || p.height > sheetHeight);
    if (oversize) {
      setError(`Peça "${oversize.name}" excede as dimensões da chapa (${sheetWidth/10}x${sheetHeight/10}cm).`);
    } else {
      setError(null);
    }
  }, [pieces, sheetWidth, sheetHeight]);

  const piecesToPack = pieces.map((p, index) => ({
    ...p,
    quantity: p.quantity * furnitureQty,
    originalId: p.id,
    orderIndex: index + 1
  }));
    
  const packingResult = packPieces(piecesToPack, sheetWidth, sheetHeight);

  // Edge Tape Calculations
  const totalEdgeTapeMetersUnit = pieces.reduce((sum, p) => sum + calculatePieceEdgeTapeMeters(p) * p.quantity, 0);
  const totalEdgeTapeMetersBatch = totalEdgeTapeMetersUnit * furnitureQty;

  const unitCost = costs.reduce((sum, cost) => sum + (cost.unitPrice * cost.quantity), 0);
  const totalCost = unitCost * furnitureQty;

  // Backing Packing Calculation
  const backPiecesToPack = backPieces.map((p, index) => ({
    ...p,
    quantity: p.quantity * furnitureQty,
    originalId: p.id,
    orderIndex: index + 1
  }));
  const backPackingResult = packPieces(backPiecesToPack, backSheetWidth, backSheetHeight);

  // Render Backing CNC Sheet Maps
  useEffect(() => {
    backCanvasRefs.current.forEach((canvas, i) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const scale = 0.2;
      canvas.width = backSheetWidth * scale + 40;
      canvas.height = backSheetHeight * scale + 40;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      for (let x = 0; x <= backSheetWidth; x += 500) {
        ctx.beginPath();
        ctx.moveTo(20 + x * scale, 20);
        ctx.lineTo(20 + x * scale, 20 + backSheetHeight * scale);
        ctx.stroke();
      }
      for (let y = 0; y <= backSheetHeight; y += 500) {
        ctx.beginPath();
        ctx.moveTo(20, 20 + y * scale);
        ctx.lineTo(20 + backSheetWidth * scale, 20 + y * scale);
        ctx.stroke();
      }

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, backSheetWidth * scale, backSheetHeight * scale);

      backPackingResult.placed.filter(p => p.sheet === i + 1).forEach(p => {
        ctx.fillStyle = getColorForPiece(p.name);
        ctx.fillRect(20 + p.x * scale, 20 + p.y * scale, p.width * scale, p.height * scale);
        ctx.strokeStyle = '#0f172a';
        ctx.strokeRect(20 + p.x * scale, 20 + p.y * scale, p.width * scale, p.height * scale);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`${(p as any).orderIndex}`, 20 + p.x * scale + 4, 20 + p.y * scale + 14);
      });
    });
  }, [backPackingResult, backSheetWidth, backSheetHeight]);

  // Helper to generate the jsPDF Document
  const generatePdfDoc = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 15;

    // Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ROUTERLUCRATIVA', 14, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(245, 158, 11);
    doc.text(`PROJETO: ${projectName.toUpperCase()}`, 14, 21);

    doc.setTextColor(203, 213, 225);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 50, 14);
    doc.text(`Lote: ${furnitureQty} móvel(is)`, pageWidth - 50, 21);

    y = 35;

    // Project Info Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y, pageWidth - 28, 16, 2, 2, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMO DO PROJETO:', 18, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.text(`Chapa MDF: ${sheetWidth} x ${sheetHeight} mm (${sheetWidth/10}x${sheetHeight/10} cm)`, 18, y + 11);
    doc.text(`Chapas Necessárias: ${packingResult.sheetsUsed} chapa(s)`, 105, y + 11);
    doc.text(`Qtd. Móveis: ${furnitureQty} un.`, 165, y + 11);

    y += 24;

    // Section 1: Peças e Medidas
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('1. LISTA DE PEÇAS, MEDIDAS E QUANTIDADES POR UNIDADE', 14, y);
    y += 5;

    // Table Header for Pieces
    doc.setFillColor(30, 41, 59);
    doc.rect(14, y, pageWidth - 28, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('Item', 17, y + 4.8);
    doc.text('Nome da Peça', 28, y + 4.8);
    doc.text('Altura (mm / cm)', 76, y + 4.8);
    doc.text('Largura (mm / cm)', 112, y + 4.8);
    doc.text('AB (cm)', 146, y + 4.8);
    doc.text('Qtd Unit.', 164, y + 4.8);
    doc.text('Qtd Lote', 182, y + 4.8);

    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);

    if (pieces.length === 0) {
      doc.text('Nenhuma peça cadastrada no projeto.', 18, y + 5);
      y += 8;
    } else {
      pieces.forEach((p, idx) => {
        if (y > 270) {
          doc.addPage();
          y = 15;
        }
        if (idx % 2 === 1) {
          doc.setFillColor(241, 245, 249);
          doc.rect(14, y, pageWidth - 28, 6, 'F');
        }
        doc.text(`${idx + 1}`, 17, y + 4.2);
        doc.text(p.name, 28, y + 4.2);
        doc.text(`${p.height} mm (${p.height / 10} cm)`, 76, y + 4.2);
        doc.text(`${p.width} mm (${p.width / 10} cm)`, 112, y + 4.2);
        doc.text(p.ab !== undefined ? `${p.ab / 10} cm` : '-', 146, y + 4.2);
        doc.text(`${p.quantity}`, 168, y + 4.2);
        doc.text(`${p.quantity * furnitureQty}`, 184, y + 4.2);
        y += 6;
      });
    }

    y += 6;

    // Section 2: Detalhamento das Peças Produzidas e Balanço de MDF
    if (y > 220) {
      doc.addPage();
      y = 15;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('2. DETALHAMENTO DAS PEÇAS PRODUZIDAS', 14, y);
    y += 5;

    const pieceDetailsMap = packingResult.placed.reduce((acc, p) => {
      const key = `${p.name} (${(p as any).orderIndex})`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const detailEntries = Object.entries(pieceDetailsMap);
    const detailLinesCount = Math.max(1, detailEntries.length);

    const totalPlacedArea = packingResult.placed.reduce((sum, p) => sum + (p.height * p.width), 0);
    const totalSheetArea = sheetWidth * sheetHeight * packingResult.sheetsUsed;
    const yieldPercentage = packingResult.sheetsUsed > 0 ? (totalPlacedArea / totalSheetArea) * 100 : 0;

    const boxHeight = Math.max(38, 12 + detailLinesCount * 5.5);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y, pageWidth - 28, boxHeight, 2, 2, 'FD');

    // Left Side: Peças Produzidas no Lote (cada item em uma linha, tamanho padrão 8.5)
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Peças Produzidas no Lote:', 18, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);

    if (detailEntries.length === 0) {
      doc.text('• Nenhuma peça posicionada.', 18, y + 12);
    } else {
      detailEntries.forEach(([pieceName, count], idx) => {
        doc.text(`• ${pieceName}: ${count}`, 18, y + 12 + idx * 5.5);
      });
    }

    // Right Side: Balanço de MDF & Aproveitamento
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Balanço e Aproveitamento de MDF:', 105, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);

    doc.text(`• Chapas MDF Utilizadas: ${packingResult.sheetsUsed} chapa(s) (${sheetWidth/10}x${sheetHeight/10} cm)`, 105, y + 12);
    doc.text(`• Área Total de MDF: ${(totalSheetArea / 1000000).toFixed(2)} m²`, 105, y + 17.5);
    doc.text(`• Área Útil Ocupada: ${(totalPlacedArea / 1000000).toFixed(2)} m²`, 105, y + 23);
    doc.text(`• Sobra / Retalho Estimado: ${(Math.max(0, totalSheetArea - totalPlacedArea) / 1000000).toFixed(2)} m²`, 105, y + 28.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6);
    doc.text(`• Aproveitamento Médio: ${yieldPercentage.toFixed(1)}%`, 105, y + 34);

    y += boxHeight + 8;

    // Section 3: Simulação CNC - Mapa e Plano de Corte das Chapas
    if (packingResult.sheetsUsed > 0) {
      if (y > 180) {
        doc.addPage();
        y = 15;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('3. SIMULAÇÃO CNC - PLANO DE CORTE DAS CHAPAS PRINCIPAIS', 14, y);
      y += 6;

      for (let i = 0; i < packingResult.sheetsUsed; i++) {
        const canvas = canvasRefs.current[i];
        if (canvas) {
          const sheetImgData = canvas.toDataURL('image/png');
          const sheetPiecesCount = packingResult.placed.filter(p => p.sheet === i + 1).length;

          if (y > 200) {
            doc.addPage();
            y = 15;
          }

          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(217, 119, 6);
          doc.text(`Chapa ${i + 1} de ${packingResult.sheetsUsed} (${sheetPiecesCount} peças posicionadas)`, 18, y);
          y += 4;

          const imgWidth = 140;
          const imgHeight = (canvas.height / canvas.width) * imgWidth;

          doc.setFillColor(6, 9, 19);
          doc.rect(14, y, imgWidth, imgHeight, 'F');
          doc.addImage(sheetImgData, 'PNG', 14, y, imgWidth, imgHeight);

          y += imgHeight + 8;
        }
      }
    }

    // Section 3.1: Simulação CNC - Plano de Corte de FUNDO (MDF 3mm / 6mm)
    if (backPackingResult.sheetsUsed > 0) {
      if (y > 180) {
        doc.addPage();
        y = 15;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('3.1. SIMULAÇÃO CNC - PLANO DE CORTE DE FUNDO (MDF 3mm / 6mm)', 14, y);
      y += 5;

      // Table Header for Back Pieces
      doc.setFillColor(30, 41, 59);
      doc.rect(14, y, pageWidth - 28, 7, 'F');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('Item', 17, y + 4.8);
      doc.text('Peça de Fundo', 28, y + 4.8);
      doc.text('Altura (mm / cm)', 82, y + 4.8);
      doc.text('Largura (mm / cm)', 122, y + 4.8);
      doc.text('Qtd Unit.', 158, y + 4.8);
      doc.text('Qtd Lote', 176, y + 4.8);

      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);

      backPieces.forEach((p, idx) => {
        if (y > 270) {
          doc.addPage();
          y = 15;
        }
        if (idx % 2 === 1) {
          doc.setFillColor(241, 245, 249);
          doc.rect(14, y, pageWidth - 28, 6, 'F');
        }
        doc.text(`${idx + 1}`, 17, y + 4.2);
        doc.text(p.name, 28, y + 4.2);
        doc.text(`${p.height} mm (${p.height / 10} cm)`, 82, y + 4.2);
        doc.text(`${p.width} mm (${p.width / 10} cm)`, 122, y + 4.2);
        doc.text(`${p.quantity}`, 162, y + 4.2);
        doc.text(`${p.quantity * furnitureQty}`, 180, y + 4.2);
        y += 6;
      });

      y += 4;

      // Backing Sheets Diagrams
      for (let i = 0; i < backPackingResult.sheetsUsed; i++) {
        const canvas = backCanvasRefs.current[i];
        if (canvas) {
          const sheetImgData = canvas.toDataURL('image/png');
          const sheetPiecesCount = backPackingResult.placed.filter(p => p.sheet === i + 1).length;

          if (y > 200) {
            doc.addPage();
            y = 15;
          }

          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(16, 185, 129);
          doc.text(`Chapa de Fundo ${i + 1} de ${backPackingResult.sheetsUsed} (${sheetPiecesCount} peças de fundo)`, 18, y);
          y += 4;

          const imgWidth = 140;
          const imgHeight = (canvas.height / canvas.width) * imgWidth;

          doc.setFillColor(6, 9, 19);
          doc.rect(14, y, imgWidth, imgHeight, 'F');
          doc.addImage(sheetImgData, 'PNG', 14, y, imgWidth, imgHeight);

          y += imgHeight + 8;
        }
      }
    }

    // Section 4: Custos de Produção
    if (y > 230) {
      doc.addPage();
      y = 15;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('4. CUSTOS DE PRODUÇÃO E INSUMOS', 14, y);
    y += 5;

    // Table Header for Costs
    doc.setFillColor(30, 41, 59);
    doc.rect(14, y, pageWidth - 28, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('Item', 17, y + 4.8);
    doc.text('Produto / Insumo', 28, y + 4.8);
    doc.text('Valor Unitário (R$)', 130, y + 4.8, { align: 'right' });
    doc.text('Quantidade', 152, y + 4.8, { align: 'center' });
    doc.text('Valor Total (R$)', 192, y + 4.8, { align: 'right' });

    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);

    if (costs.length === 0) {
      doc.text('Nenhum custo cadastrado no projeto.', 18, y + 5);
      y += 8;
    } else {
      costs.forEach((c, idx) => {
        if (y > 270) {
          doc.addPage();
          y = 15;
        }
        if (idx % 2 === 1) {
          doc.setFillColor(241, 245, 249);
          doc.rect(14, y, pageWidth - 28, 6, 'F');
        }
        doc.text(`${idx + 1}`, 17, y + 4.2);
        doc.text(c.name, 28, y + 4.2);
        doc.text(`R$ ${c.unitPrice.toFixed(2)}`, 130, y + 4.2, { align: 'right' });
        doc.text(`${c.quantity}`, 152, y + 4.2, { align: 'center' });
        doc.text(`R$ ${(c.unitPrice * c.quantity).toFixed(2)}`, 192, y + 4.2, { align: 'right' });
        y += 6;
      });
    }

    y += 4;

    // CUSTO UNITÁRIO E DIRETO DO LOTE HIGHLIGHT BOX
    if (y > 255) {
      doc.addPage();
      y = 15;
    }

    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, pageWidth - 28, 14, 'F');

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`CUSTO UNITÁRIO POR MÓVEL (1 UNID):`, 18, y + 6);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text(`Custo Direto de Produção do Lote (${furnitureQty} ${furnitureQty === 1 ? 'móvel' : 'móveis'}): R$ ${totalCost.toFixed(2)}`, 18, y + 11);

    doc.setTextColor(245, 158, 11);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${unitCost.toFixed(2)}`, pageWidth - 48, y + 8);

    y += 18;

    // Section 4.1: Cenários de Venda e Análise de Lucratividade
    if (y > 220) {
      doc.addPage();
      y = 15;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('4.1. CENÁRIOS DE VENDA E ANÁLISE DE LUCRATIVIDADE', 14, y);
    y += 5;

    // Table Header for Sales Scenarios
    doc.setFillColor(30, 41, 59);
    doc.rect(14, y, pageWidth - 28, 7, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Cenário de Venda', 17, y + 4.8);
    doc.text('Venda Unit. (R$)', 80, y + 4.8, { align: 'right' });
    doc.text('Faturamento Lote (R$)', 122, y + 4.8, { align: 'right' });
    doc.text('Lucro / Móvel (R$)', 158, y + 4.8, { align: 'right' });
    doc.text('Lucro Total (R$)', 192, y + 4.8, { align: 'right' });

    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);

    salesScenarios.forEach((sc, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 15;
      }
      if (idx % 2 === 1) {
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y, pageWidth - 28, 6.5, 'F');
      }

      const totalRevenue = sc.unitPrice * furnitureQty;
      const unitProfit = sc.unitPrice - unitCost;
      const totalProfit = totalRevenue - totalCost;

      doc.setFontSize(8);
      doc.text(sc.name, 17, y + 4.5);
      doc.text(`R$ ${sc.unitPrice.toFixed(2)}`, 80, y + 4.5, { align: 'right' });
      doc.text(`R$ ${totalRevenue.toFixed(2)}`, 122, y + 4.5, { align: 'right' });

      if (unitProfit >= 0) {
        doc.setTextColor(22, 101, 52); // emerald-800
      } else {
        doc.setTextColor(153, 27, 27); // red-800
      }
      doc.text(`R$ ${unitProfit.toFixed(2)}`, 158, y + 4.5, { align: 'right' });
      doc.text(`R$ ${totalProfit.toFixed(2)}`, 192, y + 4.5, { align: 'right' });

      doc.setTextColor(30, 41, 59);
      y += 6.5;
    });

    y += 10;

    // Section 4.2: Projeção Mensal & DRE da Marcenaria
    if (y > 200) {
      doc.addPage();
      y = 15;
    }

    const activeScenario = salesScenarios.find(s => s.id === selectedScenarioId) || salesScenarios[0] || { unitPrice: 0, name: 'Cenário 1' };
    const monthlyProductionCount = furnitureQty * workDaysPerMonth;
    const monthlyGrossRevenue = activeScenario.unitPrice * monthlyProductionCount;
    const monthlyDirectCost = unitCost * monthlyProductionCount;
    const monthlyGrossProfit = monthlyGrossRevenue - monthlyDirectCost;
    const isMlScenarioPdf = selectedScenarioId === 'c2' || salesScenarios.findIndex(s => s.id === selectedScenarioId) === 1;
    const monthlyMlFeeAmount = isMlScenarioPdf ? monthlyGrossRevenue * (mlFeeRate / 100) : 0;
    const monthlyTaxAmount = monthlyGrossRevenue * (taxRate / 100);
    const rawFixedExpensesTotalPdf = fixedExpenses.reduce((sum, item) => sum + item.value, 0);
    const monthlyFixedExpensesTotal = hideFixedExpensesInDre ? 0 : rawFixedExpensesTotalPdf;
    const monthlyNetProfit = monthlyGrossRevenue - monthlyDirectCost - monthlyMlFeeAmount - monthlyTaxAmount - monthlyFixedExpensesTotal;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('4.2. PROJEÇÃO MENSAL E DEMONSTRAÇÃO DE RESULTADO (DRE)', 14, y);
    y += 5;

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Projeção baseada em ${workDaysPerMonth} dias úteis no mês | ${furnitureQty} móveis/dia (${monthlyProductionCount} móveis/mês) | ${activeScenario.name}`, 14, y);
    y += 6;

    // Fixed Expenses Table in PDF
    if (fixedExpenses.length > 0) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Despesas Fixas Mensais da Oficina:', 14, y);
      y += 4;

      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, pageWidth - 28, 5, 'F');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Descrição da Despesa', 17, y + 3.6);
      doc.text('Valor Mensal (R$)', 192, y + 3.6, { align: 'right' });
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      fixedExpenses.forEach(fe => {
        if (y > 270) {
          doc.addPage();
          y = 15;
        }
        doc.text(fe.name, 17, y + 4);
        doc.text(`R$ ${fe.value.toFixed(2)}`, 192, y + 4, { align: 'right' });
        y += 5;
      });
      y += 2;
    }

    // DRE Executive Summary Box in PDF
    if (y > 210) {
      doc.addPage();
      y = 15;
    }

    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, pageWidth - 28, 43, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 158, 11);
    doc.text('RESUMO DRE MENSAL:', 18, y + 6);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 255, 255);
    doc.text(`(+) Faturamento Bruto Mensal (${monthlyProductionCount} móveis):`, 18, y + 12);
    doc.text(`R$ ${formatBRL(monthlyGrossRevenue)}`, 190, y + 12, { align: 'right' });

    doc.text('(-) Custo Direto de Produção Mensal:', 18, y + 17);
    doc.text(`R$ ${formatBRL(monthlyDirectCost)}`, 190, y + 17, { align: 'right' });

    doc.text(`(-) Taxas Mercado Livre (${isMlScenarioPdf ? mlFeeRate.toFixed(1) : '0.0'}%):`, 18, y + 22);
    doc.text(`R$ ${formatBRL(monthlyMlFeeAmount)}`, 190, y + 22, { align: 'right' });

    doc.text(`(-) Imposto sobre Vendas (${taxRate}%):`, 18, y + 27);
    doc.text(`R$ ${formatBRL(monthlyTaxAmount)}`, 190, y + 27, { align: 'right' });

    doc.text('(-) Total de Despesas Fixas Mensais:', 18, y + 32);
    doc.text(`R$ ${formatBRL(monthlyFixedExpensesTotal)}`, 190, y + 32, { align: 'right' });

    doc.setDrawColor(245, 158, 11);
    doc.line(18, y + 35, 192, y + 35);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    if (monthlyNetProfit >= 0) {
      doc.setTextColor(74, 222, 128); // green
      doc.text(`LUCRO LÍQUIDO MENSAL FINAL: R$ ${formatBRL(monthlyNetProfit)}`, 18, y + 40);
    } else {
      doc.setTextColor(248, 113, 113); // red
      doc.text(`RESULTADO MENSAL (PREJUÍZO): R$ ${formatBRL(monthlyNetProfit)}`, 18, y + 40);
    }

    return doc;
  };

  // View PDF in Browser Tab
  const handleViewPDF = () => {
    try {
      const doc = generatePdfDoc();
      const pdfBlobUrl = doc.output('bloburl');
      window.open(pdfBlobUrl, '_blank');
    } catch (err) {
      console.error('Erro ao visualizar PDF:', err);
      alert('Erro ao visualizar o relatório PDF.');
    }
  };

  // Download PDF File to Computer
  const handleDownloadPDF = () => {
    try {
      const doc = generatePdfDoc();
      doc.save(`${projectName.toLowerCase().replace(/\s+/g, '-')}-${furnitureQty}moveis.pdf`);
    } catch (err) {
      console.error('Erro ao baixar PDF:', err);
      alert('Erro ao baixar o relatório em PDF.');
    }
  };

  // Render CNC Sheet Maps
  useEffect(() => {
    canvasRefs.current.forEach((canvas, i) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const scale = 0.2;
      canvas.width = sheetWidth * scale + 40;
      canvas.height = sheetHeight * scale + 40;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Grid Rulers
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      for (let x = 0; x <= sheetWidth; x += 500) {
        ctx.beginPath();
        ctx.moveTo(20 + x * scale, 20);
        ctx.lineTo(20 + x * scale, 20 + sheetHeight * scale);
        ctx.stroke();
      }
      for (let y = 0; y <= sheetHeight; y += 500) {
        ctx.beginPath();
        ctx.moveTo(20, 20 + y * scale);
        ctx.lineTo(20 + sheetWidth * scale, 20 + y * scale);
        ctx.stroke();
      }

      // Sheet boundary
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, sheetWidth * scale, sheetHeight * scale);

      packingResult.placed.filter(p => p.sheet === i + 1).forEach((p) => {
        ctx.fillStyle = getColorForPiece(p.name);
        ctx.fillRect(20 + p.x * scale, 20 + p.y * scale, p.width * scale, p.height * scale);
        ctx.strokeStyle = '#0f172a';
        ctx.strokeRect(20 + p.x * scale, 20 + p.y * scale, p.width * scale, p.height * scale);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`${(p as any).orderIndex}`, 20 + p.x * scale + 4, 20 + p.y * scale + 14);
      });
    });
  }, [packingResult, sheetWidth, sheetHeight]);

  const addPiece = () => {
    if (!newPiece.name || !newPiece.height || !newPiece.width) return;
    const heightVal = parseInt(newPiece.height) * 10;
    const widthVal = parseInt(newPiece.width) * 10;
    const quantityVal = parseInt(newPiece.quantity) || 1;
    const abParsed = newPiece.ab ? parseFloat(newPiece.ab.replace(',', '.')) * 10 : undefined;
    const abVal = isNaN(abParsed as number) ? undefined : abParsed;

    if (editingPieceId) {
      setPieces(pieces.map(p => p.id === editingPieceId ? {
        id: editingPieceId,
        name: newPiece.name,
        height: heightVal,
        width: widthVal,
        quantity: quantityVal,
        ab: abVal,
        edgeTape: newPieceEdgeTape,
      } : p));
      setEditingPieceId(null);
    } else {
      setPieces([...pieces, { 
        id: Date.now().toString(),
        name: newPiece.name, 
        height: heightVal, 
        width: widthVal, 
        quantity: quantityVal,
        ab: abVal,
        edgeTape: newPieceEdgeTape,
      }]);
    }
    setNewPiece({ name: '', height: '', width: '', quantity: '1', ab: '' });
    setNewPieceEdgeTape('none');
  };

  // Add Cost Item
  const addCost = () => {
    if (!newCost.name || !newCost.unitPrice) return;
    const unitPrice = parseFloat(newCost.unitPrice.replace(',', '.')) || 0;
    const quantity = Math.max(1, parseInt(newCost.quantity) || 1);

    setCosts([
      ...costs,
      {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
        name: newCost.name,
        unitPrice,
        quantity,
      },
    ]);
    setNewCost({ name: '', unitPrice: '', quantity: '1' });
  };

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-slate-300 p-6 font-sans">
      {/* Toast Notification */}
      {saveToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-950 border border-emerald-600 text-emerald-300 px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* App Header */}
      <header className="mb-8 border-b border-slate-800 pb-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Logo & Project Name Input */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-slate-100 tracking-tight">ROUTER<span className="text-amber-500">LUCRATIVA</span></h1>
            
            {/* Editable Project Name & Favorite Star */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2.5 py-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Projeto:</span>
              <input
                type="text"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="Nome do Projeto"
                className="bg-transparent text-amber-400 font-bold text-xs focus:outline-none w-44 md:w-52"
              />
              <button
                onClick={handleToggleCurrentFavorite}
                className="p-1 rounded hover:bg-slate-900 transition-colors"
                title={
                  (savedProjects.find(p => p.id === currentProjectId)?.isFavorite)
                    ? 'Remover este projeto dos favoritos'
                    : 'Marcar este projeto como favorito'
                }
              >
                <Star
                  className={`w-4 h-4 transition-all ${
                    savedProjects.find(p => p.id === currentProjectId)?.isFavorite
                      ? 'fill-amber-400 text-amber-400 scale-110'
                      : 'text-slate-600 hover:text-amber-400'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            {/* Project Management Actions in Order: 1. Salvar (Verde), 2. Meus Projetos, 3. Resumo Gerencial */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 1º: BOTÃO SALVAR (EM VERDE DESTAQUE) */}
              <button
                onClick={() => handleSaveProjectToBrowser(false)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-emerald-950/40 border border-emerald-400/60 cursor-pointer"
                title="Salvar este projeto no banco de dados Supabase (Auto-salvamento a cada 1 minuto ativado)"
              >
                <Save size={15} className="text-slate-950" />
                <span>Salvar</span>
              </button>

              {/* 2º: MEUS PROJETOS */}
              <button
                onClick={() => setIsProjectsModalOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 border border-amber-500/50 text-amber-400 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm cursor-pointer"
                title="Abrir gerenciador de múltiplos projetos salvos no navegador"
              >
                <FolderKanban size={14} />
                <span>Meus Projetos ({savedProjects.length})</span>
              </button>

              {/* 3º: RESUMO GERENCIAL */}
              <button
                onClick={() => setIsExecutiveSummaryOpen(true)}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-amber-500/20 cursor-pointer"
                title="Abrir o Resumo Gerencial, Comparativo de Móveis e DRE Consolidada"
              >
                <BarChart3 size={15} />
                <span>Resumo Gerencial</span>
                {savedProjects.filter(p => p.isFavorite).length > 0 && (
                  <span className="bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold">
                    {savedProjects.filter(p => p.isFavorite).length} ⭐
                  </span>
                )}
              </button>

              {/* 4º: BIBLIOTECA MERCADO LIVRE (VENDAS) */}
              <button
                onClick={() => setIsMlLibraryOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 border border-yellow-500/60 text-yellow-400 px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm cursor-pointer"
                title="Abrir a Biblioteca de Produtos e Anúncios do Mercado Livre (Vendas)"
              >
                <ShoppingBag size={15} className="text-yellow-400" />
                <span>📚 Biblioteca Vendas</span>
              </button>

              {/* 5º: BIBLIOTECA DE COMPRAS */}
              <button
                onClick={() => setIsPurchaseLibraryOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 border border-emerald-500/60 text-emerald-400 px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm cursor-pointer"
                title="Abrir a Biblioteca de Produtos e Materiais para Compra"
              >
                <ShoppingCart size={15} className="text-emerald-400" />
                <span>🛒 Produtos p/ Compra</span>
              </button>


              {/* Visualizar PDF (relatório) */}
              <button
                onClick={handleViewPDF}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="Visualizar o relatório PDF em uma nova aba do navegador"
              >
                <Eye size={14} />
                <span>Visualizar PDF</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Projects Manager Modal */}
      <ProjectsModal
        isOpen={isProjectsModalOpen}
        onClose={() => setIsProjectsModalOpen(false)}
        savedProjects={savedProjects}
        currentProjectId={currentProjectId}
        isCloudConnected={isCloudConnected}
        onLoadProject={handleLoadProjectFromBrowser}
        onDeleteProject={handleDeleteProjectFromBrowser}
        onDuplicateProject={handleDuplicateProject}
        onNewBlankProject={handleNewBlankProject}
        onToggleFavoriteProject={handleToggleFavoriteProject}
      />

      {/* Executive Management Summary & DRE Modal */}
      <ExecutiveSummaryModal
        isOpen={isExecutiveSummaryOpen}
        onClose={() => setIsExecutiveSummaryOpen(false)}
        savedProjects={savedProjects}
        onLoadProject={handleLoadProjectFromBrowser}
        onToggleFavoriteProject={handleToggleFavoriteProject}
      />

      {/* Mercado Livre Products Library Modal (Vendas) */}
      <MercadoLivreLibraryModal
        isOpen={isMlLibraryOpen}
        onClose={() => setIsMlLibraryOpen(false)}
        onImportToProject={handleImportMlProductToProject}
      />

      {/* Purchase Products Library Modal (Compras) */}
      <PurchaseLibraryModal
        isOpen={isPurchaseLibraryOpen}
        onClose={() => setIsPurchaseLibraryOpen(false)}
        onImportToProject={handleImportPurchaseProductToProject}
      />


      {/* Main Furniture Project Section */}
      <section className="bg-slate-900 border border-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 uppercase tracking-widest text-xs">Projeto do Móvel</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col items-center justify-between gap-3 border border-slate-800 bg-slate-950 p-4 rounded-lg">
            <div className="w-full flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Fotos de Referência ({furnitureImages.length})
              </span>
              <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-400 py-1 px-2.5 rounded text-xs flex items-center gap-1 font-semibold transition-all active:scale-95">
                <Plus size={14} />
                <span>Adicionar Foto</span>
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            {furnitureImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-6 border-2 border-dashed border-slate-800 rounded-lg w-full">
                <p className="text-slate-400 text-xs mb-3">Nenhuma foto de referência adicionada.</p>
                <label className="cursor-pointer bg-amber-500 hover:bg-amber-400 text-black py-2 px-4 rounded text-xs font-bold transition-all">
                  <span>Enviar Foto de Referência</span>
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                </label>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                {/* Selected Image */}
                <div className="relative w-full max-w-sm rounded-lg overflow-hidden border border-slate-800 bg-slate-900 shadow-md">
                  <img
                    src={furnitureImages[selectedImageIndex] || furnitureImages[0]}
                    alt={`Referência ${selectedImageIndex + 1}`}
                    className="w-full h-64 object-contain rounded-lg"
                  />
                  <button
                    onClick={() => removeImage(selectedImageIndex)}
                    className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-600 text-white rounded-full p-1.5 shadow-md transition-all active:scale-90"
                    title="Excluir esta foto"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Thumbnails Row */}
                {furnitureImages.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto w-full py-1 justify-center">
                    {furnitureImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImageIndex(idx)}
                        className={`relative rounded border-2 overflow-hidden w-12 h-12 flex-shrink-0 transition-all ${
                          selectedImageIndex === idx
                            ? 'border-amber-500 scale-105 shadow-md'
                            : 'border-slate-800 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={img} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {/* AI Analysis Trigger Button */}
                <button
                  onClick={() => setIsAiModalOpen(true)}
                  className="w-full mt-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-black animate-pulse" />
                  <span>✨ Analisar Foto com IA (Extrair Peças)</span>
                </button>
              </div>
            )}
          </div>
          <FurniturePreview
            pieces={pieces}
            onCaptureCanvas={(fn) => {
              get3dImageRef.current = fn;
            }}
          />
        </div>

        {/* AI Piece Extractor Modal */}
        {furnitureImages.length > 0 && (
          <AiPieceExtractorModal
            isOpen={isAiModalOpen}
            onClose={() => setIsAiModalOpen(false)}
            imageSrc={furnitureImages[selectedImageIndex] || furnitureImages[0]}
            onImportPieces={handleImportPiecesFromAi}
          />
        )}
      </section>

      {/* Main CNC Section Grid: Left (Pieces & Config) vs Right (CNC Simulation & Yield) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 mb-8">
        {/* LEFT COLUMN: Lista de Peças, Lote & Detalhamento */}
        <div className="xl:col-span-5 space-y-6">
          {/* 1. Pieces List Section */}
          <section className="bg-slate-900 border border-slate-800 p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold text-amber-400 uppercase tracking-widest">Lista de Peças ({pieces.length})</h2>
              <button onClick={() => setPieces([])} className="text-slate-500 hover:text-red-400 text-xs flex items-center gap-1 cursor-pointer">
                <Trash2 size={13} /> Limpar Peças
              </button>
            </div>
            
            <div className="flex gap-2 mb-4 items-center flex-wrap sm:flex-nowrap">
              <input list="piece-suggestions" placeholder="Nome da peça" value={newPiece.name} onChange={e => setNewPiece({...newPiece, name: e.target.value})} className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs flex-1 min-w-[130px]"/>
              <datalist id="piece-suggestions">
                {Array.isArray(suggestions) && suggestions.map(s => <option key={s} value={s} />)}
              </datalist>
              <input placeholder="Alt(cm)" value={newPiece.height} onChange={e => setNewPiece({...newPiece, height: e.target.value})} className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs text-center w-14"/>
              <input placeholder="Larg(cm)" value={newPiece.width} onChange={e => setNewPiece({...newPiece, width: e.target.value})} className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs text-center w-14"/>
              <input placeholder="AB(cm)" value={newPiece.ab} onChange={e => setNewPiece({...newPiece, ab: e.target.value})} className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs text-center w-14" title="Altura a partir da Base em cm (opcional)"/>
              <input placeholder="Qtd" value={newPiece.quantity} onChange={e => setNewPiece({...newPiece, quantity: e.target.value})} className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs text-center w-12"/>
              <button onClick={addPiece} className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-2.5 rounded font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer">
                {editingPieceId ? 'OK' : <><Plus size={16}/><span>Add</span></>}
              </button>
            </div>

            <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {pieces.map(p => (
                <li key={p.id} className="flex flex-row gap-1.5 items-center bg-slate-950 p-2 rounded border border-slate-800 text-xs">
                  <input value={p.name} onChange={e => setPieces(pieces.map(x => x.id === p.id ? {...x, name: e.target.value} : x))} className="bg-transparent border-none text-slate-200 w-full focus:outline-none focus:bg-slate-900 rounded px-1" />
                  <input type="number" value={p.height/10} onChange={e => setPieces(pieces.map(x => x.id === p.id ? {...x, height: parseFloat(e.target.value)*10} : x))} className="bg-transparent border-none text-slate-200 w-12 text-center focus:outline-none focus:bg-slate-900 rounded px-0.5" title="Altura (cm)" />
                  <input type="number" value={p.width/10} onChange={e => setPieces(pieces.map(x => x.id === p.id ? {...x, width: parseFloat(e.target.value)*10} : x))} className="bg-transparent border-none text-slate-200 w-12 text-center focus:outline-none focus:bg-slate-900 rounded px-0.5" title="Largura (cm)" />
                  <input 
                    type="text" 
                    value={p.ab !== undefined ? (p.ab / 10).toString().replace('.', ',') : ''} 
                    placeholder="AB"
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        setPieces(pieces.map(x => x.id === p.id ? {...x, ab: undefined} : x));
                      } else {
                        const parsed = parseFloat(val.replace(',', '.'));
                        setPieces(pieces.map(x => x.id === p.id ? {...x, ab: isNaN(parsed) ? undefined : parsed * 10} : x));
                      }
                    }} 
                    className="bg-transparent border-none text-amber-400 font-semibold w-12 text-center focus:outline-none focus:bg-slate-900 rounded px-0.5" 
                    title="Altura a partir da Base (cm)"
                  />
                  <input type="number" value={p.quantity} onChange={e => setPieces(pieces.map(x => x.id === p.id ? {...x, quantity: parseInt(e.target.value)} : x))} className="bg-transparent border-none text-slate-200 w-9 text-center focus:outline-none focus:bg-slate-900 rounded px-0.5" title="Quantidade" />
                  <Trash2 size={15} className="cursor-pointer text-slate-500 hover:text-red-500 transition-colors flex-shrink-0" onClick={() => setPieces(pieces.filter(x => x.id !== p.id))}/>
                </li>
              ))}
            </ul>
          </section>

          {/* 2. Batch & Sheet Config Banner */}
          <section className="bg-slate-900 border border-amber-500/40 p-5 rounded-lg shadow-lg space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Layers className="w-5 h-5 text-amber-500" />
                <span className="text-base text-amber-400 font-bold uppercase tracking-wider">
                  Qtd. de Móveis a Produzir no Lote:
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-2 rounded-lg justify-between flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setFurnitureQty(Math.max(1, furnitureQty - 1))}
                    className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-amber-500 font-bold w-8 h-8 rounded flex items-center justify-center text-sm transition-all"
                    title="Diminuir"
                  >
                    -
                  </button>
                  <input 
                    type="number" 
                    min="1"
                    value={furnitureQty} 
                    onChange={e => setFurnitureQty(Math.max(1, parseInt(e.target.value) || 1))} 
                    className="bg-slate-900 border border-slate-700 text-amber-400 font-bold h-8 rounded w-14 text-center text-sm font-mono focus:outline-none focus:border-amber-500"
                  />
                  <button 
                    onClick={() => setFurnitureQty(furnitureQty + 1)}
                    className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-amber-500 font-bold w-8 h-8 rounded flex items-center justify-center text-sm transition-all"
                    title="Aumentar"
                  >
                    +
                  </button>
                </div>

                <div className="flex gap-1">
                  {[1, 2, 3, 5, 10, 20].map(qty => (
                    <button
                      key={qty}
                      onClick={() => setFurnitureQty(qty)}
                      className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                        furnitureQty === qty 
                          ? 'bg-amber-500 text-black shadow-md scale-105' 
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {qty}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sheet Dimensions Input */}
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-lg">
              <span className="text-slate-400 uppercase tracking-widest text-xs font-semibold">Chapa MDF (mm):</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={sheetWidth}
                  onChange={e => setSheetWidth(parseInt(e.target.value) || 0)}
                  className="bg-slate-900 border border-slate-800 p-1.5 rounded w-20 text-slate-200 text-xs text-center font-mono focus:outline-none focus:border-amber-500"
                />
                <span className="text-slate-500 font-bold">x</span>
                <input
                  type="number"
                  value={sheetHeight}
                  onChange={e => setSheetHeight(parseInt(e.target.value) || 0)}
                  className="bg-slate-900 border border-slate-800 p-1.5 rounded w-20 text-slate-200 text-xs text-center font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Total de Chapas Display */}
            <div className="flex items-center justify-center gap-3 bg-slate-950 border border-amber-500/30 px-3.5 py-2.5 rounded-lg">
              <span className="text-slate-300 uppercase tracking-widest text-sm font-bold">Total de Chapas:</span>
              <span className="text-amber-400 font-extrabold text-base font-mono bg-slate-900 border border-amber-500/40 px-3 py-1 rounded">
                {packingResult.sheetsUsed} {packingResult.sheetsUsed === 1 ? 'chapa' : 'chapas'}
              </span>
            </div>
          </section>

          {/* 3. Detalhamento das Peças Produzidas (Positioned below Lista de Peças) */}
          <section className="bg-slate-900 border border-slate-800 p-5 rounded-lg shadow-lg">
            <h3 className="font-semibold text-slate-100 mb-3 text-sm border-b border-slate-800 pb-2">
              Detalhamento das Peças Produzidas:
            </h3>

            {/* Cabeçalho da Tabela: PEÇAS vs QTDADES */}
            <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-950 px-3 py-1.5 rounded border border-slate-850 mb-2">
              <span>PEÇAS</span>
              <span>QTDADES</span>
            </div>

            <div className="space-y-1.5">
              {Object.entries(packingResult.placed.reduce((acc, p) => {
                const key = `${p.name} (${(p as any).orderIndex})`;
                acc[key] = (acc[key] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)).map(([key, count]) => (
                <div key={key} className="bg-slate-950 border border-slate-800 px-3 py-2 rounded flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{key}</span>
                  <span className="text-amber-400 font-bold font-mono bg-slate-900 border border-slate-700 px-2.5 py-0.5 rounded">
                    {count}
                  </span>
                </div>
              ))}
              {packingResult.placed.length === 0 && <p className="text-slate-500 text-xs italic py-2 text-center">Nenhuma peça posicionada no lote.</p>}
            </div>
          </section>

          {/* 4. Balanço de Área e Aproveitamento (Positioned below Detalhamento das Peças) */}
          {(() => {
            const totalPlacedArea = packingResult.placed.reduce((sum, p) => sum + (p.height * p.width), 0);
            const totalSheetArea = sheetWidth * sheetHeight * packingResult.sheetsUsed;
            const yieldPercentage = packingResult.sheetsUsed > 0 ? (totalPlacedArea / totalSheetArea) * 100 : 0;

            return (
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-lg shadow-lg space-y-3 text-xs">
                <h3 className="font-semibold text-slate-100 border-b border-slate-800 pb-2 text-sm">Balanço de Área e Aproveitamento:</h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-slate-300">
                    <span>Área por Chapa ({sheetWidth/10}x{sheetHeight/10}cm):</span>
                    <span className="font-mono">{((sheetWidth * sheetHeight) / 1000000).toFixed(2)} m²</span>
                  </div>
                  <div className="flex justify-between text-slate-300 font-semibold">
                    <span>Área Total de MDF ({packingResult.sheetsUsed} chapa{packingResult.sheetsUsed !== 1 ? 's' : ''}):</span>
                    <span className="font-mono text-slate-100">{(totalSheetArea / 1000000).toFixed(2)} m²</span>
                  </div>
                  <div className="flex justify-between text-emerald-400">
                    <span>Área Útil Ocupada pelas Peças:</span>
                    <span className="font-mono font-bold">{(totalPlacedArea / 1000000).toFixed(2)} m²</span>
                  </div>
                  <div className="flex justify-between text-amber-500">
                    <span>Área de Sobra / Retalho Estimada:</span>
                    <span className="font-mono font-bold">
                      {(Math.max(0, totalSheetArea - totalPlacedArea) / 1000000).toFixed(2)} m²
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-bold">
                    <span className="text-slate-200">Aproveitamento Médio:</span>
                    <span className={`font-mono text-base ${yieldPercentage < 60 ? 'text-amber-500' : 'text-emerald-400'}`}>
                      {packingResult.sheetsUsed > 0 ? yieldPercentage.toFixed(1) : '0.0'}%
                    </span>
                  </div>
                </div>

                {packingResult.sheetsUsed > 0 && yieldPercentage < 60 && (
                  <div className="bg-amber-950/40 border border-amber-600/50 text-amber-200 p-3 rounded-md text-xs flex items-start gap-2.5 mt-2">
                    <Lightbulb size={18} className="text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-300">Dica de Otimização (Aproveitamento &lt; 60%):</p>
                      <p className="mt-1 text-amber-200/90 leading-relaxed">
                        O aproveitamento da chapa é de apenas <strong>{yieldPercentage.toFixed(1)}%</strong>. Para reduzir o desperdício de material, experimente <strong>rotacionar manualmente as peças</strong> ou <strong>ajustar o tamanho da chapa de MDF</strong> / quantidade de móveis produzidos.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* RIGHT COLUMN: Simulação CNC - Plano de Corte */}
        <div className="xl:col-span-7">
          <section ref={simulationRef} className="bg-slate-900 border border-slate-800 p-6 rounded-lg shadow-lg">
            <div className='flex justify-between items-center mb-4 pb-3 border-b border-slate-800'>
              <div>
                <h2 className="text-lg font-semibold text-slate-100 uppercase tracking-widest text-xs">Simulação CNC - Plano de Corte</h2>
                <p className="text-lg text-amber-500 font-medium mt-0.5">Lote: <span className="font-bold text-slate-100">{furnitureQty} móvel(is)</span></p>
              </div>
              <div className='flex items-center gap-2 flex-wrap'>
                <button
                  onClick={handleViewPDF}
                  className='bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/50 px-3 py-1.5 rounded flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer'
                  title="Visualizar o relatório PDF em uma nova aba do navegador"
                >
                  <Eye size={14}/> Visualizar PDF
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className='bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer'
                  title="Baixar o arquivo PDF para o computador"
                >
                  <Download size={14}/> Baixar PDF
                </button>
              </div>
            </div>

            {error && <div className="bg-red-900/20 border border-red-800 text-red-400 p-3 rounded mb-4 text-sm">{error}</div>}

            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-950 p-3 rounded border border-slate-800 text-sm">
                <span className="text-slate-400">Chapas MDF Necessárias:</span>
                <span className="text-amber-500 font-bold text-base">{packingResult.sheetsUsed} chapa(s)</span>
              </div>

              {packingResult.sheetsUsed === 0 ? (
                <div className="bg-slate-950 border border-slate-800 rounded p-8 text-center text-slate-500 text-sm">
                  Adicione peças para visualizar o mapa de corte nas chapas MDF.
                </div>
              ) : (
                Array.from({ length: packingResult.sheetsUsed }).map((_, i) => (
                  <div key={i} className="bg-slate-950 p-3 rounded border border-slate-800">
                    <p className='text-xs font-bold text-amber-400 mb-2 flex justify-between items-center'>
                      <span>Chapa {i + 1} de {packingResult.sheetsUsed}</span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        {packingResult.placed.filter(p => p.sheet === i + 1).length} peças
                      </span>
                    </p>
                    <canvas ref={(el) => canvasRefs.current[i] = el} className={`border border-slate-800 rounded bg-slate-900 w-full ${error ? 'opacity-50' : ''}`} />
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* CNC Cutting Plan Simulation Section for BACKING (FUNDO) */}
      <section className="bg-slate-900 border border-emerald-500/40 p-6 rounded-lg shadow-lg mb-8">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-lg font-semibold text-slate-100 uppercase tracking-widest text-xs">
                Simulação CNC - Plano de Corte de FUNDO (MDF 3mm / 6mm)
              </h2>
              <p className="text-lg text-emerald-400 font-medium mt-0.5">
                Lote: <span className="font-bold text-slate-100">{furnitureQty} móvel(is)</span>
              </p>
            </div>
          </div>

          {/* Back Sheet Dimensions */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded">
            <span className="text-slate-400 uppercase tracking-widest text-[11px] font-semibold">Chapa de Fundo (mm):</span>
            <input
              type="number"
              value={backSheetWidth}
              onChange={e => setBackSheetWidth(parseInt(e.target.value) || 0)}
              className="bg-slate-900 border border-slate-800 p-1 rounded w-16 text-slate-200 text-xs text-center font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-slate-500 font-bold">x</span>
            <input
              type="number"
              value={backSheetHeight}
              onChange={e => setBackSheetHeight(parseInt(e.target.value) || 0)}
              className="bg-slate-900 border border-slate-800 p-1 rounded w-16 text-slate-200 text-xs text-center font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column: Form + List of Back Pieces */}
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Peças de Fundo Cadastradas ({backPieces.length})
              </span>
              
              <button
                onClick={handleAutoExtractBackPieces}
                className="text-emerald-400 hover:text-emerald-300 text-xs font-semibold flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/60 px-2 py-1 rounded transition-colors"
                title="Importar peças com nome Fundo/Costa do projeto principal"
              >
                <Sparkles size={13} />
                <span>⚡ Importar do Projeto</span>
              </button>
            </div>

            {/* Add Back Piece Input Form */}
            <div className="flex gap-2 items-center">
              <input
                placeholder="Nome da peça de fundo (ex: Fundo Traseiro)"
                value={newBackPiece.name}
                onChange={e => setNewBackPiece({ ...newBackPiece, name: e.target.value })}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-slate-200 text-xs flex-1"
              />
              <input
                placeholder="Alt(cm)"
                value={newBackPiece.height}
                onChange={e => setNewBackPiece({ ...newBackPiece, height: e.target.value })}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-slate-200 text-xs text-center w-16"
              />
              <input
                placeholder="Larg(cm)"
                value={newBackPiece.width}
                onChange={e => setNewBackPiece({ ...newBackPiece, width: e.target.value })}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-slate-200 text-xs text-center w-16"
              />
              <input
                placeholder="Qtd"
                value={newBackPiece.quantity}
                onChange={e => setNewBackPiece({ ...newBackPiece, quantity: e.target.value })}
                className="bg-slate-950 border border-slate-800 p-2 rounded text-slate-200 text-xs text-center w-14"
              />
              <button
                onClick={addBackPiece}
                className="bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-2 rounded font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <Plus size={16} />
                <span>Add</span>
              </button>
            </div>

            {/* Back Pieces List Table */}
            {backPieces.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-6 border border-dashed border-slate-800 rounded">
                Nenhuma peça de fundo cadastrada. Digite as medidas acima ou clique em "Importar do Projeto".
              </p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {backPieces.map(p => (
                  <li key={p.id} className="flex flex-row gap-2 items-center bg-slate-950 p-2 rounded border border-slate-800 text-xs">
                    <input
                      value={p.name}
                      onChange={e => setBackPieces(backPieces.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))}
                      className="bg-transparent border-none text-slate-200 w-full focus:outline-none focus:bg-slate-900 rounded px-1"
                    />
                    <input
                      type="number"
                      value={p.height / 10}
                      onChange={e => setBackPieces(backPieces.map(x => x.id === p.id ? { ...x, height: parseFloat(e.target.value) * 10 } : x))}
                      className="bg-transparent border-none text-slate-200 w-12 text-center focus:outline-none focus:bg-slate-900 rounded px-1"
                    />
                    <input
                      type="number"
                      value={p.width / 10}
                      onChange={e => setBackPieces(backPieces.map(x => x.id === p.id ? { ...x, width: parseFloat(e.target.value) * 10 } : x))}
                      className="bg-transparent border-none text-slate-200 w-12 text-center focus:outline-none focus:bg-slate-900 rounded px-1"
                    />
                    <input
                      type="number"
                      value={p.quantity}
                      onChange={e => setBackPieces(backPieces.map(x => x.id === p.id ? { ...x, quantity: parseInt(e.target.value) } : x))}
                      className="bg-transparent border-none text-slate-200 w-10 text-center focus:outline-none focus:bg-slate-900 rounded px-1"
                    />
                    <Trash2
                      size={16}
                      className="cursor-pointer text-slate-500 hover:text-red-500 transition-colors"
                      onClick={() => setBackPieces(backPieces.filter(x => x.id !== p.id))}
                    />
                  </li>
                ))}
              </ul>
            )}

            {/* Backing MDF Balance Box */}
            {(() => {
              const totalPlacedArea = backPackingResult.placed.reduce((sum, p) => sum + (p.height * p.width), 0);
              const totalSheetArea = backSheetWidth * backSheetHeight * backPackingResult.sheetsUsed;
              const yieldPercentage = backPackingResult.sheetsUsed > 0 ? (totalPlacedArea / totalSheetArea) * 100 : 0;

              return (
                <div className="bg-slate-950 p-4 rounded border border-slate-800 space-y-2 text-xs">
                  <h3 className="font-semibold text-slate-100 border-b border-slate-800 pb-2 text-sm">
                    Balanço e Aproveitamento do MDF de Fundo:
                  </h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-300">
                      <span>Área por Chapa ({backSheetWidth / 10}x{backSheetHeight / 10}cm):</span>
                      <span className="font-mono">{((backSheetWidth * backSheetHeight) / 1000000).toFixed(2)} m²</span>
                    </div>
                    <div className="flex justify-between text-slate-300 font-semibold">
                      <span>Área Total de Fundo ({backPackingResult.sheetsUsed} chapa{backPackingResult.sheetsUsed !== 1 ? 's' : ''}):</span>
                      <span className="font-mono text-slate-100">{(totalSheetArea / 1000000).toFixed(2)} m²</span>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>Área Útil Ocupada:</span>
                      <span className="font-mono font-bold">{(totalPlacedArea / 1000000).toFixed(2)} m²</span>
                    </div>
                    <div className="flex justify-between text-amber-500">
                      <span>Sobra / Retalho Estimado:</span>
                      <span className="font-mono font-bold">
                        {(Math.max(0, totalSheetArea - totalPlacedArea) / 1000000).toFixed(2)} m²
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-bold">
                      <span className="text-slate-200">Aproveitamento Médio:</span>
                      <span className="font-mono text-base text-emerald-400">
                        {backPackingResult.sheetsUsed > 0 ? yieldPercentage.toFixed(1) : '0.0'}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Right Column: Canvas Map */}
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-950 p-3 rounded border border-slate-800 text-sm">
              <span className="text-slate-400">Chapas de Fundo Necessárias:</span>
              <span className="text-emerald-400 font-bold text-base">{backPackingResult.sheetsUsed} chapa(s)</span>
            </div>

            {backPackingResult.sheetsUsed === 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded p-8 text-center text-slate-500 text-sm">
                Adicione peças de fundo para visualizar o mapa de corte nas chapas de fundo.
              </div>
            ) : (
              Array.from({ length: backPackingResult.sheetsUsed }).map((_, i) => (
                <div key={i} className="bg-slate-950 p-3 rounded border border-slate-800">
                  <p className="text-xs font-bold text-emerald-400 mb-2 flex justify-between items-center">
                    <span>Chapa de Fundo {i + 1} de {backPackingResult.sheetsUsed}</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {backPackingResult.placed.filter(p => p.sheet === i + 1).length} peças
                    </span>
                  </p>
                  <canvas
                    ref={el => backCanvasRefs.current[i] = el}
                    className="border border-slate-800 rounded bg-slate-900 w-full"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* FECHAMENTO FINANCEIRO: CUSTOS DE PRODUÇÃO, CENÁRIOS DE VENDA E ANÁLISE DE LUCRO */}
      <section className="bg-slate-900 border border-amber-500/40 p-6 rounded-lg shadow-xl mb-12">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/30">
              <DollarSign className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 uppercase tracking-widest">
                Fechamento Financeiro: Custos, Cenários de Venda & Lucratividade
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Defina os custos de insumos e simule cenários de preço de venda por unidade e por lote ({furnitureQty} {furnitureQty === 1 ? 'móvel' : 'móveis'}).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCosts([])}
              className="text-slate-400 hover:text-red-400 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
              <span>Zerar Insumos</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Left Column: Itemized Production Costs Table */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
              <span>1. Custos de Produção por Móvel (Insumos)</span>
              <span className="text-xs text-slate-400 font-normal">Cadastre os insumos para 1 móvel</span>
            </h3>

            {/* Add Cost Form */}
            <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
              <input
                placeholder="Nome do produto/insumo (ex: Chapa MDF, Corrediça)"
                value={newCost.name}
                onChange={e => setNewCost({ ...newCost, name: e.target.value })}
                className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs flex-1 min-w-[160px] focus:outline-none focus:border-amber-500"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Valor Unit(R$)"
                value={newCost.unitPrice}
                onChange={e => setNewCost({ ...newCost, unitPrice: e.target.value })}
                className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs text-center w-28 focus:outline-none focus:border-amber-500 font-mono"
              />
              <input
                type="number"
                min="1"
                placeholder="Qtd"
                value={newCost.quantity}
                onChange={e => setNewCost({ ...newCost, quantity: e.target.value })}
                className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs text-center w-16 focus:outline-none focus:border-amber-500 font-mono"
              />
              <button
                onClick={addCost}
                className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2.5 rounded font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-md"
              >
                <Plus size={16} />
                <span>Add</span>
              </button>
            </div>

            {/* Costs List Table */}
            {costs.length === 0 ? (
              <div className="bg-slate-950 border border-dashed border-slate-800 rounded-lg p-6 text-center text-slate-500 text-xs">
                Nenhum insumo ou custo cadastrado. Adicione acima os custos de MDF, ferragens, fitas de borda e mão de obra para 1 móvel.
              </div>
            ) : (
              <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider text-[10px] sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2.5">Insumo</th>
                      <th className="py-1.5 px-2.5 text-right">Valor Unit.</th>
                      <th className="py-1.5 px-2.5 text-center">Qtd</th>
                      <th className="py-1.5 px-2.5 text-right">Valor Total</th>
                      <th className="py-1.5 px-2.5 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.map(c => (
                      <tr key={c.id} className="hover:bg-slate-900/50">
                        <td className="py-1 px-2.5">
                          <input
                            value={c.name}
                            onChange={e => setCosts(costs.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))}
                            className="bg-transparent border-none text-slate-200 w-full focus:outline-none focus:bg-slate-900 rounded px-1"
                          />
                        </td>
                        <td className="py-1 px-2.5 text-right font-mono">
                          <CurrencyInput
                            value={c.unitPrice}
                            onChange={val => setCosts(costs.map(x => x.id === c.id ? { ...x, unitPrice: val } : x))}
                          />
                        </td>
                        <td className="py-1 px-2.5 text-center font-mono">
                          <input
                            type="number"
                            min="1"
                            value={c.quantity}
                            onChange={e => setCosts(costs.map(x => x.id === c.id ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))}
                            className="bg-transparent border-none text-slate-200 w-12 text-center focus:outline-none focus:bg-slate-900 rounded px-1"
                          />
                        </td>
                        <td className="py-1 px-2.5 text-right font-mono text-amber-400 font-semibold">
                          R$ {formatBRL(c.unitPrice * c.quantity)}
                        </td>
                        <td className="py-1 px-2.5 text-center">
                          <Trash2
                            size={14}
                            className="cursor-pointer text-slate-500 hover:text-red-500 mx-auto transition-colors"
                            onClick={() => setCosts(costs.filter(x => x.id !== c.id))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Production Cost Total Summary */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-between items-center flex-wrap gap-2">
              <div>
                <span className="text-slate-400 text-xs uppercase tracking-wider block font-semibold">Custo Unitário por Móvel:</span>
                <span className="text-[11px] text-slate-500">
                  Custo Direto do Lote ({furnitureQty} {furnitureQty === 1 ? 'móvel' : 'móveis'}):{' '}
                  <strong className="text-amber-400 font-mono">R$ {formatBRL(totalCost)}</strong>
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono text-amber-400 text-2xl font-extrabold block">
                  R$ {formatBRL(unitCost)}
                </span>
              </div>
            </div>

            {/* Botão CALCULADORA */}
            <button
              onClick={handleOpenCalcModal}
              className="w-full bg-slate-950 hover:bg-slate-900 border border-amber-500/50 hover:border-amber-400 text-amber-400 hover:text-amber-300 py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-[0.99] mt-3"
            >
              <Calculator size={16} />
              <span>CALCULADORA</span>
            </button>

            {/* Preços e Links dos Concorrentes (Mercado Livre / Mercado) */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3 mt-3">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wide">
                  <Link className="w-3.5 h-3.5 text-amber-500" />
                  <span>Preços do Concorrente / Mercado Livre ({Array.isArray(competitorItems) ? competitorItems.length : 0}/5)</span>
                </div>
              </div>

              {/* Form para cadastrar Valor do Concorrente + Link */}
              {(!Array.isArray(competitorItems) || competitorItems.length < 5) && (
                <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Valor R$"
                    value={newCompetitorPrice}
                    onChange={e => setNewCompetitorPrice(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCompetitorItem(e);
                      }
                    }}
                    className="bg-slate-900 border border-slate-800 p-2 rounded text-slate-200 text-xs w-28 text-center focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Link do anúncio (ex: https://...)"
                    value={newCompetitorLink}
                    onChange={e => setNewCompetitorLink(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCompetitorItem(e);
                      }
                    }}
                    className="bg-slate-900 border border-slate-800 p-2 rounded text-slate-200 text-xs flex-1 min-w-[130px] focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={addCompetitorItem}
                    className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-2 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap active:scale-95 shadow-sm"
                  >
                    <Plus size={14} />
                    <span>Add Novo Valor</span>
                  </button>
                </div>
              )}

              {/* Lista de Valores de Concorrentes com Links Clicáveis */}
              {!Array.isArray(competitorItems) || competitorItems.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic text-center py-1">
                  Nenhum preço de concorrente cadastrado. Digite o valor (R$) e o link acima para comparar.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {competitorItems.map((item, idx) => {
                    if (!item) return null;
                    const itemPrice = typeof item.price === 'number' && !isNaN(item.price) ? item.price : (parseFloat(item.price as any) || 0);
                    const itemLink = typeof item.link === 'string' ? item.link : '';
                    const itemId = item.id || `comp-${idx}`;

                    return (
                      <div
                        key={itemId}
                        className="flex items-center justify-between bg-slate-900 border border-slate-800 px-3 py-2 rounded text-xs gap-2"
                      >
                        <div className="flex items-center gap-2 font-mono flex-1 min-w-0">
                          <span className="text-slate-400 font-semibold text-[11px] whitespace-nowrap">
                            Valor {idx + 1}:
                          </span>
                          <span className="text-amber-400 font-bold text-sm whitespace-nowrap">
                            R$ {formatBRL(itemPrice)}
                          </span>
                          {itemLink && (
                            <>
                              <span className="text-slate-600">→</span>
                              <a
                                href={itemLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-400 hover:text-emerald-300 text-[11px] truncate flex items-center gap-1 hover:underline font-sans"
                                title={itemLink}
                              >
                                <ExternalLink className="w-3 h-3 flex-shrink-0 text-emerald-500" />
                                <span className="truncate">{itemLink}</span>
                              </a>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCompetitorItem(itemId)}
                          className="text-slate-500 hover:text-red-400 p-1 transition-colors flex-shrink-0 cursor-pointer"
                          title="Excluir este valor do concorrente"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Sales Scenarios & Profitability Analysis */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              <span>2. Simulação de Cenários de Venda & Lucro</span>
              <span className="text-xs text-slate-400 font-normal">Digite o valor de venda por unidade</span>
            </h3>

            {/* CALCULADORA DE PREÇO REVERSO (MARGEM ALVO / MARKUP) */}
            {(() => {
              const monthlyProductionCount = furnitureQty * workDaysPerMonth;
              const monthlyFixedExpensesTotal = fixedExpenses.reduce((sum, item) => sum + item.value, 0);
              const fixedCostPerUnit = includeFixedInMarkup && monthlyProductionCount > 0 ? monthlyFixedExpensesTotal / monthlyProductionCount : 0;
              const effectiveBaseUnitCost = unitCost + fixedCostPerUnit;

              // 1. Suggested Price for Direct Sales / Varejo: base / (1 - tax% - margin%)
              const divVarejo = 1 - (taxRate / 100) - (targetNetMargin / 100);
              const suggestedVarejoPrice = divVarejo > 0 ? effectiveBaseUnitCost / divVarejo : 0;

              // 2. Suggested Price for Mercado Livre: base / (1 - tax% - mlFee% - margin%)
              const divML = 1 - (taxRate / 100) - (mlFeeRate / 100) - (targetNetMargin / 100);
              const suggestedMLPrice = divML > 0 ? effectiveBaseUnitCost / divML : 0;

              return (
                <div className="bg-slate-950 p-4 rounded-lg border border-emerald-500/30 space-y-3 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900 pb-2">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase tracking-wide">
                      <Sparkles size={14} />
                      <span>Calculadora de Preço Ideal (Margem Alvo / Markup)</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-[11px] text-slate-300 font-semibold uppercase">Margem Alvo (%):</span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="90"
                          value={targetNetMargin === 0 ? '' : targetNetMargin}
                          onChange={e => {
                            if (e.target.value === '') {
                              setTargetNetMargin(0);
                            } else {
                              const val = parseFloat(e.target.value);
                              setTargetNetMargin(isNaN(val) ? 0 : Math.max(0, val));
                            }
                          }}
                          className="bg-slate-950 text-emerald-400 font-bold text-xs font-mono w-12 text-center rounded border border-slate-800 focus:outline-none"
                        />
                      </div>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeFixedInMarkup}
                          onChange={e => setIncludeFixedInMarkup(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                        <span>Incluir Despesas Fixas (R$ {formatBRL(fixedCostPerUnit)}/un)</span>
                      </label>
                    </div>
                  </div>

                  {/* Suggested Prices Action Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    {/* Varejo Suggestion */}
                    <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 flex justify-between items-center gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-sans block">Venda Direta / Varejo ({targetNetMargin}% Líquido):</span>
                        <span className="text-sm font-bold text-emerald-400">R$ {formatBRL(suggestedVarejoPrice)}</span>
                      </div>
                      <button
                        onClick={() => {
                          if (suggestedVarejoPrice > 0) {
                            setSalesScenarios(prev => prev.map((s, i) => i === 0 ? { ...s, unitPrice: parseFloat(suggestedVarejoPrice.toFixed(2)) } : s));
                            setSaveToast(`Preço de Varejo (R$ ${formatBRL(suggestedVarejoPrice)}) aplicado no Cenário 1!`);
                            setTimeout(() => setSaveToast(null), 3500);
                          }
                        }}
                        className="bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-[10px] px-2 py-1.5 rounded font-sans font-bold transition-all cursor-pointer whitespace-nowrap"
                      >
                        Aplicar no Cenário 1
                      </button>
                    </div>

                    {/* Mercado Livre Suggestion (Highlighted) */}
                    <div className="bg-gradient-to-r from-amber-950/80 via-yellow-950/50 to-slate-900 border-2 border-amber-500/80 p-2.5 rounded flex justify-between items-center gap-2 shadow-md">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="bg-yellow-500 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded font-sans uppercase">
                            📦 Mercado Livre
                          </span>
                          <span className="text-[10px] text-amber-300 font-sans font-semibold">(+Taxa {mlFeeRate}%):</span>
                        </div>
                        <span className="text-sm font-black text-amber-400">R$ {formatBRL(suggestedMLPrice)}</span>
                      </div>
                      <button
                        onClick={() => {
                          if (suggestedMLPrice > 0) {
                            setSalesScenarios(prev => prev.map((s, i) => i === 1 ? { ...s, unitPrice: parseFloat(suggestedMLPrice.toFixed(2)) } : s));
                            setSaveToast(`Preço Mercado Livre (R$ ${formatBRL(suggestedMLPrice)}) aplicado no Cenário 2!`);
                            setTimeout(() => setSaveToast(null), 3500);
                          }
                        }}
                        className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-[10px] px-2.5 py-1.5 rounded font-sans font-extrabold transition-all cursor-pointer whitespace-nowrap shadow-md active:scale-95"
                      >
                        Aplicar no Cenário 2
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-3">
              {salesScenarios.map((scenario, index) => {
                const isML = scenario.id === 'c2' || index === 1 || scenario.name.toLowerCase().includes('mercado livre');
                const totalRevenue = scenario.unitPrice * furnitureQty;
                const unitProfit = scenario.unitPrice - unitCost;
                const totalProfit = totalRevenue - totalCost;
                const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

                return (
                  <div
                    key={scenario.id}
                    className={`p-4 rounded-xl transition-all space-y-3 ${
                      isML
                        ? 'bg-gradient-to-r from-amber-950/70 via-yellow-950/40 to-slate-950 border-2 border-amber-500 shadow-xl shadow-amber-500/10 ring-1 ring-amber-500/30'
                        : 'bg-slate-950 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900 pb-2">
                      <div className="flex items-center gap-2 flex-1">
                        {isML && (
                          <span className="bg-yellow-500 text-slate-950 font-black text-[10px] uppercase px-2 py-0.5 rounded-full shadow shrink-0">
                            📦 Mercado Livre
                          </span>
                        )}
                        <input
                          type="text"
                          value={scenario.name}
                          onChange={e => setSalesScenarios(salesScenarios.map(s => s.id === scenario.id ? { ...s, name: e.target.value } : s))}
                          className={`font-bold text-xs focus:outline-none rounded px-1.5 py-0.5 flex-1 ${
                            isML ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40' : 'bg-transparent text-slate-100 focus:bg-slate-900'
                          }`}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] uppercase font-bold ${isML ? 'text-amber-300' : 'text-slate-400'}`}>
                          Venda Unitária (R$):
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={scenario.unitPrice === 0 ? '0.00' : scenario.unitPrice}
                          onChange={e => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            setSalesScenarios(salesScenarios.map(s => s.id === scenario.id ? { ...s, unitPrice: isNaN(val) ? 0 : val } : s));
                          }}
                          className={`font-bold text-sm h-8 rounded w-28 text-center font-mono focus:outline-none ${
                            isML
                              ? 'bg-slate-950 border-2 border-amber-400 text-amber-300 shadow-md focus:border-yellow-300'
                              : 'bg-slate-900 border border-slate-700 text-emerald-400 focus:border-emerald-500'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Financial Metrics Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                      <div className={`p-2 rounded border ${isML ? 'bg-slate-950/80 border-amber-500/30' : 'bg-slate-900/60 border-slate-850'}`}>
                        <span className="text-[10px] text-slate-400 block font-semibold">Faturamento Lote:</span>
                        <span className={`font-mono font-bold text-sm ${isML ? 'text-amber-300' : 'text-slate-100'}`}>
                          R$ {formatBRL(totalRevenue)}
                        </span>
                      </div>

                      <div className={`p-2 rounded border ${isML ? 'bg-slate-950/80 border-amber-500/30' : 'bg-slate-900/60 border-slate-850'}`}>
                        <span className="text-[10px] text-slate-400 block font-semibold">Lucro / Móvel:</span>
                        <span className={`font-mono font-bold text-sm ${unitProfit >= 0 ? (isML ? 'text-emerald-400' : 'text-emerald-400') : 'text-red-400'}`}>
                          R$ {formatBRL(unitProfit)}
                        </span>
                      </div>

                      <div className={`p-2 rounded border ${isML ? 'bg-slate-950/80 border-amber-500/30' : 'bg-slate-900/60 border-slate-850'}`}>
                        <span className="text-[10px] text-slate-400 block font-semibold">Lucro Total Lote:</span>
                        <span className={`font-mono font-bold text-sm ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          R$ {formatBRL(totalProfit)}
                        </span>
                      </div>

                      <div className={`p-2 rounded border ${isML ? 'bg-slate-950/80 border-amber-500/30' : 'bg-slate-900/60 border-slate-850'}`}>
                        <span className="text-[10px] text-slate-400 block font-semibold">Margem de Lucro:</span>
                        <span className={`font-mono font-bold text-sm ${margin >= 40 ? 'text-emerald-400' : margin > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                          {margin.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* PART 3: PROJEÇÃO MENSAL, DESPESAS FIXAS, IMPOSTOS E DRE */}
        <div className="mt-8 pt-6 border-t border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
            <div>
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Calculator className="w-4 h-4 text-amber-500" />
                <span>3. Projeção Mensal de Vendas & DRE da Marcenaria</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Simule o faturamento mensal considerando a quantidade de dias úteis trabalhados por mês e despesas fixas.
              </p>
            </div>

            {/* Inputs: Work Days, Vendas/Dia, Tax Rate & Highlighted Cenário */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded">
                <span className="text-[11px] text-slate-300 font-semibold uppercase">Dias no Mês:</span>
                <input
                  type="number"
                  min="0"
                  max="31"
                  value={workDaysPerMonth === 0 ? '' : workDaysPerMonth}
                  onChange={e => {
                    if (e.target.value === '') {
                      setWorkDaysPerMonth(0);
                    } else {
                      const val = parseInt(e.target.value);
                      setWorkDaysPerMonth(isNaN(val) ? 0 : Math.max(0, val));
                    }
                  }}
                  className="bg-slate-950 text-amber-400 font-bold text-xs font-mono w-12 text-center rounded border border-slate-800 focus:outline-none"
                />
              </div>

              {/* Campo para digitar Vendas por dia (Posicionado do lado direito de Dias no Mês) */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-amber-500/50 px-2.5 py-1 rounded shadow-sm" title="Digite a quantidade de vendas desejada por dia">
                <span className="text-[11px] text-amber-300 font-bold uppercase">Vendas/Dia:</span>
                <input
                  type="number"
                  min="0"
                  value={dailySales === 0 ? '' : dailySales}
                  onChange={e => {
                    if (e.target.value === '') {
                      setDailySales(0);
                    } else {
                      const val = parseInt(e.target.value);
                      setDailySales(isNaN(val) ? 0 : Math.max(0, val));
                    }
                  }}
                  className="bg-slate-950 text-amber-400 font-bold text-xs font-mono w-14 text-center rounded border border-amber-500/60 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded">
                <span className="text-[11px] text-slate-300 font-semibold uppercase">Imposto (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={taxRate === 0 ? '' : taxRate}
                  onChange={e => {
                    if (e.target.value === '') {
                      setTaxRate(0);
                    } else {
                      const val = parseFloat(e.target.value);
                      setTaxRate(isNaN(val) ? 0 : Math.max(0, val));
                    }
                  }}
                  className="bg-slate-950 text-amber-400 font-bold text-xs font-mono w-14 text-center rounded border border-slate-800 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded">
                <span className="text-[11px] text-slate-300 font-semibold uppercase">Taxas ML (%):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={mlFeeRate === 0 ? '' : mlFeeRate}
                  onChange={e => {
                    if (e.target.value === '') {
                      setMlFeeRate(0);
                    } else {
                      const val = parseFloat(e.target.value);
                      setMlFeeRate(isNaN(val) ? 0 : Math.max(0, val));
                    }
                  }}
                  className="bg-slate-950 text-amber-400 font-bold text-xs font-mono w-14 text-center rounded border border-slate-800 focus:outline-none"
                />
              </div>

              {/* Active Scenario Selector for Monthly Projection - Destaque visual destacado */}
              <div className="flex items-center gap-2 bg-gradient-to-r from-amber-950 via-yellow-950 to-slate-950 border-2 border-amber-400 px-3 py-1.5 rounded-lg shadow-lg ring-2 ring-amber-500/40">
                <span className="text-xs font-black text-amber-300 uppercase tracking-wide flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
                  CENÁRIO:
                </span>
                <select
                  value={selectedScenarioId}
                  onChange={e => setSelectedScenarioId(e.target.value)}
                  className="bg-slate-950 text-amber-300 font-extrabold text-xs rounded border border-amber-500/70 focus:outline-none focus:ring-2 focus:ring-amber-400 py-1 px-2 cursor-pointer shadow-inner"
                >
                  {salesScenarios.map((sc, i) => (
                    <option key={sc.id} value={sc.id} className="bg-slate-950 text-slate-100 font-medium">
                      {sc.name || `Cenário ${i + 1}`} (R$ {formatBRL(sc.unitPrice)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggle Ocultar Despesas Fixas na DRE */}
              <label className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded cursor-pointer select-none font-semibold hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  checked={hideFixedExpensesInDre}
                  onChange={e => setHideFixedExpensesInDre(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0 cursor-pointer"
                />
                <span>Ocultar Despesas Fixas</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Left Sub-Column: Fixed Expenses Manager */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Despesas Fixas Mensais da Oficina ({fixedExpenses.length})
                </h4>
                <button
                  onClick={() => setFixedExpenses([])}
                  className="text-slate-500 hover:text-red-400 text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>Limpar Despesas</span>
                </button>
              </div>

              {/* Add Fixed Expense Form */}
              <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                <input
                  placeholder="Nome da despesa (ex: Aluguel, Energia, Funcionário)"
                  value={newFixedExpense.name}
                  onChange={e => setNewFixedExpense({ ...newFixedExpense, name: e.target.value })}
                  className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs flex-1 min-w-[160px] focus:outline-none focus:border-amber-500"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Valor Mensal (R$)"
                  value={newFixedExpense.value}
                  onChange={e => setNewFixedExpense({ ...newFixedExpense, value: e.target.value })}
                  className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-200 text-xs text-center w-32 focus:outline-none focus:border-amber-500 font-mono"
                />
                <button
                  onClick={addFixedExpense}
                  className="bg-amber-500 hover:bg-amber-400 text-black px-3.5 py-2.5 rounded font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-md"
                >
                  <Plus size={16} />
                  <span>Add</span>
                </button>
              </div>

              {/* Fixed Expenses Table */}
              {fixedExpenses.length === 0 ? (
                <div className="bg-slate-950 border border-dashed border-slate-800 rounded-lg p-5 text-center text-slate-500 text-xs">
                  Nenhuma despesa fixa mensal cadastrada.
                </div>
              ) : (
                <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider text-[10px] sticky top-0">
                      <tr>
                        <th className="p-2.5">Despesa Fixa</th>
                        <th className="p-2.5 text-right">Valor Mensal</th>
                        <th className="p-2.5 text-center w-12">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixedExpenses.map(fe => (
                        <tr key={fe.id} className="hover:bg-slate-900/50">
                          <td className="p-2.5">
                            <input
                              value={fe.name}
                              onChange={e => setFixedExpenses(fixedExpenses.map(x => x.id === fe.id ? { ...x, name: e.target.value } : x))}
                              className="bg-transparent border-none text-slate-200 w-full focus:outline-none focus:bg-slate-900 rounded px-1"
                            />
                          </td>
                          <td className="p-2.5 text-right font-mono">
                            <CurrencyInput
                              value={fe.value}
                              onChange={val => setFixedExpenses(fixedExpenses.map(x => x.id === fe.id ? { ...x, value: val } : x))}
                            />
                          </td>
                          <td className="p-2.5 text-center">
                            <Trash2
                              size={14}
                              className="cursor-pointer text-slate-500 hover:text-red-500 mx-auto transition-colors"
                              onClick={() => setFixedExpenses(fixedExpenses.filter(x => x.id !== fe.id))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Sub-Column: Monthly DRE Statement */}
            {(() => {
              const activeSc = salesScenarios.find(s => s.id === selectedScenarioId) || salesScenarios[0] || { unitPrice: 0, name: 'Cenário 1' };
              const unitCost = furnitureQty > 0 ? totalCost / furnitureQty : 0;
              const monthlyProductionCount = dailySales * workDaysPerMonth;
              const monthlyGrossRevenue = activeSc.unitPrice * monthlyProductionCount;
              const monthlyDirectCost = unitCost * monthlyProductionCount;
              const monthlyGrossProfit = monthlyGrossRevenue - monthlyDirectCost;
              const isMlScenario = selectedScenarioId === 'c2' || salesScenarios.findIndex(s => s.id === selectedScenarioId) === 1;
              const monthlyMlFeeAmount = isMlScenario ? monthlyGrossRevenue * (mlFeeRate / 100) : 0;
              const monthlyTaxAmount = monthlyGrossRevenue * (taxRate / 100);
              const rawFixedExpensesTotal = fixedExpenses.reduce((sum, item) => sum + item.value, 0);
              const monthlyFixedExpensesTotal = hideFixedExpensesInDre ? 0 : rawFixedExpensesTotal;
              const monthlyNetProfit = monthlyGrossRevenue - monthlyDirectCost - monthlyMlFeeAmount - monthlyTaxAmount - monthlyFixedExpensesTotal;
              const monthlyNetMargin = monthlyGrossRevenue > 0 ? (monthlyNetProfit / monthlyGrossRevenue) * 100 : 0;

              return (
                <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-4 shadow-inner">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={14} />
                      <span>DRE - Demonstração do Resultado do Mês</span>
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {workDaysPerMonth} dias × {dailySales} {dailySales === 1 ? 'venda' : 'vendas'}/dia = <strong>{monthlyProductionCount} vendas/mês</strong>
                    </span>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-slate-200">
                      <span>(+) Faturamento Bruto Mensal ({monthlyProductionCount} un):</span>
                      <span className="font-bold text-slate-100">R$ {formatBRL(monthlyGrossRevenue)}</span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>(-) Custo Direto de Produção Mensal:</span>
                      <span>R$ {formatBRL(monthlyDirectCost)}</span>
                    </div>

                    <div className="flex justify-between text-amber-500 font-semibold border-t border-slate-900 pt-1">
                      <span>(=) Lucro Bruto Mensal:</span>
                      <span>R$ {formatBRL(monthlyGrossProfit)}</span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>(-) Taxas Mercado Livre ({isMlScenario ? mlFeeRate.toFixed(1) : '0.0'}%):</span>
                      <span className={isMlScenario && monthlyMlFeeAmount > 0 ? "text-red-400" : "text-slate-500"}>
                        R$ {formatBRL(monthlyMlFeeAmount)}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>(-) Imposto sobre Vendas ({taxRate.toFixed(1)}%):</span>
                      <span className="text-red-400">R$ {formatBRL(monthlyTaxAmount)}</span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>(-) Total de Despesas Fixas Mensais:</span>
                      <span className={monthlyFixedExpensesTotal > 0 ? "text-red-400" : "text-slate-500"}>
                        R$ {formatBRL(monthlyFixedExpensesTotal)}
                      </span>
                    </div>

                    {/* Final Monthly Result Banner */}
                    <div className={`p-3.5 rounded-lg border mt-3 transition-all ${
                      monthlyNetProfit >= 0
                        ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                        : 'bg-red-950/60 border-red-500/50 text-red-300'
                    }`}>
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider block">
                            {monthlyNetProfit >= 0 ? '🟢 LUCRO LÍQUIDO MENSAL FINAL:' : '🔴 RESULTADO MENSAL (PREJUÍZO):'}
                          </span>
                          <span className="font-mono text-2xl font-extrabold tracking-tight block mt-0.5">
                            Margem Líquida: <strong>{monthlyNetMargin.toFixed(2)}%</strong>
                          </span>
                        </div>
                        <span className="font-mono text-2xl font-extrabold tracking-tight">
                          R$ {formatBRL(monthlyNetProfit)}
                        </span>
                      </div>

                      {/* Resumo Solicitado */}
                      <div className="mt-3 pt-2.5 border-t border-slate-700/60 font-sans text-xs">
                        <div className="font-bold text-amber-300 text-sm">
                          {dailySales} vendas por dia
                        </div>
                        <div className="text-slate-200 font-semibold mt-1 flex items-center gap-3 flex-wrap">
                          <span>total de <strong className="text-amber-400">{monthlyProductionCount}</strong> vendas por Mês</span>
                          <span className="text-slate-500 font-normal">|</span>
                          <span><strong className="text-amber-400">{workDaysPerMonth}</strong> dias mês</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Resumo Consolidado de Produção Diária e Mensal */}
      {(() => {
        const monthlyFurniture = furnitureQty * workDaysPerMonth;
        const dailyMainSheets = packingResult.sheetsUsed;
        const monthlyMainSheets = dailyMainSheets * workDaysPerMonth;
        const dailyBackSheets = backPackingResult.sheetsUsed;
        const monthlyBackSheets = dailyBackSheets * workDaysPerMonth;

        return (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg shadow-xl mb-8 space-y-5 text-center">
            <div className="flex flex-col md:flex-row justify-between items-center gap-2 border-b border-slate-800 pb-3 text-center">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center justify-center gap-2 w-full md:w-auto">
                <Layers className="w-4 h-4 text-amber-500" />
                <span>Resumo Consolidado de Produção & Insumos</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-mono text-center w-full md:w-auto">
                Base de cálculo: <strong>{workDaysPerMonth} dias úteis</strong>/mês × <strong>{furnitureQty} móveis</strong>/dia
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Box 1: Móveis por Dia */}
              <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 text-center flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block text-center">
                  Móveis Produzidos / Dia:
                </span>
                <span className="font-mono text-2xl font-extrabold text-slate-100 mt-1 block text-center">
                  {furnitureQty} <span className="text-xs font-normal text-slate-400">un/dia</span>
                </span>
              </div>

              {/* Box 2: Móveis por Mês */}
              <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 text-center flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block text-center">
                  Móveis Produzidos / Mês:
                </span>
                <span className="font-mono text-2xl font-extrabold text-amber-400 mt-1 block text-center">
                  {monthlyFurniture} <span className="text-xs font-normal text-slate-400">un/mês</span>
                </span>
              </div>

              {/* Box 3: Chapas por Dia */}
              <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 text-center flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block text-center">
                  Chapas Usadas / Dia:
                </span>
                <span className="font-mono text-2xl font-extrabold text-emerald-400 mt-1 block text-center">
                  {dailyMainSheets} <span className="text-xs font-normal text-slate-400">chapa(s)</span>
                </span>
                {dailyBackSheets > 0 && (
                  <span className="text-[10px] text-slate-500 block mt-1 font-mono text-center">
                    (+ {dailyBackSheets} chapa(s) de fundo)
                  </span>
                )}
              </div>

              {/* Box 4: Chapas por Mês */}
              <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 text-center flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block text-center">
                  Chapas Usadas / Mês:
                </span>
                <span className="font-mono text-2xl font-extrabold text-emerald-400 mt-1 block text-center">
                  {monthlyMainSheets} <span className="text-xs font-normal text-slate-400">chapas</span>
                </span>
                {monthlyBackSheets > 0 && (
                  <span className="text-[10px] text-slate-500 block mt-1 font-mono text-center">
                    (+ {monthlyBackSheets} chapas de fundo)
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Botões de Ação e Salvar no Final da Página */}
      <div className="mt-8 bg-slate-900 border border-slate-800 p-6 rounded-lg shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Save size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Salvar e Exportar Projeto</span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/40">
                {projectName}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Guarde suas alterações no navegador ou exporte o relatório PDF completo com os planos de corte e custos.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => handleSaveProjectToBrowser(false)}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-3 rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 border border-emerald-400/60 transition-all active:scale-95 cursor-pointer"
            title="Salvar este projeto no banco de dados Supabase"
          >
            <Save size={18} />
            <span>Salvar</span>
          </button>

          <button
            onClick={handleViewPDF}
            className="bg-slate-950 hover:bg-slate-800 border border-amber-500/60 text-amber-400 px-4 py-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            title="Visualizar o relatório PDF em uma nova aba"
          >
            <Eye size={18} />
            <span>Visualizar PDF</span>
          </button>

          <button
            onClick={handleDownloadPDF}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            title="Baixar o arquivo PDF para o computador"
          >
            <Download size={18} />
            <span>Baixar PDF</span>
          </button>

          <button
            onClick={handleSaveProjectJson}
            className="bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 px-3 py-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Baixar backup em arquivo JSON"
          >
            <Download size={16} />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* POPUP MODAL: CALCULADORA UNITÁRIA POR MÓVEL (MDF) */}
      {isCalcModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Calculator size={18} />
                <span className="uppercase tracking-wider">Calculadora Unitária por Móvel</span>
              </div>
              <button
                onClick={() => setIsCalcModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Calcule o custo unitário em chapa MDF para cada móvel com base no valor da chapa e na quantidade produzida.
            </p>

            {/* Inputs & Calculation Grid */}
            <div className="space-y-3 text-xs">
              {/* Field 1: Valor da Chapa (R$) */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-semibold uppercase text-[11px] block">
                  1. Valor da Chapa (R$):
                </label>
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-750 px-2.5 py-1.5 rounded focus-within:border-amber-500">
                  <span className="text-amber-400 font-bold font-mono">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={calcSheetPrice === 0 ? '' : calcSheetPrice}
                    onChange={e => {
                      if (e.target.value === '') {
                        setCalcSheetPrice(0);
                      } else {
                        const val = parseFloat(e.target.value);
                        setCalcSheetPrice(isNaN(val) ? 0 : Math.max(0, val));
                      }
                    }}
                    className="bg-transparent text-slate-100 font-mono font-bold text-sm w-full focus:outline-none"
                  />
                </div>
              </div>

              {/* Field 2: Qtd. Usada (Chapas) */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-semibold uppercase text-[11px] block">
                  2. Qtd. de Chapas Usadas:
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={calcSheetQty === 0 ? '' : calcSheetQty}
                  onChange={e => {
                    if (e.target.value === '') {
                      setCalcSheetQty(0);
                    } else {
                      const val = parseFloat(e.target.value);
                      setCalcSheetQty(isNaN(val) ? 0 : Math.max(0, val));
                    }
                  }}
                  className="bg-slate-900 border border-slate-750 p-2 rounded text-slate-100 font-mono font-bold text-xs w-full focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Field 3: Total (Valor da Chapa x Qtd. Usada) */}
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400 uppercase text-[11px] font-semibold">
                  3. Total (Valor Chapa × Qtd):
                </span>
                <span className="font-mono font-bold text-amber-400 text-sm">
                  R$ {formatBRL(calcSheetPrice * calcSheetQty)}
                </span>
              </div>

              {/* Field 4: Qtd. de Móveis Produzidos */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-semibold uppercase text-[11px] block">
                  4. Qtd. de Móveis Produzidos:
                </label>
                <input
                  type="number"
                  min="1"
                  value={calcFurnitureQty === 0 ? '' : calcFurnitureQty}
                  onChange={e => {
                    if (e.target.value === '') {
                      setCalcFurnitureQty(0);
                    } else {
                      const val = parseInt(e.target.value);
                      setCalcFurnitureQty(isNaN(val) ? 0 : Math.max(0, val));
                    }
                  }}
                  className="bg-slate-900 border border-slate-750 p-2 rounded text-slate-100 font-mono font-bold text-xs w-full focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Field 5: Result Card - Custo por Móvel */}
              {(() => {
                const totalSheet = calcSheetPrice * calcSheetQty;
                const unitMovel = calcFurnitureQty > 0 ? totalSheet / calcFurnitureQty : 0;

                return (
                  <div className="bg-amber-950/40 border border-amber-500/50 p-4 rounded-xl space-y-1 text-center shadow-inner">
                    <span className="text-[10px] text-amber-400 uppercase tracking-widest font-extrabold block">
                      5. Custo por Móvel (Base MDF):
                    </span>
                    <span className="font-mono text-2xl font-black text-amber-300 block">
                      R$ {formatBRL(unitMovel)}
                    </span>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      (R$ {formatBRL(totalSheet)} ÷ {calcFurnitureQty} móveis)
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Modal Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleApplyCalcToInsumos}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black py-2.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md"
              >
                <Check size={16} />
                <span>Lançar como Insumo (Chapa MDF)</span>
              </button>
              <button
                onClick={() => setIsCalcModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 px-4 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Custom Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDeleteState.isOpen}
        title={confirmDeleteState.title}
        message={confirmDeleteState.message}
        confirmText="Sim, Excluir"
        cancelText="Cancelar"
        onConfirm={confirmDeleteState.onConfirm}
        onCancel={() => setConfirmDeleteState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

