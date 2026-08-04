import { createContext } from 'react'
import type Cart from '../models/Cart'

export interface CartContextValue {
    cart: Cart | null
    loading: boolean
    refresh: () => Promise<void>
    addItem: (productId: string, variantId: string, quantity?: number) => Promise<void>
    addDesign: (designId: number, quantity?: number) => Promise<void>
    updateItem: (itemId: number, quantity: number) => Promise<void>
    removeItem: (itemId: number) => Promise<void>
    clear: () => Promise<void>
}

export const CartContext = createContext<CartContextValue | undefined>(undefined)
