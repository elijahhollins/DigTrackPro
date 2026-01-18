
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // STRICT GUIDELINE: Use process.env.API_KEY directly as a literal string.
  // This ensures Vite's static replacement works correctly.
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("API_KEY is not configured in the environment.");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const isMedia = typeof input !== 'string';
    const promptText = isMedia 
      ? `ACT: Professional Construction Document Processor.
         TASK: Extract precise metadata from this 811 Locate Ticket.
         FIELDS: ticketNo, jobNumber, street, extent, county, city, state, callInDate, workDate, expires.`
      : `Extract locate ticket info from this text. Ensure dates are YYYY-MM-DD.\n\n"${input}"`;

    const parts = isMedia 
      ? [{ inlineData: input as { data: string; mimeType: string } }, { text: promptText }]
      : [{ text: promptText }];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts },
      config: {
        systemInstruction: "You are a specialized 811 locate ticket parser. Return only valid JSON. Be extremely precise with ticket numbers and dates (YYYY-MM-DD). The 'extent' field should describe the work area/boundaries mentioned in the ticket.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            jobNumber: { type: Type.STRING },
            ticketNo: { type: Type.STRING },
            street: { type: Type.STRING },
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
          propertyOrdering: ["jobNumber", "ticketNo", "street", "extent", "county", "city", "state", "callInDate", "workDate", "expires", "siteContact"]
        },
        temperature: 0.1,
      }
    });

    const jsonStr = response.text?.trim() || "{}";
    return JSON.parse(jsonStr);
  } catch (error: any) {
    console.error("[Gemini] Parsing Error:", error);
    throw new Error(error.message || "Document analysis failed.");
  }
};