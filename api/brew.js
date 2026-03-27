export const config = { runtime: 'edge' };

const BREW_LINK_API = 'https://brew-link-generator-410676905016.us-central1.run.app/jit_plugin/generateBrewLink';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const BREW_SYSTEM_PROMPT = `You are an expert Fellow Aiden brewer and coffee scientist. Your job is to:
1. If given a URL, use web_search to fetch the product page and extract: coffee name, roaster, origin, roast level (Light/Light-Medium/Medium/Medium-Dark/Dark), processing method, and tasting notes.
2. Generate a precision brew profile for the Fellow Aiden coffee maker.

Fellow Aiden parameters:
- ratio: water-to-coffee ratio (e.g. 16.5)
- bloomEnabled: boolean
- bloomRatio: bloom water multiplier (2-3x coffee weight)
- bloomDuration: seconds (30-60)
- bloomTemperature: °C
- ssPulsesEnabled: boolean
- ssPulsesNumber: 1-4 pulses
- ssPulsesInterval: seconds between pulses (15-35)
- ssPulseTemperatures: array of °C per pulse (always step DOWN)
- batchPulsesEnabled: boolean
- batchPulsesNumber: 2-5 pulses
- batchPulsesInterval: seconds (25-45)
- batchPulseTemperatures: array of °C per pulse (always step DOWN)

Grind for DF64 Gen2 (dial 0-90, filter range 50-90):
- Light washed: dial 52-56 single / 63-68 batch (~720-770μm / ~900-950μm)
- Light natural/honey: dial 54-58 single / 65-70 batch
- Light carbonic/anaerobic: dial 55-60 single / 67-72 batch
- Medium: dial 57-63 single / 68-75 batch
- Medium-dark/dark: dial 60-68 single / 72-80 batch

Key principles:
- High solubility (carbonic, natural): lower temps, coarser grind, moderate pulses, bloom ratio 3:1
- Low solubility (washed): higher temps, finer grind, bloom ratio 2.5:1
- Always step temperatures DOWN across pulses
- Single serve: 2-3 pulses, shorter intervals; Batch: 3-5 pulses, longer intervals

Return ONLY valid JSON, no markdown fences, no explanation:
{
  "profileType": 0,
  "title": "...",
  "roaster": "...",
  "origin": "...",
  "roastLevel": "...",
  "process": "...",
  "tastingNotes": "...",
  "ratio": 16.5,
  "bloomEnabled": true,
  "bloomRatio": 2.5,
  "bloomDuration": 40,
  "bloomTemperature": 97,
  "ssPulsesEnabled": true,
  "ssPulsesNumber": 3,
  "ssPulsesInterval": 20,
  "ssPulseTemperatures": [97, 95, 93],
  "batchPulsesEnabled": true,
  "batchPulsesNumber": 4,
  "batchPulsesInterval": 30,
  "batchPulseTemperatures": [97, 95, 93, 91],
  "grindSingleDf64": 54,
  "grindBatchDf64": 66,
  "grindSingleMicrons": 740,
  "grindBatchMicrons": 930,
  "whyItWorks": "One sentence explaining the key logic.",
  "expectedResult": "One sentence tasting prediction."
}`;

const ADJUST_SYSTEM_PROMPT = `You are an expert Fellow Aiden brewer. Adjust a brew profile based on taste feedback.
DF64 Gen2: dial 0-90, filter 50-90.
Adjustment rules:
- Too bitter: lower temps 1-2°C, coarser grind +2-4 dial, add interval time
- Too sour/acidic: raise temps 1-2°C, finer grind -2-3 dial, reduce intervals
- Too weak/watery: lower ratio (more coffee), finer grind, more pulses
- Too strong/harsh: higher ratio, coarser grind, fewer pulses
- Muddy/heavy: coarser grind, more intervals, reduce pulses
- Lacking sweetness: raise bloom temp, extend bloom, optimize step-down
- Over-fermented/funky: lower bloom temp, steeper step-down, shorter bloom
- Lost clarity: raise temps slightly, fewer pulses, shorter intervals
Return ONLY valid JSON with same structure. Update whyItWorks to explain the adjustments made.`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const body = await req.json();
    const { action, coffeeUrl, manualDetails, brewmode, profile, feedback } = body;

    // Step 1: Generate profile via Claude
    let profileData = null;

    if (action === 'generate') {
      let userMsg = '';
      if (coffeeUrl) {
        userMsg = `Product URL: ${coffeeUrl}\nUse web_search to fetch this page and extract the coffee details, then generate the brew profile.\nBrew mode: ${brewmode || 'both'}`;
      } else if (manualDetails) {
        userMsg = `Coffee details:\n${JSON.stringify(manualDetails)}\nBrew mode: ${brewmode || 'both'}`;
      }

      const claudeResp = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 2000,
          system: BREW_SYSTEM_PROMPT,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: userMsg }]
        })
      });

      const claudeData = await claudeResp.json();
      if (claudeData.error) throw new Error(`Anthropic: ${claudeData.error.message}`);
      const text = claudeData.content.filter(x => x.type === 'text').map(x => x.text).join('');
      const clean = text.replace(/```json|```/g, '').trim();
      profileData = JSON.parse(clean);

    } else if (action === 'adjust') {
      const claudeResp = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1500,
          system: ADJUST_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `Current profile: ${JSON.stringify(profile)}\nTaste feedback: ${feedback.join(', ')}\nApply targeted adjustments only. Keep what's working.`
          }]
        })
      });

      const claudeData = await claudeResp.json();
      if (claudeData.error) throw new Error(`Anthropic: ${claudeData.error.message}`);
      const text = claudeData.content.filter(x => x.type === 'text').map(x => x.text).join('');
      profileData = JSON.parse(text.replace(/```json|```/g, '').trim());
    }

    if (!profileData) {
      return new Response(JSON.stringify({ error: 'Failed to generate profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Step 2: Call brew-link-generator
    const brewPayload = {
      profileType: 0,
      title: profileData.title,
      ratio: profileData.ratio,
      bloomEnabled: profileData.bloomEnabled,
      bloomRatio: profileData.bloomRatio,
      bloomDuration: profileData.bloomDuration,
      bloomTemperature: profileData.bloomTemperature,
      ssPulsesEnabled: true,
      ssPulsesNumber: profileData.ssPulsesNumber,
      ssPulsesInterval: profileData.ssPulsesInterval,
      ssPulseTemperatures: profileData.ssPulseTemperatures,
      batchPulsesEnabled: true,
      batchPulsesNumber: profileData.batchPulsesNumber,
      batchPulsesInterval: profileData.batchPulsesInterval,
      batchPulseTemperatures: profileData.batchPulseTemperatures
    };

    let brewLink = null;
    try {
      const blResp = await fetch(BREW_LINK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brewPayload)
      });
      if (blResp.ok) {
        const raw = await blResp.text();
        brewLink = raw.replace(/'/g, '').trim();
        if (!brewLink.startsWith('http')) brewLink = null;
      }
    } catch (e) {
      // brew.link unavailable, continue without it
    }

    return new Response(JSON.stringify({ profile: profileData, brewLink }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
