import type { NextFunction, Request, Response } from 'express'
import {
    addAIDesignUploads,
    approveAIDesign,
    changeAIDesignVariant,
    createAIDesign,
    generateInitialArtwork,
    getAIDesign,
    listAIDesigns,
    readOwnedDesignAsset,
    readOwnedUpload,
    reviseArtwork
} from '../../services/ai-designs'
import { CreditAccount } from '../../database/models/credit-account'

function userId(request: Request) {
    return Number(request.authUser!.id)
}

export async function createProject(request: Request, response: Response, next: NextFunction) {
    try {
        response.status(201).json({ design: await createAIDesign(userId(request), request.body) })
    } catch (error) {
        next(error)
    }
}

export async function uploadReferences(request: Request<{ designId: string }>, response: Response, next: NextFunction) {
    try {
        response.status(201).json({
            design: await addAIDesignUploads(userId(request), Number(request.params.designId), request.files as Express.Multer.File[] ?? [])
        })
    } catch (error) {
        next(error)
    }
}

export async function generateProject(request: Request<{ designId: string }>, response: Response, next: NextFunction) {
    try {
        response.json(await generateInitialArtwork(userId(request), Number(request.params.designId), request.body.idempotencyKey))
    } catch (error) {
        next(error)
    }
}

export async function reviseProject(request: Request<{ designId: string }>, response: Response, next: NextFunction) {
    try {
        response.json(await reviseArtwork(
            userId(request),
            Number(request.params.designId),
            request.body.instructions,
            request.body.idempotencyKey
        ))
    } catch (error) {
        next(error)
    }
}

export async function approveProject(request: Request<{ designId: string }>, response: Response, next: NextFunction) {
    try {
        response.json({ design: await approveAIDesign(userId(request), Number(request.params.designId)) })
    } catch (error) {
        next(error)
    }
}

export async function changeProjectVariant(request: Request<{ designId: string }>, response: Response, next: NextFunction) {
    try {
        response.json(await changeAIDesignVariant(userId(request), Number(request.params.designId), request.body))
    } catch (error) {
        next(error)
    }
}

export async function listProjects(request: Request, response: Response, next: NextFunction) {
    try {
        const account = await CreditAccount.findOne({ where: { userId: userId(request) } })
        response.json({ designs: await listAIDesigns(userId(request)), credits: { balance: account?.balance ?? 0 } })
    } catch (error) {
        next(error)
    }
}

export async function viewProject(request: Request<{ designId: string }>, response: Response, next: NextFunction) {
    try {
        response.json({ design: await getAIDesign(userId(request), Number(request.params.designId)) })
    } catch (error) {
        next(error)
    }
}

export async function viewUpload(request: Request<{ uploadId: string }>, response: Response, next: NextFunction) {
    try {
        const asset = await readOwnedUpload(userId(request), Number(request.params.uploadId))
        response.set({ 'Cache-Control': 'private, max-age=300', 'Content-Type': asset.mimeType, 'X-Content-Type-Options': 'nosniff' })
        response.send(asset.bytes)
    } catch (error) {
        next(error)
    }
}

export async function viewDesignAsset(
    request: Request<{ designId: string; assetKind: 'original' | 'current' | 'mockup' }>,
    response: Response,
    next: NextFunction
) {
    try {
        const asset = await readOwnedDesignAsset(userId(request), Number(request.params.designId), request.params.assetKind)
        response.set({ 'Cache-Control': 'private, max-age=300', 'Content-Type': asset.mimeType, 'X-Content-Type-Options': 'nosniff' })
        response.send(asset.bytes)
    } catch (error) {
        next(error)
    }
}
