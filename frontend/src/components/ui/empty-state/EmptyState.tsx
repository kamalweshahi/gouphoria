import { Link } from 'react-router-dom'
import './EmptyState.css'

interface Props {
    title: string
    message: string
    action?: { label: string; to: string }
}

export default function EmptyState({ title, message, action }: Props) {
    return <div className="empty-state"><span aria-hidden="true">✦</span><h2>{title}</h2><p>{message}</p>{action && <Link className="button button-primary" to={action.to}>{action.label}</Link>}</div>
}
