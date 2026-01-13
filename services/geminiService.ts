
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 * Uses gemini-3-flash-preview for fast and accurate extraction of ticket metadata.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // Always initialize GoogleGenAI with a fresh instance inside the service 
  // to ensure it uses the latest API key from the environment.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
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

    // Use ai.models.generateContent to query the model with both name and prompt
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

    // Extract text from the response using the .text property (not a method)
    const jsonStr = response.text?.trim() || "{}";
    const result = JSON.parse(jsonStr);
    console.log("[Gemini Service] Extraction success:", result);
    return result;
  } catch (error: any) {
    console.error("[Gemini Service] API Call Error:", error);
    
    // Standardized error handling for model access
    if (error.message?.includes("entity was not found") || error.message?.includes("404")) {
      throw new Error("ACCESS ERROR: Gemini 3 model access failed. Please ensure the API is enabled in your Google Cloud Project.");
    }
    throw new Error(error.message || "Analysis failed.");
  }
};
