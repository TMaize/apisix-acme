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
  ctx.set('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token,Authorization,Token')
  ctx.set('Access-Control-Max-Age', '60')

  if (ctx.method === 'OPTIONS') {
    ctx.status = 200
  } else {
    await next()
  }
})

app.use(koaBody({}))
app.use(router.routes())

function addSelfRoute(delay) {
  setTimeout(async () => {
    try {
      await common.addSelfRoute(config.APISIX_HOST, config.APISIX_TOKEN, config.SELF_APISIX_HOST)
      console.log('addSelfRoute success')
    } catch (error) {
      console.log('addSelfRoute fail:', error.message || error)
    }
  }, delay)
}

// start
app.listen(80)

// 把自己注册到 apisix，用于调用创建接口
addSelfRoute(3000)
addSelfRoute(10000)

// 每天凌晨，自动续期将要过期的证书
task.scheduleTask()
