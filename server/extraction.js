const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Kept intentionally close to the JSON shape used in the dfi_live_extraction_test.html
// prototype so downstream code (and the batch tester) can treat both as interchangeable.
const EXTRACTION_PROMPT = `You are analysing an architectural concept sketch, massing diagram, floor plan, or site plan for a building project. The values below feed a statutory compliance check, so the setbacks, plot dimensions and height matter as much as the rooms — extract them when the drawing supports it, and be honest when it does not.

Return ONLY a JSON object, no markdown fences, no other text, matching exactly this shape:
{
  "typology_guess": string,
  "dimensions_present": boolean,
  "scale_note": string,
  "plot": { "width_m": number_or_null, "depth_m": number_or_null, "area_sqm": number_or_null, "abutting_road_width_m": number_or_null },
  "setbacks_m": { "front": number_or_null, "rear": number_or_null, "side": number_or_null },
  "building_height_m": number_or_null,
  "floor_count": number_or_null,
  "massing_blocks": [{"label": string, "polygon_m": [[number, number]], "base_m": number_or_null, "top_m": number_or_null}],
  "rooms": [{"label": string, "approx_area_sqm": number_or_null, "polygon_m": [[number, number]]}],
  "total_footprint_sqm_estimate": number_or_null,
  "unit_count_estimate": number_or_null,
  "door_count_estimate": number_or_null,
  "window_count_estimate": number_or_null,
  "confidence_notes": string
}

Rules:
- SCALE IS DECISIVE. Set "dimensions_present" true ONLY if the drawing has visible dimension lines, a stated scale (e.g. "1:100"), or a scale bar. If it does, use them and say so in "scale_note". If it does NOT, set "dimensions_present" false, set every metric field you cannot read to null, and put ONLY rough proportional guesses in room areas/footprint while stating clearly in confidence_notes that these are unscaled and unreliable. Never invent setbacks, plot dimensions, or height from an unscaled sketch — return null.
- SETBACKS: read the dimensioned gaps between the plot boundary and the building footprint on a site/ground-floor plan (front = the road side). Report each only if there is a dimension for it; otherwise null. Front setback and side/rear may differ — report the actual measured value, not a typical one.
- PLOT: report width_m, depth_m and area_sqm only if dimensioned or stated. "abutting_road_width_m" only if the road width is labelled.
- building_height_m and floor_count: from an elevation/section, a height dimension, or a stated floor count (e.g. "G+7" → floor_count 8); else null.
- massing_blocks (OPTIONAL — omit or [] unless the footprint is clearly non-rectangular, e.g. L/U/T-shaped, or there are distinct blocks/a podium+tower): give each block's footprint as "polygon_m", an ordered ring of [x, y] vertices in metres in the plot frame (origin at a plot corner, x across width, y along depth). "base_m"/"top_m" are the block's start/end heights in metres (e.g. a podium base_m 0 top_m 12, a tower base_m 0 top_m 45). Only provide this when the shape is genuinely readable from the drawing; do not fabricate a polygon for a plain rectangle.
- total_footprint_sqm_estimate is the building's ground-floor footprint, not total built-up across floors.
- rooms[].polygon_m (OPTIONAL — only for a detailed, dimensioned floor plan where a room's actual outline and POSITION are clearly readable): give the room's footprint as an ordered ring of [x, y] vertices in metres in the plot frame (same origin/axes as plot and setbacks). This is the room's true drawn shape and location, not a guess — if you cannot read the real position, omit polygon_m for that room and give only approx_area_sqm. Do not invent positions.
- If the image is not an architectural drawing at all, set typology_guess to "not a floor plan or sketch", dimensions_present false, and explain in confidence_notes.
- Do not fabricate precision you don't have — prefer null and a note over a confident-looking guess.`;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Sends an image to Claude for structured building-data extraction.
 * @param {string} imageBase64 - base64-encoded image data (no data: prefix)
 * @param {string} mediaType - e.g. 'image/png', 'image/jpeg'
 * @returns {Promise<{data: object|null, raw: string, error: string|null}>}
 */
async function extractBuildingData(imageBase64, mediaType) {
  if (!imageBase64) throw new Error('No image data provided');
  const approxBytes = Math.ceil((imageBase64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (${(approxBytes / 1024 / 1024).toFixed(1)}MB) — limit is 10MB`);
  }

  const response = await getClient().messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: EXTRACTION_PROMPT }
        ]
      }
    ]
  });

  const raw = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return { ...parseModelJson(raw), raw };
}

/**
 * Best-effort parse of a model's textual reply into the extraction JSON object.
 * Tolerates markdown code fences AND surrounding prose (e.g. a claude.ai reply
 * like "Here's the data: { ... } Let me know if...") by falling back to the
 * outermost { ... } slice when a direct parse fails.
 * @param {string} raw
 * @returns {{data: object|null, error: string|null}}
 */
function parseModelJson(raw) {
  const cleaned = String(raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    return { data: JSON.parse(cleaned), error: null };
  } catch (e) {
    // ignore, try the slice fallback below
  }

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return { data: JSON.parse(cleaned.slice(first, last + 1)), error: null };
    } catch (e) {
      // fall through
    }
  }

  return { data: null, error: 'Response did not contain valid JSON' };
}

module.exports = { extractBuildingData, parseModelJson, EXTRACTION_PROMPT };
