
import { GoogleGenAI, Type } from "@google/genai";

export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // Check the environment variable injected by the platform
  const apiKey = process.env.API_KEY;
  
  console.log("[Gemini Service] Checking for API Key...");
  
  if (!apiKey) {
    console.error("[Gemini Service] API_KEY is undefined in process.env.");
    throw new Error("API KEY MISSING: Please click the 'Connect AI' button in the top right to link your Google Cloud Project. If you've already done this, refresh the page.");
  }

  console.log("[Gemini Service] Key detected. Initializing model...");

  // Initialize fresh on every call to use the most recent key injection
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const isMedia = typeof input !== 'string';
    
    const promptText = isMedia 
      ? `ACT: Professional Construction Document Processor.
         TASK: Extract precise metadata from this 811 Locate Ticket.
         FIELDS REQUIRED: 
         - ticketNo: Found as 'Ticket #', 'Request No', or 'Tkt ID'.
         - jobNumber: Found as 'Job #', 'Project', or internal code.
         - address: The work site location.
         - digStart: The Legal Start Date (YYYY-MM-DD).
         - expirationDate: The date work authorization ends (YYYY-MM-DD).`
      : `Extract locate ticket info from this text. Ensure dates are YYYY-MM-DD.\n\n"${input}"`;

    const parts = isMedia 
      ? [{ inlineData: input }, { text: promptText }]
      : [{ text: promptText }];

    // Using gemini-3-flash-preview for high accuracy parsing
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts },
      config: {
        systemInstruction: "You are a specialized 811 locate ticket parser. Return only valid JSON. If a field is missing, return an empty string. Be exact with ticket numbers.",
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
          required: ["ticketNo", "address"]
        },
        temperature: 0.1,
      }
    });

    const textOutput = response.text;
    if (!textOutput) throw new Error("AI returned an empty response. Check document clarity.");
    
    const result = JSON.parse(textOutput);
    console.log("[Gemini Service] Extraction successful:", result);
    return result;
  } catch (error: any) {
    console.error("[Gemini Service] Error during API call:", error);
    
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("ACCESS DENIED: The Gemini 3 API is not enabled in your Google Cloud Project, or the model is not available for your project region. Please enable it in the Google Cloud Console.");
    }

    if (error.message?.includes("API_KEY_INVALID")) {
      throw new Error("INVALID KEY: The project you selected is not providing a valid API Key. Try selecting a different project.");
    }

    throw new Error(error.message || "Failed to analyze document. Check Console for details.");
  }
};
