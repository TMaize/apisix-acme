const fs = require('fs')
const path = require('path')
const KoaRouter = require('@koa/router')
const common = require('./common')
const config = require('./config')
const task = require('./task')

const router = new KoaRouter()

// 查询任务
router.get('/apisix_acme/task_status', async (ctx, next) => {
  const id = ctx.query.id
  ctx.body = { code: 200, data: task.queryTask(id) }
})

// 创建任务
router.post('/apisix_acme/task_create', async (ctx, next) => {
  const body = ctx.request.body || {}
  const domain = body.domain
  const mail = body.mail || config.ACME_MAIL

  if (!domain) {
    ctx.body = { code: 400, message: '参数缺少 domain' }
    return
  }
  const result = await task.createTask(domain, mail)
  ctx.body = result
})

// 修改服务绑定的host
router.post('/apisix_acme/update_service_host', async (ctx, next) => {
  const body = ctx.request.body || {}
  const domain = body.domain
  const type = body.type
  const serviceList = body.serviceList

  if (!domain || ['add', 'remove'].indexOf(type) === -1 || !Array.isArray(serviceList)) {
    ctx.body = { code: 400, message: '参数校验失败' }
    return
  }

  let result
  try {
    for (let i = 0; i < serviceList.length; i++) {
      const service_name = serviceList[i]
      await common.updateServiceHost(config.APISIX_HOST, config.APISIX_TOKEN, domain, service_name, type)
    }
    result = { code: 200, message: '成功' }
  } catch (error) {
    result = { code: 500, message: error.message || error }
  }

  ctx.body = result
})

// acme text verify
// 主要是处理 /.well-known/acme-challenge/random 这个请求
router.get('(.*)', (ctx, next) => {
  const file = ctx.params[0]
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
