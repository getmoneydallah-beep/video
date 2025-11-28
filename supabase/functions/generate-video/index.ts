import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase URL from environment (required)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) {
      return new Response(
        JSON.stringify({ error: 'SUPABASE_URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Use service role key for database operations (bypasses RLS)
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Initialize Supabase client
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    // Get FAL API key from secrets
    const falKey = Deno.env.get('FAL_KEY')
    if (!falKey) {
      return new Response(
        JSON.stringify({ 
          error: 'FAL_KEY not configured',
          message: 'API key not found in Supabase secrets'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request body with error handling
    let body
    try {
      body = await req.json()
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const {
      prompt,
      aspectRatio = '16:9',
      duration = '8s',
      resolution = '720p',
      negativePrompt,
      enhancePrompt = true,
      autoFix = true,
      seed,
      generateAudio = true,
    } = body

    // Validate required fields
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Prepare request to fal.ai API
    const falRequest: any = {
      prompt,
      aspect_ratio: aspectRatio,
      duration: duration,
      resolution: resolution,
      enhance_prompt: enhancePrompt,
      auto_fix: autoFix,
      generate_audio: generateAudio,
    }

    // Add optional fields
    if (negativePrompt) {
      falRequest.negative_prompt = negativePrompt
    }
    if (seed) {
      falRequest.seed = seed
    }

    // Submit request to fal.ai queue
    // Endpoint format: POST /fal-ai/veo3
    // Body should have parameters directly, not wrapped in "input"
    const falResponse = await fetch('https://queue.fal.run/fal-ai/veo3', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falRequest),
    })

    if (!falResponse.ok) {
      const errorData = await falResponse.json().catch(() => ({ message: 'Unknown error' }))
      console.error('fal.ai API error:', errorData)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to submit video generation',
          details: errorData,
          status: falResponse.status
        }),
        { 
          status: falResponse.status || 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const falData = await falResponse.json()
    console.log('fal.ai API response:', JSON.stringify(falData))

    const requestId = falData.request_id
    if (!requestId) {
      console.error('No request_id in response:', falData)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to get request ID from fal.ai',
          details: falData
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Store task in database
    const { error: dbError } = await supabaseClient
      .from('video_generations')
      .insert({
        task_id: requestId,
        prompt,
        model: 'veo3_fast',
        aspect_ratio: aspectRatio,
        status: 'pending',
        ...(seed && { seeds: seed }),
      })

    if (dbError) {
      console.error('Database error:', dbError)
      // Still return success since the API call succeeded, but log the error
      return new Response(
        JSON.stringify({
          success: true,
          requestId,
          message: 'Video generation started (but failed to save to database)',
          warning: dbError.message
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        taskId: requestId, // Keep for backward compatibility
        message: 'Video generation started',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
