import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/lib/auth'

/**
 * Realtime count of unread *support replies* for the signed-in customer.
 * Unread = staff messages newer than the customer's last-read marker.
 */
export function useSupportUnread() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return }
    const { data, error } = await supabase.rpc('support_unread_count')
    if (!error && typeof data === 'number') setCount(data)
  }, [user])

  useEffect(() => {
    if (!user) { setCount(0); return }
    void refresh()
    const ch = supabase
      .channel(`support-unread:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_reads', filter: `user_id=eq.${user.id}` }, () => refresh())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, refresh])

  return { count, refresh }
}

/**
 * Realtime count of unread *customer messages* for staff (admin inbox badge).
 * Unread = customer messages newer than this staff member's last-read marker.
 */
export function useAdminSupportUnread(enabled = true) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user || !enabled) { setCount(0); return }
    const { data, error } = await supabase.rpc('support_admin_unread_count')
    if (!error && typeof data === 'number') setCount(data)
  }, [user, enabled])

  useEffect(() => {
    if (!user || !enabled) { setCount(0); return }
    void refresh()
    const ch = supabase
      .channel(`admin-support-unread:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_reads', filter: `user_id=eq.${user.id}` }, () => refresh())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, enabled, refresh])

  return { count, refresh }
}

/** Mark a ticket as read for the current user (upserts their read marker). */
export async function markTicketRead(ticketId: string, userId: string) {
  await supabase
    .from('support_ticket_reads')
    .upsert(
      { ticket_id: ticketId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: 'ticket_id,user_id' },
    )
}
