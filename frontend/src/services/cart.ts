import axios from 'axios'
import type Cart from '../models/Cart'
import type Order from '../models/Order'
import type ShippingAddress from '../models/ShippingAddress'
import type ShippingQuote from '../models/ShippingQuote'
import { configureSessionAwareClient } from './session-aware-client'
import { customerAssetUrl } from './assets'

const api = axios.create({
    baseURL: import.meta.env.VITE_REST_SERVER_URL || 'http://localhost:3000',
    withCredentials: true
})
configureSessionAwareClient(api)

function customerCart(cart: Cart) {
    return { ...cart, items: cart.items.map(item => ({ ...item, image: customerAssetUrl(item.image) })) }
}

function customerOrder(order: Order) {
    return { ...order, items: order.items.map(item => ({ ...item, image: customerAssetUrl(item.image) })) }
}

export async function getCart() {
    const response = await api.get<{ cart: Cart }>('/cart')
    return customerCart(response.data.cart)
}

export async function addCartItem(productId: string, variantId: string, quantity = 1) {
    const response = await api.post<{ cart: Cart }>('/cart/items', { productId, variantId, quantity })
    return customerCart(response.data.cart)
}

export async function addAIDesignCartItem(designId: number, quantity = 1) {
    const response = await api.post<{ cart: Cart }>(`/cart/ai-designs/${designId}`, { quantity })
    return customerCart(response.data.cart)
}

export async function updateCartItem(itemId: number, quantity: number) {
    const response = await api.patch<{ cart: Cart }>(`/cart/items/${itemId}`, { quantity })
    return customerCart(response.data.cart)
}

export async function removeCartItem(itemId: number) {
    const response = await api.delete<{ cart: Cart }>(`/cart/items/${itemId}`)
    return customerCart(response.data.cart)
}

export async function clearCart() {
    const response = await api.delete<{ cart: Cart }>('/cart')
    return customerCart(response.data.cart)
}

export async function getShippingQuote(input: { shippingAddress: ShippingAddress; productId?: string; variantId?: string; quantity?: number }) {
    const response = await api.post<{ shippingQuote: ShippingQuote }>('/orders/shipping-quotes', input)
    return response.data.shippingQuote
}

export async function createOrderFromCart(shippingAddress: ShippingAddress, shippingQuoteId: string, shippingOptionId: string) {
    const response = await api.post<{ order: Order }>('/orders', { shippingAddress, shippingQuoteId, shippingOptionId })
    return customerOrder(response.data.order)
}

export async function getOrders() {
    const response = await api.get<{ orders: Order[] }>('/orders')
    return response.data.orders.map(customerOrder)
}

export async function getOrder(orderId: number) {
    const response = await api.get<{ order: Order }>(`/orders/${orderId}`)
    return customerOrder(response.data.order)
}

export function cartErrorMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError<{ message?: string }>(error)) return fallback
    return error.response?.data?.message || fallback
}

export function protectedCommerceAssetUrl(path?: string) {
    if (!path) return undefined
    return `${import.meta.env.VITE_REST_SERVER_URL || 'http://localhost:3000'}${path}`
}
