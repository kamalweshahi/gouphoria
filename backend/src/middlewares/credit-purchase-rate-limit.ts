import { creditPurchaseRateLimit, resetRateLimitsForTests } from './rate-limits'

export function resetCreditPurchaseRateLimitsForTests() {
    resetRateLimitsForTests('CREDIT_PURCHASE')
}

export default creditPurchaseRateLimit
