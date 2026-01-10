
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
      
      const promptText = isMedia 
        ? `Analyze this construction locate ticket (811 ticket). 
           Extract the following fields accurately:
           - Ticket Number (the primary identifier)
           - Job Number (look for project codes or references)
           - Full Address (including City/ST/County)
           - Call-in Date (when the ticket was created)
           - Dig Start Date (the legal start date)
           - Expiration Date (when the markings expire)
           - Site Contact (name of the person on site)`
        : `Extract locate ticket info from the following text block. 
           Look for labels like "Ticket#", "Job#", "Work Address", "Start Date", and "Expiration".
           \n\nText Content:\n"${input}"`;

      const parts = isMedia 
        ? [{ inlineData: input }, { text: promptText }]
        : [{ text: promptText }];

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview", // Upgraded to Pro for complex extraction
        contents: { parts },
        config: {
          systemInstruction: "You are an expert construction document auditor specialized in 811 Locate Tickets. Your goal is to extract structured metadata from ticket scans and text. Be precise with dates (format YYYY-MM-DD). If a field is ambiguous, use your best judgment based on typical industry standards for locate tickets.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              jobNumber: { type: Type.STRING, description: "Internal project number or reference" },
              ticketNo: { type: Type.STRING, description: "The unique 811 ticket number" },
              address: { type: Type.STRING, description: "Full street address" },
              county: { type: Type.STRING },
              city: { type: Type.STRING },
              state: { type: Type.STRING },
              callInDate: { type: Type.STRING, description: "YYYY-MM-DD" },
              digStart: { type: Type.STRING, description: "YYYY-MM-DD" },
              expirationDate: { type: Type.STRING, description: "YYYY-MM-DD" },
              siteContact: { type: Type.STRING },
            },
            // Removed strict required to prevent total failure on partial documents
          },
          temperature: 0.1, // Low temperature for higher accuracy in extraction
        }
      });

      const extracted = JSON.parse(response.text || '{}');
      console.log("AI Extraction Results:", extracted);
      return extracted;
    } catch (error: any) {
      lastError = error;
      const isQuotaError = error.message?.includes('429') || error.message?.toLowerCase().includes('quota');
      const isServerError = error.message?.includes('500') || error.message?.includes('503');
      
      if (attempt < MAX_RETRIES - 1 && (isQuotaError || isServerError)) {
        const waitTime = INITIAL_DELAY * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`Gemini API issue (Attempt ${attempt + 1}). Retrying in ${Math.round(waitTime)}ms...`);
        await delay(waitTime);
        continue;
      }
      break;
    }
  }

  console.error("AI Error after retries:", lastError);
  throw lastError;
};
