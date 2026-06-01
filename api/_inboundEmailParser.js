import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, Type } from '@google/genai';

const systemInstruction =
  'You extract inbound utility locate request emails into structured ticket data. Return only grounded facts from the email.';

const promptForEmail = (emailText) => `Extract a structured inbound locate request from this email.

Rules:
- Use the email subject/body only.
- ticketNumber should contain the locate or ticket number when available.
- siteAddress should be the full jobsite address or best available location string.
- digStartDate and dueDate must be YYYY-MM-DD when present.
- callerName and callerPhone should identify the requesting customer when visible.
- utilityTypes should be a list of utilities requested to be marked.
- notes should summarize the work request plus any important instructions.
- If a value is missing, return an empty string or [].

Email content:
${emailText}`;

const anthropicInputSchema = {
  type: 'object',
  properties: {
    ticketNumber: { type: 'string' },
    siteAddress: { type: 'string' },
    digStartDate: { type: 'string' },
    dueDate: { type: 'string' },
    callerName: { type: 'string' },
    callerPhone: { type: 'string' },
    utilityTypes: {
      type: 'array',
      items: { type: 'string' },
    },
    notes: { type: 'string' },
  },
};

const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    ticketNumber: { type: Type.STRING },
    siteAddress: { type: Type.STRING },
    digStartDate: { type: Type.STRING },
    dueDate: { type: Type.STRING },
    callerName: { type: Type.STRING },
    callerPhone: { type: Type.STRING },
    utilityTypes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    notes: { type: Type.STRING },
  },
};

const normalizeDate = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
};

const normalizePhone = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const compact = trimmed.replace(/[^\d+x()-.\s]/gi, '').trim();
  return compact;
};

const normalizeParsed = (data) => ({
  ticketNumber: String(data?.ticketNumber || '').trim(),
  siteAddress: String(data?.siteAddress || '').trim(),
  digStartDate: normalizeDate(data?.digStartDate),
  dueDate: normalizeDate(data?.dueDate),
  callerName: String(data?.callerName || '').trim(),
  callerPhone: normalizePhone(data?.callerPhone),
  utilityTypes: Array.isArray(data?.utilityTypes)
    ? data.utilityTypes.map(item => String(item || '').trim()).filter(Boolean)
    : [],
  notes: String(data?.notes || '').trim(),
});

const parseWithAnthropic = async (emailText) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic is not configured.');
  }

  const client = new Anthropic({ apiKey });
  const rawModelCandidates = [
    process.env.ANTHROPIC_MODEL,
    'claude-haiku-4-5-20251001',
    'claude-3-7-sonnet-latest',
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-latest',
  ];
  const modelCandidates = Array.from(new Set(rawModelCandidates.filter(Boolean)));

  for (let i = 0; i < modelCandidates.length; i += 1) {
    const model = modelCandidates[i];
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 800,
        temperature: 0,
        system: systemInstruction,
        tools: [
          {
            name: 'extract_inbound_email',
            description: 'Extract structured inbound locate request fields from an email.',
            input_schema: anthropicInputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'extract_inbound_email' },
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: promptForEmail(emailText) }],
        }],
      });
      const toolUse = response.content.find(item => item.type === 'tool_use');
      if (!toolUse?.input) {
        throw new Error('Anthropic returned an empty response.');
      }
      return normalizeParsed(toolUse.input);
    } catch (error) {
      const message = String(error?.error?.message || error?.message || '');
      const isModelError = message.toLowerCase().includes('model');
      if (isModelError && i < modelCandidates.length - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Anthropic returned an empty response.');
};

const parseWithGemini = async (emailText) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini is not configured.');
  }

  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: promptForEmail(emailText),
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: geminiResponseSchema,
      systemInstruction,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }
  return normalizeParsed(JSON.parse(text));
};

export const parseInboundEmail = async (emailText) => {
  const cleaned = String(emailText || '').trim();
  if (!cleaned) {
    throw new Error('Inbound email content is empty.');
  }

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      return await parseWithAnthropic(cleaned);
    }
    if (process.env.GEMINI_API_KEY) {
      return await parseWithGemini(cleaned);
    }
  } catch (error) {
    console.error('Inbound email parsing failed:', error);
    throw new Error(String(error?.message || 'Failed to parse inbound email.'));
  }

  throw new Error('No AI provider configured for inbound email parsing.');
};
