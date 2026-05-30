import { IWhatsAppProvider } from './IWhatsAppProvider'
import { MockWhatsAppProvider } from './MockWhatsAppProvider'
import { EvolutionWhatsAppProvider } from './EvolutionWhatsAppProvider'
import { WahaWhatsAppProvider } from './WahaWhatsAppProvider'
import { WhatsAppCloudProvider } from './WhatsAppCloudProvider'
import { logger } from '../../utils/logger'

type ProviderType = 'mock' | 'evolution' | 'waha' | 'baileys' | 'cloud'

let instance: IWhatsAppProvider | null = null

export function getWhatsAppProvider(): IWhatsAppProvider {
  if (instance) return instance

  const providerType = (process.env.WHATSAPP_PROVIDER || 'mock') as ProviderType

  logger.info(`[WhatsAppFactory] Usando provider: ${providerType}`)

  switch (providerType) {
    case 'evolution':
      instance = new EvolutionWhatsAppProvider()
      break
    case 'waha':
      instance = new WahaWhatsAppProvider()
      break
    case 'cloud':
      instance = new WhatsAppCloudProvider()
      break
    case 'mock':
      instance = new MockWhatsAppProvider()
      break
    default:
      logger.warn(`Provider desconhecido: ${providerType}. Usando mock.`)
      instance = new MockWhatsAppProvider()
  }

  return instance
}

export function getMockProvider(): MockWhatsAppProvider {
  const provider = getWhatsAppProvider()
  if (provider instanceof MockWhatsAppProvider) return provider
  throw new Error('Provider atual não é o MockProvider')
}
