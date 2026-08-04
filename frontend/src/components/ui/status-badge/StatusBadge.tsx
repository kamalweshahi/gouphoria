import './StatusBadge.css'
import { statusPresentation, type StatusAudience } from '../../../utils/status-presentation'

interface Props {
    status?: string
    prefix?: string
    audience?: StatusAudience
}

export default function StatusBadge({ status, prefix, audience = 'customer' }: Props) {
    const presentation = statusPresentation(status, audience)
    return <span className={`status-badge status-${presentation.tone}`}><span aria-hidden="true" className="status-dot" />{prefix ? `${prefix}: ` : ''}{presentation.customer}</span>
}
