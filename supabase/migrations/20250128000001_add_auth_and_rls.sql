-- Migration: Add user authentication and Row Level Security
-- This migration adds user_id tracking and implements RLS policies

-- Step 1: Add user_id column to video_generations table
ALTER TABLE video_generations
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Create index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_video_generations_user_id ON video_generations(user_id);

-- Step 3: Enable Row Level Security on video_generations table
ALTER TABLE video_generations ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies for video_generations

-- Policy: Users can only view their own video generations
CREATE POLICY "Users can view own video generations"
ON video_generations
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can only insert video generations for themselves
CREATE POLICY "Users can create own video generations"
ON video_generations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own video generations
CREATE POLICY "Users can update own video generations"
ON video_generations
FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Users can only delete their own video generations
CREATE POLICY "Users can delete own video generations"
ON video_generations
FOR DELETE
USING (auth.uid() = user_id);

-- Step 5: Create user_profiles table for extended user data
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  credits INTEGER DEFAULT 100 CHECK (credits >= 0),
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'business', 'enterprise')),
  total_videos_generated INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_tier ON user_profiles(subscription_tier);

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_profiles
CREATE POLICY "Users can view own profile"
ON user_profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON user_profiles
FOR UPDATE
USING (auth.uid() = id);

-- Step 6: Create credit_transactions table for tracking credit usage
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'bonus', 'signup')),
  description TEXT,
  video_generation_id UUID REFERENCES video_generations(id) ON DELETE SET NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on credit_transactions
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(type);

-- Enable RLS on credit_transactions
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only view their own transactions
CREATE POLICY "Users can view own credit transactions"
ON credit_transactions
FOR SELECT
USING (auth.uid() = user_id);

-- Step 7: Create function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name, credits)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    100
  );

  -- Create signup bonus transaction
  INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (NEW.id, 100, 'signup', 'Welcome bonus - 100 free credits', 100);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

-- Step 8: Create function to update updated_at on user_profiles
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

-- Step 9: Create function to calculate credit cost based on video parameters
CREATE OR REPLACE FUNCTION calculate_video_credits(
  p_resolution TEXT,
  p_duration TEXT,
  p_generate_audio BOOLEAN DEFAULT true
)
RETURNS INTEGER AS $$
DECLARE
  base_credits INTEGER := 0;
  duration_seconds INTEGER;
  audio_penalty INTEGER := 0;
BEGIN
  -- Extract duration in seconds
  duration_seconds := CAST(regexp_replace(p_duration, '[^0-9]', '', 'g') AS INTEGER);

  -- Base cost calculation
  IF p_resolution = '1080p' THEN
    base_credits := duration_seconds * 3; -- 3 credits per second for 1080p
  ELSE
    base_credits := duration_seconds * 2; -- 2 credits per second for 720p
  END IF;

  -- Audio penalty (costs 33% more if audio is disabled)
  IF NOT p_generate_audio THEN
    audio_penalty := CEIL(base_credits * 0.33);
  END IF;

  RETURN base_credits + audio_penalty;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Create function to deduct credits and log transaction
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_video_generation_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_credits INTEGER;
  new_balance INTEGER;
BEGIN
  -- Get current credits with row lock
  SELECT credits INTO current_credits
  FROM user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Check if user exists
  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Check if sufficient credits
  IF current_credits < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits. Required: %, Available: %', p_amount, current_credits;
  END IF;

  -- Calculate new balance
  new_balance := current_credits - p_amount;

  -- Update user credits
  UPDATE user_profiles
  SET credits = new_balance,
      total_videos_generated = total_videos_generated + 1
  WHERE id = p_user_id;

  -- Log transaction
  INSERT INTO credit_transactions (user_id, amount, type, description, video_generation_id, balance_after)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_video_generation_id, new_balance);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Step 11: Create function to add credits (for purchases, refunds, bonuses)
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_description TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  current_credits INTEGER;
  new_balance INTEGER;
BEGIN
  -- Get current credits with row lock
  SELECT credits INTO current_credits
  FROM user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- Check if user exists
  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Calculate new balance
  new_balance := current_credits + p_amount;

  -- Update user credits
  UPDATE user_profiles
  SET credits = new_balance
  WHERE id = p_user_id;

  -- Log transaction
  INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (p_user_id, p_amount, p_type, p_description, new_balance);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Step 12: Create view for user dashboard stats
CREATE OR REPLACE VIEW user_dashboard_stats AS
SELECT
  vg.user_id,
  COUNT(*) as total_videos,
  COUNT(*) FILTER (WHERE vg.status = 'completed') as completed_videos,
  COUNT(*) FILTER (WHERE vg.status = 'failed') as failed_videos,
  COUNT(*) FILTER (WHERE vg.status = 'pending' OR vg.status = 'processing') as in_progress_videos,
  up.credits as current_credits,
  up.subscription_tier,
  up.total_videos_generated,
  (SELECT SUM(ABS(amount)) FROM credit_transactions WHERE user_id = vg.user_id AND type = 'usage') as total_credits_spent
FROM video_generations vg
JOIN user_profiles up ON up.id = vg.user_id
GROUP BY vg.user_id, up.credits, up.subscription_tier, up.total_videos_generated;

-- Grant access to authenticated users for the view
GRANT SELECT ON user_dashboard_stats TO authenticated;
