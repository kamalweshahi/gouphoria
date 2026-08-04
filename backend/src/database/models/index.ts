import { Address } from './address'
import { AdminNote } from './admin-note'
import { AIDesign } from './ai-design'
import { AIGeneration } from './ai-generation'
import { Cart } from './cart'
import { CartItem } from './cart-item'
import { CreditAccount } from './credit-account'
import { CreditTransaction } from './credit-transaction'
import { CreditPackage } from './credit-package'
import { CreditPurchase } from './credit-purchase'
import { CommerceAudit } from './commerce-audit'
import { Order } from './order'
import { OrderItem } from './order-item'
import { Payment } from './payment'
import { Product } from './product'
import { ProductVariant } from './product-variant'
import { SystemSetting } from './system-setting'
import { UploadedImage } from './uploaded-image'
import { User } from './user'
import { UserSession } from './user-session'
import { ShippingQuote } from './shipping-quote'
import { PrintifyWebhookEvent } from './printify-webhook-event'
import { CatalogProductDeletion } from './catalog-product-deletion'

export const databaseModels = [
    User,
    UserSession,
    Address,
    Product,
    ProductVariant,
    Cart,
    CartItem,
    Order,
    OrderItem,
    Payment,
    AIDesign,
    AIGeneration,
    CreditAccount,
    CreditPackage,
    CreditPurchase,
    CreditTransaction,
    CommerceAudit,
    UploadedImage,
    AdminNote,
    SystemSetting,
    ShippingQuote,
    PrintifyWebhookEvent,
    CatalogProductDeletion
]

export {
    Address,
    AdminNote,
    AIDesign,
    AIGeneration,
    Cart,
    CartItem,
    CreditAccount,
    CreditPackage,
    CreditPurchase,
    CreditTransaction,
    CommerceAudit,
    Order,
    OrderItem,
    Payment,
    Product,
    ProductVariant,
    SystemSetting,
    UploadedImage,
    User,
    UserSession,
    ShippingQuote,
    PrintifyWebhookEvent,
    CatalogProductDeletion
}

export * from './model-enums'
