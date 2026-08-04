import { Router } from 'express'
import { getRobotsTxt, getSitemap } from '../controllers/seo/controller'

const seoRouter = Router()

seoRouter.get('/sitemap.xml', getSitemap)
seoRouter.get('/robots.txt', getRobotsTxt)

export default seoRouter
