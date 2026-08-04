import { useCallback, useEffect, useState, type PropsWithChildren } from 'react'
import type Cart from '../models/Cart'
import useAuth from '../hooks/useAuth'
import {
    addCartItem,
    addAIDesignCartItem,
    clearCart,
    getCart,
    removeCartItem,
    updateCartItem
} from '../services/cart'
import { CartContext } from './cart-context'

export default function CartProvider({ children }: PropsWithChildren) {
    const { user, loading: authLoading } = useAuth()
    const [cart, setCart] = useState<Cart | null>(null)
    const [cartUserId, setCartUserId] = useState<number | null>(null)
    const [loading, setLoading] = useState(false)

    const refresh = useCallback(async () => {
        if (!user) {
            return
        }
        setLoading(true)
        try {
            setCart(await getCart())
            setCartUserId(user.id)
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => {
        if (authLoading) return
        if (!user) return
        let cancelled = false
        Promise.resolve()
            .then(() => {
                if (!cancelled) setLoading(true)
                return getCart()
            })
            .then(nextCart => {
                if (!cancelled) {
                    setCart(nextCart)
                    setCartUserId(user.id)
                }
            })
            .catch(() => {
                if (!cancelled) setCart(null)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
    }, [user, authLoading])

    async function addItem(productId: string, variantId: string, quantity = 1) {
        setCart(await addCartItem(productId, variantId, quantity))
        setCartUserId(user?.id ?? null)
    }

    async function addDesign(designId: number, quantity = 1) {
        setCart(await addAIDesignCartItem(designId, quantity))
        setCartUserId(user?.id ?? null)
    }

    async function updateItem(itemId: number, quantity: number) {
        setCart(await updateCartItem(itemId, quantity))
    }

    async function removeItem(itemId: number) {
        setCart(await removeCartItem(itemId))
    }

    async function clear() {
        setCart(await clearCart())
    }

    return (
        <CartContext.Provider value={{ cart: user && cartUserId === user.id ? cart : null, loading: user ? loading : false, refresh, addItem, addDesign, updateItem, removeItem, clear }}>
            {children}
        </CartContext.Provider>
    )
}
