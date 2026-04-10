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
  p += 'Analyze these results and return ONLY valid JSON (no markdown, no explanation):\n\n';
  p += '{\n';
  p += '  "brand": "' + brandName + '",\n';
  p += '  "synthesis_preview": "2-3 sentence summary of what AI will say when asked Is ' + brandName + ' reliable?",\n';
  p += '  "verdict": "trustworthy | mixed | questionable | concerning",\n';
  p += '  "collapse_risk": 0,\n';
  p += '  "age_quality": 0,\n';
  p += '  "critical_mention_count": 0,\n';
  p += '  "pattern_count": 0,\n';
  p += '  "search_queries_used": [],\n';
  p += '  "critical_mentions": [{ "source": "Platform", "url": "", "excerpt": "Quote", "risk_score": 0, "connectedness_score": 0, "has_response": false, "existing_response": null, "age_score": null, "age_breakdown": { "alleviate": null, "ground": null, "engage": null }, "collapse_issue": "Issue", "suggested_response": "AGE response" }],\n';
  p += '  "patterns": [{ "theme": "Pattern", "mention_count": 0, "platforms": [], "example_excerpt": "Quote", "severity": "high | medium | low" }],\n';
  p += '  "recommendations": ["Rec 1", "Rec 2", "Rec 3"]\n';
  p += '}\n\n';
  p += 'RULES: No em dashes. Base on actual results. Return ONLY JSON.';
  return p;
}

async function runSearch(query) {
  var response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: [{ role: 'user', content: 'Search for: "' + query + '". Summarize key findings including quotes, ratings, platform names, and URLs. Be thorough.' }]
  });
  var text = '';
  for (var i = 0; i < response.content.length; i++) {
    if (response.content[i].type === 'text') text += response.content[i].text;
  }
  return text;
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  var body = req.body || {};
  var brand = body.brand;
  if (!brand || !brand.trim()) return res.status(400).json({ success: false, error: 'Brand name is required' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ success: false, error: 'API key not configured' });

  try {
    var brandName = brand.trim();

    // Phase 1: Two targeted searches (sequential to avoid rate limits)
    var query1 = brandName + ' reviews ratings complaints customer experience';
    var query2 = brandName + ' reddit trustpilot yelp BBB legit';

    var result1 = await runSearch(query1);
    var result2 = await runSearch(query2);

    var allResults = '=== SEARCH 1: Reviews and Complaints ===\n' + result1 + '\n\n';
    allResults += '=== SEARCH 2: Trust Platforms and Forums ===\n' + result2 + '\n\n';

    // Phase 2: AGE analysis
    var analysisResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildAnalysisPrompt(brandName, allResults) }]
    });

    var rawText = '';
    for (var i = 0; i < analysisResponse.content.length; i++) {
      if (analysisResponse.content[i].type === 'text') rawText += analysisResponse.content[i].text;
    }

    var data = null;
    try { data = JSON.parse(rawText.trim()); } catch (e) {
      var m = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (m) try { data = JSON.parse(m[1].trim()); } catch (e2) {}
      if (!data) {
        var f = rawText.indexOf('{'), l = rawText.lastIndexOf('}');
        if (f !== -1 && l !== -1) try { data = JSON.parse(rawText.substring(f, l + 1)); } catch (e3) {}
      }
    }

    if (!data) return res.status(422).json({ success: false, error: 'Failed to parse results', raw_preview: rawText.substring(0, 300) });

    data.search_queries_used = [query1, query2];
    return res.json({ success: true, data: data });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
