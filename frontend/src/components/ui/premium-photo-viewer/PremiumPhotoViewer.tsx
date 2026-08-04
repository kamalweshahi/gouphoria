import { useEffect, useState } from 'react'
import './PremiumPhotoViewer.css'

interface Props {
    alt: string
    compact?: boolean
    eager?: boolean
    className?: string
}

const productViews = [
    ['premium-product-back', '/gouphoria-phone-back-transparent.png?v=20260802'],
    ['premium-product-side-out', '/gouphoria-phone-side-transparent.png?v=20260802'],
    ['premium-product-front', '/gouphoria-phone-front-transparent.png?v=20260802'],
    ['premium-product-side-return', '/gouphoria-phone-side-transparent.png?v=20260802']
] as const

export default function PremiumPhotoViewer({ alt, compact = false, eager = false, className = '' }: Props) {
    const [paused, setPaused] = useState(false)

    useEffect(() => {
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
        const updatePlayback = () => setPaused(document.hidden || motion.matches)
        updatePlayback()
        document.addEventListener('visibilitychange', updatePlayback)
        motion.addEventListener('change', updatePlayback)
        return () => {
            document.removeEventListener('visibilitychange', updatePlayback)
            motion.removeEventListener('change', updatePlayback)
        }
    }, [])

    return <div
        className={`premium-photo-viewer ${compact ? 'premium-photo-viewer-compact' : ''} ${paused ? 'is-paused' : ''} ${className}`}
        role="img"
        aria-label={`${alt}. Automatically rotating product presentation showing the printed back, real side profile, and Gouphoria phone screen.`}
    >
        <div className="premium-product-halo" aria-hidden="true" />
        <div className="premium-product-shadow" aria-hidden="true" />
        <div className="premium-product-sequence" aria-hidden="true">
            {productViews.map(([viewClass, src], index) => <img
                key={viewClass}
                className={viewClass}
                src={src}
                alt=""
                decoding="async"
                loading={eager || index === 0 ? 'eager' : 'lazy'}
                fetchPriority={eager && index === 0 ? 'high' : 'auto'}
            />)}
        </div>
    </div>
}
