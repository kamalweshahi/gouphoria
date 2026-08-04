const apiBaseUrl = import.meta.env.VITE_REST_SERVER_URL || 'http://localhost:3000'

export function customerAssetUrl(value?: string) {
    if (!value) return value
    return value.startsWith('/') ? `${apiBaseUrl}${value}` : value
}
