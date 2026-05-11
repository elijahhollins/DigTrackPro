export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API_KEY_MISSING: ANTHROPIC_API_KEY is not configured on the server.' });
  }

  try {
    const input = req.body?.input;
    if (input == null) {
      return res.status(400).json({ error: 'INVALID_INPUT: Request body must include input.' });
    }
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
      type: 'object',
      properties: {
        jobNumber: { type: 'string' },
        ticketNo: { type: 'string' },
        street: { type: 'string' },
        crossStreet: { type: 'string' },
        place: { type: 'string' },
        extent: { type: 'string' },
        county: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        callInDate: { type: 'string' },
        workDate: { type: 'string' },
        digByDate: { type: 'string' },
        expires: { type: 'string' },
        siteContact: { type: 'string' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        boundingBox: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lng: { type: 'number' },
            },
          },
        },
      },
    };

    const content = (() => {
      if (!isMedia) {
        return [{ type: 'text', text: `${promptText}\n\nTicket content:\n${String(input)}` }];
      }

      const media = input;
      if (typeof media.data !== 'string' || media.data.length === 0) {
        throw new Error('INVALID_INPUT: Media input must include non-empty base64 data.');
      }
      if (typeof media.mimeType !== 'string' || media.mimeType.length === 0) {
        throw new Error('INVALID_INPUT: Media input must include a valid mimeType.');
      }
      const mediaBlock = media.mimeType === 'application/pdf'
        ? {
            type: 'document',
            source: {
              type: 'base64',
              media_type: media.mimeType,
              data: media.data,
            },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: media.mimeType,
              data: media.data,
            },
          };

      return [mediaBlock, { type: 'text', text: promptText }];
    })();

    const rawModelCandidates = [
      process.env.ANTHROPIC_MODEL,
      'claude-3-5-sonnet-latest',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-latest',
      'claude-3-5-haiku-20241022',
      'claude-3-haiku-20240307',
    ];
    const modelCandidates = Array.from(
      new Set(rawModelCandidates.filter((model) => typeof model === 'string' && model.trim().length > 0)),
    );

    let body = null;
    for (let i = 0; i < modelCandidates.length; i += 1) {
      const model = modelCandidates[i];
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'pdfs-2024-09-25',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          temperature: 0,
          system: 'You are a professional construction document analyzer. Convert locate tickets into precise JSON data. If a field is illegible, leave it blank. Never hallucinate ticket numbers.',
          tools: [
            {
              name: 'extract_ticket',
              description: 'Extract structured locate-ticket metadata exactly to schema.',
              input_schema: inputSchema,
            },
          ],
          tool_choice: { type: 'tool', name: 'extract_ticket' },
          messages: [{ role: 'user', content }],
        }),
      });

      body = await response.json().catch(() => ({}));
      if (response.ok) {
        break;
      }

      const message = body?.error?.message || (typeof body?.error === 'string' ? body.error : JSON.stringify(body?.error)) || `Anthropic request failed with status ${response.status}`;
      const errorType = body?.error?.type;
      const normalizedMessage = String(message).toLowerCase();
      const isModelErrorType = errorType === 'model_not_found_error';
      const isAuthErrorType = errorType === 'authentication_error' || errorType === 'permission_error';
      const hasModelHint =
        normalizedMessage.includes('model:') ||
        normalizedMessage.includes('model not found') ||
        normalizedMessage.includes('model does not exist') ||
        normalizedMessage.includes('unsupported model') ||
        normalizedMessage.includes('invalid model') ||
        normalizedMessage.includes('unknown model');
      const isAuthError =
        isAuthErrorType ||
        ((response.status === 401 ||
          response.status === 403 ||
          normalizedMessage.includes('invalid x-api-key') ||
          normalizedMessage.includes('api key')) &&
          !hasModelHint);
      const isModelInvalidRequest =
        response.status === 400 &&
        errorType === 'invalid_request_error' &&
        normalizedMessage.includes('model');
      const isModelError =
        isModelErrorType ||
        hasModelHint ||
        response.status === 404 ||
        isModelInvalidRequest;
      if (isModelError && i < modelCandidates.length - 1) {
        continue;
      }
      if (isAuthError) {
        return res.status(403).json({ error: 'ACCESS_DENIED: Your server Anthropic API key is missing, invalid, or lacks permission.' });
      }

      return res.status(response.status).json({ error: String(message) });
    }

    const toolUse = Array.isArray(body?.content)
      ? body.content.find((item) => item?.type === 'tool_use' && item?.name === 'extract_ticket')
      : null;

    const parsed = toolUse?.input;
    if (!parsed || typeof parsed !== 'object') {
      return res.status(422).json({ error: 'The AI returned an empty response. Please try a clearer image or document.' });
    }
    if (!parsed.ticketNo && !parsed.street) {
      return res.status(422).json({ error: 'Could not identify key ticket information. Please ensure the ticket number and address are visible.' });
    }

    return res.status(200).json({ data: parsed });
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    if (msg.includes('429') || msg.includes('rate limit')) {
      return res.status(429).json({ error: 'RATE_LIMITED: Anthropic rate limit reached. Please retry in a moment.' });
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('permission') || msg.includes('invalid x-api-key')) {
      return res.status(403).json({ error: 'ACCESS_DENIED: Your server Anthropic API key is missing, invalid, or lacks permission.' });
    }
    return res.status(500).json({ error: error?.message || 'AI analysis failed. Check server configuration.' });
  }
}
