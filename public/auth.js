// Supabase configuration
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

// Initialize Supabase client (using CDN version)
const supabaseScript = document.createElement('script')
supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
supabaseScript.onload = initSupabase
document.head.appendChild(supabaseScript)

let supabase = null

function initSupabase() {
  const { createClient } = window.supabase
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Check if already logged in
  checkExistingSession()
}

async function checkExistingSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    // User is already logged in, redirect to main app
    window.location.href = '/'
  }
}

// Tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab

    // Update active tab
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')

    // Update active form
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'))
    document.getElementById(`${targetTab}Form`).classList.add('active')

    // Clear messages
    hideMessage()
  })
})

// Password toggle
document.querySelectorAll('.toggle-password').forEach(button => {
  button.addEventListener('click', () => {
    const targetId = button.dataset.target
    const input = document.getElementById(targetId)

    if (input.type === 'password') {
      input.type = 'text'
      button.textContent = 'Hide'
    } else {
      input.type = 'password'
      button.textContent = 'Show'
    }
  })
})

// Sign In Form Handler
document.getElementById('signinForm').addEventListener('submit', async (e) => {
  e.preventDefault()

  const submitBtn = document.getElementById('signinBtn')
  const email = document.getElementById('signinEmail').value.trim()
  const password = document.getElementById('signinPassword').value

  // Validation
  if (!email || !password) {
    showError('Please fill in all fields')
    return
  }

  submitBtn.disabled = true
  submitBtn.textContent = 'Signing in...'
  hideMessage()

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    // Success - redirect to main app
    showSuccess('Sign in successful! Redirecting...')
    setTimeout(() => {
      window.location.href = '/'
    }, 1000)

  } catch (error) {
    console.error('Sign in error:', error)
    showError(error.message || 'Failed to sign in. Please check your credentials.')
    submitBtn.disabled = false
    submitBtn.textContent = 'Sign In'
  }
})

// Sign Up Form Handler
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault()

  const submitBtn = document.getElementById('signupBtn')
  const name = document.getElementById('signupName').value.trim()
  const email = document.getElementById('signupEmail').value.trim()
  const password = document.getElementById('signupPassword').value

  // Validation
  if (!name || !email || !password) {
    showError('Please fill in all fields')
    return
  }

  if (password.length < 6) {
    showError('Password must be at least 6 characters long')
    return
  }

  submitBtn.disabled = true
  submitBtn.textContent = 'Creating account...'
  hideMessage()

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
        },
      },
    })

    if (error) throw error

    // Check if email confirmation is required
    if (data?.user && !data?.session) {
      showSuccess('Account created! Please check your email to confirm your account.')
      // Reset form
      document.getElementById('signupForm').reset()
      submitBtn.disabled = false
      submitBtn.textContent = 'Create Account'
    } else if (data?.session) {
      // Auto sign-in enabled
      showSuccess('Account created successfully! Redirecting...')
      setTimeout(() => {
        window.location.href = '/'
      }, 1000)
    }

  } catch (error) {
    console.error('Sign up error:', error)
    let errorMessage = 'Failed to create account. Please try again.'

    if (error.message.includes('already registered')) {
      errorMessage = 'This email is already registered. Please sign in instead.'
    } else if (error.message) {
      errorMessage = error.message
    }

    showError(errorMessage)
    submitBtn.disabled = false
    submitBtn.textContent = 'Create Account'
  }
})

// OAuth Providers
document.getElementById('googleSignin').addEventListener('click', async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) throw error
  } catch (error) {
    console.error('Google sign in error:', error)
    showError('Failed to sign in with Google. Please try again.')
  }
})

document.getElementById('githubSignin').addEventListener('click', async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) throw error
  } catch (error) {
    console.error('GitHub sign in error:', error)
    showError('Failed to sign in with GitHub. Please try again.')
  }
})

// Helper functions
function showError(message) {
  const errorEl = document.getElementById('errorMessage')
  errorEl.textContent = message
  errorEl.classList.add('show')

  // Hide success message if showing
  document.getElementById('successMessage').classList.remove('show')
}

function showSuccess(message) {
  const successEl = document.getElementById('successMessage')
  successEl.textContent = message
  successEl.classList.add('show')

  // Hide error message if showing
  document.getElementById('errorMessage').classList.remove('show')
}

function hideMessage() {
  document.getElementById('errorMessage').classList.remove('show')
  document.getElementById('successMessage').classList.remove('show')
}
