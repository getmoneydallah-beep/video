// Configuration file for Supabase connection
// This file centralizes configuration to avoid hardcoding values everywhere

export const SUPABASE_URL = 'https://xpkvqfkhbfvjqkeqsomb.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwa3ZxZmtoYmZ2anFrZXFzb21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyODEzODgsImV4cCI6MjA3OTg1NzM4OH0.SHcbSbCiS-aMi5TBkwXyvPVvcZJvikeztd9jGrg9BIg'

// Edge Function URLs
export const GENERATE_VIDEO_URL = `${SUPABASE_URL}/functions/v1/generate-video`
export const CHECK_STATUS_URL = `${SUPABASE_URL}/functions/v1/check-status`

// Credit cost configuration (matches backend calculation)
export const CREDIT_COSTS = {
  '720p': {
    '4s': 8,
    '6s': 12,
    '8s': 16,
  },
  '1080p': {
    '4s': 12,
    '6s': 18,
    '8s': 24,
  },
}

// Calculate credit cost including audio penalty
export function calculateCreditCost(resolution, duration, generateAudio) {
  const baseCost = CREDIT_COSTS[resolution]?.[duration] || 16
  const audioPenalty = !generateAudio ? Math.ceil(baseCost * 0.33) : 0
  return baseCost + audioPenalty
}
