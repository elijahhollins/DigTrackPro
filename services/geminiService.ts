import { GoogleGenAI, Type } from "@google/genai";

const MAX_RETRIES = 2;
const INITIAL_DELAY = 1000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  // Always fetch the current API_KEY from the environment
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API Key is not set. Please click the 'Setup AI' button in the header to select your project.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  let lastError: any;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const isMedia = typeof input !== 'string';
      
      const promptText = isMedia 
        ? `TASK: Analyze this construction locate ticket (811 ticket). 
           Extract high-accuracy metadata. 
           - Look for 'Legal Start', 'Work Start', or 'Start Date' for digStart.
           - Look for 'Expiration', 'Valid Until', or 'End Date' for expirationDate.
           - Look for 'Ticket Number' or 'Request #' for ticketNo.
           - Look for 'Project', 'Job #', or internal codes for jobNumber.`
        : `Extract locate ticket info from this text block. Look for Ticket#, Start Date, Expiration, and Job Number.\n\n"${input}"`;

      const parts = isMedia 
        ? [{ inlineData: input }, { text: promptText }]
        : [{ text: promptText }];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: { parts },
        config: {
          systemInstruction: "You are an expert construction document parser. Extract metadata from 811 locate tickets into structured JSON. Dates MUST be YYYY-MM-DD. Be highly precise with ticket numbers and site addresses.",
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
          },
          temperature: 0.1,
        }
      });

      const result = JSON.parse(response.text || '{}');
      console.log("AI Extraction Successful:", result);
      return result;
    } catch (error: any) {
      lastError = error;
      console.warn(`Extraction Attempt ${attempt + 1} failed:`, error.message);
      
      // Handle cases where the key exists but the API isn't enabled or the project is wrong
      if (error.message?.includes("Requested entity was not found") || error.message?.includes("403") || error.message?.includes("Permission denied")) {
        throw new Error("Gemini API Access Error: Make sure the 'Generative AI API' is enabled in your Google Cloud Console for the selected project.");
      }

      if (attempt < MAX_RETRIES - 1) {
        await delay(INITIAL_DELAY * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw lastError;
};