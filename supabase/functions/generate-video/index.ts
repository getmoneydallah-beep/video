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
    // Get Supabase URL from request or environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 
      req.headers.get('x-supabase-url') ||
      'https://xpkvqfkhbfvjqkeqsomb.supabase.co'
    
    // Use service role key for database operations (bypasses RLS)
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 
      Deno.env.get('SUPABASE_ANON_KEY') || 
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwa3ZxZmtoYmZ2anFrZXFzb21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyODEzODgsImV4cCI6MjA3OTg1NzM4OH0.SHcbSbCiS-aMi5TBkwXyvPVvcZJvikeztd9jGrg9BIg'
    
    // Initialize Supabase client
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    // Get API key from secrets
    const apiKey = Deno.env.get('KIE_AI_API_KEY')
    if (!apiKey) {
      console.error('KIE_AI_API_KEY not found in environment')
      return new Response(
        JSON.stringify({ 
          error: 'KIE_AI_API_KEY not configured',
          message: 'API key not found in Supabase secrets'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
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
    
    console.log('Kie.ai API response:', JSON.stringify(kieData))

    if (kieData.code !== 200 || !kieData.data?.taskId) {
      console.error('Kie.ai API error:', kieData)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to generate video',
          details: kieData.msg || kieData,
          code: kieData.code,
          status: kieResponse.status
        }),
        { 
          status: kieResponse.status || 500,
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
      // Still return success since the API call succeeded, but log the error
      return new Response(
        JSON.stringify({
          success: true,
          taskId,
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

