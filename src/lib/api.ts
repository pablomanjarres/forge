async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// Stats
export const getStats = () => json<Record<string, unknown>>('/api/stats')

// Providers
export const getProviders = () => json<Record<string, unknown>>('/api/providers')
export const updateProvider = (id: string, data: Record<string, unknown>) =>
  json(`/api/providers/${id}`, { method: 'POST', body: JSON.stringify(data) })

// Tasks
export const getTasks = () => json<unknown[]>('/api/tasks')
export const getTask = (id: string) => json<unknown>(`/api/tasks/${id}`)
export const createTask = (data: Record<string, unknown>) =>
  json('/api/tasks', { method: 'POST', body: JSON.stringify(data) })
export const updateTask = (id: string, data: Record<string, unknown>) =>
  json(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

// Media
export const getMedia = () => json<unknown[]>('/api/media')
export const createMedia = (data: Record<string, unknown>) =>
  json('/api/media', { method: 'POST', body: JSON.stringify(data) })
export const deleteMedia = (id: string) =>
  json(`/api/media/${id}`, { method: 'DELETE' })

// Repos
export const getRepos = () => json<unknown[]>('/api/repos')
export const createRepo = (data: Record<string, unknown>) =>
  json('/api/repos', { method: 'POST', body: JSON.stringify(data) })
export const deleteRepo = (id: string) =>
  json(`/api/repos/${id}`, { method: 'DELETE' })

// Templates
export const getTemplates = () => json<unknown[]>('/api/templates')
export const getTemplate = (id: string) => json<unknown>(`/api/templates/${id}`)
export const createTemplate = (data: Record<string, unknown>) =>
  json('/api/templates', { method: 'POST', body: JSON.stringify(data) })
export const updateTemplate = (id: string, data: Record<string, unknown>) =>
  json(`/api/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteTemplate = (id: string) =>
  json(`/api/templates/${id}`, { method: 'DELETE' })

// Activity
export const getActivity = () => json<unknown[]>('/api/activity')

// Generation
export const generateImage = (data: { prompt: string; provider?: string; model?: string }) =>
  json<unknown>('/api/generate/image', { method: 'POST', body: JSON.stringify(data) })

export const generateVideo = (data: { prompt: string; provider?: string; model?: string }) =>
  json<unknown>('/api/generate/video', { method: 'POST', body: JSON.stringify(data) })

export const generateAudio = (data: { text: string; provider?: string; voiceName?: string }) =>
  json<unknown>('/api/generate/audio', { method: 'POST', body: JSON.stringify(data) })

export const chatWithGemini = (data: { prompt: string; model?: string; systemInstruction?: string }) =>
  json<{ response: string }>('/api/generate/chat', { method: 'POST', body: JSON.stringify(data) })
