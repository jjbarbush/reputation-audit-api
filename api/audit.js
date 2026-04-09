import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildPrompt(brandName) {
  var sq = brandName + ' reviews complaints reputation trustpilot reddit';
  var p = 'Search the web for: "' + sq + '"\n\n';
  p += 'After searching, analyze what you found using the AGE framework and return ONLY valid JSON.\n\n';
  p += 'AGE Framework:\n';
  p += '- A (Alleviate): Does the brand acknowledge issues in responses?\n';
  p += '- G (Ground): Does the brand provide evidence or specifics?\n';
  p += '- E (Engage): Does the brand offer clear next steps?\n\n';
  p += 'Return this exact JSON structure (no markdown, no explanation, no preamble):\n\n';
  p += '{\n';
  p += '  "brand": "' + brandName + '",\n';
  p += '  "synthesis_preview": "2-3 sentence summary of what AI will say when someone asks Is ' + brandName + ' reliable? Write as if you are the AI answering that question.",\n';
  p += '  "verdict": "trustworthy or mixed or questionable or concerning",\n';
  p += '  "collapse_risk": "integer 0-100",\n';
  p += '  "age_quality": "integer 0-100",\n';
  p += '  "critical_mention_count": "integer",\n';
  p += '  "pattern_count": "integer",\n';
  p += '  "search_queries_used": ["' + sq + '"],\n';
  p += '  "critical_mentions": [{ "source": "Platform", "url": "URL or empty", "excerpt": "Quote from results", "risk_score": "0-100", "connectedness_score": "0-100", "has_response": false, "existing_response": null, "age_score": null, "age_breakdown": { "alleviate": null, "ground": null, "engage": null }, "collapse_issue": "Issue description", "suggested_response": "AGE response" }],\n';
  p += '  "patterns": [{ "theme": "Pattern description", "mention_count": 0, "platforms": ["Platform1"], "example_excerpt": "Quote", "severity": "high or medium or low" }],\n';
  p += '  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]\n';
  p += '}\n\n';
  p += 'IMPORTANT RULES:\n';
  p += '- No em dashes anywhere. Use hyphens or commas instead.\n';
  p += '- Base everything on actual search results, not assumptions.\n';
  p += '- If search results are thin, say so in the synthesis preview.\n';
  p += '- Return ONLY the JSON object, nothing else.';
  return { prompt: p, searchQuery: sq };
}
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'POST only' });
  }

  const { brand } = req.body || {};

  if (!brand || !brand.trim()) {
    return res.status(400).json({ success: false, error: 'Brand name is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ success: false, error: 'API key not configured on server' });
  }

  try {
    var brandName = brand.trim();
    var config = buildPrompt(brandName);

    var combinedResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5
      }],
      messages: [{
        role: 'user',
        content: config.prompt
      }]
    });

    var rawText = '';
    for (var i = 0; i < combinedResponse.content.length; i++) {
      if (combinedResponse.content[i].type === 'text') {
        rawText += combinedResponse.content[i].text;
      }
    }
    // Parse JSON with multiple strategies
    var data = null;

    // Strategy 1: Direct parse
    try {
      data = JSON.parse(rawText.trim());
    } catch (e) {
      // Strategy 2: Extract from markdown code block
      var codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        try {
          data = JSON.parse(codeBlockMatch[1].trim());
        } catch (e2) {}
      }

      // Strategy 3: Find first { to last }
      if (!data) {
        var firstBrace = rawText.indexOf('{');
        var lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          try {
            data = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
          } catch (e3) {}
        }
      }
    }

    if (!data) {
      return res.status(422).json({
        success: false,
        error: 'Failed to parse analysis results',
        raw_preview: rawText.substring(0, 300)
      });
    }

    return res.json({ success: true, data: data });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
}
