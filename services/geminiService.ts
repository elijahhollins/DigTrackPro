
import { GoogleGenAI, Type } from "@google/genai";

export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const isMedia = typeof input !== 'string';
    const parts = isMedia 
      ? [{ inlineData: input }, { text: "Extract locate ticket info. Return JSON." }]
      : [{ text: `Extract locate ticket info. Return JSON.\n\nText:\n"${input}"` }];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            jobNumber: { type: Type.STRING },
            ticketNo: { type: Type.STRING },
            address: { type: Type.STRING },
            county: { type: Type.STRING },
            city: { type: Type.STRING },
            state: { type: Type.STRING },
            callInDate: { type: Type.STRING },
            digStart: { type: Type.STRING },
            expirationDate: { type: Type.STRING },
            siteContact: { type: Type.STRING },
          },
          required: ["ticketNo"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
};
