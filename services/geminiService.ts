
import { GoogleGenAI, Type } from "@google/genai";

// Instantiate at the module level to allow build-time replacement of process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  try {
    const isMedia = typeof input !== 'string';
    const promptText = isMedia 
      ? `ACT: Professional Construction Document Processor.
         TASK: Extract precise metadata from this 811 Locate Ticket image/PDF.
         FIELDS: ticketNo, jobNumber, street, extent, county, city, state, callInDate, workDate, expires, siteContact.
         INSTRUCTION: Ensure dates are in YYYY-MM-DD format. If a field is missing, return "".`
      : `Extract structured locate ticket info from this text. Ensure dates are YYYY-MM-DD.\n\n"${input}"`;

    const parts = isMedia 
      ? [{ inlineData: input as { data: string; mimeType: string } }, { text: promptText }]
      : [{ text: promptText }];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts },
      config: {
        systemInstruction: "You are a specialized 811 locate ticket parser. Return ONLY valid JSON. Be extremely precise with ticket numbers and dates (YYYY-MM-DD). The 'extent' field should describe the specific work area boundaries mentioned in the document.",
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
        },
        temperature: 0,
      }
    });

    const jsonStr = response.text?.trim() || "{}";
    return JSON.parse(jsonStr);
  } catch (error: any) {
    console.error("[Gemini] Extraction Failure:", error);
    throw new Error(error.message || "AI Analysis failed.");
  }
};
