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
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get API key from secrets
    const apiKey = Deno.env.get('KIE_AI_API_KEY')
    if (!apiKey) {
      throw new Error('KIE_AI_API_KEY not found in environment')
    }

    // Parse request body
    const body = await req.json()
    const {
      prompt,
      imageUrls = [],
      model = 'veo3_fast',
      watermark,
      callBackUrl,
      aspectRatio = '16:9',
      seeds,
      enableFallback = false,
      enableTranslation = true,
      generationType = 'REFERENCE_2_VIDEO'
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

    // Prepare request to Kie.ai API
    const kieRequest = {
      prompt,
      model,
      aspectRatio,
      enableFallback,
      enableTranslation,
      generationType,
      ...(imageUrls.length > 0 && { imageUrls }),
      ...(watermark && { watermark }),
      ...(callBackUrl && { callBackUrl }),
      ...(seeds && { seeds }),
    }

    // Call Kie.ai API
    const kieResponse = await fetch('https://api.kie.ai/api/v1/veo/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(kieRequest),
    })

    const kieData = await kieResponse.json()

    if (kieData.code !== 200 || !kieData.data?.taskId) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to generate video',
          details: kieData.msg || kieData
        }),
        { 
          status: kieResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const taskId = kieData.data.taskId

    // Store task in database
    const { error: dbError } = await supabaseClient
      .from('video_generations')
      .insert({
        task_id: taskId,
        prompt,
        image_urls: imageUrls,
        model,
        watermark,
        aspect_ratio: aspectRatio,
        seeds,
        enable_fallback: enableFallback,
        enable_translation: enableTranslation,
        generation_type: generationType,
        status: 'pending',
      })

    if (dbError) {
      console.error('Database error:', dbError)
      // Still return success since the API call succeeded
    }

    return new Response(
      JSON.stringify({
        success: true,
        taskId,
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

