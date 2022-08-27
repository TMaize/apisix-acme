const fs = require('fs')
const path = require('path')
const KoaRouter = require('@koa/router')
const config = require('./config')
const task = require('./task')

const router = new KoaRouter()

// 查询任务
router.get('/apisix_acme/task_status', async (ctx, next) => {
  if (config.VERIFY_TOKEN && ctx.state.verifyToken != config.VERIFY_TOKEN) {
    ctx.body = { code: 401, message: 'invalid VERIFY_TOKEN' }
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
router.post('/apisix_acme/task_create', async (ctx, next) => {
  if (config.VERIFY_TOKEN && ctx.state.verifyToken != config.VERIFY_TOKEN) {
    ctx.body = { code: 401, message: 'invalid VERIFY_TOKEN' }
    return
  }

  const body = ctx.request.body || {}
  const domain = body.domain
  const serviceList = body.serviceList || []
  const mail = body.mail || config.ACME_MAIL

  if (!domain) {
    ctx.body = { code: 400, message: 'domain is required' }
    return
  }
  const result = await task.createTask(domain, mail, serviceList)
  ctx.body = result
})

// 工具页面
router.get('/apisix_acme/tool.html', async (ctx, next) => {
  ctx.type = 'html'
  if (!config.VERIFY_TOKEN) {
    ctx.body = 'The tool page is only available when the VERIFY_TOKEN is enabled'
  } else {
    ctx.body = fs.readFileSync(path.resolve(__dirname, 'tool.html'), 'utf-8')
  }
})

// acme text verify
// 主要是处理 /.well-known/acme-challenge/random 这个请求
router.get('(.*)', (ctx, next) => {
  let file = ctx.params[0]
  if (file.startsWith('/apisix_acme')) {
    file = file.substring('/apisix_acme'.length)
  }

  const filePath = path.join(__dirname, 'www', file)

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

module.exports = router
