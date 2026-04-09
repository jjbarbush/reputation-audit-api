import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildAnalysisPrompt(brandName, searchResults) {
  var p = 'You are a reputation analyst using the AGE framework.\n\n';
  p += 'AGE Framework:\n';
  p += '- A (Alleviate): Does the brand acknowledge and validate the customer issue?\n';
  p += '- G (Ground): Does the brand provide specific evidence, data, or concrete details?\n';
  p += '- E (Engage): Does the brand offer a clear next step or path forward?\n\n';
  p += 'Here are web search results about "' + brandName + '":\n\n';
  p += searchResults + '\n\n';
  p += 'Analyze these results and return ONLY valid JSON with this exact structure (no markdown, no explanation, no preamble):\n\n';
  p += '{\n';
  p += '  "brand": "' + brandName + '",\n';
  p += '  "synthesis_preview": "2-3 sentence summary of what AI will say when someone asks Is ' + brandName + ' reliable? Write as if you are the AI answering that question.",\n';
  p += '  "verdict": "trustworthy | mixed | questionable | concerning",\n';
  p += '  "collapse_risk": 0,\n';
  p += '  "age_quality": 0,\n';
  p += '  "critical_mention_count": 0,\n';
  p += '  "pattern_count": 0,\n';
  p += '  "search_queries_used": [],\n';
  p += '  "critical_mentions": [\n';
  p += '    {\n';
  p += '      "source": "Platform name",\n';
  p += '      "url": "URL if found or empty string",\n';
  p += '      "excerpt": "Exact quote or close paraphrase from search results",\n';
  p += '      "risk_score": 0,\n';
  p += '      "connectedness_score": 0,\n';
  p += '      "has_response": false,\n';
  p += '      "existing_response": "Brand response text if found, or null",\n';
  p += '      "age_score": null,\n';
  p += '      "age_breakdown": {\n';
  p += '        "alleviate": null,\n';
  p += '        "ground": null,\n';
  p += '        "engage": null\n';
  p += '      },\n';
  p += '      "collapse_issue": "What is wrong with the response or why no response is a problem",\n';
  p += '      "suggested_response": "AGE-structured response the brand should use"\n';
  p += '    }\n';
  p += '  ],\n';
  p += '  "patterns": [\n';
  p += '    {\n';
  p += '      "theme": "Short description of recurring pattern",\n';
  p += '      "mention_count": 0,\n';
  p += '      "platforms": ["Platform1", "Platform2"],\n';
  p += '      "example_excerpt": "Example quote showing this pattern",\n';
  p += '      "severity": "high | medium | low"\n';
  p += '    }\n';
  p += '  ],\n';
  p += '  "recommendations": [\n';
  p += '    "Specific actionable recommendation 1",\n';
  p += '    "Specific actionable recommendation 2",\n';
  p += '    "Specific actionable recommendation 3"\n';
  p += '  ]\n';
  p += '}\n\n';
  p += 'IMPORTANT RULES:\n';
  p += '- collapse_risk and age_quality are integers 0-100\n';
  p += '- No em dashes anywhere. Use hyphens or commas instead.\n';
  p += '- Base everything on actual search results, not assumptions.\n';
  p += '- If search results are thin, say so in the synthesis preview.\n';
  p += '- Include the actual search queries used in search_queries_used.\n';
  p += '- Return ONLY the JSON object, nothing else.';
  return p;
}
async function runSearch(query) {
  var response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 3
    }],
    messages: [{
      role: 'user',
      content: 'Search the web for: "' + query + '". Summarize all the key findings, mentions, reviews, complaints, and sentiments you find. Include specific quotes, ratings, platform names, and URLs where possible. Be thorough and factual.'
    }]
  });

  var text = '';
  for (var i = 0; i < response.content.length; i++) {
    if (response.content[i].type === 'text') {
      text += response.content[i].text;
    }
  }
  return text;
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

  var body = req.body || {};
  var brand = body.brand;

  if (!brand || !brand.trim()) {
    return res.status(400).json({ success: false, error: 'Brand name is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ success: false, error: 'API key not configured on server' });
  }

  try {
    var brandName = brand.trim();

    // Phase 1: Run 3 targeted searches in parallel
    var query1 = brandName + ' reviews ratings customer experience';
    var query2 = brandName + ' complaints problems reddit';
    var query3 = 'is ' + brandName + ' legit trustpilot yelp BBB';

    var searchPromises = [
      runSearch(query1),
      runSearch(query2),
      runSearch(query3)
    ];

    var results = await Promise.all(searchPromises);
    var allSearchResults = '';
    allSearchResults += '=== SEARCH 1: Reviews and Ratings ===\n' + results[0] + '\n\n';
    allSearchResults += '=== SEARCH 2: Complaints and Reddit ===\n' + results[1] + '\n\n';
    allSearchResults += '=== SEARCH 3: Legitimacy and Trust Platforms ===\n' + results[2] + '\n\n';

    // Phase 2: Analyze all results with AGE framework
    var analysisPrompt = buildAnalysisPrompt(brandName, allSearchResults);

    var analysisResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: analysisPrompt
      }]
    });

    var rawText = '';
    for (var i = 0; i < analysisResponse.content.length; i++) {
      if (analysisResponse.content[i].type === 'text') {
        rawText += analysisResponse.content[i].text;
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

    // Inject the actual search queries used
    data.search_queries_used = [query1, query2, query3];

    return res.json({ success: true, data: data });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
}
