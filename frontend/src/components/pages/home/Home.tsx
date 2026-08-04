import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ProductCard from '../../store/product-card/ProductCard'
import EmptyState from '../../ui/empty-state/EmptyState'
import LoadingState from '../../ui/loading-state/LoadingState'
import Reveal from '../../ui/reveal/Reveal'
import PremiumPhotoViewer from '../../ui/premium-photo-viewer/PremiumPhotoViewer'
import type Product from '../../../models/Product'
import { getAllProducts } from '../../../services/products'
import './Home.css'

const prompt = 'A monochrome mountain landscape in ink wash style'
const steps = [
    ['01','Choose a case','Pick your model, style, and finish.'],
    ['02','Create with AI','Describe your idea and let AI design something unique.'],
    ['03','Review & Order','Preview, refine if available, and place your order.']
]

type HomeIconKind = 'phone' | 'sparkle' | 'bag' | 'shield' | 'truck' | 'lock' | 'review' | 'photo'

function HomeIcon({ kind }: { kind: HomeIconKind }) {
    if (kind === 'phone') return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="9" y="3.5" width="14" height="25" rx="3"/><path d="M13 7h6M14 24.5h4"/></svg>
    if (kind === 'sparkle') return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c.9 7.1 5.9 12.1 13 13-7.1.9-12.1 5.9-13 13-.9-7.1-5.9-12.1-13-13 7.1-.9 12.1-5.9 13-13Z"/></svg>
    if (kind === 'bag') return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 11.5h18l-1.2 16H8.2L7 11.5Z"/><path d="M11.5 12V8.5a4.5 4.5 0 0 1 9 0V12M20.5 20.5a5.5 5.5 0 0 1-8.8 3.1"/><path d="m19 18 2 2.5 2.5-2"/></svg>
    if (kind === 'shield') return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5 26 7v8.2c0 6.3-4 10.8-10 13.3-6-2.5-10-7-10-13.3V7l10-3.5Z"/><path d="m11.5 15.8 3 3 6-6"/></svg>
    if (kind === 'truck') return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 8h16v14H3zM19 13h5l5 5v4H19zM3 12h9M1 16h9"/><circle cx="9" cy="24.5" r="2.5"/><circle cx="24" cy="24.5" r="2.5"/></svg>
    if (kind === 'lock') return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="12" width="20" height="16" rx="2"/><path d="M11 12V8a5 5 0 0 1 10 0v4M16 18v5"/></svg>
    if (kind === 'photo') return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3.5" y="5" width="25" height="22" rx="2.5"/><circle cx="11" cy="12" r="2.2"/><path d="m6.5 23 6.2-6.2 4.2 4.2 3.2-3.2 5.4 5.2M16 4v8M12.5 7.5 16 4l3.5 3.5"/></svg>
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M25.5 9.5A11 11 0 0 0 6 11l-2.5 1M6 11l.3-4M6.5 22.5A11 11 0 0 0 26 21l2.5-1M26 21l-.3 4"/></svg>
}

const processStages = [
    ['/gouphoria-process-01.webp', 'Blank phone case'],
    ['/gouphoria-process-02.webp', 'Reference photo added'],
    ['/gouphoria-process-03.webp', 'Design arranged on the case'],
    ['/gouphoria-process-04.webp', 'Finished custom phone case']
] as const

function ProcessGalleryDialog({ selected, onSelect, onClose }: { selected: number; onSelect: (value: number) => void; onClose: () => void }) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const closeRef = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        closeRef.current?.focus()
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = previousOverflow }
    }, [])
    const [src, alt] = processStages[selected]
    const move = (direction: number) => onSelect((selected + direction + processStages.length) % processStages.length)
    return <div className="process-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div ref={dialogRef} className="process-dialog" role="dialog" aria-modal="true" aria-labelledby="process-dialog-title" onKeyDown={event => {
            if (event.key === 'Escape') onClose()
            if (event.key === 'ArrowLeft') move(-1)
            if (event.key === 'ArrowRight') move(1)
            if (event.key === 'Tab') {
                const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])]
                if (!controls.length) return
                const first = controls[0], last = controls[controls.length - 1]
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
            }
        }}>
            <header><div><span>From idea to unique</span><h2 id="process-dialog-title">Step 0{selected + 1}</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Close process viewer">×</button></header>
            <div className="process-dialog-image"><img src={src} alt={alt}/></div>
            <p>{alt}</p>
            <div className="process-dialog-actions"><button type="button" onClick={() => move(-1)}>← Previous</button><span>0{selected + 1} / 04</span><button type="button" onClick={() => move(1)}>Next →</button></div>
            <div className="process-dialog-thumbs" aria-label="Choose a process step">{processStages.map(([thumbSrc,thumbAlt],index)=><button type="button" className={index===selected?'selected':''} aria-pressed={index===selected} aria-label={`View step 0${index+1}: ${thumbAlt}`} key={thumbSrc} onClick={() => onSelect(index)}><img src={thumbSrc} alt=""/><span>0{index+1}</span></button>)}</div>
        </div>
    </div>
}

export default function Home(){
    const[products,setProducts]=useState<Product[]>([]);const[loading,setLoading]=useState(true)
    const[selectedProcess,setSelectedProcess]=useState(3);const[processOpen,setProcessOpen]=useState(false)
    useEffect(()=>{let active=true;void getAllProducts().then(values=>{if(active)setProducts(values.slice(0,6))}).catch(()=>{if(active)setProducts([])}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[])
    return <div className="home-page">
        <section className="home-hero" aria-labelledby="home-title">
            <div className="hero-copy"><span className="eyebrow">AI-powered. Uniquely yours.</span><h1 id="home-title"><span>Design it.</span><span>Make it yours.</span></h1><p>Custom AI phone cases, crafted to reflect your style. No limits. Just your imagination.</p><div className="hero-actions"><Link className="primary-button" to="/create-ai">Create yours <span aria-hidden="true">→</span></Link><Link className="hero-text-link" to="/products">Explore designs</Link></div><Link className="hero-prompt" to={`/create-ai?prompt=${encodeURIComponent(prompt)}`}><span aria-hidden="true">✦</span><span>{prompt}</span><b aria-hidden="true">↑</b></Link><small className="prompt-label">✦ &nbsp; Create with AI</small></div>
            <div className="hero-stage"><PremiumPhotoViewer alt="Custom Gouphoria premium phone case" eager/><div className="generation-card"><span>From idea to unique</span><div className="generation-stages">{processStages.map(([src,alt],stage)=><button type="button" key={src} className={stage===selectedProcess?'active':''} aria-pressed={stage===selectedProcess} aria-label={`Open step 0${stage+1}: ${alt}`} onClick={()=>{setSelectedProcess(stage);setProcessOpen(true)}}><img src={src} alt=""/><small>0{stage+1}</small></button>)}</div></div></div>
        </section>

        <Reveal><section className="how-section" id="how-it-works" aria-labelledby="how-title"><span className="eyebrow" id="how-title">How it works</span><div className="how-grid">{steps.map(([number,title,copy],index)=><article key={number}><div className="step-icon"><HomeIcon kind={(['phone','sparkle','bag'] as HomeIconKind[])[index]}/></div><div><span>{number}</span><h3>{title}</h3><p>{copy}</p></div>{index<2&&<b aria-hidden="true">→</b>}</article>)}</div></section></Reveal>

        <section className="featured-section" aria-labelledby="featured-title"><Reveal><div className="home-section-heading"><span className="eyebrow">Featured collection</span><h2 id="featured-title">Cases made personal.</h2></div></Reveal>{loading?<LoadingState label="Loading cases"/>:products.length?<div className="featured-track">{products.map((product,index)=><Reveal key={product.id} delay={index*70}><ProductCard product={product}/></Reveal>)}</div>:<EmptyState title="Collection temporarily unavailable" message="The live case collection will return shortly." action={{label:'Create a design',to:'/create-ai'}}/>}<Link className="view-all-link" to="/products">View all cases <span aria-hidden="true">→</span></Link></section>

        <Reveal><section className="ai-story" aria-labelledby="story-title"><div className="story-copy"><span className="eyebrow">More than a case. It’s you.</span><h2 id="story-title">AI creation,<br/>crafted to feel real.</h2><p>Turn your ideas, references, and personal style into flat, print-ready artwork composed for your selected case.</p><Link to="/create-ai">Start creating <span aria-hidden="true">→</span></Link></div><div className="story-demo"><PremiumPhotoViewer compact alt="Finished Gouphoria custom phone case"/><div className="story-controls"><span>Your prompt</span><Link to={`/create-ai?prompt=${encodeURIComponent('Minimalist ink waves, calm and fluid')}`}>Minimalist ink waves, calm and fluid <b>↑</b></Link><span>Upload a photo reference</span><div className="reference-options"><Link to="/create-ai" aria-label="Upload reference photo in option 1"><span className="reference-upload-icon"><HomeIcon kind="photo"/></span><strong>Option 1</strong><small>Choose photo</small></Link><Link to="/create-ai" aria-label="Upload reference photo in option 2"><span className="reference-upload-icon"><HomeIcon kind="photo"/></span><strong>Option 2</strong><small>Choose photo</small></Link></div></div></div></section></Reveal>

        <section className="trust-row" aria-label="Shopping benefits">{([['shield','Premium Quality','Built to protect. Made to last.'],['truck','Worldwide Shipping','Availability and pricing depend on destination.'],['lock','Secure Checkout','Payments are processed securely through PayPal.'],['review','Review Before Production','AI-custom designs are reviewed before fulfillment.']] as Array<[HomeIconKind,string,string]>).map(([icon,title,copy])=><article key={title}><i><HomeIcon kind={icon}/></i><div><strong>{title}</strong><p>{copy}</p></div></article>)}</section>
        {processOpen&&<ProcessGalleryDialog selected={selectedProcess} onSelect={setSelectedProcess} onClose={()=>setProcessOpen(false)}/>} 
    </div>
}
