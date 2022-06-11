const Koa = require('koa')
const koaBody = require('koa-body')
const common = require('./common')
const config = require('./config')
const router = require('./router')
const task = require('./task')

const app = new Koa()

app.use(async (ctx, next) => {
  const origin = ctx.header.origin || ctx.origin
  ctx.set('Access-Control-Allow-Origin', origin)
  ctx.set('Access-Control-Allow-Methods', '*')
  ctx.set('Access-Control-Allow-Credentials', 'true')
  ctx.set('Access-Control-Expose-Headers', 'Content-Disposition')
  ctx.set('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token,Authorization,Token,Check-Token')
  ctx.set('Access-Control-Max-Age', '60')

  if (ctx.method === 'OPTIONS') {
    ctx.status = 204
    return
  }

  const verifyToken = ctx.header.verify_token || ctx.header['verify-token']
  if (ctx.path == '/apisix_acme/task_create' && config.VERIFY_TOKEN && verifyToken != config.VERIFY_TOKEN) {
    ctx.body = { code: 401, message: 'invalid verify_token' }
    return
  }

  try {
    await next()
  } catch (error) {
    const message = error.message || error
    ctx.body = { code: 500, message }
    common.sendMsg(`系统异常: ${message}\n\n` + '```\n' + error.stack + '\n```')
  }
})

app.use(koaBody({}))
app.use(router.routes())

// start
app.listen(config.PORT)
console.log('app listen on', config.PORT)

// 把自己注册到 apisix
common.addSelfRoute()

// 自动续期将要过期的证书
task.scheduleTask()
