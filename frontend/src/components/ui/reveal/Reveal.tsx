import { useEffect, useRef, useState, type PropsWithChildren } from 'react'
import './Reveal.css'

export default function Reveal({ children, className = '', delay = 0 }: PropsWithChildren<{ className?: string; delay?: number }>) {
    const ref = useRef<HTMLDivElement>(null)
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        const node = ref.current
        if (!node || !('IntersectionObserver' in window)) { setVisible(true); return }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
        observer.observe(node)
        return () => observer.disconnect()
    }, [])
    return <div ref={ref} className={`reveal ${visible ? 'is-visible' : ''} ${className}`} style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}>{children}</div>
}
