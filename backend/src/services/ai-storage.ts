import { chmod, mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { extname, resolve, sep } from 'path'

export interface PrivateStorageService {
    write(namespace: string, bytes: Buffer, extension: string): Promise<string>
    read(storageKey: string): Promise<Buffer>
    remove(storageKey: string): Promise<void>
}

function storageRoot() {
    return resolve(process.env.AI_STORAGE_ROOT ?? resolve(process.cwd(), '.private-ai-storage'))
}

function safeSegment(value: string) {
    if (!/^[a-z0-9_-]+$/i.test(value)) throw new Error('Invalid private storage namespace')
    return value
}

function safeExtension(value: string) {
    const normalized = value.toLowerCase().replace(/^\./, '')
    if (!['png', 'jpg', 'jpeg', 'webp'].includes(normalized)) throw new Error('Invalid private image extension')
    return normalized === 'jpeg' ? 'jpg' : normalized
}

function resolvedStoragePath(storageKey: string) {
    if (!/^[a-z0-9_/-]+\.(png|jpg|webp)$/i.test(storageKey)) throw new Error('Invalid private storage key')
    const root = storageRoot()
    const candidate = resolve(root, storageKey)
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) throw new Error('Invalid private storage key')
    return candidate
}

export class LocalPrivateStorage implements PrivateStorageService {
    async write(namespace: string, bytes: Buffer, extension: string) {
        const folder = safeSegment(namespace)
        const suffix = safeExtension(extension)
        const key = `${folder}/${randomUUID()}.${suffix}`
        const destination = resolvedStoragePath(key)
        const root = storageRoot()
        const namespaceRoot = resolve(root, folder)
        await mkdir(root, { recursive: true, mode: 0o700 })
        await chmod(root, 0o700)
        await mkdir(namespaceRoot, { recursive: true, mode: 0o700 })
        await chmod(namespaceRoot, 0o700)
        await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
        return key
    }

    read(storageKey: string) {
        return readFile(resolvedStoragePath(storageKey))
    }

    async remove(storageKey: string) {
        try {
            await unlink(resolvedStoragePath(storageKey))
        } catch (error: any) {
            if (error?.code !== 'ENOENT') throw error
        }
    }
}

export const privateStorage: PrivateStorageService = new LocalPrivateStorage()

export function mimeTypeForStorageKey(storageKey: string) {
    const extension = extname(storageKey).toLowerCase()
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
    if (extension === '.webp') return 'image/webp'
    return 'image/png'
}
