import React, { useState, useEffect } from 'react';
import { 
  X, Search, Star, ExternalLink, Trash2, Plus, 
  ShoppingCart, Tag, Check, Edit2, Upload, FolderPlus, 
  ImageIcon, Link as LinkIcon, FileText, Camera, ClipboardCheck
} from 'lucide-react';

import { PurchaseProductData } from '../lib/mlScraper';
import { fetchPurchaseLibraryFromCloud, savePurchaseLibraryToCloud } from '../lib/supabase';

interface PurchaseLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportToProject?: (product: PurchaseProductData) => void;
}

const DEFAULT_PURCHASE_CATEGORIES = [
  'Chapas & Compensados',
  'Fitas de Borda',
  'Ferragens & Dobradiças',
  'Corrediças & Trilhos',
  'Parafusos & Fixadores',
  'Lixas & Colas / Selantes',
  'Ferramentas & Fresas CNC',
  'Geral / Outros Insumos'
];

export const PurchaseLibraryModal: React.FC<PurchaseLibraryModalProps> = ({
  isOpen,
  onClose,
  onImportToProject,
}) => {
  const [libraryItems, setLibraryItems] = useState<PurchaseProductData[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mdf-purchase-custom-categories');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Form State for Purchase Product Registration / Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formUrl, setFormUrl] = useState<string>('');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>(DEFAULT_PURCHASE_CATEGORIES[0]);
  const [formImageUrl, setFormImageUrl] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');

  // Category Creation State
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load Library from Supabase / localStorage on mount or open
  useEffect(() => {
    if (isOpen) {
      fetchPurchaseLibraryFromCloud().then(items => {
        if (Array.isArray(items)) {
          const sanitized = items
            .filter(i => i && typeof i === 'object')
            .map(i => ({
              id: i.id || `pur-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              title: i.title || 'Item sem título',
              url: i.url || '',
              price: typeof i.price === 'number' ? i.price : parseFloat(i.price || '0') || 0,
              categoryName: i.categoryName || DEFAULT_PURCHASE_CATEGORIES[0],
              imageUrl: i.imageUrl || '',
              notes: i.notes || '',
              isFavorite: Boolean(i.isFavorite),
              createdAt: i.createdAt || new Date().toISOString(),
            }));
          setLibraryItems(sanitized);
        }
      }).catch(err => {
        console.error('Erro ao carregar biblioteca de compras:', err);
      });
    }
  }, [isOpen]);

  // Handle global paste event (Ctrl+V) when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                setFormImageUrl(event.target.result as string);
                showToast('Foto do item de compra colada! 📋');
              }
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Safe items check
  const safeItems = Array.isArray(libraryItems) ? libraryItems : [];
  const allCategories = Array.from(
    new Set([
      ...DEFAULT_PURCHASE_CATEGORIES,
      ...(Array.isArray(customCategories) ? customCategories : []),
      ...safeItems.map(i => i?.categoryName).filter((c): c is string => Boolean(c))
    ])
  );

  // Add new category handler
  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    const existingMatch = allCategories.find(c => c.toLowerCase() === trimmed.toLowerCase());
    if (existingMatch) {
      setFormCategory(existingMatch);
      showToast(`Categoria "${existingMatch}" selecionada!`);
    } else {
      const updatedCustom = [...customCategories, trimmed];
      setCustomCategories(updatedCustom);
      try {
        localStorage.setItem('mdf-purchase-custom-categories', JSON.stringify(updatedCustom));
      } catch (e) {}
      setFormCategory(trimmed);
      showToast(`Nova categoria de compra "${trimmed}" cadastrada!`);
    }

    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  // Handle local file upload (convert to Base64 data URL)
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('A imagem deve ter no máximo 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setFormImageUrl(event.target.result as string);
        showToast('Foto do produto de compra carregada!');
      }
    };
    reader.readAsDataURL(file);
  };

  // Screen Capture Handler (getDisplayMedia)
  const handleScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          setFormImageUrl(dataUrl);
          showToast('Print da tela capturado com sucesso! 📸');
        }
        stream.getTracks().forEach(track => track.stop());
      }, 600);
    } catch (err) {
      console.warn('Captura de tela cancelada ou não suportada.');
    }
  };

  // Clipboard button handler
  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const reader = new FileReader();
              reader.onload = (event) => {
                if (event.target?.result) {
                  setFormImageUrl(event.target.result as string);
                  showToast('Foto colada da área de transferência! 📋');
                }
              };
              reader.readAsDataURL(blob);
              return;
            }
          }
        }
      }
    } catch (e) {}
    showToast('Dica: Use Win + Shift + S para cortar qualquer área da tela e aperte Ctrl + V!');
  };

  // Save (Create or Update) purchase product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('Por favor, informe o nome do produto para compra.');
      return;
    }

    const parsedPrice = parseFloat(formPrice.toString().replace(',', '.')) || 0;
    let formattedUrl = formUrl.trim();
    if (formattedUrl && !/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const fallbackImg = 'https://images.unsplash.com/photo-1581783898377-1c85bf937427?w=500&auto=format&fit=crop&q=60';

    if (editingId) {
      // Edit existing item
      const updated = safeItems.map(item => {
        if (item.id === editingId) {
          return {
            ...item,
            title: formTitle.trim(),
            url: formattedUrl,
            price: parsedPrice,
            categoryName: formCategory || DEFAULT_PURCHASE_CATEGORIES[0],
            imageUrl: formImageUrl.trim() || item.imageUrl || fallbackImg,
            notes: formNotes.trim(),
          };
        }
        return item;
      });

      setLibraryItems(updated);
      await savePurchaseLibraryToCloud(updated);
      showToast(`Produto de compra "${formTitle.trim()}" atualizado!`);
      resetForm();
    } else {
      // Create new purchase product
      const newItem: PurchaseProductData = {
        id: `pur-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: formTitle.trim(),
        url: formattedUrl,
        price: parsedPrice,
        categoryName: formCategory || DEFAULT_PURCHASE_CATEGORIES[0],
        imageUrl: formImageUrl.trim() || fallbackImg,
        notes: formNotes.trim(),
        isFavorite: false,
        createdAt: new Date().toISOString(),
      };

      const updated = [newItem, ...safeItems];
      setLibraryItems(updated);
      await savePurchaseLibraryToCloud(updated);
      showToast(`Item "${newItem.title}" adicionado à lista de compras!`);
      resetForm();
    }
  };

  const handleEditClick = (item: PurchaseProductData) => {
    setEditingId(item.id);
    setFormTitle(item.title || '');
    setFormUrl(item.url || '');
    setFormPrice(item.price ? item.price.toString() : '');
    setFormCategory(item.categoryName || DEFAULT_PURCHASE_CATEGORIES[0]);
    setFormImageUrl(item.imageUrl || '');
    setFormNotes(item.notes || '');

    const container = document.getElementById('purchase-modal-scroll-area');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormTitle('');
    setFormUrl('');
    setFormPrice('');
    setFormCategory(allCategories[0] || DEFAULT_PURCHASE_CATEGORIES[0]);
    setFormImageUrl('');
    setFormNotes('');
  };

  const handleToggleFavorite = async (id: string) => {
    const updated = safeItems.map(item => 
      item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
    );
    setLibraryItems(updated);
    await savePurchaseLibraryToCloud(updated);
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este item da lista de compras?')) return;
    const updated = safeItems.filter(item => item.id !== id);
    setLibraryItems(updated);
    await savePurchaseLibraryToCloud(updated);
    showToast('Item removido da lista de compras.');

    if (editingId === id) {
      resetForm();
    }
  };

  // Filter items safely with null checks
  const filteredItems = safeItems.filter(item => {
    if (!item) return false;
    const titleStr = (item.title || '').toLowerCase();
    const catStr = (item.categoryName || '').toLowerCase();
    const notesStr = (item.notes || '').toLowerCase();
    const urlStr = (item.url || '').toLowerCase();
    const queryStr = (searchQuery || '').toLowerCase();

    const matchesSearch = titleStr.includes(queryStr) || catStr.includes(queryStr) || notesStr.includes(queryStr) || urlStr.includes(queryStr);
    const matchesCategory = selectedCategoryFilter === 'all' || item.categoryName === selectedCategoryFilter;
    const matchesFav = !filterFavoritesOnly || Boolean(item.isFavorite);

    return matchesSearch && matchesCategory && matchesFav;
  });

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
        {/* Modal Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl text-slate-950 shadow-md">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                  Biblioteca de Produtos para Compra
                </h2>
                <span className="text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold px-2.5 py-0.5 rounded-full">
                  {safeItems.length} {safeItems.length === 1 ? 'Item' : 'Itens'} para Compra
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Salve links, preços e fornecedores de materiais, ferragens e insumos que você precisa comprar.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div id="purchase-modal-scroll-area" className="flex-1 overflow-y-auto p-4 space-y-5">
          
          {/* Top Form: Registration / Edit */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm uppercase tracking-wider">
                {editingId ? (
                  <>
                    <Edit2 size={16} className="text-emerald-400" />
                    <span>Alterar Item de Compra</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} className="text-emerald-400" />
                    <span>Cadastrar Novo Produto para Compra</span>
                  </>
                )}
              </div>

              {/* Category Management Bar at the Top */}
              <div className="flex items-center gap-2">
                {!isAddingCategory ? (
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(true)}
                    className="text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-300 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    title="Cadastrar uma nova categoria na lista de compras"
                  >
                    <FolderPlus size={14} className="text-emerald-400" />
                    <span>+ Nova Categoria</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-slate-900 border border-emerald-500/60 p-1 rounded-lg animate-fadeIn">
                    <input
                      type="text"
                      placeholder="Nome da categoria..."
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCategory();
                        }
                      }}
                      className="bg-slate-950 border border-slate-750 px-2 py-1 text-xs text-slate-100 rounded focus:outline-none focus:border-emerald-400 w-44"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold px-2.5 py-1 rounded transition-colors cursor-pointer"
                    >
                      Cadastrar
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingCategory(false)}
                      className="text-slate-400 hover:text-slate-200 text-xs p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              {/* Main Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                {/* Nome do Produto (5 cols) */}
                <div className="lg:col-span-5 space-y-1">
                  <label className="text-[11px] uppercase font-bold text-slate-300 block">
                    Nome do Produto <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Corrediça Telescópica 45cm 45kg Reforçada"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    required
                    className="bg-slate-900 border border-slate-800 text-slate-100 p-2.5 rounded-lg w-full focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>

                {/* Categoria para Selecionar da Lista (4 cols) */}
                <div className="lg:col-span-4 space-y-1">
                  <label className="text-[11px] uppercase font-bold text-slate-300 block">
                    Categoria da Lista <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-emerald-300 font-semibold p-2.5 rounded-lg w-full focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer pr-8"
                    >
                      {allCategories.map(cat => (
                        <option key={cat} value={cat} className="bg-slate-900 text-slate-100">
                          📦 {cat}
                        </option>
                      ))}
                    </select>
                    <Tag className="w-4 h-4 text-emerald-400 absolute right-2.5 top-3 pointer-events-none" />
                  </div>
                </div>

                {/* Valor de Compra (R$) (3 cols) */}
                <div className="lg:col-span-3 space-y-1">
                  <label className="text-[11px] uppercase font-bold text-slate-300 block">
                    Valor de Compra (R$)
                  </label>
                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 focus-within:border-emerald-500">
                    <span className="text-emerald-400 font-bold font-mono mr-1">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={formPrice}
                      onChange={e => setFormPrice(e.target.value)}
                      className="bg-transparent text-emerald-300 font-mono font-bold p-1.5 w-full focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Second Row: Link and Foto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                {/* Link do Produto (6 cols) */}
                <div className="lg:col-span-6 space-y-1">
                  <label className="text-[11px] uppercase font-bold text-slate-300 flex items-center gap-1">
                    <LinkIcon size={12} className="text-emerald-400" />
                    <span>Link do Produto / Loja / Mercado Livre:</span>
                  </label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={formUrl}
                    onChange={e => setFormUrl(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-slate-200 p-2.5 rounded-lg w-full focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                  />
                </div>

                {/* Foto do Produto (Upload ou URL) (6 cols) */}
                <div className="lg:col-span-6 space-y-1">
                  <label className="text-[11px] uppercase font-bold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <ImageIcon size={12} className="text-emerald-400" />
                      <span>Foto do Produto (Arquivo ou URL):</span>
                    </span>
                    {formImageUrl && (
                      <button
                        type="button"
                        onClick={() => setFormImageUrl('')}
                        className="text-red-400 hover:underline text-[10px] lowercase"
                      >
                        [remover foto]
                      </button>
                    )}
                  </label>

                  <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                    <div className="w-10 h-10 shrink-0 rounded-lg border border-slate-750 bg-slate-900 overflow-hidden flex items-center justify-center" title="Prévia da Foto">
                      {formImageUrl ? (
                        <img src={formImageUrl} alt="Prévia" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={18} className="text-slate-600" />
                      )}
                    </div>

                    {/* Upload File Input Button */}
                    <label className="bg-slate-900 hover:bg-slate-800 border border-slate-750 text-slate-300 font-semibold px-2.5 py-2 rounded-lg flex items-center gap-1 cursor-pointer whitespace-nowrap text-xs transition-colors shrink-0" title="Escolher arquivo de imagem do computador">
                      <Upload size={13} className="text-emerald-400" />
                      <span>Arquivo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        className="hidden"
                      />
                    </label>

                    {/* Screen Capture Button */}
                    <button
                      type="button"
                      onClick={handleScreenCapture}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-750 text-slate-300 font-semibold px-2.5 py-2 rounded-lg flex items-center gap-1 whitespace-nowrap text-xs transition-colors shrink-0 cursor-pointer"
                      title="Tirar print/captura da tela inteira ou janela"
                    >
                      <Camera size={13} className="text-emerald-400" />
                      <span>Print</span>
                    </button>

                    {/* Paste from Clipboard Button */}
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-750 text-slate-300 font-semibold px-2.5 py-2 rounded-lg flex items-center gap-1 whitespace-nowrap text-xs transition-colors shrink-0 cursor-pointer"
                      title="Colar print cortado com Win+Shift+S (ou aperte Ctrl+V no formulário)"
                    >
                      <ClipboardCheck size={13} className="text-emerald-400" />
                      <span>Colar (Ctrl+V)</span>
                    </button>

                    <input
                      type="text"
                      placeholder="ou cole URL da imagem..."
                      value={formImageUrl}
                      onChange={e => setFormImageUrl(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded-lg w-full focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                    />
                  </div>
                </div>
              </div>

              {/* Third Row: Observações */}
              <div className="space-y-1">
                <label className="text-[11px] uppercase font-bold text-slate-300 flex items-center gap-1">
                  <FileText size={12} className="text-emerald-400" />
                  <span>Observação / Detalhes do Fornecedor / Frete:</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Fornecedor Madeiranit, frete grátis acima de R$ 300, marca Hafele..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-200 p-2.5 rounded-lg w-full focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-900">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Cancelar Edição
                  </button>
                )}
                <button
                  type="submit"
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black px-5 py-2.5 rounded-lg text-xs flex items-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  {editingId ? (
                    <>
                      <Check size={16} />
                      <span>Salvar Alterações</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Adicionar à Lista de Compras</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 sm:flex-initial min-w-[240px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, marca ou observação..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-3 py-2 w-full focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Category Filter Dropdown */}
              <select
                value={selectedCategoryFilter}
                onChange={e => setSelectedCategoryFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">Todas as Categorias ({safeItems.length})</option>
                {allCategories.map(cat => {
                  const count = safeItems.filter(i => i && i.categoryName === cat).length;
                  return (
                    <option key={cat} value={cat}>
                      {cat} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setFilterFavoritesOnly(!filterFavoritesOnly)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  filterFavoritesOnly
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Star size={14} className={filterFavoritesOnly ? 'fill-emerald-400 text-emerald-400' : ''} />
                <span>Apenas Favoritos ⭐</span>
              </button>
            </div>
          </div>

          {/* Horizontal List Table (One Row Per Product) */}
          <div className="space-y-2">
            {filteredItems.length === 0 ? (
              <div className="bg-slate-950 border border-dashed border-slate-800 rounded-xl p-12 text-center text-slate-500 space-y-3">
                <ShoppingCart className="w-10 h-10 mx-auto text-slate-600" />
                <h3 className="text-sm font-bold text-slate-300">Nenhum item na lista de compras</h3>
                <p className="text-xs max-w-md mx-auto">
                  Cadastre seus materiais, ferragens e links de fornecedores acima para organizar suas compras.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Column Headers (Desktop) */}
                <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-850">
                  <div className="col-span-1 text-center">Foto</div>
                  <div className="col-span-4">Produto para Compra</div>
                  <div className="col-span-2">Categoria</div>
                  <div className="col-span-2">Valor de Compra</div>
                  <div className="col-span-3 text-right">Ações</div>
                </div>

                {/* Horizontal Product Rows */}
                {filteredItems.map(item => {
                  const itemPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price || '0') || 0;
                  return (
                    <div
                      key={item.id}
                      className={`bg-slate-950 border p-3 rounded-xl transition-all flex flex-col lg:grid lg:grid-cols-12 gap-3 items-center ${
                        item.isFavorite
                          ? 'border-emerald-500/60 bg-gradient-to-r from-emerald-950/20 via-slate-950 to-slate-950 shadow-sm'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Col 1: Thumbnail & Favorite */}
                      <div className="w-full lg:w-auto lg:col-span-1 flex items-center justify-between lg:justify-center gap-2">
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 shrink-0">
                          <img
                            src={item.imageUrl || 'https://images.unsplash.com/photo-1581783898377-1c85bf937427?w=500&auto=format&fit=crop&q=60'}
                            alt={item.title || 'Item de compra'}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(item.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer lg:hidden ${
                            item.isFavorite ? 'text-emerald-400' : 'text-slate-600 hover:text-slate-300'
                          }`}
                        >
                          <Star size={16} className={item.isFavorite ? 'fill-emerald-400' : ''} />
                        </button>
                      </div>

                      {/* Col 2: Title, Link & Notes */}
                      <div className="w-full lg:col-span-4 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-100 line-clamp-1" title={item.title}>
                            {item.title || 'Item sem nome'}
                          </h4>
                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(item.id)}
                            className={`hidden lg:inline-block p-0.5 rounded transition-colors cursor-pointer ${
                              item.isFavorite ? 'text-emerald-400' : 'text-slate-600 hover:text-slate-300'
                            }`}
                            title={item.isFavorite ? 'Remover dos favoritos' : 'Favoritar item de compra'}
                          >
                            <Star size={14} className={item.isFavorite ? 'fill-emerald-400' : ''} />
                          </button>
                        </div>

                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1 hover:underline truncate max-w-full font-mono"
                            title={item.url}
                          >
                            <ExternalLink size={11} />
                            <span className="truncate">{item.url}</span>
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-600 italic">Sem link cadastrado</span>
                        )}

                        {item.notes && (
                          <p className="text-[10px] text-slate-400 bg-slate-900/90 border border-slate-800 px-2 py-0.5 rounded line-clamp-1 font-sans">
                            📝 <span className="font-semibold text-slate-300">Obs:</span> {item.notes}
                          </p>
                        )}
                      </div>

                      {/* Col 3: Category Badge */}
                      <div className="w-full lg:col-span-2 flex items-center">
                        <span className="bg-slate-900 border border-slate-800 text-emerald-300 text-[11px] font-semibold px-2.5 py-1 rounded-md inline-flex items-center gap-1 max-w-full truncate">
                          <Tag size={12} className="text-emerald-400 shrink-0" />
                          <span className="truncate">{item.categoryName || 'Geral / Outros'}</span>
                        </span>
                      </div>

                      {/* Col 4: Price */}
                      <div className="w-full lg:col-span-2 flex items-center justify-between lg:justify-start">
                        <span className="lg:hidden text-[11px] text-slate-400 font-semibold">Valor Compra:</span>
                        <span className="text-emerald-400 font-extrabold font-mono text-sm">
                          R$ {itemPrice.toFixed(2).replace('.', ',')}
                        </span>
                      </div>

                      {/* Col 5: Action Buttons */}
                      <div className="w-full lg:col-span-3 flex items-center justify-end gap-1.5 pt-2 lg:pt-0 border-t lg:border-0 border-slate-900">
                        {onImportToProject && (
                          <button
                            type="button"
                            onClick={() => {
                              onImportToProject(item);
                              showToast(`"${item.title}" lançado nos insumos do projeto!`);
                            }}
                            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-2 py-1 rounded text-[11px] transition-all cursor-pointer whitespace-nowrap"
                            title="Lançar preço como insumo no projeto ativo"
                          >
                            Usar no Projeto
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleEditClick(item)}
                          className="bg-slate-900 hover:bg-slate-800 border border-slate-750 text-slate-200 hover:text-emerald-300 font-semibold px-2.5 py-1 rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                          title="Alterar dados do item de compra"
                        >
                          <Edit2 size={12} />
                          <span>Alterar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="bg-slate-900 hover:bg-red-950/40 border border-slate-800 hover:border-red-800/50 text-slate-400 hover:text-red-400 p-1.5 rounded transition-colors cursor-pointer"
                          title="Excluir item da lista de compras"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
