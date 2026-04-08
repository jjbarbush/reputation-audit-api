import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    const searchQueries = [
      `${brand} reviews`,
      `${brand} complaints reddit`,
      `is ${brand} legit trustpilot yelp`
    ];

    let allSearchResults = [];

    for (const query of searchQueries) {
      try {
        const searchResponse = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          tools: [{
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 3
          }],
          messages: [{
            role: 'user',
            content: `Search the web for: "${query}". Return all results you find. Include URLs, titles, and any review content or mentions you see.`
          }]
        });

        for (const block of searchResponse.content) {
          if (block.type === 'text') {
            allSearchResults.push({ query, content: block.text });
          }
        }
      } catch (searchErr) {
        allSearchResults.push({ query, content: `Search failed: ${searchErr.message}` });
      }
    }

    if (allSearchResults.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'No search results found. Try a different brand name.'
      });
    }

    const analysisPrompt = buildAnalysisPrompt(brand, searchQueries, allSearchResults);

    const analysisResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: analysisPrompt
      }]
    });

    let rawText = '';
    for (const block of analysisResponse.content) {
      if (block.type === 'text') {
        rawText += block.text;
      }
    }

    let data = null;
    try {
      data = JSON.parse(rawText.trim());
    } catch (e) {
      const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        try { data = JSON.parse(codeBlockMatch[1].trim()); } catch (e2) {}
      }
      if (!data) {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          try { data = JSON.parse(rawText.substring(firstBrace, lastBrace + 1)); } catch (e3) {}
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

    return res.json({ success: true, data });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
}

function buildAnalysisPrompt(brand, searchQueries, allSearchResults) {
  const resultsText = allSearchResults.map(r => `--- Query: "${r.query}" ---\n${r.content}`).join('\n\n');
  return `You are a reputation synthesis analyst for Cast Iron LA's Stage30 framework.

You have web search results about the brand "${brand}". Analyze them using the AGE framework:
- A (Alleviate): Does the brand acknowledge issues in responses?
- G (Ground): Does the brand provide evidence/specifics?
- E (Engage): Does the brand offer clear next steps?

SEARCH RESULTS:
${resultsText}

Return ONLY valid JSON (no markdown, no explanation, no preamble). Use this exact structure:

{
  "brand": "${brand}",
  "synthesis_preview": "2-3 sentence summary of what AI will say when someone asks 'Is ${brand} reliable?' Write as if you are the AI answering that question.",
  "verdict": "trustworthy | mixed | questionable | concerning",
  "collapse_risk": 0,
  "age_quality": 0,
  "critical_mention_count": 0,
  "pattern_count": 0,
  "search_queries_used": ${JSON.stringify(searchQueries)},
  "critical_mentions": [
    {
      "source": "Platform name",
      "url": "URL if found or empty string",
      "excerpt": "Exact quote or close paraphrase from search results",
      "risk_score": 0,
      "connectedness_score": 0,
      "has_response": false,
      "existing_response": null,
      "age_score": null,
      "age_breakdown": { "alleviate": null, "ground": null, "engage": null },
      "collapse_issue": "What is wrong with the response or why no response is a problem",
      "suggested_response": "AGE-structured response the brand should use"
    }
  ],
  "patterns": [
    {
      "theme": "Short description of recurring pattern",
      "mention_count": 0,
      "platforms": ["Platform1", "Platform2"],
      "example_excerpt": "Example quote showing this pattern",
      "severity": "high | medium | low"
    }
  ],
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2",
    "Specific actionable recommendation 3"
  ]
}

IMPORTANT RULES:
- No em dashes anywhere. Use hyphens or commas instead.
- Base everything on actual search results, not assumptions
- If search results are thin, say so in the synthesis preview
- Replace all placeholder 0 values with real scores based on your analysis
- Return ONLY the JSON object, nothing else`;
}
