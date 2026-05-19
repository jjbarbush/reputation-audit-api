import Anthropic from '@anthropic-ai/sdk';

var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildStageRules() {
  var r = 'STAGE Framework:\n';
  r += '- S (Scene): The context where a customer encounter happens (review site, social post, forum thread)\n';
  r += '- T (Tension): The specific friction or complaint the customer raises\n';
  r += '- A (Alleviate): Does the brand acknowledge and validate the issue?\n';
  r += '- G (Ground): Does the brand provide specific evidence, data, or concrete details?\n';
  r += '- E (Engage): Does the brand offer a clear next step or path forward?\n\n';
  return r;
}

function buildJsonSchema(brandName) {
  var s = 'Return ONLY valid JSON with this exact structure (no markdown, no explanation, no preamble):\n\n';
  s += '{\n';
  s += '  "brand": "' + brandName + '",\n';
  s += '  "timestamp": "ISO 8601 timestamp",\n';
  s += '  "synthesis_preview": "2-3 sentence summary of what an AI search engine would say when asked: Is ' + brandName + ' good? Write as the AI answering directly.",\n';
  s += '  "verdict": "trusted | mixed | uncertain | negative",\n';
  s += '  "trust_score": 0,\n';
  s += '  "synthesis_clarity": 0,\n';
  s += '  "data_volume": "strong | moderate | thin | minimal",\n';
  s += '  "source_count": 0,\n';
  s += '  "critical_mention_count": 0,\n';
  s += '  "pattern_count": 0,\n';
  s += '  "search_queries_used": ["the actual queries you searched for"],\n';
  s += '  "critical_mentions": [\n';
  s += '    {\n';
  s += '      "source": "Platform name (Yelp, Reddit, Google Reviews, BBB, Trustpilot, etc.)",\n';
  s += '      "url": "Direct URL to the review/comment if found, or empty string",\n';
  s += '      "date": "Date if available, or empty string",\n';
  s += '      "excerpt": "Exact quote or close paraphrase from search results",\n';
  s += '      "scene": "Where this mention lives and who sees it",\n';
  s += '      "tension": "The specific friction or complaint being raised",\n';
  s += '      "sentiment": "positive | negative | neutral | mixed",\n';
  s += '      "influence": "high | medium | low",\n';
  s += '      "has_response": false,\n';
  s += '      "existing_response": "Brand response text if found, or null",\n';
  s += '      "stage_scores": { "alleviate": null, "ground": null, "engage": null },\n';
  s += '      "trust_impact": "One sentence: how this mention affects AI trust in the brand",\n';
  s += '      "suggested_response": "STAGE-structured response: Alleviate the concern, Ground with evidence, Engage with next step"\n';
  s += '    }\n';
  s += '  ],\n';
  s += '  "fog_words": ["vague words found in brand copy that weaken AI synthesis"],\n';
  s += '  "patterns": [\n';
  s += '    {\n';
  s += '      "theme": "Short description of recurring pattern",\n';
  s += '      "direction": "positive | negative | neutral",\n';
  s += '      "mention_count": 0,\n';
  s += '      "platforms": ["Platform1", "Platform2"],\n';
  s += '      "example_excerpt": "Example quote",\n';
  s += '      "severity": "high | medium | low"\n';
  s += '    }\n';
  s += '  ],\n';
  s += '  "recommendations": [\n';
  s += '    {\n';
  s += '      "action": "Specific actionable recommendation referencing real findings",\n';
  s += '      "priority": "high | medium | low",\n';
  s += '      "stage_element": "Scene | Tension | Alleviate | Ground | Engage",\n';
  s += '      "entropy_note": "What specific language or gap creates AI synthesis uncertainty"\n';
  s += '    }\n';
  s += '  ]\n';
  s += '}\n\n';
  return s;
}

function buildScoringRules() {
  var r = 'CRITICAL SCORING RULES:\n\n';
  r += 'trust_score (0-100): How much would an AI search engine trust this brand?\n';
  r += '- MUST account for data volume. Thin data = lower ceiling.\n';
  r += '- Fewer than 5 distinct sources: cap at 55 maximum.\n';
  r += '- 5-10 distinct sources: cap at 70 maximum.\n';
  r += '- Only 10+ sources with consistently positive sentiment can score above 70.\n';
  r += '- Above 85 is extremely rare. Reserved for Nike/Apple-tier brands.\n';
  r += '- Small/local brand with thin but positive data: 35-50.\n';
  r += '- Well-known brand with positive data: 60-75.\n';
  r += '- Zero negative data does NOT mean high trust. It may mean no data.\n\n';
  r += 'synthesis_clarity (0-100): How clear a narrative can AI build?\n';
  r += '- Sparse or contradictory data: LOW (20-40).\n';
  r += '- Consistent story with gaps: MODERATE (40-65).\n';
  r += '- Clear consistent story across many sources: HIGH (65-85).\n';
  r += '- Above 85 only for brands with extremely uniform public narratives.\n\n';
  r += 'stage_scores: 0-100 each, or null if brand has not responded.\n\n';
  return r;
}

function buildRecRules() {
  var r = 'RECOMMENDATION RULES:\n';
  r += '- Every recommendation MUST reference a specific finding from search results.\n';
  r += '- NEVER use generic language like "enhance platform functionality" or "match industry standards".\n';
  r += '- Name the specific platform, mention, or gap found in the data.\n';
  r += '- Good: "Respond to the 2-star Yelp review about slow delivery with a STAGE response: acknowledge the wait, share new shipping timeline, offer discount."\n';
  r += '- Bad: "Improve online reputation management." This is fog.\n';
  r += '- entropy_note must name specific words, gaps, or contradictions.\n';
  r += '- Good entropy_note: "The phrase best-in-class donuts appears 3 times but no review explains what makes them better."\n';
  r += '- Bad entropy_note: "Messaging could be improved."\n\n';
  return r;
}

function buildOtherRules() {
  var r = 'OTHER RULES:\n';
  r += '- No em dashes. Use hyphens or commas.\n';
  r += '- Base everything on actual search results, not assumptions.\n';
  r += '- If data is thin, say so in synthesis_preview.\n';
  r += '- search_queries_used must list every query you actually searched for.\n';
  r += '- timestamp should be current ISO 8601 date/time.\n';
  r += '- Return ONLY the JSON object, nothing else.';
  return r;
}

// ========================================
// STANDARD MODE: 2 targeted searches + analysis (3 API calls)
// ========================================
function buildAnalysisPrompt(brandName, searchResults) {
  var p = 'You are a reputation analyst using the STAGE framework.\n\n';
  p += buildStageRules();
  p += 'Here are web search results about "' + brandName + '":\n\n';
  p += searchResults + '\n\n';
  p += 'Analyze these results and ' + buildJsonSchema(brandName);
  p += buildScoringRules();
  p += 'fog_words: Vague or hedging words in brand copy that weaken AI synthesis.\n';
  p += '- Examples: "innovative", "best-in-class", "premium", "solutions", "world-class"\n';
  p += '- Return empty array if none found.\n\n';
  p += 'source_count: Actual number of distinct sources/platforms found.\n\n';
  p += buildRecRules();
  p += buildOtherRules();
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
      content: 'Search the web for: "' + query + '". Summarize all key findings, mentions, reviews, complaints, and sentiments. Include specific quotes, ratings, platform names, and URLs. Be thorough and factual.'
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

async function runStandard(brandName) {
  var query1 = brandName + ' reviews ratings complaints customer experience';
  var query2 = brandName + ' reddit trustpilot yelp BBB legit';

  var result1 = await runSearch(query1);
  var result2 = await runSearch(query2);

  var allSearchResults = '';
  allSearchResults += '=== SEARCH 1: Reviews, Ratings, and Customer Experience ===\n' + result1 + '\n\n';
  allSearchResults += '=== SEARCH 2: Trust Platforms and Community Discussion ===\n' + result2 + '\n\n';

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
  return { rawText: rawText, queries: [query1, query2] };
}

// ========================================
// MAX MODE: Single intelligent call. Claude searches freely.
// ========================================
function buildMaxPrompt(brandName) {
  var p = 'You are a reputation analyst. Your job is to find out everything AI search engines know about "' + brandName + '" and analyze it using the STAGE framework.\n\n';
  p += buildStageRules();
  p += 'INSTRUCTIONS:\n';
  p += 'Search the web thoroughly for "' + brandName + '". You have access to web search. Use it as many times as you need.\n\n';
  p += 'Start broad, then follow threads:\n';
  p += '1. Search for reviews, ratings, and customer experience\n';
  p += '2. Search trust platforms: Reddit, Trustpilot, Yelp, BBB, Google Reviews\n';
  p += '3. Search for complaints, controversies, or negative coverage\n';
  p += '4. Search for the brand own website or social media to check their messaging\n';
  p += '5. If you find something interesting (a complaint thread, a viral post, a BBB filing), search deeper on it\n\n';
  p += 'Be thorough. The more sources you find, the more accurate the scoring.\n\n';
  p += 'After searching, analyze everything and ' + buildJsonSchema(brandName);
  p += buildScoringRules();
  p += 'fog_words: Vague or hedging words found in the brand own website copy, social bios, or responses.\n';
  p += '- Examples: "innovative", "best-in-class", "premium", "solutions", "world-class", "cutting-edge"\n';
  p += '- These weaken AI synthesis because they lack specificity.\n';
  p += '- Search the brand own site/social to find these.\n';
  p += '- Return empty array if none found.\n\n';
  p += 'source_count: Count every distinct source/platform you accessed.\n\n';
  p += buildRecRules();
  p += buildOtherRules();
  return p;
}

async function runMax(brandName) {
  var response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 15
    }],
    messages: [{
      role: 'user',
      content: buildMaxPrompt(brandName)
    }]
  });

  var rawText = '';
  for (var i = 0; i < response.content.length; i++) {
    if (response.content[i].type === 'text') {
      rawText += response.content[i].text;
    }
  }
  return { rawText: rawText, queries: [] };
}

// ========================================
// HANDLER
// ========================================
function parseJson(rawText) {
  var data = null;

  try {
    data = JSON.parse(rawText.trim());
  } catch (e) {
    var codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        data = JSON.parse(codeBlockMatch[1].trim());
      } catch (e2) {}
    }

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
  return data;
}

export default async function handler(req, res) {
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
  var mode = body.mode || 'standard';

  if (!brand || !brand.trim()) {
    return res.status(400).json({ success: false, error: 'Brand name is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ success: false, error: 'API key not configured on server' });
  }

  try {
    var brandName = brand.trim();
    var result;

    if (mode === 'max') {
      result = await runMax(brandName);
    } else {
      result = await runStandard(brandName);
    }

    var data = parseJson(result.rawText);

    if (!data) {
      return res.status(422).json({
        success: false,
        error: 'Failed to parse analysis results',
        raw_preview: result.rawText.substring(0, 300)
      });
    }

    // Inject search queries for standard mode
    if (mode !== 'max' && result.queries.length > 0) {
      data.search_queries_used = result.queries;
    }

    data.mode = mode;

    return res.json({ success: true, data: data });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
}
