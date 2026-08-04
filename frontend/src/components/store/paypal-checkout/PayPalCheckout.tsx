import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { capturePayPalOrder, createPayPalOrder, getPayPalClientId, recoverPayPalOrder, type PayPalCapture } from '../../../services/products'
import './PayPalCheckout.css'
import type ShippingAddress from '../../../models/ShippingAddress'

declare global {
    interface Window {
        paypal?: {
            Buttons: (options: {
                createOrder: () => Promise<string>
                onApprove: (data: { orderID: string }) => Promise<void>
                onError: (error: unknown) => void
            }) => { render: (selector: HTMLDivElement) => void }
        }
    }
}

interface PayPalCheckoutProps {
    productId?: string
    variantId?: string
    orderId?: number
    disabled?: boolean
    selectionPrompt?: string
    onPaymentComplete?: (capture: PayPalCapture) => void | Promise<void>
    shippingAddress?: ShippingAddress
    shippingQuoteId?: string
    shippingOptionId?: string
    quantity?: number
}

let paypalSdkPromise: Promise<void> | undefined

async function loadPayPalSdk(clientId: string) {
    if (window.paypal) return
    if (paypalSdkPromise) return paypalSdkPromise

    paypalSdkPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk="true"]')
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true })
            existing.addEventListener('error', reject, { once: true })
            return
        }

        const script = document.createElement('script')
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`
        script.async = true
        script.dataset.paypalSdk = 'true'
        script.onload = () => resolve()
        script.onerror = reject
        document.body.appendChild(script)
    })

    return paypalSdkPromise
}

export default function PayPalCheckout({ productId, variantId, orderId, disabled, selectionPrompt, onPaymentComplete, shippingAddress, shippingQuoteId, shippingOptionId, quantity }: PayPalCheckoutProps) {
    const paypalRef = useRef<HTMLDivElement>(null)
    const localOrderIdRef = useRef<number | undefined>(orderId)
    const providerOrderIdRef = useRef<string | undefined>(undefined)
    const createRequestRef = useRef<Promise<string> | undefined>(undefined)
    const captureRequestRef = useRef<Promise<PayPalCapture> | undefined>(undefined)
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [recovering, setRecovering] = useState(false)
    const [recoveryAvailable, setRecoveryAvailable] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    function apiError(requestError: unknown, fallback: string) {
        return axios.isAxiosError<{ message?: string }>(requestError)
            ? requestError.response?.data?.message || fallback
            : fallback
    }

    async function retryRecovery() {
        if (!providerOrderIdRef.current || !localOrderIdRef.current || recovering) return
        setRecovering(true)
        setError('')
        setMessage('Checking the verified PayPal payment status…')
        try {
            const result = await recoverPayPalOrder(providerOrderIdRef.current, localOrderIdRef.current)
            if (result.paymentStatus === 'captured') {
                setRecoveryAvailable(false)
                setMessage(`Payment verified for ${result.orderNumber}.`)
                await onPaymentComplete?.(result)
            } else {
                setRecoveryAvailable(true)
                setMessage('')
                setError('PayPal has not completed this payment yet. Return to PayPal to approve it, or retry recovery shortly.')
            }
        } catch (requestError) {
            setRecoveryAvailable(true)
            setMessage('')
            setError(apiError(requestError, 'Payment status could not be recovered yet. No second payment was created; please retry.'))
        } finally {
            setRecovering(false)
        }
    }

    useEffect(() => {
        let cancelled = false
        localOrderIdRef.current = orderId
        providerOrderIdRef.current = undefined
        createRequestRef.current = undefined
        captureRequestRef.current = undefined

        // Remove the previous variant's button immediately so a stale checkout
        // cannot be used while the newly selected variant is being validated.
        if (paypalRef.current) paypalRef.current.replaceChildren()

        async function loadPayPalButton() {
            setRecoveryAvailable(false)
            setProcessing(false)
            const hasCheckoutSource = Boolean(orderId || (productId && variantId))
            if (disabled || !hasCheckoutSource) {
                setLoading(false)
                setMessage('')
                setError('')
                return
            }

            try {
                setLoading(true)
                setError('')
                setMessage('')
                const clientId = await getPayPalClientId()
                await loadPayPalSdk(clientId)
                if (cancelled || !paypalRef.current || !window.paypal) return

                paypalRef.current.replaceChildren()

                window.paypal.Buttons({
                    createOrder: async () => {
                        if (!createRequestRef.current) {
                            createRequestRef.current = createPayPalOrder(orderId
                                ? { orderId }
                                : { productId: productId!, variantId: variantId!, shippingAddress: shippingAddress!, shippingQuoteId: shippingQuoteId!, shippingOptionId: shippingOptionId!, quantity })
                                .then(created => {
                                    localOrderIdRef.current = created.orderId
                                    providerOrderIdRef.current = created.id
                                    return created.id
                                })
                                .catch(requestError => {
                                    createRequestRef.current = undefined
                                    throw requestError
                                })
                        }
                        return createRequestRef.current
                    },
                    onApprove: async (data) => {
                        if (!localOrderIdRef.current) throw new Error('Local order is missing.')
                        providerOrderIdRef.current = data.orderID
                        setProcessing(true)
                        setError('')
                        setMessage('Verifying your payment and saving the order…')
                        try {
                            if (!captureRequestRef.current) {
                                captureRequestRef.current = capturePayPalOrder(data.orderID, localOrderIdRef.current)
                            }
                            const capture = await captureRequestRef.current
                            setRecoveryAvailable(false)
                            setMessage(`Payment verified for ${capture.orderNumber}.`)
                            await onPaymentComplete?.(capture)
                        } catch (requestError) {
                            captureRequestRef.current = undefined
                            setRecoveryAvailable(true)
                            setMessage('')
                            setError(apiError(requestError, 'Payment confirmation was interrupted. Do not pay again; use Retry payment recovery.'))
                        } finally {
                            setProcessing(false)
                        }
                    },
                    onError: (payPalError) => {
                        void payPalError
                        if (providerOrderIdRef.current) {
                            setRecoveryAvailable(true)
                            setError('PayPal checkout was interrupted. Do not pay again; recover the existing payment below.')
                        } else {
                            setError('PayPal could not start checkout. Please try again.')
                        }
                    }
                }).render(paypalRef.current)
            } catch (error: unknown) {
                setError(apiError(error, 'Could not load PayPal checkout. Check backend PayPal credentials.'))
            } finally {
                setLoading(false)
            }
        }

        void loadPayPalButton()
        return () => {
            cancelled = true
        }
    }, [productId, variantId, orderId, disabled, onPaymentComplete, shippingAddress, shippingQuoteId, shippingOptionId, quantity])

    return (
        <div className={`paypal-checkout${processing ? ' is-processing' : ''}`}>
            {loading && <p>Loading PayPal checkout...</p>}
            {processing && <p className="state-message" role="status">Processing payment. Keep this page open; it is safe to retry recovery if the connection is interrupted.</p>}
            {error && <p className="error">{error}</p>}
            {message && <p className="success">{message}</p>}
            {recoveryAvailable && <button type="button" className="payment-recovery-button" disabled={recovering || processing} onClick={() => void retryRecovery()}>
                {recovering ? 'Checking PayPal…' : 'Retry payment recovery'}
            </button>}
            {!orderId && !variantId && <p className="state-message">{selectionPrompt || 'Select a phone model to continue to PayPal.'}</p>}
            {(orderId || variantId) && disabled && <p className="error">This checkout is currently unavailable.</p>}
            <div ref={paypalRef}></div>
        </div>
    )
}
