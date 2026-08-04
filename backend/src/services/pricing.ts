import HttpError from '../errors/http-error'

export interface PricedLine {
    unitPrice: string | number
    quantity: number
}

export interface PricingBreakdown {
    currency: string
    subtotalCents: number
    shippingCents: number
    taxCents: number
    totalCents: number
    subtotal: number
    shipping: number
    tax: number
    total: number
}

export function moneyToCents(value: string | number) {
    const normalized = typeof value === 'number' ? value.toFixed(2) : String(value).trim()
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new HttpError(409, 'A stored price is invalid.')
    const [whole, fraction = ''] = normalized.split('.')
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    if (!Number.isSafeInteger(cents) || cents < 0) throw new HttpError(409, 'A stored price is invalid.')
    return cents
}

export function centsToMoney(cents: number) {
    if (!Number.isSafeInteger(cents) || cents < 0) throw new HttpError(409, 'A monetary amount is invalid.')
    return cents / 100
}

export function centsToDecimal(cents: number) {
    return centsToMoney(cents).toFixed(2)
}

export function calculatePricing(
    lines: PricedLine[],
    shippingCents: number,
    currency = 'USD',
    taxCents = 0
): PricingBreakdown {
    const subtotalCents = lines.reduce((total, line) => {
        if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new HttpError(409, 'An order quantity is invalid.')
        const lineCents = moneyToCents(line.unitPrice) * line.quantity
        if (!Number.isSafeInteger(lineCents)) throw new HttpError(409, 'An order amount is too large.')
        return total + lineCents
    }, 0)
    if (![subtotalCents, shippingCents, taxCents].every(value => Number.isSafeInteger(value) && value >= 0)) {
        throw new HttpError(409, 'An order amount is invalid.')
    }
    const totalCents = subtotalCents + shippingCents + taxCents
    if (!Number.isSafeInteger(totalCents)) throw new HttpError(409, 'An order amount is too large.')
    return {
        currency: currency.toUpperCase(),
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        subtotal: centsToMoney(subtotalCents),
        shipping: centsToMoney(shippingCents),
        tax: centsToMoney(taxCents),
        total: centsToMoney(totalCents)
    }
}
