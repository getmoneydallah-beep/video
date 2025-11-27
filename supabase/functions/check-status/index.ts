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

    // Get taskId from query parameters or request body
    const url = new URL(req.url)
    let taskId = url.searchParams.get('taskId')
    
    if (!taskId) {
      // Try to get from body if not in query params
      try {
        const body = await req.json()
        taskId = body.taskId
      } catch {
        // Body might be empty, that's okay
      }
    }

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: 'taskId is required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Call Kie.ai API to check status
    // Try taskId as query parameter (most common for GET requests)
    let kieResponse = await fetch(
      `https://api.kie.ai/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    // If that doesn't work, try with different parameter name or in body
    if (!kieResponse.ok) {
      // Try alternative: task_id instead of taskId
      kieResponse = await fetch(
        `https://api.kie.ai/api/v1/veo/record-info?task_id=${encodeURIComponent(taskId)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      )
    }

    const kieData = await kieResponse.json()

    if (kieData.code !== 200) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to check status',
          details: kieData.msg || kieData
        }),
        { 
          status: kieResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const statusData = kieData.data

    // Determine status
    let status = 'pending'
    if (statusData.successFlag === 1) {
      status = 'completed'
    } else if (statusData.errorCode || statusData.errorMessage) {
      status = 'failed'
    } else if (statusData.response) {
      status = 'processing'
    }

    // Update database with latest status
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (statusData.response) {
      updateData.result_urls = statusData.response.resultUrls || []
      updateData.origin_urls = statusData.response.originUrls || []
      updateData.resolution = statusData.response.resolution
    }

    if (statusData.errorCode) {
      updateData.error_code = statusData.errorCode
    }

    if (statusData.errorMessage) {
      updateData.error_message = statusData.errorMessage
    }

    if (statusData.fallbackFlag !== undefined) {
      updateData.fallback_flag = statusData.fallbackFlag
    }

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = statusData.completeTime || new Date().toISOString()
    }

    const { error: dbError } = await supabaseClient
      .from('video_generations')
      .update(updateData)
      .eq('task_id', taskId)

    if (dbError) {
      console.error('Database update error:', dbError)
      // Still return the status from API
    }

    return new Response(
      JSON.stringify({
        success: true,
        taskId: statusData.taskId || taskId,
        status,
        data: statusData,
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

