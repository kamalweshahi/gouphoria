import { Router } from 'express'
import {
    approveProject,
    changeProjectVariant,
    createProject,
    generateProject,
    listProjects,
    reviseProject,
    uploadReferences,
    viewDesignAsset,
    viewProject,
    viewUpload
} from '../controllers/ai/controller'
import requireAuthentication from '../middlewares/auth/authentication'
import aiRateLimit from '../middlewares/ai-rate-limit'
import aiUpload from '../middlewares/ai-upload'
import bodyValidation from '../middlewares/body-validation'
import paramsValidation from '../middlewares/params-validation'
import {
    aiAssetParamsSchema,
    aiDesignParamsSchema,
    aiUploadParamsSchema,
    changeAIDesignVariantSchema,
    createAIDesignSchema,
    generateAIDesignSchema,
    reviseAIDesignSchema
} from '../validators/ai'
import { uploadRateLimit } from '../middlewares/rate-limits'

const aiRouter = Router()

aiRouter.use(requireAuthentication)
aiRouter.get('/assets/uploads/:uploadId', paramsValidation(aiUploadParamsSchema), viewUpload)
aiRouter.get('/assets/designs/:designId/:assetKind', paramsValidation(aiAssetParamsSchema), viewDesignAsset)
aiRouter.get('/designs', listProjects)
aiRouter.post('/designs', bodyValidation(createAIDesignSchema), createProject)
aiRouter.post('/designs/:designId/uploads', paramsValidation(aiDesignParamsSchema), uploadRateLimit, aiUpload, uploadReferences)
aiRouter.post('/designs/:designId/generate', paramsValidation(aiDesignParamsSchema), aiRateLimit, bodyValidation(generateAIDesignSchema), generateProject)
aiRouter.post('/designs/:designId/revise', paramsValidation(aiDesignParamsSchema), aiRateLimit, bodyValidation(reviseAIDesignSchema), reviseProject)
aiRouter.patch('/designs/:designId/variant', paramsValidation(aiDesignParamsSchema), bodyValidation(changeAIDesignVariantSchema), changeProjectVariant)
aiRouter.post('/designs/:designId/approve', paramsValidation(aiDesignParamsSchema), approveProject)
aiRouter.get('/designs/:designId', paramsValidation(aiDesignParamsSchema), viewProject)

export default aiRouter
