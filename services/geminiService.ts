
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 * This service extracts structured metadata from 811 locate tickets (text or media).
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // Always use a new GoogleGenAI instance with process.env.API_KEY as per guidelines.
  // The API key is managed externally and injected into the process environment.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const isMedia = typeof input !== 'string';
    const promptText = isMedia 
      ? `ACT: Professional Construction Document Processor.
         TASK: Extract precise metadata from this 811 Locate Ticket image/PDF.
         FIELDS: ticketNo, jobNumber, street, crossStreet, place, extent, county, city, state, callInDate, workDate, expires, siteContact.
         INSTRUCTION: Specifically identify State, County, Place, and Cross St fields. Ensure dates are in YYYY-MM-DD format. If a field is missing, return "".`
      : `Extract structured locate ticket info from this text. Look specifically for State, County, Place, and Cross St. Ensure dates are YYYY-MM-DD.\n\n"${input}"`;

    const parts = isMedia 
      ? [{ inlineData: input as { data: string; mimeType: string } }, { text: promptText }]
      : [{ text: promptText }];

    // Using gemini-3-flash-preview for high speed and consistent compatibility across all API key tiers.
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts },
      config: {
        systemInstruction: "You are a specialized 811 locate ticket parser. Return ONLY valid JSON. Be extremely precise with ticket numbers, locations (State, County, Place, Cross St), and dates (YYYY-MM-DD). The 'extent' field should describe the specific work area boundaries mentioned in the document.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            jobNumber: { type: Type.STRING },
            ticketNo: { type: Type.STRING },
            street: { type: Type.STRING },
            crossStreet: { type: Type.STRING },
            place: { type: Type.STRING },
            extent: { type: Type.STRING },
            county: { type: Type.STRING },
            city: { type: Type.STRING },
            state: { type: Type.STRING },
            callInDate: { type: Type.STRING },
            workDate: { type: Type.STRING },
            expires: { type: Type.STRING },
            siteContact: { type: Type.STRING },
          },
          required: ["ticketNo", "street", "workDate", "expires"],
        },
        temperature: 0,
      }
    });

    // Access the .text property directly as it is a property, not a method.
    const jsonStr = response.text?.trim() || "{}";
    return JSON.parse(jsonStr);
  } catch (error: any) {
    console.error("[Gemini] Extraction Failure:", error);
    throw new Error(error.message || "AI Analysis failed. Check if API Key is configured.");
  }
};
