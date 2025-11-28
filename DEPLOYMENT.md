# Deployment Guide

## Phase 1 Implementation Complete ✅

All code changes for the authentication and security system have been completed and committed to the repository.

## What's Been Implemented

### Database Layer
- ✅ User authentication with Supabase Auth
- ✅ Row Level Security (RLS) policies on `video_generations` table
- ✅ `user_profiles` table for credits and subscription tracking
- ✅ `credit_transactions` table for audit trail
- ✅ Auto-profile creation trigger (100 free credits on signup)
- ✅ Credit deduction functions with atomic transactions

### Backend (Edge Functions)
- ✅ JWT token verification in `generate-video` function
- ✅ JWT token verification in `check-status` function
- ✅ Credit validation and deduction before video generation
- ✅ User-scoped data access (RLS enforcement)

### Frontend
- ✅ Authentication UI (`auth.html` + `auth.js`)
- ✅ Login/Signup with email and password
- ✅ OAuth scaffolding (Google, GitHub)
- ✅ Session management with auto-redirect
- ✅ Credits display in header
- ✅ Real-time cost estimation
- ✅ Credit validation before generation
- ✅ Logout functionality

## Manual Deployment Steps Required

### Step 1: Verify Database Migration ✅ (Already Done)

The database migration has been applied successfully. You should see:
- `user_profiles` table
- `credit_transactions` table
- RLS policies on `video_generations`
- Trigger `on_auth_user_created`

### Step 2: Deploy Edge Functions ⏳ (Action Required)

**Option A: Via Supabase Dashboard** (Easiest)

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **Edge Functions** in the sidebar
4. For `generate-video`:
   - Click "New Function" or edit existing
   - Copy contents from: `supabase/functions/generate-video/index.ts`
   - Click "Deploy"
5. For `check-status`:
   - Click "New Function" or edit existing
   - Copy contents from: `supabase/functions/check-status/index.ts`
   - Click "Deploy"

**Option B: Via Supabase CLI** (If you have it installed)

```bash
# From your local machine (not this environment)
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy generate-video
supabase functions deploy check-status
```

### Step 3: Verify Secrets Configuration ⏳ (Action Required)

Make sure the following secrets are configured in Supabase:

1. Go to **Edge Functions → Secrets** in the Supabase Dashboard
2. Verify these secrets exist:
   - `FAL_KEY` - Your fal.ai API key
   - `SUPABASE_URL` - Auto-configured by Supabase
   - `SUPABASE_ANON_KEY` - Auto-configured by Supabase

If `FAL_KEY` is missing:
```bash
# Via Dashboard: Add new secret with name FAL_KEY and your key value
# Via CLI:
supabase secrets set FAL_KEY=your_fal_api_key_here
```

### Step 4: Test the Authentication Flow ⏳ (Action Required)

1. **Open your app** in a browser
2. **Sign up** with a new email/password
   - Should redirect to auth page if not logged in
   - Should create user profile with 100 credits
   - Should create credit transaction for signup bonus
3. **Check credits display** - should show 100 credits in header
4. **Generate a video**:
   - Fill out the form
   - Cost estimate should update based on settings
   - Should deduct credits on submit
   - Should create video generation record
5. **Check video status**
   - Click "Check Status" button
   - Should update status from fal.ai
6. **Verify in database**:
   - Check `user_profiles` - credits should be reduced
   - Check `credit_transactions` - should have signup + usage entries
   - Check `video_generations` - should have your video with user_id

### Step 5: Push Your Commit (If Not Already Done)

```bash
git push -u origin claude/review-ai-video-saas-012JRCwTSz65YgcxHMrRBgfF
```

## Common Issues & Solutions

### Issue: "Database error saving new user"
**Solution**: Already fixed! The trigger function now uses explicit schema references.

### Issue: "Unauthorized" or "Missing authorization header"
**Solution**: Make sure Edge Functions are deployed with the updated code that includes JWT verification.

### Issue: "FAL_KEY not configured"
**Solution**: Add the FAL_KEY secret in Supabase Dashboard → Edge Functions → Secrets

### Issue: Credits not updating after generation
**Solution**: Check that the `deduct_credits` function is being called successfully. Look at Supabase logs for errors.

### Issue: Can't see video generations
**Solution**: RLS policies ensure users only see their own videos. Make sure you're logged in with the same account that created the videos.

## Next Steps (Phase 2)

Based on the production readiness review, the next critical features to implement are:

1. **Payment Integration** (3-5 days)
   - Stripe or Paddle integration
   - Credit purchase flow
   - Subscription management

2. **Auto-Polling** (6 hours)
   - Automatic status checks for pending videos
   - Real-time updates without manual refresh

3. **Pagination** (8 hours)
   - Infinite scroll or pagination for video list
   - Performance optimization for large datasets

4. **Error Handling** (1-2 days)
   - Credit refunds on failed generations
   - Better error messages
   - Retry mechanisms

5. **Rate Limiting** (1-2 days)
   - Prevent abuse
   - Per-user limits
   - IP-based throttling

## Questions?

If you encounter any issues during deployment:
1. Check Supabase logs (Dashboard → Logs)
2. Check browser console for errors
3. Verify all secrets are configured
4. Ensure Edge Functions are deployed successfully

Happy deploying! 🚀
