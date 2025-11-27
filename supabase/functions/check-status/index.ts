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

    // Get requestId from query parameters or request body
    const url = new URL(req.url)
    let requestId = url.searchParams.get('requestId') || url.searchParams.get('taskId')
    
    if (!requestId) {
      // Try to get from body if not in query params
      try {
        const body = await req.json()
        requestId = body.requestId || body.taskId
      } catch {
        // Body might be empty, that's okay
      }
    }

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: 'requestId or taskId is required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check status using fal.ai queue API
    const statusResponse = await fetch(
      `https://queue.fal.run/fal-ai/veo3/fast/status?requestId=${encodeURIComponent(requestId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!statusResponse.ok) {
      const errorData = await statusResponse.json().catch(() => ({ message: 'Unknown error' }))
      return new Response(
        JSON.stringify({ 
          error: 'Failed to check status',
          details: errorData
        }),
        { 
          status: statusResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const statusData = await statusResponse.json()
    console.log('fal.ai status response:', JSON.stringify(statusData))

    // Determine status from fal.ai response
    let status = 'pending'
    let resultUrls: string[] = []
    
    if (statusData.status === 'COMPLETED') {
      status = 'completed'
      // Fetch the result to get the video URL
      try {
        const resultResponse = await fetch(
          `https://queue.fal.run/fal-ai/veo3/fast/result?requestId=${encodeURIComponent(requestId)}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Key ${falKey}`,
              'Content-Type': 'application/json',
            },
          }
        )
        
        if (resultResponse.ok) {
          const resultData = await resultResponse.json()
          if (resultData.video?.url) {
            resultUrls = [resultData.video.url]
          }
        }
      } catch (error) {
        console.error('Error fetching result:', error)
      }
    } else if (statusData.status === 'IN_PROGRESS' || statusData.status === 'IN_QUEUE') {
      status = 'processing'
    } else if (statusData.status === 'FAILED') {
      status = 'failed'
    }

    // Update database with latest status
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (resultUrls.length > 0) {
      updateData.result_urls = resultUrls
    }

    if (statusData.error) {
      updateData.error_message = statusData.error
    }

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString()
    }

    const { error: dbError } = await supabaseClient
      .from('video_generations')
      .update(updateData)
      .eq('task_id', requestId)

    if (dbError) {
      console.error('Database update error:', dbError)
      // Still return the status from API
    }

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        taskId: requestId, // Keep for backward compatibility
        status,
        data: {
          ...statusData,
          videoUrl: resultUrls[0] || null,
        },
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
