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

  // Mercado Libre Scraper Proxy Endpoint (Alta Precisão)
  app.get("/api/scrape-ml", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "URL inválida" });
    }

    try {
      const cleanUrl = url.trim();

      // Fetch HTML directly from Mercado Livre
      const pageRes = await fetch(cleanUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });

      if (!pageRes.ok) {
        return res.status(500).json({ error: "Não foi possível acessar o anúncio do Mercado Livre" });
      }

      const html = await pageRes.text();

      // 1. Extração Precisa de Título e Preço via <meta property="og:title" content="...">
      // Exemplo no código do site: content="Mesinha Lateral Redonda Monopé Mesa De Apoio Para Sofá Cor Mel - R$ 104,99"
      let title = "";
      let price = 0;

      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                           html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i);

      if (ogTitleMatch && ogTitleMatch[1]) {
        const fullContent = ogTitleMatch[1].trim();
        // Verifica se contém " - R$ " dividindo Nome do Produto e Preço
        const splitMatch = fullContent.match(/^(.*?)\s*-\s*R\$\s*([\d\.,]+)$/i);
        if (splitMatch) {
          title = splitMatch[1].trim();
          const priceRaw = splitMatch[2].replace('.', '').replace(',', '.');
          price = parseFloat(priceRaw) || 0;
        } else {
          title = fullContent.replace(/\s*\|\s*MercadoLivre$/i, '').trim();
        }
      }

      // Fallback de Título se og:title falhar
      if (!title) {
        const h1Match = html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                        html.match(/<title>([^<]+)<\/title>/i);
        if (h1Match) {
          title = h1Match[1].replace(/\s*\|\s*MercadoLivre$/i, '').trim();
        }
      }

      // Fallback de Preço se não foi extraído do og:title
      if (price === 0) {
        const priceMetaMatch = html.match(/<meta\s+property="product:price:amount"\content="([^"]+)"/i) ||
                               html.match(/<meta\s+itemprop="price"\s+content="([^"]+)"/i) ||
                               html.match(/"price"\s*:\s*([\d\.]+)/i);
        if (priceMetaMatch) {
          price = parseFloat(priceMetaMatch[1]) || 0;
        }
      }

      // 2. Extração da Primeira Foto do Produto (Foto Principal em alta resolução)
      let imageUrl = "";
      const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                            html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
      if (ogImageMatch && ogImageMatch[1]) {
        imageUrl = ogImageMatch[1];
      }

      // 3. Extração da Categoria (Sempre o ÚLTIMO item da lista de breadcrumbs)
      // Ex: Casa, Móveis e Decoração > Móveis para Casa > Mesas de Cabeceira -> "Mesas de Cabeceira"
      let categoryName = "Móveis para Casa";
      const breadcrumbMatches = Array.from(html.matchAll(/class="andes-breadcrumb__link"[^>]*>([^<]+)<\/a>/gi));
      if (breadcrumbMatches.length > 0) {
        const lastBreadcrumb = breadcrumbMatches[breadcrumbMatches.length - 1][1].trim();
        if (lastBreadcrumb) {
          categoryName = lastBreadcrumb;
        }
      } else {
        // Tenta regex alternativa de breadcrumb
        const altBreadcrumbMatches = Array.from(html.matchAll(/itemprop="name"[^>]*>([^<]+)<\/span>/gi));
        if (altBreadcrumbMatches.length > 0) {
          const lastItem = altBreadcrumbMatches[altBreadcrumbMatches.length - 1][1].trim();
          if (lastItem && !lastItem.toLowerCase().includes('mercado livre')) {
            categoryName = lastItem;
          }
        }
      }

      // 4. Extração de Total Vendido (ex: +1000 vendidos)
      let soldQuantity: number | string = 0;
      const soldMatch = html.match(/(\+?\d+)\s*vendidos?/i) ||
                        html.match(/Novo\s*\|\s*(\+?\d+\s*vendidos?)/i) ||
                        html.match(/"sold_quantity"\s*:\s*(\d+)/i);
      if (soldMatch) {
        soldQuantity = soldMatch[1];
      }

      // 5. Caso itemId MLB esteja presente, podemos complementar via API oficial do ML
      const mlbMatch = cleanUrl.match(/MLB-?(\d+)/i);
      if (mlbMatch && mlbMatch[1]) {
        const itemId = `MLB${mlbMatch[1]}`;
        try {
          const itemRes = await fetch(`https://api.mercadolivre.com/items/${itemId}`);
          if (itemRes.ok) {
            const apiData: any = await itemRes.json();
            if (!title || title === "Produto Mercado Livre") title = apiData.title || title;
            if (price === 0) price = apiData.price || price;
            if (!soldQuantity) soldQuantity = apiData.sold_quantity || 0;
            if (!imageUrl && apiData.pictures?.[0]?.secure_url) {
              imageUrl = apiData.pictures[0].secure_url;
            }
            if (apiData.category_id) {
              try {
                const catRes = await fetch(`https://api.mercadolivre.com/categories/${apiData.category_id}`);
                if (catRes.ok) {
                  const catData: any = await catRes.json();
                  if (catData.name) categoryName = catData.name;
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
      }

      return res.json({
        title: title || 'Produto Mercado Livre',
        price,
        soldQuantity: soldQuantity || '0',
        imageUrl: imageUrl || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&auto=format&fit=crop&q=60',
        categoryName,
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
