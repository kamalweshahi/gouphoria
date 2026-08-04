import axios from 'axios'

const PAYPAL_SANDBOX_URL = 'https://api-m.sandbox.paypal.com'
const PAYPAL_LIVE_URL = 'https://api-m.paypal.com'

function getPayPalConfig() {
    const clientId = process.env.PAYPAL_CLIENT_ID
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET
    const environment = process.env.PAYPAL_ENV ?? 'sandbox'

    if (!clientId || !clientSecret) {
        const error: any = new Error('PayPal is not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in backend environment variables.')
        error.status = 500
        throw error
    }

    return {
        clientId,
        clientSecret,
        baseUrl: environment === 'live' ? PAYPAL_LIVE_URL : PAYPAL_SANDBOX_URL
    }
}

export function getPayPalClientId() {
    const { clientId } = getPayPalConfig()
    return clientId
}

async function getAccessToken() {
    const { clientId, clientSecret, baseUrl } = getPayPalConfig()
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const response = await axios.post(
        `${baseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    )

    return response.data.access_token
}

export interface PayPalOrderLine {
    name: string
    quantity: number
    unitPrice: number
}

export interface PayPalOrderInput {
    referenceId: string
    description: string
    total: number
    currency: string
    items: PayPalOrderLine[]
    itemTotal?: number
    shipping?: number
    tax?: number
}

export async function createPayPalOrder(input: PayPalOrderInput | { id: string; title: string; price: number; currency: string }) {
    const { baseUrl } = getPayPalConfig()
    const accessToken = await getAccessToken()
    const order: PayPalOrderInput = 'referenceId' in input ? input : {
        referenceId: input.id,
        description: input.title,
        total: input.price,
        currency: input.currency,
        items: [{ name: input.title, quantity: 1, unitPrice: input.price }]
    }

    const response = await axios.post(
        `${baseUrl}/v2/checkout/orders`,
        {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    reference_id: order.referenceId,
                    description: order.description.slice(0, 127),
                    amount: {
                        currency_code: order.currency || 'USD',
                        value: order.total.toFixed(2),
                        breakdown: {
                            item_total: {
                                currency_code: order.currency || 'USD',
                                value: (order.itemTotal ?? order.total).toFixed(2)
                            },
                            ...((order.shipping ?? 0) > 0 ? { shipping: {
                                currency_code: order.currency || 'USD',
                                value: order.shipping!.toFixed(2)
                            } } : {}),
                            ...((order.tax ?? 0) > 0 ? { tax_total: {
                                currency_code: order.currency || 'USD',
                                value: order.tax!.toFixed(2)
                            } } : {})
                        }
                    },
                    items: order.items.map(item => ({
                        name: item.name.slice(0, 127),
                        quantity: String(item.quantity),
                        unit_amount: {
                            currency_code: order.currency || 'USD',
                            value: item.unitPrice.toFixed(2)
                        }
                    }))
                }
            ]
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'PayPal-Request-Id': order.referenceId
            }
        }
    )

    return response.data
}

export async function capturePayPalOrder(orderId: string, requestId?: string) {
    const { baseUrl } = getPayPalConfig()
    const accessToken = await getAccessToken()

    const response = await axios.post(
        `${baseUrl}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...(requestId ? { 'PayPal-Request-Id': requestId } : {})
            }
        }
    )

    return response.data
}

export async function getPayPalOrder(orderId: string) {
    const { baseUrl } = getPayPalConfig()
    const accessToken = await getAccessToken()

    const response = await axios.get(
        `${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        }
    )

    return response.data
}
