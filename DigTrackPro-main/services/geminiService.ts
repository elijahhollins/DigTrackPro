export interface ParsedTicketData {
  jobNumber?: string;
  ticketNo?: string;
  street?: string;
  crossStreet?: string;
  place?: string;
  extent?: string;
  county?: string;
  city?: string;
  state?: string;
  callInDate?: string;
  workDate?: string;
  digByDate?: string;
  expires?: string;
  siteContact?: string;
  lat?: number;
  lng?: number;
  boundingBox?: Array<{ lat: number; lng: number }>;
}

interface ParsedTicketResponse {
  data?: ParsedTicketData;
  error?: string;
}

const sanitizeAiParseErrorMessage = (message: string): string => {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("consumer suspended") ||
    normalizedMessage.includes("permission denied") ||
    normalizedMessage.includes("permission_denied") ||
    normalizedMessage.includes("api key") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("access_denied")
  ) {
    return "ACCESS_DENIED: The configured AI provider credentials were rejected. Check the server-side API key and billing status.";
  }

  if (
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("quota") ||
    normalizedMessage.includes("429") ||
    normalizedMessage.includes("resource exhausted")
  ) {
    return "RATE_LIMITED: AI provider rate limit reached. Please retry in a moment.";
  }

  return message;
};

/**
 * Specialized service for parsing locate tickets through the server AI endpoint.
 * This service extracts structured metadata from 811 locate tickets.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }): Promise<ParsedTicketData> => {
  try {
    const response = await fetch("/api/parse-ticket", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    let body: ParsedTicketResponse = {};
    try {
      body = await response.json();
    } catch (jsonError) {
      console.error("[AI Parse] Invalid JSON response:", jsonError);
    }

    if (!response.ok) {
      throw new Error(sanitizeAiParseErrorMessage(body?.error || `AI parsing failed with status ${response.status}`));
    }

    if (!body?.data || typeof body.data !== "object") {
      throw new Error("The AI returned an empty response. Please try a clearer image or document.");
    }

    return body.data;
  } catch (error: unknown) {
    console.error("[AI Parse] Extraction Failure:", error);
    throw new Error(
      sanitizeAiParseErrorMessage(error instanceof Error ? error.message : "AI analysis failed. Please try again."),
    );
  }
};
