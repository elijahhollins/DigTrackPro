
import { GoogleGenAI, Type } from "@google/genai";
import { getEnv } from "../lib/supabaseClient.ts";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 * This service extracts structured metadata from 811 locate tickets.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // Initialization must happen inside the function to ensure current key is used.
  // We use getEnv to robustly fetch the key from multiple possible sources.
  const apiKey = getEnv('API_KEY');
  
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("API_KEY_MISSING: Please connect your Gemini API key using the button in the dashboard.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const isMedia = typeof input !== 'string';
    
    const promptText = `Extract structured locate ticket metadata from the provided ${isMedia ? 'document' : 'text'}.
    
    LOCATE TICKET ANALYSIS RULES:
    1. TICKET NUMBER: Look for "Ticket:", "Ticket No:", "Tkt #", or similar.
    2. JOB NUMBER: Look for "Job:", "Job #", "Project:", or "Reference".
    3. ADDRESS: Extract the primary "Street" and "Cross Street" (Intersection).
    4. LOCATION: Identify "City", "State", "County", and "Place/Township".
    5. DATES: Extract "Work Start Date" (or "Legal Date") and "Expiration Date". 
       - Convert all dates to YYYY-MM-DD format.
    6. CUSTOMER: Identify the client or contractor (labels: "Done For", "Contractor", "Customer").
    7. SITE CONTACT: Identify the person to contact on site.
    
    If a field is missing or illegible, return null for that field.
    Return a clean JSON object according to the requested schema.`;

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
        },
        temperature: 0,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("The AI returned an empty response. Please try a clearer image or document.");
    }

    const jsonStr = text.trim();
    const cleanJson = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    
    try {
      const parsed = JSON.parse(cleanJson);
      // Basic validation: we at least need a ticket number or street to be useful
      if (!parsed.ticketNo && !parsed.street) {
        throw new Error("Could not identify key ticket information. Please ensure the ticket number and address are visible.");
      }
      return parsed;
    } catch (e: any) {
      console.error("Gemini returned malformed response:", jsonStr);
      throw new Error(e.message.includes("Could not identify") ? e.message : "Analysis failed: The AI response was malformed. Please ensure the image is clear.");
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
