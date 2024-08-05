import Koa from 'koa'
import koaBody from 'koa-body'
import common from './common.js'
import config from './config.js'
import router from './router.js'

// 启动服务
async function start() {
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
  
    ctx.state.verifyToken = ctx.header['verify-token'] || ctx.header.verify_token || ''
  
    try {
      await next()
    } catch (error) {
      const message = error.message || error
      ctx.body = { code: 500, message }
      common.sendMsg(`接口异常: ${message}\n\n` + '```\n' + error.stack + '\n```')
    }
  })
  
  app.use(koaBody({}))
  app.use(router().routes())

  return new Promise(function (resolve, reject) {
    const server = app.listen(config.port, '0.0.0.0')
    server.on('error', reject)
    server.on('listening', function () {
      console.log('server start success:', server.address())
      resolve()
    })
  })
}

export default {
  start
}
