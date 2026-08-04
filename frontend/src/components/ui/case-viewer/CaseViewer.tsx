import { useEffect, useRef, useState } from 'react'
import './CaseViewer.css'

interface Props { image?: string; alt: string; compact?: boolean; className?: string }

export default function CaseViewer({ image, alt, compact = false, className = '' }: Props) {
    const [angle, setAngle] = useState(-12)
    const [dragging, setDragging] = useState(false)
    const drag = useRef({ x: 0, angle: -12 })
    const frame = useRef<number | undefined>(undefined)
    const angleRef = useRef(angle)
    useEffect(() => { angleRef.current = angle }, [angle])

    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduced || dragging) return
        let previous = performance.now()
        const tick = (time: number) => {
            if (!document.hidden) {
                const elapsed = Math.min(50, time - previous)
                const next = angleRef.current + elapsed * .006
                const bounded = next > 18 ? -18 : next
                angleRef.current = bounded
                setAngle(bounded)
            }
            previous = time
            frame.current = requestAnimationFrame(tick)
        }
        frame.current = requestAnimationFrame(tick)
        return () => { if (frame.current) cancelAnimationFrame(frame.current) }
    }, [dragging])

    return <div
        className={`case-viewer ${compact ? 'case-viewer-compact' : ''} ${className}`}
        role="img"
        aria-label={`${alt}. Interactive 360 degree product view.`}
        tabIndex={0}
        onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault(); setAngle(value => Math.max(-38, Math.min(38, value + (event.key === 'ArrowLeft' ? -5 : 5))))
            }
        }}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, angle }; setDragging(true) }}
        onPointerMove={event => { if (dragging) setAngle(Math.max(-38, Math.min(38, drag.current.angle + (event.clientX - drag.current.x) * .16))) }}
        onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false) }}
        onPointerCancel={() => setDragging(false)}
    >
        <div className="case-viewer-shadow" />
        <div className="case-viewer-object" style={{ transform: `rotateX(4deg) rotateY(${angle}deg) rotateZ(-5deg)` }}>
            <div className="case-viewer-depth" />
            <div className="case-viewer-face">
                {image ? <img src={image} alt="" decoding="async" /> : <div className="case-viewer-art"><span>G</span></div>}
                <div className="case-viewer-camera"><i /><i /><i /><b /></div>
            </div>
        </div>
        <span className="case-viewer-help">Drag or use arrow keys</span>
    </div>
}
