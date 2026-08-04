import { useEffect, useRef, useState } from 'react'
import type { AdminProductDeletionPlan } from '../../../models/AdminManagement'

export default function ProductDeleteDialog({ plan, working, onCancel, onConfirm }: {
    plan: AdminProductDeletionPlan; working: boolean; onCancel: () => void; onConfirm: (confirmation: string) => void
}) {
    const [permanentStep, setPermanentStep] = useState(false)
    const [confirmation, setConfirmation] = useState('')
    const dialogRef = useRef<HTMLDivElement>(null)
    const firstRef = useRef<HTMLButtonElement>(null)
    useEffect(() => { firstRef.current?.focus() }, [])
    const permanent = plan.action === 'delete'
    const archivedPermanent = permanent && plan.archivedWithHistory === true
    const valid = confirmation.trim() === 'DELETE' || confirmation.trim() === plan.productName
    return <div ref={dialogRef} className="confirm-action" role="alertdialog" aria-modal="true" aria-labelledby="product-delete-title" aria-describedby="product-delete-message" onKeyDown={event => {
        if (event.key === 'Escape' && !working) onCancel()
        if (event.key === 'Tab') {
            const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? [])]
            const first = controls[0], last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
    }}><div className="confirm-card product-delete-card"><span className="confirm-icon" aria-hidden="true">!</span><h2 id="product-delete-title">{archivedPermanent ? 'Hide archived product from management?' : permanent ? 'Permanently delete product?' : 'Archive product?'}</h2><p id="product-delete-message">{archivedPermanent ? 'This archived product will be hidden from active catalog management and blocked from synchronization. Existing orders, payments, designs, and fulfillment history will remain preserved.' : permanent ? 'This product has no order or design history and can be permanently removed with its unused variants.' : 'This product has existing order or design history. It will be hidden from the storefront while historical records remain available.'}</p><strong>{plan.productName}</strong>
        {permanent && permanentStep && <label className="delete-confirm-field">Type the product name or DELETE<input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
        <div><button ref={firstRef} type="button" className="confirm-cancel" disabled={working} onClick={onCancel}>Cancel</button>{permanent && !permanentStep ? <button type="button" className="confirm-danger" onClick={() => setPermanentStep(true)}>Continue</button> : <button type="button" className="confirm-danger" disabled={working || (permanent && !valid)} onClick={() => onConfirm(permanent ? confirmation.trim() : 'ARCHIVE')}>{working ? 'Processing…' : archivedPermanent ? 'Hide from product management' : permanent ? 'Delete permanently' : 'Archive product'}</button>}</div>
    </div></div>
}
