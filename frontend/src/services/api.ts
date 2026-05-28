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
}

// Conversations
export const conversationsApi = {
  findAll: (status?: string) =>
    api.get('/conversations', { params: status ? { status } : {} }),
  findById: (id: string) => api.get(`/conversations/${id}`),
  getMessages: (id: string) => api.get(`/conversations/${id}/messages`),
  updateStatus: (id: string, status: string) =>
    api.patch(`/conversations/${id}/status`, { status }),
  markAsRead: (id: string) => api.patch(`/conversations/${id}/read`),
}

// Contacts
export const contactsApi = {
  findAll: (search?: string) =>
    api.get('/contacts', { params: search ? { search } : {} }),
  findById: (id: string) => api.get(`/contacts/${id}`),
  create: (data: object) => api.post('/contacts', data),
  update: (id: string, data: object) => api.put(`/contacts/${id}`, data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
}

// Leads
export const leadsApi = {
  findAll: (params?: { status?: string; stageId?: string; search?: string }) =>
    api.get('/leads', { params }),
  findById: (id: string) => api.get(`/leads/${id}`),
  create: (data: object) => api.post('/leads', data),
  update: (id: string, data: object) => api.put(`/leads/${id}`, data),
  updateStage: (id: string, pipelineStageId: string) =>
    api.patch(`/leads/${id}/stage`, { pipelineStageId }),
  updateStatus: (id: string, status: string) =>
    api.patch(`/leads/${id}/status`, { status }),
  createFromConversation: (data: object) => api.post('/leads/from-conversation', data),
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

// Dashboard
export const dashboardApi = {
  user: () => api.get('/dashboard/user'),
  admin: () => api.get('/dashboard/admin'),
}
