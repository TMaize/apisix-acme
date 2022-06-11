const fs = require('fs')
const path = require('path')
const KoaRouter = require('@koa/router')
const common = require('./common')
const config = require('./config')
const task = require('./task')

const router = new KoaRouter()

// 查询任务
router.get('/apisix_acme/task_status', async (ctx, next) => {
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
