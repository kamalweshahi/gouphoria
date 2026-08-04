export enum UserRole {
    USER = 'user',
    ADMIN = 'admin'
}

export enum UserStatus {
    ACTIVE = 'active',
    SUSPENDED = 'suspended',
    DISABLED = 'disabled'
}

export enum ProductStatus {
    DRAFT = 'draft',
    ACTIVE = 'active',
    ARCHIVED = 'archived'
}

export enum CartStatus {
    ACTIVE = 'active',
    CHECKED_OUT = 'checked_out',
    ABANDONED = 'abandoned'
}

export enum OrderStatus {
    PENDING = 'pending',
    PAID = 'paid',
    READY_FOR_FULFILLMENT = 'ready_for_fulfillment',
    FULFILLMENT_FAILED = 'fulfillment_failed',
    PENDING_AI_REVIEW = 'pending_ai_review',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    SENT_TO_PRINTIFY = 'sent_to_printify',
    PRINTING = 'printing',
    PARTIALLY_FULFILLED = 'partially_fulfilled',
    SHIPPED = 'shipped',
    DELIVERED = 'delivered',
    CANCELLED = 'cancelled',
    REFUNDED = 'refunded',
    FAILED = 'failed'
}

export enum FulfillmentStatus {
    NOT_READY = 'not_ready',
    READY = 'ready',
    SUBMITTED = 'submitted',
    IN_PRODUCTION = 'in_production',
    PARTIAL = 'partial',
    SHIPPED = 'shipped',
    DELIVERED = 'delivered',
    FAILED = 'failed',
    CANCELLED = 'cancelled'
}

export enum PaymentStatus {
    CREATED = 'created',
    APPROVED = 'approved',
    CAPTURED = 'captured',
    FAILED = 'failed',
    REFUNDED = 'refunded'
}

export enum CreditPurchaseStatus {
    CREATED = 'created',
    APPROVED = 'approved',
    CAPTURED = 'captured',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    REFUNDED = 'refunded'
}

export enum AIDesignStatus {
    DRAFT = 'draft',
    GENERATING = 'generating',
    GENERATED = 'generated',
    WAITING_FOR_USER = 'waiting_for_user',
    REVISION_REQUESTED = 'revision_requested',
    APPROVED = 'approved',
    FAILED = 'failed',
    ADDED_TO_CART = 'added_to_cart',
    PURCHASED = 'purchased',
    PENDING_ADMIN_REVIEW = 'pending_admin_review',
    APPROVED_FOR_PRINT = 'approved_for_print',
    REJECTED = 'rejected',
    CHANGES_REQUESTED = 'changes_requested',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled'
}

export enum CommerceItemType {
    STANDARD = 'standard',
    AI_CUSTOM = 'ai_custom'
}

export enum OrderItemStatus {
    PENDING_PAYMENT = 'pending_payment',
    PAID = 'paid',
    PENDING_DESIGN_REVIEW = 'pending_design_review',
    APPROVED_FOR_PRINT = 'approved_for_print',
    REJECTED = 'rejected',
    CHANGES_REQUESTED = 'changes_requested',
    SENT_TO_PRINTIFY = 'sent_to_printify',
    IN_PRODUCTION = 'in_production',
    SHIPPED = 'shipped',
    DELIVERED = 'delivered',
    FULFILLMENT_FAILED = 'fulfillment_failed',
    CANCELLED = 'cancelled',
    REFUNDED = 'refunded'
}

export enum AdminReviewAction {
    CUSTOMER_APPROVED = 'customer_approved',
    ADDED_TO_CART = 'added_to_cart',
    PAYMENT_CAPTURED = 'payment_captured',
    APPROVED_FOR_PRINT = 'approved_for_print',
    REJECTED = 'rejected',
    CHANGES_REQUESTED = 'changes_requested',
    PRINTIFY_SUBMITTED = 'printify_submitted',
    PRINTIFY_RETRIED = 'printify_retried',
    PRINTIFY_SYNCHRONIZED = 'printify_synchronized'
}

export enum AIGenerationKind {
    INITIAL = 'initial',
    REVISION = 'revision'
}

export enum AIGenerationStatus {
    PROCESSING = 'processing',
    SUCCEEDED = 'succeeded',
    FAILED = 'failed'
}

export enum AIApprovalStatus {
    NOT_REQUIRED = 'not_required',
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CHANGES_REQUESTED = 'changes_requested'
}

export enum CreditTransactionReason {
    FREE_PROJECT = 'free_project',
    PURCHASE = 'purchase',
    GENERATION = 'generation',
    REVISION = 'revision',
    ORDER_REWARD = 'order_reward',
    ADMIN_ADJUSTMENT = 'admin_adjustment',
    REFUND = 'refund',
    PROMOTION = 'promotion'
}

export enum AdminNoteVisibility {
    INTERNAL = 'internal',
    USER = 'user'
}
