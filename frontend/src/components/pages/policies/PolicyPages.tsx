import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supportEmail, supportResponseTime } from '../../../config/store'
import './PolicyPages.css'

interface Section {
    title: string
    content: ReactNode
}

interface Policy {
    eyebrow: string
    title: string
    intro: string
    sections: Section[]
}

function SupportContact() {
    return supportEmail
        ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
        : <>Support contact details are being updated. Please check back soon.</>
}

const policies: Record<string, Policy> = {
    privacy: {
        eyebrow: 'Privacy policy',
        title: 'How your information supports your account, designs, and orders.',
        intro: 'This policy describes the information Gouphoria uses to provide its current services. It does not claim compliance with a particular jurisdiction.',
        sections: [
            { title: 'Information we collect', content: <p>We may store account details, session and technical logs, shipping addresses, order records, payment references, uploaded reference images, AI prompts, generated artwork, mockup previews, review notes, and fulfillment or tracking updates.</p> },
            { title: 'How information is used', content: <p>Information is used for account and session management, fraud and abuse prevention, support, AI generation, payment verification, order processing, design review, production, and delivery.</p> },
            { title: 'Connected services', content: <p>PayPal processes payments, specialist manufacturing and delivery services support orders, and the configured AI service processes design requests. Hosting and infrastructure services may process technical data needed to operate Gouphoria. Their own terms and privacy practices also apply.</p> },
            { title: 'Payments', content: <p>Gouphoria records PayPal order, capture, amount, currency, and status references needed to verify payment. Gouphoria does not receive or store your full payment-card details when PayPal processes the payment.</p> },
            { title: 'Cookies and sessions', content: <p>An HttpOnly session cookie keeps you signed in. Session records may include expiration, IP address, and user-agent information for security. Disabled or logged-out sessions are revoked.</p> },
            { title: 'Uploaded images and AI designs', content: <p>Reference uploads are kept outside the public frontend and served through authenticated routes. They are used for the design and order workflow. Administrators can access purchased design files when required for review and fulfillment.</p> },
            { title: 'Storage and retention', content: <p>Account, order, payment-reference, credit-ledger, design-review, and fulfillment records are retained while needed for the Gouphoria workflow, security, support, and business records. A final deletion schedule has not yet been published.</p> },
            { title: 'Your choices and contact', content: <p>You may contact support to ask about your stored account information or request an available correction or deletion. Some order, payment, audit, or fulfillment records may need to be retained. <SupportContact /></p> }
        ]
    },
    terms: {
        eyebrow: 'Terms and conditions',
        title: 'The responsibilities that make the Gouphoria workflow work.',
        intro: 'By using Gouphoria, you agree to provide accurate information, use the service lawfully, and review custom work before ordering.',
        sections: [
            { title: 'Accounts and information', content: <p>You are responsible for your account credentials, activity, accurate shipping information, and reviewing selections before payment. Gouphoria may suspend accounts used for abuse, fraud, or repeated policy violations.</p> },
            { title: 'Products, pricing, and payment', content: <p>Availability comes from the connected catalog and may change. Backend-verified prices and currency shown at checkout control the order. PayPal must confirm payment before an order can proceed.</p> },
            { title: 'Shipping and fulfillment', content: <p>Shipping options depend on the address, cart, and selected case. Production and delivery estimates are not guarantees. Customs or import fees may apply.</p> },
            { title: 'AI-custom workflow and review', content: <p>AI-custom-only products require finalized artwork. You must review the design and selected variant. Paid custom items may require administrator review, approval, rejection, or requested changes before production.</p> },
            { title: 'Prompts, uploads, and prohibited content', content: <p>You must own or have permission to use submitted content. Illegal, infringing, hateful, exploitative, malicious, or deceptive content is not allowed.</p> },
            { title: 'Cancellation, returns, and refunds', content: <p>Cancellation may not be possible after payment, design approval, or production begins. Custom-product eligibility is limited as described in the Refund and Return Policy. Gouphoria does not currently promise automatic refunds.</p> },
            { title: 'Service availability and responsibility', content: <p>Connected services can be delayed or unavailable. Gouphoria will use reasonable care but cannot guarantee uninterrupted service or perfect AI, screen, print, color, material, or delivery results. Nothing here removes rights that cannot lawfully be limited.</p> },
            { title: 'Changes and contact', content: <p>These terms may be updated when the service or business policy changes. Questions may be sent to Gouphoria support. <SupportContact /></p> }
        ]
    },
    shipping: {
        eyebrow: 'Shipping policy',
        title: 'Shipping is calculated for the actual case, cart, and destination.',
        intro: 'Gouphoria uses current shipping availability rather than promising a hardcoded country list or delivery time.',
        sections: [
            { title: 'Options and price', content: <p>Shipping availability, methods, and prices depend on the selected product and variant, the cart contents, and the delivery address. Review the server-calculated option and total before payment.</p> },
            { title: 'Production versus delivery', content: <p>Production time is separate from carrier shipping time. AI-custom items may wait for design review before production starts. Production and carrier estimates are estimates, not guarantees.</p> },
            { title: 'Tracking and split shipments', content: <p>Tracking appears in Order Details when it becomes available. Mixed orders and items produced separately may arrive in more than one shipment.</p> },
            { title: 'Addresses and customs', content: <p>Review the recipient, address, postal code, country, and phone before payment. Incorrect information can delay or prevent delivery. Customs, duties, taxes, or import fees may apply depending on the destination and remain the customer’s responsibility unless stated otherwise at checkout.</p> }
        ]
    },
    refunds: {
        eyebrow: 'Refund and return policy',
        title: 'Standard and custom products require different review.',
        intro: 'Gouphoria does not currently provide automatic refunds. Contact support so the order, payment, and fulfillment records can be reviewed.',
        sections: [
            { title: 'Standard products', content: <><p>Damaged, defective, or incorrect standard items may be considered for replacement or refund after review. Photos of the product, packaging, shipping label, and damage may reasonably be requested.</p><p>Please contact Gouphoria support as soon as possible after receiving a damaged, defective, or incorrect item. Eligibility will be reviewed based on the order details and available evidence.</p></> },
            { title: 'AI-custom products', content: <p>Custom products are generally not returnable for change of mind after production begins. A replacement or refund may be considered for a manufacturing defect, incorrect item, delivery damage, or a material mismatch from the approved order. Later dislike of an approved artistic result is not by itself a product defect.</p> },
            { title: 'Payment and fulfillment issues', content: <p>Contact support about a possible duplicate charge, payment captured without order completion, cancelled production, or a production failure. Provide the internal order number and PayPal reference when available. Any refund remains subject to verification and the available payment process.</p> },
            { title: 'How to request help', content: <p>Use the <Link to="/support">support page</Link> and include the order number, issue, and relevant evidence. Do not send full card details.</p> }
        ]
    },
    ai: {
        eyebrow: 'AI design policy',
        title: 'AI helps create artwork, but review remains essential.',
        intro: 'Generated designs and product previews can contain imperfections and are not guarantees of an exact physical result.',
        sections: [
            { title: 'Design expectations', content: <p>AI may produce unexpected details, imperfect text, faces, logos, colors, or objects. The service does not guarantee photorealistic accuracy. Review the current artwork and mockup carefully before approval.</p> },
            { title: 'Preview and print differences', content: <p>A mockup is an approximation. Screens, printing, material, crop, case edges, and device shape can cause minor differences in color, position, texture, and appearance.</p> },
            { title: 'Review before production', content: <p>Paid AI-custom items may require administrator review. Gouphoria may approve, reject, or request changes before production and may refuse unsafe, illegal, infringing, hateful, deceptive, or prohibited content.</p> },
            { title: 'Credits and failures', content: <p>The current workflow charges a credit only when the generation transaction completes successfully. The credit ledger shows charges, adjustments, or refunds. A rate-limited request does not begin generation or deduct a credit.</p> },
            { title: 'Customer responsibility', content: <p>You remain responsible for prompts and reference images and must have permission to use them. Approval confirms the chosen design and phone-case variant, subject to the physical differences described above.</p> }
        ]
    },
    copyright: {
        eyebrow: 'Uploaded content and copyright',
        title: 'Upload only content you own or are allowed to use.',
        intro: 'Gouphoria does not automatically claim ownership of your uploaded references or artwork through this policy.',
        sections: [
            { title: 'Your confirmation', content: <p>By uploading content, you confirm that you own it or have the permissions needed for the requested design and product workflow.</p> },
            { title: 'Copyright, trademarks, and publicity rights', content: <p>Logos, characters, photographs, illustrations, artwork, trademarks, and celebrity images may require permission. Public availability online does not necessarily grant commercial-use rights.</p> },
            { title: 'Prohibited uploads', content: <p>Do not upload illegal content, malicious files, explicit exploitation, hateful content, or material that violates applicable law.</p> },
            { title: 'Review and enforcement', content: <p>Gouphoria may reject or remove suspected infringing or unsafe content and may suspend accounts repeatedly used for infringement or abuse.</p> },
            { title: 'How uploads are used', content: <p>Uploads are used for the requested AI design, review, order, and support workflow as described in the Privacy Policy. Purchased files may be available to authorized administrators and fulfillment services as needed.</p> }
        ]
    }
}

const faqs = [
    ['How does AI case design work?', 'Choose an AI-enabled product and variant, confirm your content rights, upload supported references, enter a prompt, and spend one credit for a completed generation. The flat artwork remains separate from the product preview.'],
    ['How many credits does generation cost?', 'The current initial generation costs one credit. The single supported revision also costs one credit. Your ledger records completed charges.'],
    ['Can I revise a design?', 'An eligible design receives one revision before it is locked by approval or commerce state. The design page shows whether it remains available.'],
    ['Why does my design need admin approval?', 'Paid AI-custom items are reviewed for the exact purchased artwork, selected variant, and print readiness before fulfillment.'],
    ['Can I buy a blank AI-custom case directly?', 'No. An AI-custom-only product requires a valid design owned by your account.'],
    ['How is shipping calculated?', 'Gouphoria requests current options using the cart and delivery address, then stores the selected verified shipping quote with the order.'],
    ['When will my order go into production?', 'Standard items can proceed after verified payment. AI-custom items wait for any required design approval. Current availability also affects submission.'],
    ['Can I cancel an order?', 'Cancellation is not guaranteed after payment or production begins. Contact support promptly with the order number.'],
    ['Are custom products refundable?', 'They are generally not returnable for change of mind after production starts. Manufacturing defects, incorrect items, damage, or material order mismatch can be reviewed.'],
    ['What file types can I upload?', 'The current reference uploader accepts valid, non-animated PNG, JPG/JPEG, and WEBP images within the configured size and dimension limits.'],
    ['Can I use copyrighted images?', 'Only if you own the content or have the permission needed for this use.'],
    ['Where can I track my order?', 'Open Order History and then Order Details. Tracking appears when it becomes available.'],
    ['What if payment succeeds but the page closes?', 'Open the saved order and use the available payment-recovery action. The backend checks the existing PayPal order instead of creating a duplicate payment.'],
    ['Why might the printed case differ from the preview?', 'Screens, crop, case shape, material, printing, and color reproduction can cause minor differences. The preview is an approximation.']
]

export function PolicyPage({ policy }: { policy: keyof typeof policies }) {
    const page = policies[policy]
    return <main className="policy-page">
        <header className="policy-hero"><span className="eyebrow">{page.eyebrow}</span><h1>{page.title}</h1><p>{page.intro}</p></header>
        <div className="policy-sections">{page.sections.map(section => <section key={section.title}><h2>{section.title}</h2><div>{section.content}</div></section>)}</div>
        <aside className="policy-help"><strong>Need help with a specific account, design, or order?</strong><Link to="/support">Contact support</Link></aside>
    </main>
}

export function FAQPage() {
    return <main className="policy-page"><header className="policy-hero"><span className="eyebrow">Frequently asked questions</span><h1>Clear answers about designing, ordering, and fulfillment.</h1><p>These answers reflect the current Gouphoria experience and connected services.</p></header><section className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section><aside className="policy-help"><strong>Still need help?</strong><Link to="/support">Contact support</Link></aside></main>
}

export function SupportPage() {
    const [topic, setTopic] = useState('Order issue')
    const [orderNumber, setOrderNumber] = useState('')
    const [email, setEmail] = useState('')
    const [message, setMessage] = useState('')
    function submit(event: FormEvent) {
        event.preventDefault()
        if (!supportEmail) return
        const subject = `Gouphoria Support — ${topic}${orderNumber.trim() ? ` — ${orderNumber.trim()}` : ''}`
        const body = [`Topic: ${topic}`, `Order number: ${orderNumber.trim() || 'Not provided'}`, `Customer email: ${email.trim()}`, '', message.trim()].join('\n')
        window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    }
    return <main className="policy-page"><header className="policy-hero"><span className="eyebrow">Contact and support</span><h1>Tell us what happened and include the order number when possible.</h1><p>This form opens your configured email application. It does not store or send a support request through the website.</p></header>
        <div className="support-layout"><form className="support-form" onSubmit={submit}>
            <label htmlFor="support-topic">Topic<select id="support-topic" value={topic} onChange={event => setTopic(event.target.value)}>{['Order issue', 'Payment issue', 'Shipping issue', 'AI design issue', 'Damaged product', 'Account issue', 'Other'].map(value => <option key={value}>{value}</option>)}</select></label>
            <label htmlFor="support-order">Order number <span>optional</span><input id="support-order" value={orderNumber} onChange={event => setOrderNumber(event.target.value)} maxLength={80} placeholder="For example, GPH-1234" /></label>
            <label htmlFor="support-email">Your email<input id="support-email" type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required /></label>
            <label htmlFor="support-message">Message<textarea id="support-message" value={message} onChange={event => setMessage(event.target.value)} minLength={10} maxLength={3000} rows={8} required /></label>
            <button className="primary-button" type="submit" disabled={!supportEmail}>Open email application</button>
            {!supportEmail && <p className="state-message" role="status">Support contact details are being updated. Please check back soon.</p>}
        </form><aside className="support-details"><h2>Before contacting support</h2><ul><li>Include the internal order number.</li><li>For damage, keep the item, packaging, and shipping label and attach clear photos in your email.</li><li>Never send full card details or passwords.</li></ul><p><strong>Gouphoria support</strong><br /><SupportContact /></p><p><strong>Expected response</strong><br />{supportResponseTime}</p></aside></div>
    </main>
}
