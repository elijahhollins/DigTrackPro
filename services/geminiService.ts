
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 * This service extracts structured metadata from 811 locate tickets.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const isMedia = typeof input !== 'string';
    
    // Using a more direct, high-intensity prompt for construction document extraction
    const promptText = `Extract structured locate ticket metadata from the provided ${isMedia ? 'document' : 'text'}.
    
    RULES:
    1. Identify 'TICKET #', 'JOB #', 'STREET', 'CROSS STREET', 'CITY', 'STATE', 'COUNTY', 'WORK START DATE', and 'EXPIRATION DATE'.
    2. Convert all dates to YYYY-MM-DD format.
    3. The 'Customer' is usually found after labels like 'DONE FOR:', 'CONTRACTOR:', or 'CUSTOMER:'.
    4. If 'Place' is found but 'City' is missing, use 'Place' as 'City'.
    5. Return a clean JSON object according to the requested schema.`;

    const parts = isMedia 
      ? [
          { 
            inlineData: { 
              data: (input as any).data, 
              mimeType: (input as any).mimeType 
            } 
          }, 
          { text: promptText }
        ]
      : [{ text: promptText }];

    // Switching to gemini-3-pro-preview for superior document reasoning (Complex Task)
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", 
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: "You are a specialized 811 locate ticket parser. You convert construction ticket images and text into precise structured data. Always return valid JSON.",
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
          // Reduced required fields to core essentials to prevent model generation failure on incomplete documents
          required: ["ticketNo", "street"],
        },
        temperature: 0.1,
      }
    });

    const jsonStr = response.text?.trim() || "{}";
    
    // Robust parsing that handles potential markdown blocks if responseMimeType is ignored by model
    const cleanJson = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    
    try {
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error("Gemini returned invalid JSON:", jsonStr);
      throw new Error("Failed to parse document. Please ensure the ticket is legible.");
    }
  } catch (error: any) {
    console.error("[Gemini] Extraction Failure:", error);
    throw new Error(error.message || "AI Analysis failed. Please check your internet connection.");
  }
};
