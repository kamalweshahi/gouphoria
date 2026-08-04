import axios from 'axios'
import { useEffect, useState } from 'react'
import { getAdminAssetBlob } from '../../../services/admin'

type LoadState = 'loading' | 'ready' | 'missing' | 'error'
type LoadResult = { requestKey: string; state: LoadState; blobUrl: string }

export default function ProtectedAdminImage({
    endpoint,
    alt,
    assetLabel,
    downloadName,
    onAvailabilityChange
}: {
    endpoint?: string
    alt: string
    assetLabel: string
    downloadName?: string
    onAvailabilityChange?: (available: boolean) => void
}) {
    const [retry, setRetry] = useState(0)
    const requestKey = `${endpoint ?? ''}:${retry}`
    const [result, setResult] = useState<LoadResult>({ requestKey: '', state: 'loading', blobUrl: '' })
    const state = result.requestKey === requestKey ? result.state : endpoint ? 'loading' : 'missing'
    const blobUrl = result.requestKey === requestKey ? result.blobUrl : ''

    useEffect(() => {
        let active = true
        let currentBlobUrl = ''
        onAvailabilityChange?.(false)

        if (!endpoint) {
            return () => { active = false }
        }

        void getAdminAssetBlob(endpoint).then(blob => {
            if (!active) return
            currentBlobUrl = URL.createObjectURL(blob)
            setResult({ requestKey, state: 'ready', blobUrl: currentBlobUrl })
            onAvailabilityChange?.(true)
        }).catch(error => {
            if (!active) return
            const status = axios.isAxiosError(error) ? error.response?.status : undefined
            setResult({ requestKey, state: status === 404 ? 'missing' : 'error', blobUrl: '' })
            onAvailabilityChange?.(false)
        })

        return () => {
            active = false
            if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
        }
    }, [endpoint, onAvailabilityChange, requestKey])

    function imageFailed() {
        setResult({ requestKey, state: 'error', blobUrl: '' })
        onAvailabilityChange?.(false)
    }

    if (state === 'loading') return <div className="admin-protected-image-state" role="status">Loading {assetLabel}…</div>
    if (state !== 'ready' || !blobUrl) return <div className="admin-protected-image-state admin-protected-image-error" role="alert">
        <strong>{assetLabel}</strong>
        <span>{state === 'missing' ? 'The stored image file could not be found.' : 'The protected image could not be loaded.'}</span>
        <button type="button" onClick={() => setRetry(value => value + 1)}>Retry image loading</button>
    </div>

    return <div className="admin-protected-image">
        <a href={blobUrl} target="_blank" rel="noreferrer" aria-label={`Open larger preview of ${assetLabel}`}>
            <img src={blobUrl} alt={alt} onError={imageFailed} />
        </a>
        <div className="admin-protected-image-actions">
            <a href={blobUrl} target="_blank" rel="noreferrer">Open larger preview</a>
            {downloadName && <a href={blobUrl} download={downloadName}>Download printable artwork</a>}
        </div>
    </div>
}
