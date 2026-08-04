import { useEffect, useRef, useState } from 'react'
import type { CreditPackage } from '../../../models/Credits'
import { cancelCreditPurchase, captureCreditPurchase, createCreditPurchase, creditErrorMessage } from '../../../services/credits'
import { getPayPalClientId } from '../../../services/products'
import { createId } from '../../../utils/create-id'
import '../../store/paypal-checkout/PayPalCheckout.css'

interface PayPalButtons {
    render: (container: HTMLDivElement) => void
}

interface PayPalWindow {
    paypal?: {
        Buttons: (options: {
            createOrder: () => Promise<string>
            onApprove: (data: { orderID: string }) => Promise<void>
            onCancel: (data: { orderID?: string }) => Promise<void>
            onError: (error: unknown) => void
        }) => PayPalButtons
    }
}

interface Props {
    selectedPackage: CreditPackage
    onComplete: () => void | Promise<void>
}

let sdkPromise: Promise<void> | undefined

async function loadPayPalSdk(clientId: string) {
    const paypalWindow = window as unknown as PayPalWindow
    if (paypalWindow.paypal) return
    if (sdkPromise) return sdkPromise
    sdkPromise = new Promise((resolve, reject) => {
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
    return sdkPromise
}

export default function CreditPayPalCheckout({ selectedPackage, onComplete }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const requestKeyRef = useRef(createId())
    const purchaseIdRef = useRef<number | undefined>(undefined)
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        requestKeyRef.current = createId()
        purchaseIdRef.current = undefined
        let cancelled = false
        if (containerRef.current) containerRef.current.replaceChildren()

        async function renderButtons() {
            try {
                setLoading(true); setMessage(''); setError('')
                const clientId = await getPayPalClientId()
                await loadPayPalSdk(clientId)
                const paypalWindow = window as unknown as PayPalWindow
                if (cancelled || !containerRef.current || !paypalWindow.paypal) return
                containerRef.current.replaceChildren()
                paypalWindow.paypal.Buttons({
                    createOrder: async () => {
                        const purchase = await createCreditPurchase(selectedPackage.id, requestKeyRef.current)
                        purchaseIdRef.current = purchase.id
                        if (!purchase.paypalOrderId) throw new Error('PayPal order is missing.')
                        return purchase.paypalOrderId
                    },
                    onApprove: async data => {
                        if (!purchaseIdRef.current) throw new Error('Credit purchase is missing.')
                        const result = await captureCreditPurchase(purchaseIdRef.current, data.orderID)
                        setMessage(`${result.purchase.credits} credits added. Your balance is now ${result.balance}.`)
                        requestKeyRef.current = createId()
                        await onComplete()
                    },
                    onCancel: async data => {
                        if (purchaseIdRef.current) await cancelCreditPurchase(purchaseIdRef.current, data.orderID)
                        setMessage('Payment cancelled. No credits were added.')
                        requestKeyRef.current = createId()
                    },
                    onError: payPalError => {
                        void payPalError
                        setError('PayPal payment failed. No credits were added. Please try again.')
                    }
                }).render(containerRef.current)
            } catch (checkoutError) {
                setError(creditErrorMessage(checkoutError, 'Could not load PayPal checkout. Please try again.'))
            } finally { setLoading(false) }
        }

        void renderButtons()
        return () => { cancelled = true }
    }, [selectedPackage, onComplete])

    return <div className="paypal-checkout">
        {loading && <p>Loading PayPal checkout...</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" aria-live="polite">{message}</p>}
        <div ref={containerRef}></div>
    </div>
}
