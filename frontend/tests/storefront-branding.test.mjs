import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function sourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
        if (entry.name === 'admin') continue
        const path = join(directory, entry.name)
        if (entry.isDirectory()) files.push(...await sourceFiles(path))
        else if (/\.(tsx|css)$/.test(entry.name)) files.push(path)
    }
    return files
}

test('customer-rendered components contain no production-service branding', async () => {
    const root = new URL('../src/components', import.meta.url)
    const files = await sourceFiles(root.pathname)
    for (const file of files) {
        const source = await readFile(file, 'utf8')
        assert.doesNotMatch(source, /Printify|print provider|fulfillment provider|production partner|blueprint ID|provider variant/i, file)
    }
})

test('public metadata and favicon use Gouphoria editorial branding', async () => {
    const [html, favicon] = await Promise.all([
        readFile(new URL('../index.html', import.meta.url), 'utf8'),
        readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8')
    ])
    assert.match(html, /<title>Gouphoria — Custom AI Phone Cases<\/title>/)
    assert.match(html, /property="og:site_name" content="Gouphoria"/)
    assert.match(html, /name="twitter:title" content="Gouphoria — Custom AI Phone Cases"/)
    assert.match(html, /Create custom phone cases with AI, preview your design, choose your phone model/)
    assert.doesNotMatch(html, /Printify|Store —|production partner|fulfillment provider/i)
    assert.match(favicon, />G<\/text>/)
    assert.doesNotMatch(favicon, /linearGradient|#5b5ce2|#9a62ed|>S<\/text>/i)
})

test('About, support, and public policy copy contain no old brand or launch placeholders', async () => {
    const [about, policies, config] = await Promise.all([
        readFile(new URL('../src/components/pages/about/About.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/policies/PolicyPages.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/config/store.ts', import.meta.url), 'utf8')
    ])
    assert.match(about, /How Gouphoria works/)
    assert.match(about, /Gouphoria connects original design tools/)
    assert.match(policies, /Gouphoria Support —/)
    assert.match(policies, /GPH-1234/)
    assert.match(config, /VITE_SUPPORT_EMAIL/)
    assert.match(config, /VITE_SUPPORT_RESPONSE_TIME/)
    assert.doesNotMatch(`${about}\n${policies}\n${config}`, /How Store works|Store support|STORE-|support@example\.com|\[OWNER REVIEW|\bTODO\b|\bTBD\b/)
})

test('admin uses neutral production wording and collapses exact integration diagnostics', async () => {
    const [orders, details, review, products, status] = await Promise.all([
        readFile(new URL('../src/components/pages/admin/AdminOrders.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/admin/AdminOrderDetails.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/admin/AdminReviewDetails.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/admin/AdminProducts.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/utils/status-presentation.ts', import.meta.url), 'utf8')
    ])
    const admin = `${orders}\n${details}\n${review}\n${products}\n${status}`
    for (const wording of ['Submit to production', 'Production fulfillment', 'Production status', 'External production order', 'Synchronize production', 'Integration mapping', 'Internal integration details']) {
        assert.match(admin, new RegExp(wording, 'i'))
    }
    assert.doesNotMatch(admin, /Submit to Printify|Sync Printify|Printify fulfillment|Printify mapping|Printify webhook events|Submitted to Printify|Sent to Printify/i)
    assert.match(details, /<details className="admin-integration-details"><summary>Internal integration details<\/summary>/)
    assert.match(details, /Printify product ID/)
    assert.match(review, /Printify order ID/)
})

test('product removal wording matches permanent deletion, archival, and management hiding', async () => {
    const dialog = await readFile(new URL('../src/components/pages/admin/ProductDeleteDialog.tsx', import.meta.url), 'utf8')
    assert.match(dialog, /Permanently delete product/)
    assert.match(dialog, /has no order or design history and can be permanently removed/)
    assert.match(dialog, /Archive product/)
    assert.match(dialog, /existing order or design history/)
    assert.match(dialog, /Hide from product management/)
    assert.doesNotMatch(dialog, /Permanently remove archived product/)
})

test('premium header exposes the approved navigation and mobile controls', async () => {
    const header = await readFile(new URL('../src/components/layout/header/Header.tsx', import.meta.url), 'utf8')
    for (const label of ['Gouphoria', 'Home page', 'Cases', 'Create with AI', 'My Designs', 'About']) assert.match(header, new RegExp(label))
    assert.match(header, /to="\/" end>Home page/)
    assert.match(header, /account-popover/)
    assert.match(header, /My Orders/)
    assert.match(header, /AI Credits/)
    assert.match(header, /Log out/)
    assert.match(header, /aria-expanded=/)
    assert.match(header, /aria-controls="primary-navigation"/)
    assert.match(header, /user\?\.role === 'admin'.*<NavLink to="\/admin">Admin<\/NavLink>/s)
})

test('My Designs cards remain inside the responsive grid', async () => {
    const css = await readFile(new URL('../src/components/pages/ai/AI.css', import.meta.url), 'utf8')
    assert.match(css, /\.design-grid\s*\{[^}]*min-width:\s*0/)
    assert.match(css, /\.design-card\s*\{[^}]*min-width:\s*0/)
    assert.match(css, /grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/)
    assert.match(css, /\.design-card h2\s*\{[^}]*font-size:clamp/)
    assert.match(css, /\.designs-library-heading/)
    assert.match(css, /\.design-card-visual/)
    assert.match(css, /\.design-artwork-inset/)
})

test('admin catalog images resolve backend-relative asset URLs', async () => {
    const service = await readFile(new URL('../src/services/admin.ts', import.meta.url), 'utf8')
    assert.match(service, /image: customerAssetUrl\(product\.image\)/)
    assert.match(service, /variants: product\.variants\.map/)
})

test('protected admin review images use authenticated blobs with cleanup and approval safety', async () => {
    const [component, service, details] = await Promise.all([
        readFile(new URL('../src/components/pages/admin/ProtectedAdminImage.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/services/admin.ts', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/admin/AdminReviewDetails.tsx', import.meta.url), 'utf8')
    ])
    assert.match(service, /withCredentials:\s*true/)
    assert.match(service, /responseType:\s*'blob'/)
    assert.match(service, /replace\(\/\^\\\/admin\\\/reviews/)
    assert.match(service, /\/admin\/ai-reviews\//)
    assert.match(component, /URL\.createObjectURL/)
    assert.match(component, /URL\.revokeObjectURL/)
    assert.match(component, /state === 'loading'/)
    assert.match(component, /state: 'ready'/)
    assert.match(component, /Retry image loading/)
    assert.match(component, /The stored image file could not be found/)
    assert.match(component, /Download printable artwork/)
    assert.match(details, /<ProtectedAdminImage/)
    assert.match(details, /onAvailabilityChange=\{setArtworkAvailable\}/)
    assert.match(details, /disabled=\{working \|\| !decisionAvailable \|\| !artworkAvailable\}/)
    assert.doesNotMatch(details, /<img src=\{adminAssetUrl\(review\.design/)
})

test('admin order production action supports standard, AI-custom, and mixed item routing', async () => {
    const details = await readFile(new URL('../src/components/pages/admin/AdminOrderDetails.tsx', import.meta.url), 'utf8')
    assert.match(details, /item\.itemType === 'ai_custom'/)
    assert.match(details, /'approved_for_print'/)
    assert.match(details, /'paid', 'fulfillment_failed'/)
    assert.match(details, /'ready', 'failed', 'partial'/)
    assert.match(details, /order\.items\.some\(item => item\.printify\.orderId\)/)
    assert.match(details, /Each standard and AI-custom item is routed through its matching idempotent production flow/)
})

test('case viewer supports reduced motion, keyboard use, and hidden-tab pausing', async () => {
    const [viewer, css] = await Promise.all([
        readFile(new URL('../src/components/ui/case-viewer/CaseViewer.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/ui/case-viewer/CaseViewer.css', import.meta.url), 'utf8')
    ])
    assert.match(viewer, /prefers-reduced-motion/)
    assert.match(viewer, /document\.hidden/)
    assert.match(viewer, /ArrowLeft/)
    assert.match(viewer, /tabIndex=\{0\}/)
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('homepage uses the approved case photography, process images, and line icons', async () => {
    const home = await readFile(new URL('../src/components/pages/home/Home.tsx', import.meta.url), 'utf8')
    for (const asset of [
        'gouphoria-process-01.webp',
        'gouphoria-process-02.webp',
        'gouphoria-process-03.webp',
        'gouphoria-process-04.webp'
    ]) {
        assert.match(home, new RegExp(asset.replaceAll('.', '\\.')))
        await access(new URL(`../public/${asset}`, import.meta.url))
    }
    for (const kind of ['phone', 'sparkle', 'bag', 'shield', 'truck', 'lock', 'review', 'photo']) {
        assert.match(home, new RegExp(`'${kind}'`))
    }
    assert.match(home, /Upload a photo reference/)
    assert.match(home, /Option 1/)
    assert.match(home, /Option 2/)
    assert.match(home, /ProcessGalleryDialog/)
    assert.match(home, /aria-pressed=/)
    assert.match(home, /Previous/)
    assert.match(home, /Next/)
    assert.doesNotMatch(home, /Suggested styles/)
    assert.doesNotMatch(home, /360|Premium Finish/i)
})

test('premium photo viewer automatically sequences the transparent back, side, and phone screen views', async () => {
    const [viewer, css] = await Promise.all([
        readFile(new URL('../src/components/ui/premium-photo-viewer/PremiumPhotoViewer.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/ui/premium-photo-viewer/PremiumPhotoViewer.css', import.meta.url), 'utf8')
    ])
    assert.match(viewer, /gouphoria-phone-back-transparent\.png/)
    assert.match(viewer, /gouphoria-phone-side-transparent\.png/)
    assert.match(viewer, /gouphoria-phone-front-transparent\.png/)
    for (const asset of ['gouphoria-phone-back-transparent.png', 'gouphoria-phone-side-transparent.png', 'gouphoria-phone-front-transparent.png']) {
        await access(new URL(`../public/${asset}`, import.meta.url))
    }
    assert.match(viewer, /prefers-reduced-motion/)
    assert.match(viewer, /document\.hidden/)
    assert.match(css, /premium-product-back/)
    assert.match(css, /premium-product-side-out/)
    assert.match(css, /premium-product-front/)
    assert.doesNotMatch(viewer, /onPointerDown|Drag to explore/)
})
