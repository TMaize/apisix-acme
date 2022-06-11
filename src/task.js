const schedule = require('node-schedule')
const config = require('./config')
const common = require('./common')

// domain
// error
// status: running-申请中 error-错误 success-成功
const taskMap = {}

async function queryTask(domain) {
  let task = taskMap[domain]
  if (task) return task
  const result = await common.checkSSL(config.APISIX_HOST, config.APISIX_TOKEN, domain)
  if (!result.id) {
    return { domain, status: 'error', error: '域名不存在' }
  }
  return { domain, status: 'success', validity_end: result.validity_end }
}

async function createTask(domain, mail, serviceList) {
  let task = taskMap[domain]

  if (task && task.status === 'running') {
    return { code: 200, message: '证书申请中，等待片刻', data: { status: 'running', domain } }
  }

  const result = await common.checkSSL(config.APISIX_HOST, config.APISIX_TOKEN, domain)
  const left_seconds = result.validity_end - parseInt(Date.now() / 1000)
  if (left_seconds > config.RENEW_LESS) {
    return { code: 200, message: '证书已存在且未过期，跳过操作', data: { status: 'skip', domain } }
  }

  task = {
    status: 'running',
    domain: domain,
    error: ''
  }

  taskMap[domain] = task

  async function doTask() {
    let err = ''
    try {
      await common.addVerifyRoute(config.APISIX_HOST, config.APISIX_TOKEN, domain, config.SELF_APISIX_HOST)
      const sslInfo = await common.createSSL(domain, mail)
      await common.applySSL(config.APISIX_HOST, config.APISIX_TOKEN, sslInfo)
      await common.removeVerifyRoute(config.APISIX_HOST, config.APISIX_TOKEN, domain)

      if (Array.isArray(serviceList) && serviceList.length > 0) {
        for (let i = 0; i < serviceList.length; i++) {
          const serviceName = serviceList[i]
          await common.updateServiceHost(config.APISIX_HOST, config.APISIX_TOKEN, domain, serviceName, 'add')
        }
      }
    } catch (error) {
      err = error.message || error
      common.sendMsg(`系统异常: ${err}\n\n` + '```\n' + error.stack + '\n```')
    }

    if (err) {
      task.status = 'error'
      task.error = err
    } else {
      task.status = 'success'
      task.error = ''
    }
  }

  doTask() // async function

  return { code: 200, message: '任务已提交，等待片刻', data: { status: 'created', domain } }
}

async function renewAll() {
  const list = await common.listSSL(config.APISIX_HOST, config.APISIX_TOKEN)
  list.forEach(item => {
    if (String(item.id).match(/^acme_/)) {
      createTask(item.snis[0], config.ACME_MAIL)
    }
  })
}

async function scheduleTask() {
  schedule.scheduleJob('renewAll', '0 0 1 * * *', () => {
    renewAll()
  })
}

module.exports = {
  scheduleTask,
  queryTask,
  createTask
}
