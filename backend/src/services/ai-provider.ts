import OpenAI, { toFile } from 'openai'
import { PHONE_CASE_PROVIDER_SIZE } from './ai-artwork'

export interface AIImageResult {
    bytes: Buffer
    provider: string
    model: string
    requestId?: string
    metadata?: Record<string, unknown>
}

export interface AIImageProvider {
    moderate(prompt: string, images: Array<{ bytes: Buffer; mimeType: string }>): Promise<{ flagged: boolean }>
    generate(prompt: string, references: Array<{ bytes: Buffer; mimeType: string }>): Promise<AIImageResult>
    revise(prompt: string, currentArtwork: Buffer, references: Array<{ bytes: Buffer; mimeType: string }>): Promise<AIImageResult>
}

export class AIProviderUnavailableError extends Error {}
export class AIModerationRejectedError extends Error {}
export class AIProviderTimeoutError extends Error {}

function generationTimeoutMs() {
    const timeout = Number(process.env.AI_GENERATION_TIMEOUT_MS ?? 120000)
    if (!Number.isInteger(timeout) || timeout < 10000 || timeout > 300000) {
        throw new Error('AI_GENERATION_TIMEOUT_MS must be between 10000 and 300000')
    }
    return timeout
}

function configuredModel() {
    return process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2'
}

function configuredQuality() {
    const quality = process.env.OPENAI_IMAGE_QUALITY?.trim() || 'medium'
    if (!['low', 'medium', 'high', 'auto'].includes(quality)) throw new Error('OPENAI_IMAGE_QUALITY is invalid')
    return quality as 'low' | 'medium' | 'high' | 'auto'
}

function providerClient() {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) throw new AIProviderUnavailableError('OpenAI image generation is not configured')
    return new OpenAI({ apiKey, timeout: generationTimeoutMs(), maxRetries: 1 })
}

async function uploadable(bytes: Buffer, mimeType: string, index: number) {
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]
    return toFile(bytes, `reference-${index}.${extension}`, { type: mimeType })
}

function imageResult(response: any): AIImageResult {
    const encoded = response.data?.[0]?.b64_json
    if (!encoded) throw new Error('OpenAI returned no image data')
    return {
        bytes: Buffer.from(encoded, 'base64'),
        provider: 'openai',
        model: configuredModel(),
        requestId: response._request_id,
        metadata: response.usage ? { usage: response.usage } : undefined
    }
}

function withTimeoutMapping<T>(operation: Promise<T>) {
    return operation.catch((error: any) => {
        if (error?.name === 'APIConnectionTimeoutError' || error?.code === 'ETIMEDOUT') {
            throw new AIProviderTimeoutError('The image provider timed out')
        }
        throw error
    })
}

export class OpenAIImageProvider implements AIImageProvider {
    async moderate(prompt: string, images: Array<{ bytes: Buffer; mimeType: string }>) {
        const client = providerClient()
        const input: any[] = [{ type: 'text', text: prompt }]
        for (const image of images) {
            input.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.bytes.toString('base64')}` } })
        }
        const result = await withTimeoutMapping(client.moderations.create({ model: 'omni-moderation-latest', input } as any))
        return { flagged: result.results.some(entry => entry.flagged) }
    }

    async generate(prompt: string, references: Array<{ bytes: Buffer; mimeType: string }>) {
        const client = providerClient()
        const common = {
            model: configuredModel() as any,
            prompt,
            size: PHONE_CASE_PROVIDER_SIZE,
            quality: configuredQuality(),
            output_format: 'png' as const
        }
        const response = references.length
            ? await withTimeoutMapping(client.images.edit({
                ...common,
                image: await Promise.all(references.map((image, index) => uploadable(image.bytes, image.mimeType, index)))
            } as any))
            : await withTimeoutMapping(client.images.generate(common as any))
        return imageResult(response)
    }

    async revise(prompt: string, currentArtwork: Buffer, references: Array<{ bytes: Buffer; mimeType: string }>) {
        const client = providerClient()
        const images = [
            await uploadable(currentArtwork, 'image/png', 0),
            ...await Promise.all(references.map((image, index) => uploadable(image.bytes, image.mimeType, index + 1)))
        ]
        const response = await withTimeoutMapping(client.images.edit({
            model: configuredModel() as any,
            image: images,
            prompt,
            size: PHONE_CASE_PROVIDER_SIZE,
            quality: configuredQuality(),
            output_format: 'png'
        } as any))
        return imageResult(response)
    }
}

let provider: AIImageProvider = new OpenAIImageProvider()

export function getAIImageProvider() {
    return provider
}

export function setAIImageProviderForTests(next: AIImageProvider) {
    provider = next
}

export function resetAIImageProvider() {
    provider = new OpenAIImageProvider()
}
