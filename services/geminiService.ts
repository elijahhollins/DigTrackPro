
/**
 * Specialized service for parsing locate tickets using Anthropic AI.
 * This service extracts structured metadata from 811 locate tickets.
 */
export const parseTicketData = async (input: string | { data: string; mimeType: string }) => {
  try {
    const response = await fetch("/api/parse-ticket", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    let body: any = {};
    try {
      body = await response.json();
    } catch (jsonError) {
      console.error("[AI Parse] Invalid JSON response:", jsonError);
    }
    if (!response.ok) {
      throw new Error(body?.error || `AI parsing failed with status ${response.status}`);
    }

    if (!body?.data || typeof body.data !== "object") {
      throw new Error("The AI returned an empty response. Please try a clearer image or document.");
    }

    return body.data;
  } catch (error: any) {
    console.error("[AI Parse] Extraction Failure:", error);
    throw new Error(error.message || "AI analysis failed. Please try again.");
  }
};
