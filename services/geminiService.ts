
import { GoogleGenAI, Type } from "@google/genai";

const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let lastError: any;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const isMedia = typeof input !== 'string';
      const parts = isMedia 
        ? [{ inlineData: input }, { text: "Extract locate ticket info from this document/image. Focus on finding the ticket number, job number, address, and key dates. Return JSON." }]
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
          },
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      return JSON.parse(response.text || '{}');
    } catch (error: any) {
      lastError = error;
      const isQuotaError = error.message?.includes('429') || error.message?.toLowerCase().includes('quota');
      const isServerError = error.message?.includes('500') || error.message?.includes('503');
      
      if (attempt < MAX_RETRIES - 1 && (isQuotaError || isServerError)) {
        const waitTime = INITIAL_DELAY * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`Gemini API issue. Retrying in ${Math.round(waitTime)}ms...`);
        await delay(waitTime);
        continue;
      }
      break;
    }
  }

  console.error("AI Error after retries:", lastError);
  throw lastError;
};
