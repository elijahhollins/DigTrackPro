
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 * Uses gemini-3-flash-preview for fast and accurate extraction of ticket metadata.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // CRITICAL: Always initialize GoogleGenAI immediately before making an API call 
  // to ensure it uses the most up-to-date API key injected into process.env.
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.error("[Gemini] API_KEY not found in process.env");
    throw new Error("API KEY MISSING: Ensure you have linked a Google Cloud project with the 'Connect AI' button.");
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
    console.log("[Gemini] Extraction successful.", result);
    return result;
  } catch (error: any) {
    console.error("[Gemini] Extraction failed:", error);
    
    if (error.message?.includes("entity was not found") || error.message?.includes("404")) {
      throw new Error("ACCESS ERROR: Gemini 3 is not enabled in your Google Cloud Project. Please enable the 'Generative AI API'.");
    }
    throw new Error(error.message || "Document analysis failed.");
  }
};
