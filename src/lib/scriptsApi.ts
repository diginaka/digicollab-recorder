// fb_scripts CRUD helpers.
// RLS で user_id = auth.uid() のローのみ操作可能。
// create 時は明示的に user_id を設定 (トリガー無しのため)。
import { supabase } from './supabase'
import type { Script, AppId } from '../types'

function client() {
  if (!supabase) throw new Error('Supabase client not initialized')
  return supabase
}

export async function listScripts(limit = 50): Promise<Script[]> {
  const sb = client()
  const { data, error } = await sb
    .from('fb_scripts')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Script[]
}

export async function getScript(id: string): Promise<Script | null> {
  const sb = client()
  const { data, error } = await sb.from('fb_scripts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Script | null) ?? null
}

export interface CreateScriptInput {
  title?: string | null
  content: string
  source_app?: AppId | null
  source_ref?: string | null
}

export async function createScript(input: CreateScriptInput): Promise<Script> {
  const sb = client()
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser()
  if (authErr || !user) throw new Error('認証セッションが見つかりません')

  const { data, error } = await sb
    .from('fb_scripts')
    .insert({
      user_id: user.id,
      title: input.title ?? null,
      content: input.content,
      source_app: input.source_app ?? 'standalone',
      source_ref: input.source_ref ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Script
}

export interface UpdateScriptInput {
  title?: string | null
  content?: string
}

export async function updateScript(id: string, patch: UpdateScriptInput): Promise<Script> {
  const sb = client()
  const { data, error } = await sb
    .from('fb_scripts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Script
}

export async function deleteScript(id: string): Promise<void> {
  const sb = client()
  const { error } = await sb.from('fb_scripts').delete().eq('id', id)
  if (error) throw error
}
