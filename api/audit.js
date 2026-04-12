import Anthropic from '@anthropic-ai/sdk';

var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Models
var SEARCH_MODEL = 'claude-haiku-4-20250514';   // fast + cheap for web search passes
var ANALYSIS_MODEL = 'claude-sonnet-4-20250514'; // full reasoning for STAGE analysis

// Per-request timeout (ms) - keeps us well inside Vercel's 180s maxDuration
var REQUEST_TIMEOUT_MS = 150000;

function buildAnalysisPrompt(brandName, searchResults) {
      var p = 'You are a reputation analyst using the STAGE framework (Scene, Tension, Alleviate, Ground, Engage).\n\n';
      p += 'STAGE Framework:\n';
      p += '- S (Scene): The context where a customer encounter happens (review site, social post, forum thread)\n';
      p += '- T (Tension): The specific friction or complaint the customer raises\n';
      p += '- A (Alleviate): Does the brand acknowledge and validate the issue?\n';
      p += '- G (Ground): Does the brand provide specific evidence, data, or concrete details?\n';
      p += '- E (Engage): Does the brand offer a clear next step or path forward?\n\n';
      p += 'Here are web search results about "' + brandName + '":\n\n';
      p += searchResults + '\n\n';
      p += 'Analyze these results and return ONLY valid JSON with this exact structure (no markdown, no explanation, no preamble):\n\n';
      p += '{\n';
      p += ' "brand": "' + brandName + '",\n';
      p += ' "timestamp": "ISO 8601 timestamp of when this analysis was generated",\n';
      p += ' "synthesis_preview": "2-3 sentence summary of what an AI search engine would say when someone asks: Is ' + brandName + ' good? Write as if you are the AI answering that question directly.",\n';
      p += ' "verdict": "trusted | mixed | uncertain | negative",\n';
      p += ' "trust_score": 0,\n';
      p += ' "synthesis_clarity": 0,\n';
      p += ' "data_volume": "strong | moderate | thin | minimal",\n';
      p += ' "source_count": 0,\n';
      p += ' "critical_mention_count": 0,\n';
      p += ' "pattern_count": 0,\n';
      p += ' "search_queries_used": [],\n';
      p += ' "critical_mentions": [\n';
      p += '  {\n';
      p += '   "source": "Platform name (e.g. Yelp, Reddit, Google Reviews, BBB, Trustpilot)",\n';
      p += '   "url": "Direct URL to the specific review/comment if found, or empty string",\n';
      p += '   "date": "Date of the mention if available, or empty string",\n';
      p += '   "excerpt": "Exact quote or close paraphrase from search results",\n';
      p += '   "scene": "Brief description of where this mention lives and who sees it",\n';
      p += '   "tension": "The specific friction or complaint being raised",\n';
      p += '   "sentiment": "positive | negative | neutral | mixed",\n';
      p += '   "influence": "high | medium | low - how much this mention shapes AI synthesis",\n';
      p += '   "has_response": false,\n';
      p += '   "existing_response": "Brand response text if found, or null",\n';
      p += '   "stage_scores": {\n';
      p += '    "alleviate": null,\n';
      p += '    "ground": null,\n';
      p += '    "engage": null\n';
      p += '   },\n';
      p += '   "trust_impact": "One sentence: how this mention affects AI trust in the brand",\n';
      p += '   "suggested_response": "A STAGE-structured response the brand should use (Alleviate the concern, Ground with evidence, Engage with next step)"\n';
      p += '  }\n';
      p += ' ],\n';
      p += ' "fog_words": ["word1", "word2"],\n';
      p += ' "patterns": [\n';
      p += '  {\n';
      p += '   "theme": "Short description of recurring pattern",\n';
      p += '   "direction": "positive | negative | neutral",\n';
      p += '   "mention_count": 0,\n';
      p += '   "platforms": ["Platform1", "Platform2"],\n';
      p += '   "example_excerpt": "Example quote showing this pattern",\n';
      p += '   "severity": "high | medium | low"\n';
      p += '  }\n';
      p += ' ],\n';
      p += ' "recommendations": [\n';
      p += '  {\n';
      p += '   "action": "Specific actionable recommendation - MUST name a specific platform, mention, or gap from the search data",\n';
      p += '   "priority": "high | medium | low",\n';
      p += '   "stage_element": "Which STAGE element this addresses (Scene, Tension, Alleviate, Ground, or Engage)",\n';
      p += '   "entropy_note": "What specific language or data gap creates synthesis uncertainty for AI about this brand"\n';
      p += '  }\n';
      p += ' ]\n';
      p += '}\n\n';
      p += 'CRITICAL SCORING RULES - READ CAREFULLY:\n\n';
      p += 'trust_score (0-100): How much would an AI search engine trust this brand based on available public data?\n';
      p += '- This score MUST account for data volume. Thin data = lower ceiling.\n';
      p += '- If search results contain fewer than 5 distinct sources: cap trust_score at 55 maximum.\n';
      p += '- If search results contain 5-10 distinct sources: cap trust_score at 70 maximum.\n';
      p += '- Only brands with 10+ distinct sources AND consistently positive sentiment can score above 70.\n';
      p += '- Scoring above 85 should be extremely rare - reserved for major brands with deep, consistent positive presence.\n';
      p += '- A small/local brand with mostly positive but thin data should score 35-50.\n';
      p += '- A well-known brand with mostly positive data should score 60-75.\n';
      p += '- A major brand like Nike or Apple with massive positive presence scores 75-85.\n';
      p += '- Zero negative data does NOT mean high trust. It may mean no data at all.\n\n';
      p += 'synthesis_clarity (0-100): How clear and coherent a narrative can AI build about this brand?\n';
      p += '- If data is contradictory or sparse, clarity is LOW (20-40).\n';
      p += '- If data tells a consistent story with some gaps, clarity is MODERATE (40-65).\n';
      p += '- If data tells a clear, consistent story across many sources, clarity is HIGH (65-85).\n';
      p += '- Above 85 only for brands with extremely clear, uniform public narratives.\n\n';
      p += 'stage_scores for each mention (alleviate, ground, engage): 0-100 each, or null if brand has not responded.\n';
      p += '- These score the quality of the brand existing response, if one exists.\n';
      p += '- If has_response is false, all three should be null.\n\n';
      p += 'fog_words: List any vague, hedging, or adverbially unclear words found in the brand public-facing copy or responses.\n';
      p += '- Examples: "innovative", "best-in-class", "premium", "solutions", "leverage", "synergy", "world-class"\n';
      p += '- These are words that create uncertainty in AI synthesis because they lack specificity.\n';
      p += '- Return an empty array if none found.\n\n';
      p += 'source_count: The actual number of distinct sources/platforms found in search results.\n\n';
      p += 'RECOMMENDATION QUALITY RULES - CRITICAL:\n';
      p += 'Every recommendation MUST be specific to this brand and this search data. Generic corporate advice is FORBIDDEN.\n\n';
      p += 'NEVER write recommendations like:\n';
      p += '- "Enhance e-commerce platform functionality to match industry standards"\n';
      p += '- "Improve customer experience across touchpoints"\n';
      p += '- "Leverage digital channels to increase brand awareness"\n';
      p += '- "Develop a comprehensive content strategy"\n';
      p += '- "Optimize your online presence"\n\n';
      p += 'ALWAYS write recommendations that:\n';
      p += '1. Name the specific platform or source from the search results (e.g. "Your Yelp listing shows..." or "The Reddit thread on r/dogs mentions...")\n';
      p += '2. Reference the actual complaint, gap, or pattern found (e.g. "3 reviewers mentioned slow shipping" not "improve delivery")\n';
      p += '3. Give a concrete next action (e.g. "Reply to the unanswered Google review from March" not "respond to reviews")\n';
      p += '4. Include an entropy_note that identifies what specific language or data gap creates AI synthesis uncertainty\n\n';
      p += 'GOOD example: "Your BBB profile has 2 unresolved complaints about billing errors from 2024. Respond to each with a specific resolution and post a public update - unanswered complaints on BBB are heavily weighted by AI trust signals."\n';
      p += 'BAD example: "Enhance your reputation management strategy to align with industry best practices."\n\n';
      p += 'If search data is thin and you cannot make specific recommendations, say so explicitly: "Search data is too thin to make specific platform recommendations. Priority is generating any indexed presence on [specific platforms that showed up as empty]."\n\n';
      p += 'OTHER RULES:\n';
      p += '- No em dashes anywhere. Use hyphens or commas instead.\n';
      p += '- Base everything on actual search results, not assumptions.\n';
      p += '- If search results are thin, say so clearly in the synthesis_preview.\n';
      p += '- timestamp should be the current ISO 8601 date/time.\n';
      p += '- Return ONLY the JSON object, nothing else.';
      return p;
}

// Wraps a promise with an AbortController timeout
function withTimeout(promise, ms) {
      return new Promise(function(resolve, reject) {
              var timer = setTimeout(function() {
                        reject(new Error('Request timed out after ' + ms + 'ms'));
              }, ms);
              promise.then(
                        function(val) { clearTimeout(timer); resolve(val); },
                        function(err) { clearTimeout(timer); reject(err); }
                      );
      });
}

async function runSearch(query) {
      var response = await client.messages.create({
              model: SEARCH_MODEL,
              max_tokens: 2048,
              tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
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

function parseJson(rawText) {
      // Attempt 1: direct parse
  try { return JSON.parse(rawText.trim()); } catch (e) {}
      // Attempt 2: strip markdown code fences
  var fenceMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) {
              try { return JSON.parse(fenceMatch[1].trim()); } catch (e) {}
      }
      // Attempt 3: extract outermost { ... }
  var first = rawText.indexOf('{');
      var last = rawText.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
              try { return JSON.parse(rawText.substring(first, last + 1)); } catch (e) {}
      }
      return null;
}

export default async function handler(req, res) {
      // CORS handled by vercel.json headers config - no need to repeat here

  if (req.method === 'OPTIONS') {
          return res.status(200).end();
  }

  if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'POST only' });
  }

  // --- Simple shared-secret auth ---
  // Set AUDIT_API_KEY in Vercel env vars. If not set, auth is skipped (dev mode).
  var expectedKey = process.env.AUDIT_API_KEY;
      if (expectedKey) {
              var incomingKey = req.headers['x-api-key'];
              if (!incomingKey || incomingKey !== expectedKey) {
                        return res.status(401).json({ success: false, error: 'Unauthorized' });
              }
      }

  if (!process.env.ANTHROPIC_API_KEY) {
          return res.status(500).json({ success: false, error: 'API key not configured on server' });
  }

  var body = req.body || {};
      var brand = body.brand;
      if (!brand || !brand.trim()) {
              return res.status(400).json({ success: false, error: 'Brand name is required' });
      }

  try {
          var brandName = brand.trim();
          var query1 = brandName + ' reviews ratings complaints customer experience';
          var query2 = brandName + ' reddit trustpilot yelp BBB legit';

        // Run both searches in parallel, both wrapped with the global timeout
        var [result1, result2] = await withTimeout(
                  Promise.all([runSearch(query1), runSearch(query2)]),
                  REQUEST_TIMEOUT_MS
                );

        var allSearchResults = '';
          allSearchResults += '=== SEARCH 1: Reviews, Ratings, and Customer Experience ===\n' + result1 + '\n\n';
          allSearchResults += '=== SEARCH 2: Trust Platforms and Community Discussion ===\n' + result2 + '\n\n';

        var analysisPrompt = buildAnalysisPrompt(brandName, allSearchResults);

        var analysisResponse = await withTimeout(
                  client.messages.create({
                              model: ANALYSIS_MODEL,
                              max_tokens: 4096,
                              messages: [{ role: 'user', content: analysisPrompt }]
                  }),
                  REQUEST_TIMEOUT_MS
                );

        var rawText = '';
          for (var i = 0; i < analysisResponse.content.length; i++) {
                    if (analysisResponse.content[i].type === 'text') {
                                rawText += analysisResponse.content[i].text;
                    }
          }

        var data = parseJson(rawText);

        if (!data) {
                  return res.status(422).json({
                              success: false,
                              error: 'Failed to parse analysis results',
                              raw_preview: rawText.substring(0, 300)
                  });
        }

        // Always use the server-constructed queries - more reliable than Claude's self-report
        data.search_queries_used = [query1, query2];

        return res.json({ success: true, data: data });

  } catch (err) {
          var status = err.message && err.message.includes('timed out') ? 504 : 500;
          return res.status(status).json({
                    success: false,
                    error: err.message || 'Internal server error'
          });
  }
}
