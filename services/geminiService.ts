
import { GoogleGenAI, Type } from "@google/genai";

const MAX_RETRIES = 2;
const INITIAL_DELAY = 1000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let lastError: any;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const isMedia = typeof input !== 'string';
      
      const promptText = isMedia 
        ? `TASK: Analyze this construction 811 locate ticket.
           REQUIRED FIELDS:
           - Ticket Number: Often found at top labeled as "Ticket No", "Ticket #", or "Request Number".
           - Job Number: Look for internal reference codes, project names, or "Job #".
           - Address: The specific work location address.
           - Start Date: Also known as "Legal Date", "Work Start", or "Available Date".
           - Expiration: When the markings are no longer valid.
           - Site Contact: The person listed under "Contact" or "Field Representative".`
        : `Extract 811 ticket data from this text:\n\n"${input}"`;

      const parts = isMedia 
        ? [{ inlineData: input }, { text: promptText }]
        : [{ text: promptText }];

      // Gemini 3 Flash is preferred for fast, accurate vision-to-JSON tasks
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: { parts },
        config: {
          systemInstruction: "You are a professional 811 ticket parser. Your goal is to return valid JSON metadata extracted from the provided ticket document or text. If a date is found, always format it as YYYY-MM-DD. If a field is missing, return an empty string. Focus heavily on the 'Ticket Number' and 'Start Date'.",
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
          temperature: 0, // Strict extraction
        }
      });

      const textOutput = response.text;
      if (!textOutput) throw new Error("AI returned an empty response.");
      
      const extracted = JSON.parse(textOutput);
      console.log("Gemini Extraction Success:", extracted);
      return extracted;
    } catch (error: any) {
      lastError = error;
      console.error(`AI Analysis Attempt ${attempt + 1} failed:`, error);
      
      if (attempt < MAX_RETRIES - 1) {
        await delay(INITIAL_DELAY * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw lastError;
};
