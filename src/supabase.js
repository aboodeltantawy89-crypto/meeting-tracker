import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('⚠️  مش لاقي VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY في ملف .env')
}

export const supabase = createClient(url, key)
