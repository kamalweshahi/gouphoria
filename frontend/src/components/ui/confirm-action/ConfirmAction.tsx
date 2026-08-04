import { useEffect, useRef } from 'react'
import './ConfirmAction.css'

interface Props {
    title: string
    message: string
    confirmLabel: string
    tone?: 'standard' | 'danger'
    working?: boolean
    onCancel: () => void
    onConfirm: () => void
}

export default function ConfirmAction({ title, message, confirmLabel, tone = 'standard', working, onCancel, onConfirm }: Props) {
    const cancelRef = useRef<HTMLButtonElement>(null)
    const dialogRef = useRef<HTMLDivElement>(null)
    useEffect(() => { cancelRef.current?.focus() }, [])

    return <div ref={dialogRef} className="confirm-action" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" onKeyDown={event => {
        if (event.key === 'Escape' && !working) onCancel()
        if (event.key === 'Tab') {
            const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? [])]
            if (!controls.length) return
            const first = controls[0], last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }
    }}>
        <div className="confirm-card">
            <span className="confirm-icon" aria-hidden="true">!</span>
            <h2 id="confirm-title">{title}</h2>
            <p id="confirm-message">{message}</p>
            <div><button ref={cancelRef} type="button" className="confirm-cancel" onClick={onCancel} disabled={working}>Cancel</button><button type="button" className={tone === 'danger' ? 'confirm-danger' : 'confirm-primary'} onClick={onConfirm} disabled={working}>{working ? 'Saving…' : confirmLabel}</button></div>
        </div>
    </div>
}
