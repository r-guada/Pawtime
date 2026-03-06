import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yvknsirpvnrtkpqnisnw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2a25zaXJwdm5ydGtwcW5pc253Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzYxODcsImV4cCI6MjA4ODI1MjE4N30.Sj5SKq6Xl3ZOTnxaT3Fx5DNOe8rj__sEnob-xsWcnQc'

export const supabase = createClient(supabaseUrl, supabaseKey)