
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 * This service extracts structured metadata from 811 locate tickets.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // Use window.process explicitly to ensure we avoid polyfill scoping issues
  const apiKey = (window as any).process?.env?.API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const isMedia = typeof input !== 'string';
    
    const promptText = `Extract structured locate ticket metadata from the provided ${isMedia ? 'document' : 'text'}.
    
    RULES:
    1. Identify 'TICKET #', 'JOB #', 'STREET', 'CROSS STREET', 'CITY', 'STATE', 'COUNTY', 'WORK START DATE', and 'EXPIRATION DATE'.
    2. Convert all dates to YYYY-MM-DD format.
    3. The 'Customer' name is usually found after labels like 'DONE FOR:', 'CONTRACTOR:', or 'CUSTOMER:'.
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

    // Using gemini-3-flash-preview as the primary robust extraction engine
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts },
      config: {
        systemInstruction: "You are a professional construction document analyzer. Convert locate tickets into precise JSON data. If a field is illegible, leave it blank. Never hallucinate ticket numbers.",
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
          required: ["ticketNo", "street"],
        },
        temperature: 0.05,
      }
    });

    const jsonStr = response.text?.trim() || "{}";
    // Sanitize string if model wrapped in markdown blocks
    const cleanJson = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    
    try {
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error("Gemini returned malformed response:", jsonStr);
      throw new Error("Analysis failed: The AI response was not in the expected format. Please try again with a clearer image.");
    }
  } catch (error: any) {
    console.error("[Gemini] OCR Extraction Failure:", error);
    
    // Check for specific error codes related to project permissions
    if (error.message?.includes('403') || error.message?.includes('404') || error.message?.includes('entity was not found')) {
      throw new Error("ACCESS_DENIED: Your project does not have permission for the Gemini 3 model. Please ensure billing is enabled and you have selected the correct project in the AI Studio dialog.");
    }
    
    throw new Error(error.message || "AI Analysis failed. Check your internet connection or API project status.");
  }
};
