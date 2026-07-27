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
