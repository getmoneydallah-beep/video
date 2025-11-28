// Supabase configuration
const SUPABASE_URL = 'https://xpkvqfkhbfvjqkeqsomb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwa3ZxZmtoYmZ2anFrZXFzb21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyODEzODgsImV4cCI6MjA3OTg1NzM4OH0.SHcbSbCiS-aMi5TBkwXyvPVvcZJvikeztd9jGrg9BIg'

const supabaseAnonKey = SUPABASE_ANON_KEY

// Edge Function URLs
const GENERATE_VIDEO_URL = `${SUPABASE_URL}/functions/v1/generate-video`
const CHECK_STATUS_URL = `${SUPABASE_URL}/functions/v1/check-status`

// Toast notification system
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer')
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  
  container.appendChild(toast)
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse'
    setTimeout(() => toast.remove(), 300)
  }, 4000)
}

// Input validation
function validateForm(formData) {
  const prompt = formData.get('prompt')?.trim()
  
  if (!prompt || prompt.length < 10) {
    return { valid: false, error: 'Prompt must be at least 10 characters long' }
  }
  
  if (prompt.length > 1000) {
    return { valid: false, error: 'Prompt must be less than 1000 characters' }
  }
  
  const seed = formData.get('seed')
  if (seed && (isNaN(seed) || parseInt(seed) < 0)) {
    return { valid: false, error: 'Seed must be a positive number' }
  }
  
  return { valid: true }
}

// Skeleton loader
function createSkeletonLoader() {
  return `
    <div class="skeleton-item">
      <div class="skeleton skeleton-line" style="width: 70%; height: 16px; margin-bottom: 12px;"></div>
      <div class="skeleton skeleton-line" style="width: 50%; height: 12px; margin-bottom: 8px;"></div>
      <div class="skeleton skeleton-line" style="width: 60%; height: 12px;"></div>
    </div>
  `.repeat(3)
}

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
  const formData = new FormData(e.target)
  
  // Validate form
  const validation = validateForm(formData)
  if (!validation.valid) {
    showToast(validation.error, 'error')
    return
  }
  
  submitBtn.disabled = true
  submitBtn.textContent = 'Generating...'
  
  try {
    const payload = {
      prompt: formData.get('prompt').trim(),
      aspectRatio: formData.get('aspectRatio') || '16:9',
      duration: formData.get('duration') || '8s',
      resolution: formData.get('resolution') || '720p',
      enhancePrompt: document.getElementById('enhancePrompt').checked,
      autoFix: document.getElementById('autoFix').checked,
      generateAudio: document.getElementById('generateAudio').checked,
      ...(formData.get('negativePrompt')?.trim() && { negativePrompt: formData.get('negativePrompt').trim() }),
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
      const errorText = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)
      throw new Error(errorText)
    }
    
    // Show success toast
    const taskId = data.requestId || data.taskId
    showToast('Video generation started successfully', 'success')
    
    // Reset form
    e.target.reset()
    
    // Reload generations
    await loadGenerations()
    
  } catch (error) {
    console.error('Error:', error)
    showToast(error.message || 'Failed to generate video. Please try again.', 'error')
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Generate Video'
  }
}

async function loadGenerations() {
  const listContainer = document.getElementById('generationsList')
  
  // Show skeleton loader
  listContainer.innerHTML = createSkeletonLoader()
  
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
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No video generations yet.</p>
          <p style="margin-top: 8px; color: var(--text-tertiary);">Create your first video above!</p>
        </div>
      `
      return
    }
    
    listContainer.innerHTML = generations.map(gen => createGenerationCard(gen)).join('')
    
    // Attach event listeners to check status buttons
    attachCheckStatusListeners()
    
  } catch (error) {
    console.error('Error loading generations:', error)
    listContainer.innerHTML = `
      <div class="error">
        <strong>Error loading generations:</strong> ${error.message}
      </div>
    `
  }
}

function createGenerationCard(gen) {
  const statusClass = `status-${gen.status}`
  const createdDate = new Date(gen.created_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
  const completedDate = gen.completed_at ? new Date(gen.completed_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }) : null
  
  let videoSection = ''
  if (gen.status === 'completed' && gen.result_urls && gen.result_urls.length > 0) {
    const videos = gen.result_urls.map((url, idx) => {
      const originUrl = gen.origin_urls && gen.origin_urls[idx] ? gen.origin_urls[idx] : null
      return `
        <div class="video-preview">
          <video controls preload="metadata">
            <source src="${url}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          <div class="video-links">
            <a href="${url}" target="_blank" rel="noopener noreferrer">Download</a>
            ${originUrl ? `<a href="${originUrl}" target="_blank" rel="noopener noreferrer">Original</a>` : ''}
          </div>
        </div>
      `
    }).join('')
    videoSection = videos
  }
  
  const errorSection = gen.error_message 
    ? `<div class="error">${escapeHtml(gen.error_message)}</div>`
    : ''
  
  // Add Check Status button for pending/processing items
  const checkStatusButton = (gen.status === 'pending' || gen.status === 'processing')
    ? `<button class="btn btn-secondary btn-sm check-status-btn" data-task-id="${gen.task_id}">
        Check Status
      </button>`
    : ''
  
  // Format task ID (show first 8 chars)
  const shortTaskId = gen.task_id.substring(0, 8) + '...'
  
  return `
    <div class="generation-item" data-task-id="${gen.task_id}">
      <div class="generation-header">
        <div class="generation-prompt">${escapeHtml(gen.prompt)}</div>
        <span class="status-badge ${statusClass}">
          ${gen.status}
        </span>
      </div>
      <div class="generation-info">
        <strong>ID:</strong> ${shortTaskId}<br>
        <strong>Created:</strong> ${createdDate}<br>
        ${completedDate ? `<strong>Completed:</strong> ${completedDate}<br>` : ''}
        ${gen.resolution ? `<strong>Resolution:</strong> ${gen.resolution}<br>` : ''}
        ${gen.aspect_ratio ? `<strong>Aspect:</strong> ${gen.aspect_ratio}<br>` : ''}
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
    // Remove existing listeners to prevent duplicates
    const newButton = button.cloneNode(true)
    button.parentNode.replaceChild(newButton, button)
    
    newButton.addEventListener('click', async (e) => {
      const taskId = e.target.getAttribute('data-task-id')
      if (taskId) {
        await checkStatus(taskId, e.target)
      }
    })
  })
}

// Manual status check function
async function checkStatus(taskId, buttonElement = null) {
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
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Status check failed: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to check status')
    }
    
    // If video is ready, update the card immediately with the video
    if (data.status === 'completed' && data.data?.videoUrl) {
      updateGenerationCardWithVideo(taskId, data.data.videoUrl, data)
      showToast('Video is ready!', 'success')
    } else if (data.status === 'completed') {
      // Video completed but URL not in response, reload to get it from database
      await loadGenerations()
      showToast('Video generation completed!', 'success')
    } else if (data.status === 'failed') {
      // Update card to show failed status
      updateGenerationCardStatus(taskId, 'failed', data.data?.error || 'Generation failed')
      showToast('Video generation failed', 'error')
    } else {
      // Still processing, just update status
      updateGenerationCardStatus(taskId, data.status)
      showToast('Still processing...', 'info')
      
      // Restore button for next check
      if (button) {
        button.disabled = false
        button.textContent = 'Check Status'
      }
      return
    }
    
    // Remove check status button if completed or failed
    if (button && (data.status === 'completed' || data.status === 'failed')) {
      button.remove()
    }
    
  } catch (error) {
    console.error('Error checking status:', error)
    showToast(error.message || 'Failed to check status', 'error')
    
    // Restore button state
    if (button) {
      button.disabled = false
      button.textContent = 'Check Status'
    }
  }
}

// Update generation card with video when ready
function updateGenerationCardWithVideo(taskId, videoUrl, statusData) {
  const generationItem = document.querySelector(`.generation-item[data-task-id="${taskId}"]`)
  if (!generationItem) return
  
  // Check if video already exists
  if (generationItem.querySelector('.video-preview')) {
    return // Video already displayed
  }
  
  // Find where to insert video (after generation-info, before error section)
  const infoSection = generationItem.querySelector('.generation-info')
  const errorSection = generationItem.querySelector('.error')
  const checkButton = generationItem.querySelector('.check-status-btn')
  
  // Create video section
  const videoSection = document.createElement('div')
  videoSection.className = 'video-preview'
  videoSection.innerHTML = `
    <video controls preload="metadata">
      <source src="${videoUrl}" type="video/mp4">
      Your browser does not support the video tag.
    </video>
    <div class="video-links">
      <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">Download</a>
    </div>
  `
  
  // Insert video section
  if (checkButton) {
    checkButton.insertAdjacentElement('beforebegin', videoSection)
  } else if (errorSection) {
    errorSection.insertAdjacentElement('beforebegin', videoSection)
  } else {
    infoSection.insertAdjacentElement('afterend', videoSection)
  }
  
  // Update status badge
  const statusBadge = generationItem.querySelector('.status-badge')
  if (statusBadge) {
    statusBadge.className = 'status-badge status-completed'
    statusBadge.textContent = 'completed'
  }
  
  // Add completed time if available
  if (statusData.completed_at) {
    const completedDate = new Date(statusData.completed_at).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
    const infoSection = generationItem.querySelector('.generation-info')
    if (infoSection && !infoSection.textContent.includes('Completed:')) {
      infoSection.innerHTML += `<br><strong>Completed:</strong> ${completedDate}`
    }
  }
}

// Update generation card status
function updateGenerationCardStatus(taskId, status, errorMessage = null) {
  const generationItem = document.querySelector(`.generation-item[data-task-id="${taskId}"]`)
  if (!generationItem) return
  
  // Update status badge
  const statusBadge = generationItem.querySelector('.status-badge')
  if (statusBadge) {
    statusBadge.className = `status-badge status-${status}`
    statusBadge.textContent = status
  }
  
  // Add error message if failed
  if (status === 'failed' && errorMessage) {
    const existingError = generationItem.querySelector('.error')
    if (!existingError) {
      const errorDiv = document.createElement('div')
      errorDiv.className = 'error'
      errorDiv.textContent = errorMessage
      generationItem.appendChild(errorDiv)
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
