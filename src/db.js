import { supabase } from './supabase'

// ─── Settings ───────────────────────────────────────────
export async function getWeekOffset() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'week_offset')
    .single()
  return data ? parseInt(data.value) : 0
}

export async function setWeekOffset(offset) {
  await supabase
    .from('app_settings')
    .upsert({ key: 'week_offset', value: String(offset) })
}

// ─── Members ────────────────────────────────────────────
export async function getMembers() {
  const { data } = await supabase
    .from('members')
    .select('*')
    .order('sort_order')
  return data || []
}

export async function addMember(id, name, sortOrder) {
  await supabase.from('members').insert({ id, name, sort_order: sortOrder })
}

export async function updateMemberName(id, name) {
  await supabase.from('members').update({ name }).eq('id', id)
}

export async function deleteMember(id) {
  await supabase.from('members').delete().eq('id', id)
}

// ─── Tasks ──────────────────────────────────────────────
export async function getTasks(weekKey) {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('week_key', weekKey)
    .order('created_at')
  return data || []
}

export async function getAllTasks() {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at')
  return data || []
}

export async function insertTask(task) {
  // task: { id, member_id, week_key, text, done }
  await supabase.from('tasks').insert(task)
}

export async function toggleTask(id, done) {
  await supabase.from('tasks').update({ done }).eq('id', id)
}

export async function removeTask(id) {
  await supabase.from('tasks').delete().eq('id', id)
}

// ─── Notes ──────────────────────────────────────────────
export async function getAllNotes() {
  const { data } = await supabase.from('notes').select('*')
  return data || []
}

export async function upsertNote(memberId, weekKey, content) {
  await supabase.from('notes').upsert(
    { member_id: memberId, week_key: weekKey, content, updated_at: new Date().toISOString() },
    { onConflict: 'member_id,week_key' }
  )
}

// ─── Generic Settings ────────────────────────────────────
export async function getSetting(key) {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single()
  return data ? data.value : null
}

export async function setSetting(key, value) {
  await supabase
    .from('app_settings')
    .upsert({ key, value })
}
