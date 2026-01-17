
import { GoogleGenAI, Type } from "@google/genai";
import { getEnv } from "../lib/supabaseClient.ts";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 * Uses gemini-3-flash-preview for fast and accurate extraction of ticket metadata.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  const apiKey = getEnv('API_KEY');
  
  if (!apiKey) {
    console.error("[Gemini] API_KEY not found. Ensure VITE_API_KEY is set in Vercel.");
    throw new Error("CONFIGURATION ERROR: API Key is not configured. Please check your environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const isMedia = typeof input !== 'string';
    const promptText = isMedia 
      ? `ACT: Professional Construction Document Processor.
         TASK: Extract precise metadata from this 811 Locate Ticket.
         FIELDS: ticketNo, jobNumber, address, county, city, state, callInDate, digStart, expirationDate.`
      : `Extract locate ticket info from this text. Ensure dates are YYYY-MM-DD.\n\n"${input}"`;

    const parts = isMedia 
      ? [{ inlineData: input as { data: string; mimeType: string } }, { text: promptText }]
      : [{ text: promptText }];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts },
      config: {
        systemInstruction: "You are a specialized 811 locate ticket parser. Return only valid JSON. Be extremely precise with ticket numbers and dates (YYYY-MM-DD).",
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
          required: ["ticketNo", "address"],
          propertyOrdering: ["jobNumber", "ticketNo", "address", "county", "city", "state", "callInDate", "digStart", "expirationDate", "siteContact"]
        },
        temperature: 0.1,
      }
    });

    const jsonStr = response.text?.trim() || "{}";
    const result = JSON.parse(jsonStr);
    return result;
  } catch (error: any) {
    console.error("[Gemini] Parsing Error:", error);
    
    if (error.message?.includes("API key not valid")) {
      throw new Error("INVALID KEY: The API key provided is not valid or has been restricted incorrectly.");
    }
    
    throw new Error(error.message || "Document analysis failed.");
  }
};
