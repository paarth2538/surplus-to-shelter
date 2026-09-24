// Supabase Edge Function: AI Food Intake Vision Processor
//
// ENVIRONMENT VARIABLES REQUIRED IN SUPABASE DASHBOARD:
// - GEMINI_API_KEY (Google AI Studio key for gemini-1.5-flash) OR
// - OPENAI_API_KEY (OpenAI API key for gpt-4o-mini)
//
// SECURITY & PRIVACY:
// - Verifies caller's authenticated Supabase user session (rejects unauthenticated requests).
// - Strict per-user rate limiting (max 10 requests/minute).
// - Image size max 5 MB; allowed formats: image/jpeg, image/png, image/webp.
// - Sanitizes model output against strict allowed food_type and unit enumerations.
// - Never receives or forwards personal donor data (names, phones, addresses).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_FOOD_TYPES = [
  'Prepared Meals',
  'Fruits & Vegetables',
  'Bakery',
  'Packaged Food',
  'Beverages',
  'Other'
];

const ALLOWED_UNITS = [
  'Meals',
  'Kg',
  'Boxes',
  'Crates',
  'Packets',
  'Pieces'
];

// Simple in-memory rate-limiter per user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 10) {
    return false;
  }
  entry.count += 1;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or expired session.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // 2. Check Rate Limit
    if (!checkRateLimit(user.id)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait 1 minute before analyzing another photo.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // 3. Parse and Validate Payload
    const body = await req.json();
    const { image_base64, mime_type } = body;

    if (!image_base64 || !mime_type) {
      return new Response(
        JSON.stringify({ error: 'Missing image_base64 or mime_type.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(mime_type)) {
      return new Response(
        JSON.stringify({ error: 'Unsupported format. Please upload JPEG, PNG, or WebP.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Rough Base64 byte length check (max 5 MB = ~7,000,000 chars)
    if (image_base64.length > 7340032) {
      return new Response(
        JSON.stringify({ error: 'Image size exceeds 5 MB limit. Please choose a smaller photo.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 4. Call AI Vision Model (Gemini or OpenAI)
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openAiKey = Deno.env.get('OPENAI_API_KEY');

    if (!geminiKey && !openAiKey) {
      return new Response(
        JSON.stringify({
          error: 'AI vision provider is not configured on this server.',
          ai_available: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 }
      );
    }

    const promptText = `You are a food intake assistant for Surplus2Shelter, a food rescue charity platform.
Analyze the food in this image and return a JSON object with:
- "food_name": concise, humane descriptive name (e.g. "Cooked Rice & Lentil Curry", "Fresh Apples", "Artisan Bread Loaves"). Max 50 characters.
- "food_type": MUST be exactly one of: ["Prepared Meals", "Fruits & Vegetables", "Bakery", "Packaged Food", "Beverages", "Other"].
- "quantity": conservative numeric estimate of the quantity shown (e.g. 15, 20, 50). Minimum 1.
- "unit": MUST be exactly one of: ["Meals", "Kg", "Boxes", "Crates", "Packets", "Pieces"].
- "suggested_expiry_hours": realistic shelf-life hours remaining based on food state (e.g., 4 to 8 hours for warm prepared meals, 24 to 72 hours for produce/bakery, 168+ hours for packaged goods).
- "confidence": number between 0.1 and 0.99 indicating identification confidence.

Return ONLY a valid JSON object with these exact keys and no extra formatting or markdown.`;

    let rawJsonText = '';

    if (geminiKey) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: promptText },
                  {
                    inline_data: {
                      mime_type: mime_type,
                      data: image_base64
                    }
                  }
                ]
              }],
              generationConfig: {
                temperature: 0.2,
                response_mime_type: 'application/json'
              }
            })
          }
        );
        clearTimeout(timeoutId);

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          throw new Error(`Gemini API error: ${errText}`);
        }

        const geminiJson = await geminiRes.json();
        rawJsonText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      } catch (geminiErr: unknown) {
        clearTimeout(timeoutId);
        throw geminiErr;
      }
    } else if (openAiKey) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptText },
                  {
                    type: 'image_url',
                    image_url: { url: `data:${mime_type};base64,${image_base64}` }
                  }
                ]
              }
            ],
            max_tokens: 300,
            temperature: 0.2
          })
        });
        clearTimeout(timeoutId);

        if (!openAiRes.ok) {
          const errText = await openAiRes.text();
          throw new Error(`OpenAI API error: ${errText}`);
        }

        const openAiJson = await openAiRes.json();
        rawJsonText = openAiJson.choices?.[0]?.message?.content || '{}';
      } catch (openAiErr: unknown) {
        clearTimeout(timeoutId);
        throw openAiErr;
      }
    }

    // 5. Parse, Sanitize & Validate JSON
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawJsonText);
    } catch {
      return new Response(
        JSON.stringify({ error: 'AI response could not be parsed. Please enter details manually.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    const foodName = typeof parsed.food_name === 'string' ? parsed.food_name.trim().slice(0, 80) : 'Surplus Food';
    const foodType = ALLOWED_FOOD_TYPES.includes(String(parsed.food_type)) ? String(parsed.food_type) : 'Other';
    const quantity = Number(parsed.quantity) > 0 ? Math.round(Number(parsed.quantity) * 10) / 10 : 10;
    const unit = ALLOWED_UNITS.includes(String(parsed.unit)) ? String(parsed.unit) : 'Meals';
    const suggestedExpiryHours = Math.max(1, Math.min(168, Number(parsed.suggested_expiry_hours) || 6));
    const confidence = Math.max(0.1, Math.min(1.0, Number(parsed.confidence) || 0.8));

    // Calculate suggested ISO expiry timestamp
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + suggestedExpiryHours);

    return new Response(
      JSON.stringify({
        success: true,
        estimate: {
          food_name: foodName,
          food_type: foodType,
          quantity: quantity,
          unit: unit,
          suggested_expiry_hours: suggestedExpiryHours,
          suggested_expiry_time: expiryDate.toISOString(),
          confidence: Math.round(confidence * 100) / 100
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
