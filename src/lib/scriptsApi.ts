// fb_scripts CRUD helpers.
// RLS \u3067 user_id = auth.uid() \u306e\u30ed\u30fc\u306e\u307f\u64cd\u4f5c\u53ef\u80fd\u3002
// create \u6642\u306f\u660e\u793a\u7684\u306b user_id \u3092\u8a2d\u5b9a (\u30c8\u30ea\u30ac\u30fc\u7121\u3057\u306e\u305f\u3081)\u3002
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
  if (authErr || !user) throw new Error('\u8a8d\u8a3c\u30bb\u30c3\u30b7\u30e7\u30f3\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093')

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
