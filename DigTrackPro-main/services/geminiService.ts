
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 * This service extracts structured metadata from 811 locate tickets.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // Initialization must happen inside the function to ensure current key is used.
  // The SDK strictly requires process.env.API_KEY as the source.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
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

    // Using gemini-3-flash-preview for balanced speed and accuracy in OCR tasks.
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
        temperature: 0,
      }
    });

    const jsonStr = response.text?.trim() || "{}";
    const cleanJson = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    
    try {
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error("Gemini returned malformed response:", jsonStr);
      throw new Error("Analysis failed: The AI response was malformed. Please ensure the image is clear.");
    }
  } catch (error: any) {
    console.error("[Gemini] OCR Extraction Failure:", error);
    
    const msg = error.message?.toLowerCase() || '';
    if (msg.includes('403') || msg.includes('404') || msg.includes('entity was not found') || msg.includes('permission')) {
      throw new Error("ACCESS_DENIED: Your current project does not have permission for the Gemini 3 model. Ensure billing is enabled in the Google Cloud Console.");
    }
    
    throw new Error(error.message || "AI Analysis failed. Check your internet connection or API project status.");
  }
};
