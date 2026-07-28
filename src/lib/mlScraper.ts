export interface MlProductData {
  id: string;
  url: string;
  title: string;
  price: number;
  soldQuantity: number | string;
  imageUrl: string;
  categoryName: string;
  categoryId?: string;
  isFavorite?: boolean;
  createdAt: string;
}

export interface PurchaseProductData {
  id: string;
  url: string;
  title: string;
  price: number;
  categoryName: string;
  imageUrl?: string;
  notes?: string;
  isFavorite?: boolean;
  createdAt: string;
}


/**
 * Extracts Mercado Libre Item ID (MLB...) from a URL string
 */
export function extractMlItemId(url: string): string | null {
  if (!url) return null;
  // Match MLB followed by numbers (e.g., MLB1234567890 or MLB-1234567890)
  const match = url.match(/MLB-?(\d+)/i);
  if (match && match[1]) {
    return `MLB${match[1]}`;
  }
  return null;
}

/**
 * Fetches product metadata from Mercado Libre API
 */
export async function extractMlProductDetails(url: string): Promise<MlProductData> {
  const cleanUrl = url.trim();
  const itemId = extractMlItemId(cleanUrl);

  let title = 'Produto Mercado Livre';
  let price = 0;
  let soldQuantity: number | string = '0';
  let imageUrl = '';
  let categoryName = 'Geral / Outros';
  let categoryId = '';

  // 1. Tenta extrair via rota proxy /api/scrape-ml que possui parser completo de HTML og:title, og:image e breadcrumbs
  try {
    const proxyRes = await fetch(`/api/scrape-ml?url=${encodeURIComponent(cleanUrl)}`);
    if (proxyRes.ok) {
      const proxyData = await proxyRes.json();
      if (proxyData.title) title = proxyData.title;
      if (proxyData.price) price = proxyData.price;
      if (proxyData.soldQuantity) soldQuantity = proxyData.soldQuantity;
      if (proxyData.imageUrl) imageUrl = proxyData.imageUrl;
      if (proxyData.categoryName) categoryName = proxyData.categoryName;
    }
  } catch (e) {
    console.warn('Erro ao chamar proxy /api/scrape-ml:', e);
  }

  // 2. Se título ou dados ainda estiverem genéricos, tenta API pública do Mercado Livre
  if (itemId && (title === 'Produto Mercado Livre' || price === 0)) {
    try {
      const itemRes = await fetch(`https://api.mercadolivre.com/items/${itemId}`);
      if (itemRes.ok) {
        const itemData = await itemRes.json();
        
        if (title === 'Produto Mercado Livre') title = itemData.title || title;
        if (price === 0) price = typeof itemData.price === 'number' ? itemData.price : parseFloat(itemData.price || '0');
        if (!soldQuantity || soldQuantity === '0') soldQuantity = itemData.sold_quantity !== undefined ? itemData.sold_quantity : 0;
        
        if (!imageUrl) {
          if (itemData.pictures && itemData.pictures.length > 0) {
            imageUrl = itemData.pictures[0].secure_url || itemData.pictures[0].url || '';
          } else if (itemData.thumbnail) {
            imageUrl = itemData.thumbnail.replace('-I.jpg', '-O.jpg').replace('http://', 'https://');
          }
        }

        if (itemData.category_id && categoryName === 'Geral / Outros') {
          categoryId = itemData.category_id;
          try {
            const catRes = await fetch(`https://api.mercadolivre.com/categories/${itemData.category_id}`);
            if (catRes.ok) {
              const catData = await catRes.json();
              if (catData.name) {
                categoryName = catData.name;
              }
            }
          } catch (catErr) {}
        }
      }
    } catch (err) {}
  }

  return {
    id: itemId || `ml-${Date.now()}`,
    url: cleanUrl,
    title,
    price,
    soldQuantity,
    imageUrl: imageUrl || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&auto=format&fit=crop&q=60',
    categoryName,
    categoryId,
    isFavorite: false,
    createdAt: new Date().toISOString(),
  };
}
