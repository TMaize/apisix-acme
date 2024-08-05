import KoaRouter from '@koa/router'
import fs from 'fs'
import path from 'path'
import url from 'url'
import config from './config.js'
import task from './task.js'

export default function() {
  const router = new KoaRouter()

  const DIR_NAME = path.dirname(url.fileURLToPath(import.meta.url))

  // 查询任务
  router.get('/'+config.apisix_api_prefix+'/task_status', async (ctx, next) => {
    if (ctx.state.verifyToken != config.verify_token) {
      ctx.body = { code: 401, message: 'invalid VERIFY-TOKEN' }
      return
    }

    const domain = ctx.query.domain
    if (!domain) {
      ctx.body = { code: 400, message: 'domain is required' }
      return
    }
    const status = await task.queryTask(domain)
    ctx.body = { code: 200, data: status }
  })

  // 创建任务
  router.post('/'+config.apisix_api_prefix+'/task_create', async (ctx, next) => {
    if (ctx.state.verifyToken != config.verify_token) {
      ctx.body = { code: 401, message: 'invalid VERIFY-TOKEN' }
      return
    }

    const body = ctx.request.body || {}
    const domain = body.domain
    const serviceList = body.serviceList || []
    const mail = body.mail || config.acme_mail
    const force = body.force === true

    if (!domain) {
      ctx.body = { code: 400, message: 'domain is required' }
      return
    }

    const result = await task.createTask(domain, mail, serviceList, force)
    ctx.body = result
  })

  // 工具页面
  router.get('/'+config.apisix_api_prefix+'/tool.html', async (ctx, next) => {
    const filePath = path.join(DIR_NAME, 'www', "tool.html")
    ctx.body = fs.readFileSync(filePath, 'utf8')
  })

  // acme text verify
  // 主要是处理 /.well-known/acme-challenge/random 这个请求
  router.get('/.well-known/acme-challenge/(.*)', (ctx, next) => {
    let file = ctx.params[0]

    const filePath = path.join(DIR_NAME, 'www', ".well-known", "acme-challenge", file)

    if (!fs.existsSync(filePath)) {
      ctx.status = 404
      return
    }

    const state = fs.statSync(filePath)
    if (state.isDirectory()) {
      ctx.status = 404
      return
    }

    ctx.body = fs.readFileSync(filePath, 'utf8')
  })

  return router
}
