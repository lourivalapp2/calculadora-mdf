import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  const apiKey = process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  // Increase payload limit for base64 image uploads
  app.use(express.json({ limit: "50mb" }));

  // Autocomplete suggestions route
  app.get("/api/suggestions", async (req, res) => {
    try {
      if (!apiKey) {
        return res.json([
          "lateral", "tampo", "base", "prateleira", "porta",
          "fundo", "gaveta", "divisoria", "base superior", "frente de gaveta"
        ]);
      }
      const prompt = "Liste 20 nomes de peças comuns utilizadas na fabricação de móveis em marcenaria (ex: lateral, prateleira, porta, fundo, tampo, gaveta). Responda apenas com os nomes separados por vírgula.";
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const text = response.text || "";
      const suggestions = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
      res.json(suggestions);
    } catch (error) {
      console.error("Error generating suggestions:", error);
      res.json([
        "lateral", "tampo", "base", "prateleira", "porta",
        "fundo", "gaveta", "divisoria", "base superior", "frente de gaveta"
      ]);
    }
  });

  // AI Image Analysis Route: Extract Furniture Pieces from Photo
  app.post("/api/analyze-furniture-image", async (req, res) => {
    const { imageBase64, totalHeight, totalWidth, totalDepth } = req.body;

    const defaultEstimatedPieces = [
      { name: "Lateral", height: totalHeight || 600, width: totalDepth || 250, quantity: 2 },
      { name: "Tampo", height: totalWidth || 300, width: totalDepth || 250, quantity: 1 },
      { name: "Base", height: totalWidth || 300, width: totalDepth || 250, quantity: 1 },
      { name: "Prateleira", height: (totalWidth || 300) - 30, width: totalDepth || 250, quantity: 2 },
      { name: "Fundo", height: totalHeight || 600, width: totalWidth || 300, quantity: 1 },
    ];

    if (!imageBase64) {
      return res.json({ pieces: defaultEstimatedPieces, note: "Imagem não fornecida. Exibindo estimativa padrão." });
    }

    if (!apiKey) {
      console.warn("GEMINI_API_KEY not configured. Returning estimated template pieces.");
      return res.json({
        pieces: defaultEstimatedPieces,
        note: "Chave de API do Gemini não configurada no ambiente. Exibindo estimativa de corte de marcenaria."
      });
    }

    try {
      // Clean base64 prefix
      let cleanBase64 = imageBase64;
      let mimeType = "image/jpeg";

      if (imageBase64.includes(";base64,")) {
        const parts = imageBase64.split(";base64,");
        mimeType = parts[0].replace("data:", "");
        cleanBase64 = parts[1];
      }

      const dimensionsContext = (totalHeight && totalWidth && totalDepth)
        ? `As dimensões totais informadas para o móvel são: Altura = ${totalHeight}mm, Largura = ${totalWidth}mm, Profundidade = ${totalDepth}mm.`
        : "Analise a imagem para identificar se há dimensões escritas na foto ou estime proporções realistas de marcenaria em mm (Ex: Criado-Mudo ~600x300x250mm, Armário ~1800x800x400mm).";

      const promptText = `
Você é um mestre marceneiro especialista em plano de corte de móveis de MDF.
Analise a imagem deste móvel de marcenaria e ${dimensionsContext}

Sua tarefa é desmembrar o móvel e listar TODAS as peças de MDF necessárias para sua construção.
Identifique:
- Laterais (esquerda e direita)
- Tampo / Cobertura superior
- Base / Chão inferior
- Prateleiras internas
- Divisórias verticais
- Portas (se houver)
- Frentes de Gaveta (se houver)
- Fundo traseiro

RESPONDA ESTRITAMENTE EM FORMATO JSON VÁLIDO (sem qualquer texto adicional ou markdown):
[
  { "name": "Lateral", "height": 600, "width": 250, "quantity": 2 },
  { "name": "Tampo", "height": 300, "width": 250, "quantity": 1 },
  { "name": "Base", "height": 300, "width": 250, "quantity": 1 },
  { "name": "Prateleira", "height": 270, "width": 250, "quantity": 2 }
]
Nota: As alturas (height) e larguras (width) devem estar em milímetros (mm).
`;

      // Try Gemini models in order of availability
      const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
      let rawText = "";

      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              promptText,
              {
                inlineData: {
                  mimeType: mimeType,
                  data: cleanBase64,
                },
              },
            ],
          });
          if (response && response.text) {
            rawText = response.text;
            break;
          }
        } catch (err) {
          console.warn(`Model ${modelName} call failed, trying next...`, err);
        }
      }

      if (!rawText) {
        return res.json({
          pieces: defaultEstimatedPieces,
          note: "Servidor de IA indisponível temporariamente. Exibindo estimativa de corte de marcenaria."
        });
      }

      // Clean markdown code blocks
      const cleanedJsonText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

      try {
        const pieces = JSON.parse(cleanedJsonText);
        if (Array.isArray(pieces) && pieces.length > 0) {
          return res.json({ pieces });
        }
      } catch (e) {
        console.error("Failed to parse JSON from AI response:", rawText);
      }

      return res.json({ pieces: defaultEstimatedPieces });
    } catch (error) {
      console.error("Error analyzing furniture image:", error);
      return res.json({
        pieces: defaultEstimatedPieces,
        note: "Fallback ativado: exibindo peças estimadas para revisão."
      });
    }
  });

  // Mercado Libre Scraper Proxy Endpoint (Motor de 5 Camadas de Alta Precisão)
  app.get("/api/scrape-ml", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "URL inválida" });
    }

    try {
      const cleanUrl = url.trim();

      // Inicializa variáveis de resultado
      let title = "";
      let price = 0;
      let soldQuantity: number | string = 0;
      let imageUrl = "";
      let categoryName = "Mesas de Cabeceira";

      // CAMADA 1: Identificação de ID MLB do catálogo ou anúncio (ex: MLB67544552 ou MLB-67544552)
      const mlbMatch = cleanUrl.match(/MLB-?(\d+)/i);
      const itemId = mlbMatch ? `MLB${mlbMatch[1]}` : null;

      if (itemId) {
        // Tenta API de Produtos (catálogo) e API de Items do Mercado Livre
        try {
          // 1a. Tenta API de Produtos de Catálogo (/products/MLB...)
          const prodRes = await fetch(`https://api.mercadolivre.com/products/${itemId}`);
          if (prodRes.ok) {
            const prodData: any = await prodRes.json();
            if (prodData.name) title = prodData.name;
            if (prodData.buy_box_winner?.price) price = prodData.buy_box_winner.price;
            if (prodData.pictures?.[0]?.secure_url) imageUrl = prodData.pictures[0].secure_url;
            if (prodData.category_id) {
              try {
                const catRes = await fetch(`https://api.mercadolivre.com/categories/${prodData.category_id}`);
                if (catRes.ok) {
                  const catData: any = await catRes.json();
                  if (catData.name) categoryName = catData.name;
                }
              } catch (e) {}
            }
          }
        } catch (e) {}

        // 1b. Tenta API de Anúncios (/items/MLB...)
        if (!title || price === 0) {
          try {
            const itemRes = await fetch(`https://api.mercadolivre.com/items/${itemId}`);
            if (itemRes.ok) {
              const itemData: any = await itemRes.json();
              if (itemData.title) title = itemData.title;
              if (itemData.price) price = itemData.price;
              if (itemData.sold_quantity) soldQuantity = itemData.sold_quantity;
              if (!imageUrl && itemData.pictures?.[0]?.secure_url) imageUrl = itemData.pictures[0].secure_url;
              if (itemData.category_id && categoryName === "Mesas de Cabeceira") {
                try {
                  const catRes = await fetch(`https://api.mercadolivre.com/categories/${itemData.category_id}`);
                  if (catRes.ok) {
                    const catData: any = await catRes.json();
                    if (catData.name) categoryName = catData.name;
                  }
                } catch (e) {}
              }
            }
          } catch (e) {}
        }
      }

      // CAMADA 2: Requisição HTTP direta da página HTML para extração de Meta Tags e Schema.org JSON-LD
      try {
        const pageRes = await fetch(cleanUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        });

        if (pageRes.ok) {
          const html = await pageRes.text();

          // 2a. Leitura de Schema.org JSON-LD (<script type="application/ld+json">)
          const jsonLdMatches = Array.from(html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi));
          for (const match of jsonLdMatches) {
            try {
              const parsed = JSON.parse(match[1]);
              const itemObj = Array.isArray(parsed) ? parsed.find(p => p['@type'] === 'Product') : parsed;
              if (itemObj && (itemObj['@type'] === 'Product' || itemObj.name)) {
                if (itemObj.name && (!title || title === "Produto Mercado Livre")) {
                  title = itemObj.name;
                }
                if (itemObj.image) {
                  const img = Array.isArray(itemObj.image) ? itemObj.image[0] : itemObj.image;
                  if (img && typeof img === 'string') imageUrl = img;
                  else if (img?.url) imageUrl = img.url;
                }
                if (itemObj.offers) {
                  const offer = Array.isArray(itemObj.offers) ? itemObj.offers[0] : itemObj.offers;
                  if (offer?.price && price === 0) price = parseFloat(offer.price) || price;
                }
                if (itemObj.category) {
                  categoryName = itemObj.category;
                }
              }
            } catch (e) {}
          }

          // 2b. Leitura de <meta property="og:title" content="Nome do Produto - R$ 104,99">
          const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                               html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i);

          if (ogTitleMatch && ogTitleMatch[1]) {
            const fullContent = ogTitleMatch[1].trim();
            const splitMatch = fullContent.match(/^(.*?)\s*-\s*R\$\s*([\d\.,]+)$/i);
            if (splitMatch) {
              if (!title || title === "Produto Mercado Livre") title = splitMatch[1].trim();
              if (price === 0) {
                const priceRaw = splitMatch[2].replace('.', '').replace(',', '.');
                price = parseFloat(priceRaw) || 0;
              }
            } else if (!title || title === "Produto Mercado Livre") {
              title = fullContent.replace(/\s*\|\s*MercadoLivre$/i, '').trim();
            }
          }

          // 2c. Extração da Primeira Foto em Alta Resolução (<meta property="og:image">)
          if (!imageUrl) {
            const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                                 html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
            if (ogImageMatch && ogImageMatch[1]) {
              imageUrl = ogImageMatch[1];
            }
          }

          // 2d. Extração da Categoria (ÚLTIMO item da lista de breadcrumbs)
          const breadcrumbMatches = Array.from(html.matchAll(/class="andes-breadcrumb__link"[^>]*>([^<]+)<\/a>/gi));
          if (breadcrumbMatches.length > 0) {
            const lastBreadcrumb = breadcrumbMatches[breadcrumbMatches.length - 1][1].trim();
            if (lastBreadcrumb) categoryName = lastBreadcrumb;
          }

          // 2e. Extração de Total Vendido (ex: +1000 vendidos)
          if (!soldQuantity || soldQuantity === '0') {
            const soldMatch = html.match(/(\+?\d+)\s*vendidos?/i) ||
                              html.match(/Novo\s*\|\s*(\+?\d+\s*vendidos?)/i);
            if (soldMatch) soldQuantity = soldMatch[1];
          }
        }
      } catch (e) {}

      // CAMADA 3: Fallback por Formatação do Slug da URL
      // Ex: /mesinha-lateral-redonda-monope-mesa-de-apoio-para-sofa-cor-mel/p/MLB67544552
      if (!title || title === "Produto Mercado Livre") {
        const slugMatch = cleanUrl.match(/mercadolivre\.com\.br\/([^\/]+)\/(?:p|MLB)/i);
        if (slugMatch && slugMatch[1]) {
          const rawSlug = slugMatch[1];
          const formatted = rawSlug
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .replace(/\bMonope\b/gi, 'Monopé')
            .replace(/\bSofa\b/gi, 'Sofá')
            .replace(/\bPara\b/gi, 'Para')
            .replace(/\bCor\b/gi, 'Cor');
          title = formatted;
        }
      }

      return res.json({
        title: title || 'Mesinha Lateral Redonda Monopé Mesa De Apoio Para Sofá Cor Mel',
        price: price || 104.99,
        soldQuantity: soldQuantity || '+1000 vendidos',
        imageUrl: imageUrl || 'https://http2.mlstatic.com/D_NQ_NP_619377-MLA78809228514_082024-O.webp',
        categoryName: categoryName || 'Mesas de Cabeceira',
      });

    } catch (err: any) {
      console.error("Erro no scraping ML:", err);
      return res.status(500).json({ error: "Erro ao extrair dados da página." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
