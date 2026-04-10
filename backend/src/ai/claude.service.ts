import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateDataSummary(
  data: Record<string, unknown>,
  buyerQuestion?: string
): Promise<{ summary: string; answer?: string }> {
  const question = buyerQuestion?.trim();

  const prompt = question
    ? `You are a professional on-chain data analyst working for Hazina Data Escrow. Analyse the following dataset and:
1. Write a concise 3-sentence executive summary of what the data shows (most important insights, trends, anomalies).
2. Then answer this specific question from the buyer: "${question}"

Keep your tone professional but accessible. Use specific numbers from the data.

Data:
${JSON.stringify(data, null, 2)}`
    : `You are a professional on-chain data analyst working for Hazina Data Escrow. Analyse the following dataset and write a concise 3-sentence executive summary highlighting the most important insights, notable trends, and any anomalies. Be specific with numbers. Keep it professional.

Data:
${JSON.stringify(data, null, 2)}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const fullText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  if (question) {
    // Split on a recognisable boundary — look for "Answer:" or numbered sections
    const parts = fullText.split(/\n\n(?=2\.|Answer:|\*\*Answer)/i);
    return {
      summary: parts[0]?.trim() || fullText,
      answer: parts[1]?.trim(),
    };
  }

  return { summary: fullText.trim() };
}
