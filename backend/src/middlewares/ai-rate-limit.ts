import { aiGenerationRateLimit, resetRateLimitsForTests } from './rate-limits'

export function resetAIRateLimitsForTests() {
    resetRateLimitsForTests('AI')
}

export default aiGenerationRateLimit
