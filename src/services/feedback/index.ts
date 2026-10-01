import { createFeedbackRepository, type FeedbackInput } from '@blanky/api'
import { getCurrentUserId } from '../auth/index.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'

export async function saveClassificationFeedback(input: FeedbackInput): Promise<void> {
  if (!isSupabaseConfigured) return
  try {
    const userId = await getCurrentUserId()
    if (!userId) return
    await createFeedbackRepository(getSupabaseClient()).save(userId, input)
  } catch {
    // Saving the schedule stays local if feedback cannot be stored.
  }
}
