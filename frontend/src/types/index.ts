export type UserRole = 'ADMIN' | 'USER'
export type SessionStatus = 'CONNECTED' | 'DISCONNECTED' | 'WAITING_QR' | 'ERROR'
export type ConversationStatus = 'OPEN' | 'PENDING' | 'CLOSED'
export type LeadStatus = 'OPEN' | 'WON' | 'LOST'
export type MessageDirection = 'IN' | 'OUT'
export type MessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO' | 'LOCATION'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  isActive: boolean
  aiEnabled?: boolean
  avatarUrl?: string | null
  createdAt: string
  updatedAt?: string
  whatsappSessions?: WhatsAppSession[]
  _count?: { conversations: number; leads: number; contacts?: number }
}

export interface WhatsAppSession {
  id: string
  userId: string
  phoneNumber?: string
  status: SessionStatus
  qrCode?: string
  provider: string
  connectedAt?: string
  disconnectedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: string
  userId: string
  name: string
  phone: string
  city?: string
  documentNumber?: string
  notes?: string
  avatarUrl?: string | null
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string }
  tags?: ContactTag[]
  leads?: Lead[]
  conversations?: Conversation[]
  _count?: { conversations: number; leads: number }
}

export interface ContactTag {
  id: string
  contactId: string
  tagId: string
  tag: Tag
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface ConversationTag {
  id: string
  conversationId: string
  tagId: string
  tag: Tag
}

export interface Conversation {
  id: string
  userId: string
  whatsappSessionId: string
  contactId?: string
  leadId?: string
  status: ConversationStatus
  lastMessage?: string
  lastMessageAt?: string
  unreadCount: number
  aiAuto?: boolean
  createdAt: string
  updatedAt: string
  contact?: Contact
  lead?: Lead
  user?: { id: string; name: string }
  whatsappSession?: { id: string; phoneNumber?: string; status: SessionStatus }
  tags?: ConversationTag[]
  _count?: { messages: number }
}

export interface Message {
  id: string
  conversationId: string
  userId: string
  whatsappSessionId: string
  contactId?: string
  direction: MessageDirection
  type: MessageType
  textBody?: string
  mediaUrl?: string
  latitude?: number
  longitude?: number
  externalMessageId?: string
  sentAt?: string
  createdAt: string
  contact?: Contact
}

export interface PipelineStage {
  id: string
  name: string
  order: number
  color: string
  createdAt: string
  updatedAt: string
  leads?: Lead[]
  _count?: { leads: number }
}

export interface Lead {
  id: string
  contactId: string
  responsibleUserId: string
  pipelineStageId?: string
  status: LeadStatus
  source?: string
  value?: number
  notes?: string
  createdAt: string
  updatedAt: string
  lastInteractionAt?: string
  contact?: Contact
  responsibleUser?: { id: string; name: string; email?: string }
  pipelineStage?: PipelineStage
  conversations?: Conversation[]
  crmNotes?: CRMNote[]
  _count?: { crmNotes: number; conversations: number }
}

export interface CRMNote {
  id: string
  leadId: string
  userId: string
  content: string
  createdAt: string
  user?: { id: string; name: string }
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  aiEnabled?: boolean
  avatarUrl?: string | null
}

export interface KanbanColumn {
  id: string
  name: string
  order: number
  color: string
  leads: Lead[]
}

export interface DashboardUser {
  conversations: { total: number; open: number; pending: number; closed: number }
  messages: { total: number; unread: number }
  leads: { total: number; open: number; won: number }
  recentMessages: Message[]
  whatsapp?: { status: SessionStatus; phoneNumber?: string } | null
}

export interface DashboardAdmin {
  users: { total: number; active: number; connectedSessions: number }
  conversations: { total: number }
  leads: { total: number }
  messages: { total: number }
  leadsPerStage: { name: string; color: string; count: number }[]
  conversationsPerUser: { name: string; count: number }[]
  leadsPerUser: { name: string; count: number }[]
}

export interface QuickReply {
  id: string
  title: string
  body: string
  isGlobal: boolean
  userId: string
  createdAt: string
  updatedAt: string
}

export interface CustomField {
  id: string
  name: string
  fieldKey: string
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN'
  entity: 'CONTACT' | 'LEAD'
  options?: string[]
  isRequired: boolean
  createdAt: string
  updatedAt: string
}

export interface CustomFieldValue {
  id: string
  customFieldId: string
  entityId: string
  value?: string
  createdAt: string
  updatedAt: string
  customField?: CustomField
}
