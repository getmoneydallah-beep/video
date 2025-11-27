-- Create video_generations table
CREATE TABLE IF NOT EXISTS video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT UNIQUE NOT NULL,
  prompt TEXT NOT NULL,
  image_urls JSONB DEFAULT '[]'::jsonb,
  model TEXT DEFAULT 'veo3_fast',
  watermark TEXT,
  aspect_ratio TEXT DEFAULT '16:9',
  seeds INTEGER,
  enable_fallback BOOLEAN DEFAULT false,
  enable_translation BOOLEAN DEFAULT true,
  generation_type TEXT DEFAULT 'REFERENCE_2_VIDEO',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result_urls JSONB,
  origin_urls JSONB,
  resolution TEXT,
  error_message TEXT,
  error_code TEXT,
  fallback_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on task_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_video_generations_task_id ON video_generations(task_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_video_generations_status ON video_generations(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_video_generations_created_at ON video_generations(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_video_generations_updated_at
  BEFORE UPDATE ON video_generations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

