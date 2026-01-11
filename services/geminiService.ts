import { GoogleGenAI, Type } from "@google/genai";

const MAX_RETRIES = 1;

export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // Accessing the injected API key
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("Missing Project Link: Click 'Setup AI' in the top header to connect your Google Cloud project.");
  }

  // Always initialize right before the call to get the freshest injected key
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

    // Using gemini-3-flash-preview as the default high-performance model
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
    if (!textOutput) throw new Error("AI returned an empty response.");
    
    const result = JSON.parse(textOutput);
    console.log("Gemini Extraction Result:", result);
    return result;
  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    
    // Platform rule: handle "entity not found" by prompting for re-selection
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("MODEL ACCESS ERROR: The selected project might not have Gemini 3 enabled. Please check Google Cloud Console or re-select your project via 'Setup AI'.");
    }

    if (error.message?.includes("API_KEY_INVALID")) {
      throw new Error("INVALID API KEY: Please re-select your project using 'Setup AI'.");
    }

    throw new Error(error.message || "Document analysis failed. Please check your internet connection and project settings.");
  }
};