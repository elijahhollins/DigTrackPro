
import { getEnv } from "../lib/supabaseClient.ts";

/**
 * Specialized service for parsing locate tickets using Anthropic AI.
 * This service extracts structured metadata from 811 locate tickets.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  const apiKey = getEnv('ANTHROPIC_API_KEY');
  
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("API_KEY_MISSING: Set ANTHROPIC_API_KEY in your environment to use AI parsing.");
  }
  
  try {
    const isMedia = typeof input !== 'string';
    
    const promptText = `Extract structured locate ticket metadata from the provided ${isMedia ? 'document' : 'text'}.
    
    LOCATE TICKET ANALYSIS RULES:
    1. TICKET NUMBER: Look for "Ticket:", "Ticket No:", "Tkt #", or similar.
    2. JOB NUMBER: Look for "Job:", "Job #", "Project:", or "Reference".
    3. ADDRESS: Extract the primary "Street" and "Cross Street" (Intersection).
    4. LOCATION: Identify "City", "State", "County", and "Place/Township".
    5. DATES: Extract "Work Start Date" (or "Legal Date"), "Expiration Date", and "Dig By Date" (the deadline by which digging must start if no work has begun — often labeled "Dig By", "Legal Date", or listed as call-in date + 10 calendar days). 
       - Convert all dates to YYYY-MM-DD format.
    6. CUSTOMER: Identify the client or contractor (labels: "Done For", "Contractor", "Customer").
    7. SITE CONTACT: Identify the person to contact on site.
    8. GPS COORDINATES: Look for a single representative lat/lng coordinate (often near "Best Fit", "GPS", "Lat/Long", or listed as a decimal degree pair like 41.123456, -87.654321). Extract as separate numeric values.
    9. BOUNDING BOX: 811 locate tickets often include exactly 4 coordinate pairs that define the dig area boundary (sometimes labeled as corners: NE/NW/SE/SW, or Point 1–4, or listed in a grid/table). Extract them as an ordered array of objects with "lat" and "lng" numeric fields. If all 4 are present return all 4; if only 3 are visible return those 3; return null if fewer than 3 boundary coordinates can be identified.
    
    If a field is missing or illegible, return null for that field.
    Return a clean JSON object according to the requested schema.`;

    const inputSchema = {
      type: "object",
      properties: {
        jobNumber: { type: "string" },
        ticketNo: { type: "string" },
        street: { type: "string" },
        crossStreet: { type: "string" },
        place: { type: "string" },
        extent: { type: "string" },
        county: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        callInDate: { type: "string" },
        workDate: { type: "string" },
        digByDate: { type: "string" },
        expires: { type: "string" },
        siteContact: { type: "string" },
        lat: { type: "number" },
        lng: { type: "number" },
        boundingBox: {
          type: "array",
          items: {
            type: "object",
            properties: {
              lat: { type: "number" },
              lng: { type: "number" },
            },
          },
        },
      },
    } as const;

    const content = (() => {
      if (!isMedia) {
        return [{
          type: "text",
          text: `${promptText}\n\nTicket content:\n${String(input)}`
        }];
      }

      const media = input as { data: string; mimeType: string };
      const mediaBlock =
        media.mimeType === 'application/pdf'
          ? {
              type: "document",
              source: {
                type: "base64",
                media_type: media.mimeType,
                data: media.data,
              },
            }
          : {
              type: "image",
              source: {
                type: "base64",
                media_type: media.mimeType,
                data: media.data,
              },
            };

      return [
        mediaBlock,
        {
          type: "text",
          text: promptText,
        },
      ];
    })();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1200,
        temperature: 0,
        system: "You are a professional construction document analyzer. Convert locate tickets into precise JSON data. If a field is illegible, leave it blank. Never hallucinate ticket numbers.",
        tools: [
          {
            name: "extract_ticket",
            description: "Extract structured locate-ticket metadata exactly to schema.",
            input_schema: inputSchema,
          },
        ],
        tool_choice: { type: "tool", name: "extract_ticket" },
        messages: [
          {
            role: "user",
            content,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Anthropic request failed with status ${response.status}`);
    }

    const body = await response.json();
    const toolUse = Array.isArray(body?.content)
      ? body.content.find((item: any) => item?.type === "tool_use" && item?.name === "extract_ticket")
      : null;

    const parsed = toolUse?.input;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("The AI returned an empty response. Please try a clearer image or document.");
    }

    if (!parsed.ticketNo && !parsed.street) {
      throw new Error("Could not identify key ticket information. Please ensure the ticket number and address are visible.");
    }

    return parsed;
  } catch (error: any) {
    console.error("[Anthropic] OCR Extraction Failure:", error);
    
    const msg = error.message?.toLowerCase() || '';
    if (msg.includes('401') || msg.includes('403') || msg.includes('permission') || msg.includes('invalid x-api-key')) {
      throw new Error("ACCESS_DENIED: Your Anthropic API key is missing, invalid, or lacks permission.");
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      throw new Error("RATE_LIMITED: Anthropic rate limit reached. Please retry in a moment.");
    }

    throw new Error(error.message || "AI analysis failed. Check your Anthropic API key and network connection.");
  }
};
