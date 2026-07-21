import axios, { AxiosError } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
}

// Users
export const usersApi = {
  findAll: () => api.get('/users'),
  findById: (id: string) => api.get(`/users/${id}`),
  create: (data: { name: string; email: string; password: string; role: string }) =>
    api.post('/users', data),
  update: (id: string, data: object) => api.put(`/users/${id}`, data),
  activate: (id: string) => api.patch(`/users/${id}/activate`),
  deactivate: (id: string) => api.patch(`/users/${id}/deactivate`),
  remove: (id: string) => api.delete(`/users/${id}`),
  setAi: (id: string, enabled: boolean) => api.patch(`/users/${id}/ai`, { enabled }),
  syncFichaLinks: () => api.post('/users/sync-ficha-links'),
}

// IA
export const aiApi = {
  getConfig: () => api.get('/ai/config'),
  updateConfig: (data: object) => api.put('/ai/config', data),
  suggest: (conversationId: string) => api.post('/ai/suggest', { conversationId }),
}

// Números de WhatsApp (multi-número)
export const numbersApi = {
  list: () => api.get('/whatsapp-numbers'),
  add: (data: { label: string; phoneNumberId: string; token: string; wabaId?: string }) =>
    api.post('/whatsapp-numbers', data),
  update: (id: string, data: object) => api.put(`/whatsapp-numbers/${id}`, data),
  setDefault: (id: string) => api.patch(`/whatsapp-numbers/${id}/default`),
  remove: (id: string) => api.delete(`/whatsapp-numbers/${id}`),
}

// Supervisão / Monitor ao vivo
export const monitorApi = {
  agentConversations: (userId: string) => api.get(`/internal-chat/supervision/${userId}/conversations`),
  conversationMessages: (conversationId: string) =>
    api.get(`/internal-chat/supervision/conversations/${conversationId}/messages`),
  send: (conversationId: string, body: string) =>
    api.post(`/internal-chat/supervision/conversations/${conversationId}/send`, { body }),
  sendAudio: (conversationId: string, audio: string, mimetype: string) =>
    api.post(`/internal-chat/supervision/conversations/${conversationId}/send`, { audio, mimetype }),
  sendMedia: (conversationId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/internal-chat/supervision/conversations/${conversationId}/send-media`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

// Busca global
export const searchApi = {
  search: (q: string) => api.get('/search', { params: { q } }),
}

// Tags
export const tagsApi = {
  list: () => api.get('/tags'),
  create: (data: { name: string; color?: string }) => api.post('/tags', data),
  remove: (id: string) => api.delete(`/tags/${id}`),
}

// Mensagens agendadas
export const schedulesApi = {
  list: (conversationId?: string) =>
    api.get('/scheduled-messages', { params: conversationId ? { conversationId } : {} }),
  create: (data: { toPhone: string; body: string; sendAt: string; conversationId?: string; contactId?: string }) =>
    api.post('/scheduled-messages', data),
  cancel: (id: string) => api.delete(`/scheduled-messages/${id}`),
}

// Auto-tags (regras palavra-chave → tag)
export const autoTagsApi = {
  list: () => api.get('/auto-tags'),
  create: (data: { keyword: string; tagId: string }) => api.post('/auto-tags', data),
  toggle: (id: string, enabled: boolean) => api.patch(`/auto-tags/${id}`, { enabled }),
  remove: (id: string) => api.delete(`/auto-tags/${id}`),
}

// Ligações (registro de chamadas)
export const callsApi = {
  list: (params: { contactId?: string; leadId?: string }) => api.get('/calls', { params }),
  create: (data: { contactId: string; leadId?: string; phone: string; direction?: string; outcome?: string; durationSec?: number; notes?: string }) =>
    api.post('/calls', data),
  remove: (id: string) => api.delete(`/calls/${id}`),
}

// Modelos (templates aprovados)
export const templatesApi = {
  list: () => api.get('/templates'),
  create: (data: { name: string; category: string; language: string; body: string; exampleVars?: string[] }) =>
    api.post('/templates', data),
  remove: (name: string) => api.delete(`/templates/${name}`),
  send: (to: string, templateName: string, language: string, variables: string[], previewText: string) =>
    api.post('/templates/send', { to, templateName, language, variables, previewText }),
}

// Fluxos (chatbot)
export const flowsApi = {
  list: () => api.get('/flows'),
  get: (id: string) => api.get(`/flows/${id}`),
  create: (name: string) => api.post('/flows', { name }),
  update: (id: string, data: object) => api.put(`/flows/${id}`, data),
  remove: (id: string) => api.delete(`/flows/${id}`),
  qualificationTemplate: () => api.post('/flows/qualification-template'),
}

// WhatsApp
export const whatsappApi = {
  getSession: () => api.get('/whatsapp/session'),
  connect: () => api.post('/whatsapp/connect'),
  disconnect: () => api.post('/whatsapp/disconnect'),
  getQRCode: () => api.get('/whatsapp/qrcode'),
  sendMessage: (to: string, body: string) => api.post('/whatsapp/send', { to, body }),
  simulate: (sessionId: string, from: string, body: string) =>
    api.post('/whatsapp/simulate', { sessionId, from, body }),
  getAllSessions: () => api.get('/whatsapp/admin/sessions'),
  sendMedia: (to: string, file: File) => {
    const form = new FormData()
    form.append('to', to)
    form.append('file', file)
    return api.post('/whatsapp/send-media', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  sendAudio: (to: string, audioBase64: string, mimetype: string) =>
    api.post('/whatsapp/send-audio', { to, audio: audioBase64, mimetype }),
  sendLocation: (to: string, latitude: number, longitude: number, name?: string) =>
    api.post('/whatsapp/send-location', { to, latitude, longitude, name }),
  sendLocationQuery: (to: string, query: string) =>
    api.post('/whatsapp/send-location', { to, query }),
  adminConnect: (userId: string) => api.post('/whatsapp/admin/connect', { userId }),
  createConnectLink: (userId: string) => api.post('/whatsapp/admin/connect-link', { userId }),
  adminDisconnect: (sessionId: string) => api.post(`/whatsapp/admin/disconnect/${sessionId}`),
  adminAssignSession: (sessionId: string, targetUserId: string) =>
    api.post(`/whatsapp/admin/sessions/${sessionId}/reassign`, { targetUserId }),
  routeToVendor: (phone: string, vendorUserId: string, message?: string) =>
    api.post('/whatsapp/admin/route-to-vendor', { phone, vendorUserId, message }),
}

// Roleta (visão unificada roleta + WhatsApp — Central de Vendedores)
export const rouletteApi = {
  getOverview: () => api.get('/roulette/overview'),
  setActive: (userId: string, isActive: boolean) =>
    api.patch(`/roulette/agents/${userId}/active`, { isActive }),
  setManualOutreach: (userId: string, manualOutreach: boolean) =>
    api.patch(`/roulette/agents/${userId}/manual-outreach`, { manualOutreach }),
}

// Conversations
export const conversationsApi = {
  findAll: (status?: string) =>
    api.get('/conversations', { params: status ? { status } : {} }),
  findById: (id: string) => api.get(`/conversations/${id}`),
  getMessages: (id: string, before?: string) =>
    api.get(`/conversations/${id}/messages`, { params: before ? { before } : {} }),
  updateStatus: (id: string, status: string) =>
    api.patch(`/conversations/${id}/status`, { status }),
  markAsRead: (id: string) => api.patch(`/conversations/${id}/read`),
  setAiAuto: (id: string, enabled: boolean) => api.patch(`/conversations/${id}/ai-auto`, { enabled }),
  remove: (id: string) => api.delete(`/conversations/${id}`),
  clearAll: () => api.post('/conversations/clear-all'),
}

// Contacts
export const contactsApi = {
  findAll: (search?: string) =>
    api.get('/contacts', { params: search ? { search } : {} }),
  findById: (id: string) => api.get(`/contacts/${id}`),
  create: (data: object) => api.post('/contacts', data),
  update: (id: string, data: object) => api.put(`/contacts/${id}`, data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
  import: (contacts: object[], targetUserId?: string) =>
    api.post('/contacts/import', { contacts, targetUserId }),
}

// Leads
export const leadsApi = {
  findAll: (params?: { status?: string; stageId?: string; search?: string; source?: string }) =>
    api.get('/leads', { params }),
  findById: (id: string) => api.get(`/leads/${id}`),
  create: (data: object) => api.post('/leads', data),
  update: (id: string, data: object) => api.put(`/leads/${id}`, data),
  remove: (id: string) => api.delete(`/leads/${id}`),
  updateStage: (id: string, pipelineStageId: string) =>
    api.patch(`/leads/${id}/stage`, { pipelineStageId }),
  updateStatus: (id: string, status: string) =>
    api.patch(`/leads/${id}/status`, { status }),
  createFromConversation: (data: object) => api.post('/leads/from-conversation', data),
  getMessages: (id: string) => api.get(`/leads/${id}/messages`),
  getNotes: (id: string) => api.get(`/leads/${id}/notes`),
  addNote: (id: string, content: string) => api.post(`/leads/${id}/notes`, { content }),
}

// Pipeline
export const pipelineApi = {
  getStages: () => api.get('/pipeline/stages'),
  getKanban: () => api.get('/pipeline/kanban'),
  createStage: (data: object) => api.post('/pipeline/stages', data),
  updateStage: (id: string, data: object) => api.put(`/pipeline/stages/${id}`, data),
  deleteStage: (id: string) => api.delete(`/pipeline/stages/${id}`),
}

// CRM Boards (multi-board)
export const crmBoardsApi = {
  list: () => api.get('/crm-boards'),
  create: (data: object) => api.post('/crm-boards', data),
  update: (id: string, data: object) => api.put(`/crm-boards/${id}`, data),
  remove: (id: string) => api.delete(`/crm-boards/${id}`),
  getKanban: (id: string) => api.get(`/crm-boards/${id}/kanban`),
  listMembers: (id: string) => api.get(`/crm-boards/${id}/members`),
  addMember: (id: string, userId: string, role?: string) =>
    api.post(`/crm-boards/${id}/members`, { userId, role }),
  removeMember: (id: string, userId: string) => api.delete(`/crm-boards/${id}/members/${userId}`),
  addStage: (id: string, name: string, color?: string) =>
    api.post(`/crm-boards/${id}/stages`, { name, color }),
  updateStage: (id: string, stageId: string, data: object) =>
    api.put(`/crm-boards/${id}/stages/${stageId}`, data),
  deleteStage: (id: string, stageId: string) =>
    api.delete(`/crm-boards/${id}/stages/${stageId}`),
}

// Dashboard
export const dashboardApi = {
  user: () => api.get('/dashboard/user'),
  admin: () => api.get('/dashboard/admin'),
}

// Saúde do sistema (admin)
export const systemApi = {
  health: () => api.get('/system/health'),
}

// Quick Replies
export const quickRepliesApi = {
  getAll: () => api.get('/quick-replies'),
  create: (data: { title: string; body: string; isGlobal?: boolean }) =>
    api.post('/quick-replies', data),
  update: (id: string, data: { title: string; body: string; isGlobal?: boolean }) =>
    api.put(`/quick-replies/${id}`, data),
  remove: (id: string) => api.delete(`/quick-replies/${id}`),
}

// Custom Fields
export const customFieldsApi = {
  getFields: (entity: string) => api.get(`/custom-fields?entity=${entity}`),
  createField: (data: object) => api.post('/custom-fields', data),
  updateField: (id: string, data: object) => api.put(`/custom-fields/${id}`, data),
  deleteField: (id: string) => api.delete(`/custom-fields/${id}`),
  getValues: (entityId: string) => api.get(`/custom-fields/values/${entityId}`),
  upsertValue: (entityId: string, data: object) =>
    api.put(`/custom-fields/values/${entityId}`, data),
}

// Conversation Tags
export const conversationTagsApi = {
  addTag: (conversationId: string, tagId: string) =>
    api.post(`/conversations/${conversationId}/tags`, { tagId }),
  removeTag: (conversationId: string, tagId: string) =>
    api.delete(`/conversations/${conversationId}/tags/${tagId}`),
}
