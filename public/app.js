// Supabase configuration
const SUPABASE_URL = 'https://xpkvqfkhbfvjqkeqsomb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwa3ZxZmtoYmZ2anFrZXFzb21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyODEzODgsImV4cCI6MjA3OTg1NzM4OH0.SHcbSbCiS-aMi5TBkwXyvPVvcZJvikeztd9jGrg9BIg'

const supabaseAnonKey = SUPABASE_ANON_KEY

// Edge Function URLs
const GENERATE_VIDEO_URL = `${SUPABASE_URL}/functions/v1/generate-video`
const CHECK_STATUS_URL = `${SUPABASE_URL}/functions/v1/check-status`

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('generateForm')
  const refreshBtn = document.getElementById('refreshBtn')
  
  form.addEventListener('submit', handleFormSubmit)
  refreshBtn.addEventListener('click', loadGenerations)
  
  // Load existing generations on page load
  loadGenerations()
})

async function handleFormSubmit(e) {
  e.preventDefault()
  
  const submitBtn = document.getElementById('submitBtn')
  submitBtn.disabled = true
  submitBtn.textContent = 'Generating...'
  
  try {
    // Get form data
    const formData = new FormData(e.target)
    
    const payload = {
      prompt: formData.get('prompt'),
      aspectRatio: formData.get('aspectRatio') || '16:9',
      duration: formData.get('duration') || '8s',
      resolution: formData.get('resolution') || '720p',
      enhancePrompt: document.getElementById('enhancePrompt').checked,
      autoFix: document.getElementById('autoFix').checked,
      generateAudio: document.getElementById('generateAudio').checked,
      ...(formData.get('negativePrompt') && { negativePrompt: formData.get('negativePrompt') }),
      ...(formData.get('seed') && { seed: parseInt(formData.get('seed')) }),
    }
    
    // Call generate-video Edge Function
    const response = await fetch(GENERATE_VIDEO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(payload),
    })
    
    const data = await response.json()
    
    if (!response.ok || !data.success) {
      console.error('Full error response:', data)
      const errorMsg = data.error || data.message || data.details || 'Failed to generate video'
      throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg))
    }
    
    // Show success message
    const taskId = data.requestId || data.taskId
    alert(`Video generation started! Request ID: ${taskId}`)
    
    // Reset form
    e.target.reset()
    
    // Reload generations (this will start polling if needed)
    await loadGenerations()
    
  } catch (error) {
    console.error('Error:', error)
    alert(`Error: ${error.message}`)
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Generate Video'
  }
}

async function loadGenerations() {
  const listContainer = document.getElementById('generationsList')
  listContainer.innerHTML = '<div class="loading">Loading...</div>'
  
  try {
    // Fetch from Supabase database
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/video_generations?select=*&order=created_at.desc`,
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
      }
    )
    
    if (!response.ok) {
      throw new Error('Failed to load generations')
    }
    
    const generations = await response.json()
    
    if (generations.length === 0) {
      listContainer.innerHTML = '<div class="empty-state">No video generations yet. Create one above!</div>'
      return
    }
    
    listContainer.innerHTML = generations.map(gen => createGenerationCard(gen)).join('')
    
    // Attach event listeners to check status buttons
    attachCheckStatusListeners()
    
  } catch (error) {
    console.error('Error loading generations:', error)
    listContainer.innerHTML = `<div class="error">Error loading generations: ${error.message}</div>`
  }
}

function createGenerationCard(gen) {
  const statusClass = `status-${gen.status}`
  const createdDate = new Date(gen.created_at).toLocaleString()
  const completedDate = gen.completed_at ? new Date(gen.completed_at).toLocaleString() : null
  
  let videoSection = ''
  if (gen.status === 'completed' && gen.result_urls && gen.result_urls.length > 0) {
    const videos = gen.result_urls.map((url, idx) => {
      const originUrl = gen.origin_urls && gen.origin_urls[idx] ? gen.origin_urls[idx] : null
      return `
        <div class="video-preview">
          <video controls>
            <source src="${url}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          <div class="video-links">
            <a href="${url}" target="_blank">View Result</a>
            ${originUrl ? `<a href="${originUrl}" target="_blank">View Original</a>` : ''}
          </div>
        </div>
      `
    }).join('')
    videoSection = videos
  }
  
  const errorSection = gen.error_message 
    ? `<div class="error" style="margin-top: 8px;">Error: ${gen.error_message}</div>`
    : ''
  
  // Add Check Status button for pending/processing items
  const checkStatusButton = (gen.status === 'pending' || gen.status === 'processing')
    ? `<button class="btn btn-secondary btn-sm check-status-btn" data-task-id="${gen.task_id}" style="margin-top: 8px;">
        Check Status
      </button>`
    : ''
  
  return `
    <div class="generation-item" data-task-id="${gen.task_id}">
      <div class="generation-header">
        <div class="generation-prompt">${escapeHtml(gen.prompt)}</div>
        <span class="status-badge ${statusClass}">
          ${gen.status}
        </span>
      </div>
      <div class="generation-info">
        <strong>Task ID:</strong> ${gen.task_id}<br>
        <strong>Model:</strong> ${gen.model || 'N/A'}<br>
        <strong>Created:</strong> ${createdDate}<br>
        ${completedDate ? `<strong>Completed:</strong> ${completedDate}<br>` : ''}
        ${gen.resolution ? `<strong>Resolution:</strong> ${gen.resolution}<br>` : ''}
      </div>
      ${checkStatusButton}
      ${videoSection}
      ${errorSection}
    </div>
  `
}

// Attach event listeners to check status buttons
function attachCheckStatusListeners() {
  document.querySelectorAll('.check-status-btn').forEach(button => {
    button.addEventListener('click', async (e) => {
      const taskId = e.target.getAttribute('data-task-id')
      if (taskId) {
        await checkStatus(taskId, e.target)
      }
    })
  })
}

// Manual status check function
async function checkStatus(taskId, buttonElement = null) {
  // Find the button if not provided
  const button = buttonElement || document.querySelector(`.check-status-btn[data-task-id="${taskId}"]`)
  const generationItem = document.querySelector(`.generation-item[data-task-id="${taskId}"]`)
  
  // Show loading state
  if (button) {
    const originalText = button.textContent
    button.disabled = true
    button.textContent = 'Checking...'
  }
  
  try {
    // Call check-status Edge Function
    const response = await fetch(
      `${CHECK_STATUS_URL}?requestId=${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
      }
    )
    
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to check status')
    }
    
    // Reload generations to show updated status
    await loadGenerations()
    
    // Show success message if completed
    if (data.status === 'completed') {
      // The video should now be visible in the reloaded list
      console.log('Video generation completed!')
    }
    
  } catch (error) {
    console.error('Error checking status:', error)
    alert(`Error checking status: ${error.message}`)
    
    // Restore button state
    if (button) {
      button.disabled = false
      button.textContent = 'Check Status'
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

