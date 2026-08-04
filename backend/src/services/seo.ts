export const CANONICAL_SITE_ORIGIN = 'https://gouphoria.com'

export const PUBLIC_SITEMAP_PATHS = [
    '/',
    '/products',
    '/about',
    '/support',
    '/privacy',
    '/terms',
    '/shipping-policy',
    '/refund-policy',
    '/ai-design-policy',
    '/content-policy',
    '/faq'
] as const

export interface SitemapProduct {
    id: string
    updatedAt?: string | Date
}

function escapeXml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function validLastModified(value: string | Date | undefined) {
    if (!value) return undefined
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function buildSitemap(products: SitemapProduct[]) {
    const entries = new Map<string, string | undefined>()
    for (const path of PUBLIC_SITEMAP_PATHS) entries.set(new URL(path, CANONICAL_SITE_ORIGIN).toString(), undefined)
    for (const product of products) {
        if (!product.id.trim()) continue
        const location = new URL(`/products/${encodeURIComponent(product.id)}`, CANONICAL_SITE_ORIGIN).toString()
        entries.set(location, validLastModified(product.updatedAt))
    }

    const urls = [...entries.entries()].map(([location, lastModified]) => [
        '  <url>',
        `    <loc>${escapeXml(location)}</loc>`,
        ...(lastModified ? [`    <lastmod>${escapeXml(lastModified)}</lastmod>`] : []),
        '  </url>'
    ].join('\n')).join('\n')

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function buildRobotsTxt() {
    return [
        'User-agent: *',
        'Allow: /',
        'Disallow: /login',
        'Disallow: /register',
        'Disallow: /unauthorized',
        'Disallow: /profile',
        'Disallow: /cart',
        'Disallow: /checkout',
        'Disallow: /create-ai',
        'Disallow: /designs',
        'Disallow: /orders',
        'Disallow: /credits',
        'Disallow: /admin',
        'Disallow: /health',
        'Disallow: /products/ai-customizable',
        'Disallow: /products/sync',
        'Disallow: /auth/',
        'Disallow: /payments/',
        'Disallow: /ai/',
        'Disallow: /webhooks/',
        'Disallow: /api/',
        'Disallow: /*?',
        '',
        `Sitemap: ${CANONICAL_SITE_ORIGIN}/sitemap.xml`,
        ''
    ].join('\n')
}
