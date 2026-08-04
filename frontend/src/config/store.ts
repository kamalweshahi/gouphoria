const configuredSupportEmail = (import.meta.env.VITE_SUPPORT_EMAIL || '').trim()

export const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredSupportEmail) ? configuredSupportEmail : null
export const supportResponseTime = (import.meta.env.VITE_SUPPORT_RESPONSE_TIME || '').trim() || 'Response times may vary during the testing period.'
