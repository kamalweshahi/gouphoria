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
    assert.match(html, /<title>Gouphoria — Premium Phone Cases<\/title>/)
    assert.match(html, /property="og:site_name" content="Gouphoria"/)
    assert.match(html, /name="twitter:title" content="Gouphoria — Premium Phone Cases"/)
    assert.match(html, /Shop premium phone cases for your model or design your own custom case/)
    assert.doesNotMatch(html, /Printify|Store —|production partner|fulfillment provider/i)
    assert.match(favicon, />G<\/text>/)
    assert.doesNotMatch(favicon, /linearGradient|#5b5ce2|#9a62ed|>S<\/text>/i)
})

test('nginx exposes dynamic sitemap and robots files through the public origin', async () => {
    const nginx = await readFile(new URL('../nginx.conf', import.meta.url), 'utf8')
    assert.match(nginx, /location = \/sitemap\.xml\s*\{[^}]*proxy_pass http:\/\/backend:3000\/sitemap\.xml;/s)
    assert.match(nginx, /location = \/robots\.txt\s*\{[^}]*proxy_pass http:\/\/backend:3000\/robots\.txt;/s)
})

test('About, support, and public policy copy contain no old brand or launch placeholders', async () => {
    const [about, policies, config, footer] = await Promise.all([
        readFile(new URL('../src/components/pages/about/About.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/policies/PolicyPages.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/config/store.ts', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/layout/footer/Footer.tsx', import.meta.url), 'utf8')
    ])
    assert.match(about, /How Gouphoria works/)
    assert.match(about, /Gouphoria connects original design tools/)
    assert.match(policies, /Gouphoria Support —/)
    assert.match(policies, /GPH-1234/)
    assert.match(config, /VITE_SUPPORT_EMAIL/)
    assert.match(config, /gouphoria@gmail\.com/)
    assert.match(config, /VITE_SUPPORT_RESPONSE_TIME/)
    assert.match(footer, /mailto:\$\{supportEmail\}/)
    assert.doesNotMatch(`${about}\n${policies}\n${config}\n${footer}`, /How Store works|Store support|STORE-|support@example\.com|\[OWNER REVIEW|\bTODO\b|\bTBD\b/)
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
    const [header, css] = await Promise.all([
        readFile(new URL('../src/components/layout/header/Header.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/layout/header/Header.css', import.meta.url), 'utf8')
    ])
    for (const label of ['Gouphoria', 'Shop', 'Create with AI', 'Featured Cases', 'My Orders', 'Account']) assert.match(header, new RegExp(label))
    assert.match(header, /to="\/products">Shop/)
    assert.match(header, /account-popover/)
    assert.match(header, /My Orders/)
    assert.match(header, /AI Credits/)
    assert.match(header, /Log out/)
    assert.match(header, /aria-expanded=/)
    assert.match(header, /aria-controls="primary-navigation"/)
    assert.match(header, /className="nav-backdrop"/)
    assert.match(header, /event\.key === 'Escape'/)
    assert.match(header, /event\.key !== 'Tab'/)
    assert.match(css, /transform:translateX\(-105%\)/)
    assert.match(css, /height:100dvh/)
    assert.match(header, /user\?\.role === 'admin'.*<NavLink to="\/admin">Admin<\/NavLink>/s)
})

test('customer request IDs use a browser-compatible UUID fallback', async () => {
    const [createId, auth, checkout, createAI, designDetails] = await Promise.all([
        readFile(new URL('../src/utils/create-id.ts', import.meta.url), 'utf8'),
        readFile(new URL('../src/context/AuthProvider.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/credits/credit-paypal-checkout/CreditPayPalCheckout.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/ai/CreateAI.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/ai/DesignDetails.tsx', import.meta.url), 'utf8')
    ])
    assert.match(createId, /typeof crypto !== 'undefined'/)
    assert.match(createId, /typeof crypto\.randomUUID === 'function'/)
    assert.match(createId, /Date\.now\(\).*Math\.random\(\)/s)
    for (const consumer of [auth, checkout, createAI, designDetails]) {
        assert.match(consumer, /createId\(\)/)
        assert.doesNotMatch(consumer, /crypto\.randomUUID\(\)/)
    }
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

test('homepage prioritizes real catalog shopping and keeps AI secondary', async () => {
    const home = await readFile(new URL('../src/components/pages/home/Home.tsx', import.meta.url), 'utf8')
    for (const kind of ['shield', 'truck', 'lock', 'review']) {
        assert.match(home, new RegExp(`'${kind}'`))
    }
    assert.match(home, /Phone cases<br \/>made for you/)
    assert.match(home, /Shop our collection or create your own with AI/)
    assert.match(home, /className="primary-button" to="\/products">Shop Cases/)
    assert.match(home, /Featured Cases/)
    assert.match(home, /getAllProducts/)
    assert.match(home, /allowDirectPurchase !== false/)
    assert.match(home, /Design Your Own Case/)
    assert.match(home, /Powered by AI/)
    assert.match(home, /gouphoria-phone-back-transparent\.png/)
    assert.doesNotMatch(home, /AI-powered\. Uniquely yours|Design it\.|Make it yours\./i)
})

test('account prioritizes orders and failed designs never expose technical details', async () => {
    const [profile, designs, details, model] = await Promise.all([
        readFile(new URL('../src/components/pages/profile/Profile.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/ai/MyDesigns.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/ai/DesignDetails.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/models/AIDesign.ts', import.meta.url), 'utf8')
    ])
    assert.match(profile, /My Orders/)
    assert.match(profile, /No orders yet/)
    assert.match(profile, /Shop Cases/)
    assert.match(profile, /getOrders/)
    assert.match(designs, /Generation couldn't be completed/)
    assert.match(designs, /Your credit was not used/)
    assert.match(designs, /Try Again/)
    assert.doesNotMatch(designs, /design\.errorCode|generation\.errorCode/)
    assert.doesNotMatch(details, /generation\.errorCode|Reference:/)
    assert.doesNotMatch(model, /errorCode\?:/)
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
