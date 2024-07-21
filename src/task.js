import moment from 'moment'
import schedule from 'node-schedule'
import apisix from './apisix.js'
import common from './common.js'
import config from './config.js'

// 运行中 {"status":"running", domain, mail, serviceList, error, force}
// 上次运行失败 {"status":"error", domain, mail, serviceList, error, force}
// 从apisix中查询到数据 {"status":"success", domain, validity_end}
const taskList = []
let taskLock = false

async function queryTask(domain) {
  const task = taskList.find(item => item.domain === domain)
  if (task) return task

  const results = await apisix.listSSL(domain)
  if (results.length == 0) return { domain, status: 'error', error: '域名不存在' }

  const validity_end = results.map(item => item.validity_end).sort()[0] // 取最近的一个
  return { domain, status: 'success', validity_end }
}

async function createTask(domain, mail, serviceList, force) {
  const task = await queryTask(domain)

  switch (task.status) {
    case 'error':
      console.log('创建任务', domain)
      break
    case 'running':
      console.log('跳过任务', '已在执行', domain)
      return { code: 200, message: '证书申请中，等待片刻', data: { status: 'running', domain } }
    case 'success':
      const left_seconds = task.validity_end - parseInt(Date.now() / 1000)
      const end_date = moment(task.validity_end * 1000).format('YYYY-MM-DD HH:mm:ss')

      const msg_1 = `到期时间:${end_date}`
      const msg_2 = `剩余:${common.toFixed(left_seconds / 86400, 2)}天`
      const msg_3 = `提前续期:${config.renew_day}天`

      if (left_seconds >= config.renew_less) {
        if (force) {
          console.log('强制任务', msg_1, msg_2, msg_3, domain)
        } else {
          console.log('跳过任务', msg_1, msg_2, msg_3, domain)
          return { code: 200, message: '证书已存在且未过期，跳过操作', data: { status: 'skip', domain } }
        }
      } else {
        console.log('创建任务', msg_1, msg_2, msg_3, domain)
      }
      break
    default:
      break
  }

  const idx = taskList.findIndex(item => item.domain === domain)
  if (idx != -1) taskList.splice(idx, 1)
  taskList.push({
    status: 'running',
    domain: domain,
    mail,
    serviceList,
    force,
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
    const startTime = Date.now()
    console.log('执行任务', task.domain)

    const domain = task.domain
    const mail = task.mail || config.acme_mail
    const serviceList = task.serviceList
    const dc = common.getDomainConfig(domain)

    const dnsParam = config.dns_api.find(item => item.domain == dc.rootDomain)

    let isAddRoute = false
    try {
      if (!dnsParam) {
        if (dc.wildcard) {
          throw new Error('泛域名证书必须配置 dns_api')
        } else {
          isAddRoute = true
          console.log('添加验证路由', domain)
          await apisix.addVerifyRoute(domain)
        }
      }
      let sslInfo = null
      if (!task.force) {
        sslInfo = await common.createSSLFromCache(domain)
      }
      if (!sslInfo) {
        sslInfo = await common.createSSL(domain, mail, dnsParam, config.acme_env, config.acme_param)
      }

      await apisix.applySSL(domain, sslInfo)

      if (Array.isArray(serviceList) && serviceList.length > 0) {
        for (let i = 0; i < serviceList.length; i++) {
          await apisix.updateServiceHost(serviceList[i], domain, 'add')
        }
      }

      const idx = taskList.findIndex(item => item == task)
      if (idx != -1) taskList.splice(idx, 1)

      const msg_1 = `到期时间: ${moment(sslInfo.validity_end * 1000).format('YYYY-MM-DD HH:mm:ss')}`
      const msg_2 = `到期天数: ${parseInt((sslInfo.validity_end - parseInt(Date.now() / 1000)) / 86400)}`
      const msg_3 = `任务耗时: ${(Date.now() - startTime) / 1000}秒`
      common.sendMsg(`任务成功: ${domain}\n\n${msg_1}\n\n${msg_2}\n\n${msg_3}`)
    } catch (err) {
      task.status = 'error'
      task.error = err.message
      console.error('申请失败', domain, err.message, err.stack)

      const detail = err.detail ? `\n\n输出信息: ${err.detail}` : ''
      common.sendMsg(`任务失败: ${err.message}\n\n堆栈信息: ${err.stack}` + detail)
    } finally {
      if (isAddRoute) {
        console.log('删除验证路由', domain)
        apisix.removeVerifyRoute(domain).catch(() => {})
      }
    }
    console.log('结束任务', domain)

    await common.sleep(1000)
  }
}

async function renewAll() {
  const list = await apisix.listSSL()
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    await createTask(item.domain, config.acme_mail, [], false).catch(err => {})
  }
}

async function scheduleTask() {
  schedule.scheduleJob('renewAll', config.renew_cron, renewAll)
  renewAll() // 立即执行一次
}

export default {
  scheduleTask,
  queryTask,
  createTask
}
