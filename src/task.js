const schedule = require('node-schedule')
const config = require('./config')
const common = require('./common')

const taskList = [] // id domain runing error

function queryTask(id) {
  const task = taskList.find(item => String(item.id) === String(id))
  return task
}

async function createTask(domain, mail) {
  const result = await common.checkSSL(config.APISIX_HOST, config.APISIX_TOKEN, domain)
  const left_seconds = result.validity_end - parseInt(Date.now() / 1000)
  if (left_seconds > 604800) {
    return { code: 200, message: '证书已存在且未过期，跳过操作', data: { status: 0, domain } }
  }

  let task = taskList.find(item => item.domain === domain && item.runing) // 正在运行中的任务

  if (task) {
    return { code: 200, message: '证书申请中，等待片刻', data: { status: 1, domain, taskId: task.id } }
  }

  task = {
    id: Date.now(),
    runing: true,
    domain: domain
  }
  taskList.push(task)

  async function doTask() {
    let err = ''
    try {
      await common.addVerifyRoute(config.APISIX_HOST, config.APISIX_TOKEN, domain, config.SELF_APISIX_HOST)
      const sslInfo = await common.createSSL(domain, mail)
      await common.applySSL(config.APISIX_HOST, config.APISIX_TOKEN, sslInfo)
      await common.removeVerifyRoute(config.APISIX_HOST, config.APISIX_TOKEN, domain)
    } catch (error) {
      err = error.message || error
    }
    task.runing = false
    task.error = err
    console.log('任务完成', JSON.stringify(task))
  }

  doTask() // async function

  return { code: 200, message: '任务已提交，等待片刻', data: { status: 2, domain, taskId: task.id } }
}

async function renewAll() {
  const list = await common.listSSL(config.APISIX_HOST, config.APISIX_TOKEN)
  list.forEach(item => {
    if (String(item.id).match(/^acme_/)) {
      createTask(item.snis[0], config.ACME_MAIL).then(result => {
        console.log(JSON.stringify(result))
      })
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
