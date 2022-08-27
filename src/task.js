const schedule = require('node-schedule')
const config = require('./config')
const common = require('./common')

// {"status":"running", domain, mail, serviceList, error}
// {"status":"error", domain, mail, serviceList, error}
// {"status":"success", domain, validity_end}
const taskList = []
let taskLock = false

async function queryTask(domain) {
  const task = taskList.find(item => item.domain === domain)
  if (task) return task

  const result = await common.listSSL(config.APISIX_HOST, config.APISIX_TOKEN, true)
  const info = result.find(item => item.domain == domain)
  if (!info) {
    return { domain, status: 'error', error: '域名不存在' }
  }
  return { domain, status: 'success', validity_end: info.validity_end }
}

async function createTask(domain, mail, serviceList) {
  const task = await queryTask(domain)
  console.log('检查证书', JSON.stringify(task))

  if (task.status === 'running') {
    return { code: 200, message: '证书申请中，等待片刻', data: { status: 'running', domain } }
  }

  if (task.status === 'success') {
    const left_seconds = task.validity_end - parseInt(Date.now() / 1000)
    if (left_seconds > config.RENEW_LESS) {
      return { code: 200, message: '证书已存在且未过期，跳过操作', data: { status: 'skip', domain } }
    }
  }

  const idx = taskList.findIndex(item => item.domain === domain)
  if (idx != -1) taskList.splice(idx, 1)
  taskList.push({
    status: 'running',
    domain: domain,
    mail,
    serviceList,
    error: ''
  })

  doTask()

  return { code: 200, message: '任务已提交，等待片刻', data: { status: 'created', domain } }
}

async function doTask() {
  if (taskLock) return
  while (true) {
    const task = taskList.find(item => item.status !== 'error')
    if (!task) {
      taskLock = false
      return
    }

    taskLock = true
    console.log('申请证书', task.domain)

    const domain = task.domain
    const mail = task.mail || config.ACME_MAIL
    const serviceList = task.serviceList

    try {
      await common.addVerifyRoute(config.APISIX_HOST, config.APISIX_TOKEN, domain, config.SELF_APISIX_HOST)
      const sslInfo = await common.createSSL(domain, mail)
      await common.applySSL(config.APISIX_HOST, config.APISIX_TOKEN, domain, sslInfo)
      if (Array.isArray(serviceList) && serviceList.length > 0) {
        for (let i = 0; i < serviceList.length; i++) {
          const serviceName = serviceList[i]
          await common.updateServiceHost(config.APISIX_HOST, config.APISIX_TOKEN, domain, serviceName, 'add')
        }
      }
      const idx = taskList.findIndex(item => item == task)
      if (idx != -1) taskList.splice(idx, 1)
    } catch (err) {
      task.status = 'error'
      task.error = err.message || err
      console.log('申请失败', domain)
      common.sendMsg(`系统异常: ${task.error}\n\n` + '```\n' + err.stack + '\n```')
    } finally {
      common.removeVerifyRoute(config.APISIX_HOST, config.APISIX_TOKEN, domain).catch(() => {})
    }
    await common.sleep(1000)
  }
}

async function renewAll() {
  const list = await common.listSSL(config.APISIX_HOST, config.APISIX_TOKEN, true)
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    await createTask(item.domain, config.ACME_MAIL).catch(err => {})
  }
}

async function scheduleTask() {
  schedule.scheduleJob('renewAll', '0 0 1 * * *', renewAll)
  renewAll()
}

module.exports = {
  scheduleTask,
  queryTask,
  createTask
}
