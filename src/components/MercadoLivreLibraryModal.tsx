import React, { useState, useEffect } from 'react';
import { 
  X, Search, Star, ExternalLink, Trash2, Plus, Sparkles, 
  ShoppingBag, Tag, RefreshCw, Check, AlertCircle, Bookmark, Layers
} from 'lucide-react';
import { MlProductData, extractMlProductDetails } from '../lib/mlScraper';
import { fetchMlLibraryFromCloud, saveMlLibraryToCloud } from '../lib/supabase';

interface MercadoLivreLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportToProject?: (product: MlProductData) => void;
}

export const MercadoLivreLibraryModal: React.FC<MercadoLivreLibraryModalProps> = ({
  isOpen,
  onClose,
  onImportToProject,
}) => {
  const [libraryItems, setLibraryItems] = useState<MlProductData[]>([]);
  const [inputUrl, setInputUrl] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractedPreview, setExtractedPreview] = useState<MlProductData | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load Library from Supabase / localStorage on mount or open
  useEffect(() => {
    if (isOpen) {
      fetchMlLibraryFromCloud().then(items => {
        if (Array.isArray(items)) {
          setLibraryItems(items);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleExtract = async () => {
    if (!inputUrl.trim()) return;
    setIsExtracting(true);
    setExtractedPreview(null);
    try {
      const data = await extractMlProductDetails(inputUrl);
      setExtractedPreview(data);
      showToast('Dados extraídos com sucesso! Clique em "Salvar" para incluir na biblioteca.');
    } catch (e) {
      console.error('Erro ao extrair produto:', e);
      showToast('Não foi possível extrair dados automaticamente. Preencha os campos manualmente.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveExtracted = async () => {
    if (!extractedPreview) return;
    const exists = libraryItems.some(i => i.url === extractedPreview.url || (i.id && i.id === extractedPreview.id && i.id !== 'ml-'));
    if (exists) {
      showToast('Este produto já está cadastrado na sua biblioteca!');
      return;
    }

    const newItem: MlProductData = {
      ...extractedPreview,
      id: extractedPreview.id || `ml-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    const updated = [newItem, ...libraryItems];
    setLibraryItems(updated);
    await saveMlLibraryToCloud(updated);

    setExtractedPreview(null);
    setInputUrl('');
    showToast(`"${newItem.title}" salvo na biblioteca Mercado Livre!`);
  };

  const handleToggleFavorite = async (id: string) => {
    const updated = libraryItems.map(item => 
      item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
    );
    setLibraryItems(updated);
    await saveMlLibraryToCloud(updated);
  };

  const handleDeleteItem = async (id: string) => {
    const updated = libraryItems.filter(item => item.id !== id);
    setLibraryItems(updated);
    await saveMlLibraryToCloud(updated);
    showToast('Produto removido da biblioteca.');
  };

  // Get list of unique categories
  const categories = Array.from(new Set(libraryItems.map(i => i.categoryName || 'Geral / Outros')));

  // Filter items
  const filteredItems = libraryItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.url.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.categoryName === selectedCategory;
    const matchesFav = !filterFavoritesOnly || item.isFavorite;

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
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-yellow-500 to-amber-600 rounded-xl text-slate-950 shadow-md">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                  Biblioteca de Produtos Mercado Livre
                </h2>
                <span className="text-xs bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 font-bold px-2.5 py-0.5 rounded-full">
                  {libraryItems.length} {libraryItems.length === 1 ? 'Produto' : 'Produtos'} Cadastrados
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Garimpe links do Mercado Livre, extraia dados automaticamente e organize produtos campeões por categoria.
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

        {/* URL Input & Extractor Bar */}
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 space-y-3">
          <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={14} />
            <span>Colar Link do Mercado Livre para Extração Automática:</span>
          </label>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input
              type="text"
              placeholder="Cole a URL do produto aqui (ex: https://produto.mercadolivre.com.br/MLB-1234567...)"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleExtract();
              }}
              className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-slate-100 text-xs flex-1 focus:outline-none focus:border-amber-500 font-mono"
            />
            <button
              onClick={handleExtract}
              disabled={isExtracting || !inputUrl.trim()}
              className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50 whitespace-nowrap active:scale-95"
            >
              {isExtracting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Extraindo...</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>⚡ Extrair Dados</span>
                </>
              )}
            </button>
          </div>

          {/* Extracted Product Preview Card */}
          {extractedPreview && (
            <div className="bg-slate-900 border-2 border-yellow-500/80 p-4 rounded-xl space-y-3 shadow-xl animate-fadeIn">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-yellow-400 flex items-center gap-1 uppercase tracking-wide">
                  <Check size={14} /> Pré-visualização do Produto Extraído
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {extractedPreview.categoryName}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex gap-3 items-center flex-1 min-w-0">
                  {extractedPreview.imageUrl && (
                    <img
                      src={extractedPreview.imageUrl}
                      alt={extractedPreview.title}
                      className="w-16 h-16 object-cover rounded-lg border border-slate-800 shrink-0 bg-slate-950"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 className="text-sm font-bold text-slate-100 truncate" title={extractedPreview.title}>
                      {extractedPreview.title}
                    </h4>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-amber-400 font-extrabold text-sm">
                        R$ {extractedPreview.price ? extractedPreview.price.toFixed(2).replace('.', ',') : '0,00'}
                      </span>
                      <span className="bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded text-[11px]">
                        🛒 {extractedPreview.soldQuantity} vendidos
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleSaveExtracted}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Salvar na Biblioteca</span>
                  </button>
                  <button
                    onClick={() => setExtractedPreview(null)}
                    className="text-slate-400 hover:text-slate-200 p-2 rounded-lg"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filter Toolbar */}
        <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por nome ou categoria..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-2 w-full focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
            >
              <option value="all">Todas as Categorias ({libraryItems.length})</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat} ({libraryItems.filter(i => i.categoryName === cat).length})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterFavoritesOnly(!filterFavoritesOnly)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                filterFavoritesOnly
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <Star size={14} className={filterFavoritesOnly ? 'fill-amber-400 text-amber-400' : ''} />
              <span>Apenas Favoritos ⭐</span>
            </button>
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {filteredItems.length === 0 ? (
            <div className="bg-slate-950 border border-dashed border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-3">
              <ShoppingBag className="w-10 h-10 mx-auto text-slate-600" />
              <h3 className="text-sm font-bold text-slate-300">Nenhum produto encontrado</h3>
              <p className="text-xs max-w-md mx-auto">
                Cole a URL de anúncios do Mercado Livre acima para garimpar produtos e salvar na sua biblioteca.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className={`bg-slate-950 border p-4 rounded-xl space-y-3 transition-all relative flex flex-col justify-between ${
                    item.isFavorite
                      ? 'border-amber-500/70 bg-gradient-to-b from-amber-950/20 to-slate-950 shadow-md shadow-amber-500/5'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header Image & Favorite Star */}
                    <div className="relative rounded-lg overflow-hidden border border-slate-850 h-44 bg-slate-900 flex items-center justify-center">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => handleToggleFavorite(item.id)}
                        className={`absolute top-2 right-2 p-2 rounded-full backdrop-blur-md transition-all cursor-pointer ${
                          item.isFavorite
                            ? 'bg-amber-500 text-slate-950 shadow-lg scale-105'
                            : 'bg-slate-900/80 text-slate-400 hover:text-amber-400 hover:bg-slate-900'
                        }`}
                        title={item.isFavorite ? 'Remover dos favoritos' : 'Favoritar produto'}
                      >
                        <Star size={15} className={item.isFavorite ? 'fill-slate-950' : ''} />
                      </button>
                      <span className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md border border-slate-800 text-slate-300 text-[10px] font-mono font-semibold px-2 py-0.5 rounded truncate max-w-[85%]">
                        {item.categoryName}
                      </span>
                    </div>

                    {/* Product Name & Details */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 line-clamp-2 min-h-[2rem]" title={item.title}>
                        {item.title}
                      </h4>
                      <div className="flex justify-between items-baseline mt-2 font-mono">
                        <span className="text-amber-400 font-extrabold text-base">
                          R$ {item.price ? item.price.toFixed(2).replace('.', ',') : '0,00'}
                        </span>
                        <span className="text-[11px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                          🛒 {item.soldQuantity} vendidos
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 border-t border-slate-900 flex items-center justify-between gap-2 mt-3">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 hover:underline truncate"
                      title="Abrir anúncio original no Mercado Livre"
                    >
                      <ExternalLink size={12} />
                      <span>Abrir no ML</span>
                    </a>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onImportToProject && (
                        <button
                          onClick={() => {
                            onImportToProject(item);
                            showToast(`"${item.title}" importado para os concorrentes!`);
                          }}
                          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2.5 py-1 rounded text-[11px] transition-all cursor-pointer"
                          title="Importar preço e link para os preços concorrentes do projeto"
                        >
                          Usar no Projeto
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-slate-500 hover:text-red-400 p-1.5 rounded transition-colors"
                        title="Excluir produto da biblioteca"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
