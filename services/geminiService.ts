
import { GoogleGenAI, Type } from "@google/genai";
import { getEnv } from "../lib/supabaseClient.ts";

const getAiClient = () => {
  const apiKey = getEnv('API_KEY');
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("API_KEY_MISSING: Please connect your Gemini API key using the button in the dashboard.");
  }
  return new GoogleGenAI({ apiKey });
};

const buildParts = (input: string | { data: string; mimeType: string }, promptText: string) => {
  if (typeof input === 'string') {
    return [{ text: promptText }];
  }
  return [{ inlineData: { data: input.data, mimeType: input.mimeType } }, { text: promptText }];
};

/**
 * Phase 1: Extract all locate ticket fields except GPS coordinates.
 * Returns quickly so the user can start reviewing the ticket right away.
 */
export const parseTicketInfo = async (input: string | { data: string; mimeType: string }) => {
  const ai = getAiClient();
  const inputType = typeof input === 'string' ? 'text' : 'document';

  const promptText = `Extract structured locate ticket metadata from the provided ${inputType}.
    
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

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: buildParts(input, promptText) },
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

    const cleanJson = text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');

    try {
      const parsed = JSON.parse(cleanJson);
      if (!parsed.ticketNo && !parsed.street) {
        throw new Error("Could not identify key ticket information. Please ensure the ticket number and address are visible.");
      }
      return parsed;
    } catch (e: any) {
      console.error("Gemini returned malformed response:", text);
      throw new Error(e.message.includes("Could not identify") ? e.message : "Analysis failed: The AI response was malformed. Please ensure the image is clear.");
    }
  } catch (error: any) {
    console.error("[Gemini] Ticket Info Extraction Failure:", error);
    const msg = error.message?.toLowerCase() || '';
    if (msg.includes('403') || msg.includes('404') || msg.includes('entity was not found') || msg.includes('permission')) {
      throw new Error("ACCESS_DENIED: Your current project does not have permission for the Gemini 3 model. Ensure billing is enabled in the Google Cloud Console.");
    }
    throw new Error(error.message || "AI Analysis failed. Check your internet connection or API project status.");
  }
};

/**
 * Phase 2: Extract GPS coordinates and bounding box in the background.
 * Runs concurrently while the user is confirming the ticket info from phase 1.
 * Returns an empty object on failure so it never blocks the ticket save flow.
 */
export const parseTicketCoordinates = async (input: string | { data: string; mimeType: string }): Promise<{ lat?: number; lng?: number; boundingBox?: Array<{ lat: number; lng: number }> }> => {
  try {
    const ai = getAiClient();
    const inputType = typeof input === 'string' ? 'text' : 'document';

    const promptText = `Extract GPS coordinate data from the provided ${inputType}.
    
    COORDINATE EXTRACTION RULES:
    1. GPS COORDINATES: Look for a single representative lat/lng coordinate (often near "Best Fit", "GPS", "Lat/Long", or listed as a decimal degree pair like 41.123456, -87.654321). Extract as separate numeric values.
    2. BOUNDING BOX: 811 locate tickets often include exactly 4 coordinate pairs that define the dig area boundary (sometimes labeled as corners: NE/NW/SE/SW, or Point 1–4, or listed in a grid/table). Extract them as an ordered array of objects with "lat" and "lng" numeric fields. If all 4 are present return all 4; if only 3 are visible return those 3; return null if fewer than 3 boundary coordinates can be identified.
    
    Return null for any coordinates that cannot be found.
    Return a clean JSON object according to the requested schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: buildParts(input, promptText) },
      config: {
        systemInstruction: "You are a precise GPS coordinate extractor. Only extract coordinate data from the document. Do not infer or estimate coordinates.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            lat: { type: Type.NUMBER },
            lng: { type: Type.NUMBER },
            boundingBox: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER },
                },
              },
            },
          },
        },
        temperature: 0,
      }
    });

    const text = response.text;
    if (!text) return {};

    const cleanJson = text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    try {
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error("[Gemini] Coordinate parse error:", text);
      return {};
    }
  } catch (error: any) {
    console.error("[Gemini] Coordinate Extraction Failure:", error);
    return {};
  }
};
