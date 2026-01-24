
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Specialized service for parsing locate tickets using Gemini AI.
 * This service extracts structured metadata from 811 locate tickets using Few-Shot Prompting.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const isMedia = typeof input !== 'string';
    
    // The prompt is now optimized to treat the document as a standardized construction layout.
    const promptText = isMedia 
      ? `ACT: Professional Construction Document Processor.
         TASK: Extract precise metadata from this standardized 811 Locate Ticket image/PDF.
         CONTEXT: These tickets follow a strict structural layout. Look for specific labels like 'TICKET:', 'JOB:', 'WORK DATE:', 'EXPIRATION:', and 'DONE FOR:'.
         INSTRUCTION: Ensure all fields are extracted exactly as they appear. Dates MUST be YYYY-MM-DD. 
         CRITICAL: Identify the Customer name from the 'Done For' line.`
      : `Extract structured locate ticket info from this text. Follow the standardized mapping rules.\n\n"${input}"`;

    const parts = isMedia 
      ? [{ inlineData: input as { data: string; mimeType: string } }, { text: promptText }]
      : [{ text: promptText }];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts },
      config: {
        systemInstruction: `You are a specialized 811 locate ticket parser. 
        
        REFERENCE EXAMPLE (GOLD STANDARD):
        Input Snippet: "TICKET: 202305001 JOB: 25-099 DONE FOR: ACME CONSTRUCTION CALL-IN: 05/01/23 WORK START: 05/04/23 EXPIRES: 05/18/23 ADDR: 123 MAIN ST CROSS: OAK AVE PLACE: SPRINGFIELD COUNTY: SANGAMON STATE: IL CONTACT: JOHN DOE 555-0199 EXTENT: FRONT OF PROPERTY TO CURB"
        Result: {
          "ticketNo": "202305001",
          "jobNumber": "25-099",
          "street": "123 MAIN ST",
          "crossStreet": "OAK AVE",
          "place": "SPRINGFIELD",
          "extent": "FRONT OF PROPERTY TO CURB",
          "county": "SANGAMON",
          "city": "SPRINGFIELD",
          "state": "IL",
          "callInDate": "2023-05-01",
          "workDate": "2023-05-04",
          "expires": "2023-05-18",
          "siteContact": "ACME CONSTRUCTION (Contact: JOHN DOE 555-0199)"
        }

        RULES:
        1. Return ONLY valid JSON.
        2. Dates MUST be converted to YYYY-MM-DD.
        3. If 'Place' is provided but 'City' is missing, use 'Place' as 'City'.
        4. 'Extent' is the description of the work area (e.g., 'ENTIRE LOT', 'REAR OF BLDG').
        5. 'Site Contact' is the primary field for the Customer. You MUST look for the 'Done For' line on the ticket and prioritize this information for this field. If 'Done For' is present, include that entity name first.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            jobNumber: { 
              type: Type.STRING, 
              description: "The internal project number, often found near 'JOB' or 'PROJECT' labels." 
            },
            ticketNo: { 
              type: Type.STRING, 
              description: "The 811 ticket identifier, usually a long string of numbers." 
            },
            street: { 
              type: Type.STRING, 
              description: "The primary work address street name and number." 
            },
            crossStreet: { 
              type: Type.STRING, 
              description: "The nearest intersecting street or 'Between' field." 
            },
            place: { 
              type: Type.STRING, 
              description: "The township, village, or specific municipality name." 
            },
            extent: { 
              type: Type.STRING, 
              description: "Detailed description of the excavation boundaries." 
            },
            county: { 
              type: Type.STRING, 
              description: "The administrative county where the work is located." 
            },
            city: { 
              type: Type.STRING, 
              description: "The city associated with the mailing or site address." 
            },
            state: { 
              type: Type.STRING, 
              description: "2-letter state abbreviation (e.g., IL, WI, IN)." 
            },
            callInDate: { 
              type: Type.STRING, 
              description: "The date the ticket was requested (YYYY-MM-DD)." 
            },
            workDate: { 
              type: Type.STRING, 
              description: "The 'Dig Start' or 'Legal Start' date (YYYY-MM-DD)." 
            },
            expires: { 
              type: Type.STRING, 
              description: "The 'Expiration' or 'Life of Ticket' end date (YYYY-MM-DD)." 
            },
            siteContact: { 
              type: Type.STRING, 
              description: "The customer or entity the work is being 'Done For', plus the field contact person's details if available." 
            },
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
    throw new Error(error.message || "AI Analysis failed. Check if API Key is configured.");
  }
};
