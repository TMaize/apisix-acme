const axios = require('axios').default
const fs = require('fs')
const path = require('path')
const moment = require('moment')
const child_process = require('child_process')

const config = require('./config')

async function execShell(cmd, options) {
  const arr = cmd.split(' ').filter(item => item != '')
  const [bin, ...args] = arr
  return new Promise((resolve, reject) => {
    const task = child_process.spawn(bin, args, options)
    let output = ''
    task.on('close', code => {
      if (code === 0) {
        resolve({ code, output })
      } else {
        reject({ code, output, error: new Error(`execShell return ${code}`) })
      }
    })
    task.stdout.on('data', buf => {
      const str = buf.toString() //iconv.decode(buf, 'gbk')
      output += str
      process.stdout.write(str)
    })
    task.stderr.on('data', buf => {
      const str = buf.toString() //iconv.decode(buf, 'gbk')
      output += str
      process.stderr.write(str)
    })
    task.on('error', err => {
      reject({ code: '', output, error: err })
    })
  })
}

async function listSSL(apisix_host, token, unique) {
  const resp = await axios.request({
    method: 'GET',
    headers: { 'X-API-KEY': token },
    url: `${apisix_host}/apisix/admin/ssl`
  })
  const { data } = resp
  if (!data.count) return []

  const nodes = data.node.nodes || []
  const list = []

  nodes.forEach(node => {
    const item = node.value || {}
    // 仅支持单域名
    if (!item.snis || item.snis.length > 1) return

    const info = {
      id: item.id,
      domain: item.snis[0],
      validity_start: item.validity_start,
      validity_end: item.validity_end
    }

    if (unique) {
      const idx = list.findIndex(o => o.domain === info.domain)
      if (idx == -1) {
        list.push(info)
      }
      // 取即将过期的域名
      if (idx != -1 && list[idx].validity_end > info.validity_end) {
        list.splice(idx, 1, info)
      }
    } else {
      list.push(info)
    }
  })
  return list
}

// 添加 acme.sh 验证路由
async function addVerifyRoute(apisix_host, token, domain, self_host) {
  console.log('添加验证路由', domain)
  const id = `acme_verify_${domain}`
  await axios.request({
    method: 'PUT',
    headers: {
      'X-API-KEY': token
    },
    url: `${apisix_host}/apisix/admin/routes/${id}`,
    data: {
      uri: '/.well-known/acme-challenge/*',
      name: id,
      methods: ['GET'],
      host: domain,
      plugins: {
        'proxy-rewrite': {
          scheme: 'http'
        }
      },
      upstream: {
        nodes: [
          {
            host: new URL(self_host).hostname,
            port: Number(new URL(self_host).port) || 80,
            weight: 1
          }
        ],
        timeout: {
          connect: 6,
          send: 6,
          read: 6
        },
        type: 'roundrobin',
        scheme: 'http',
        pass_host: 'pass',
        keepalive_pool: {
          idle_timeout: 60,
          requests: 1000,
          size: 320
        }
      },
      status: 1
    }
  })
}

// 删除 acme.sh 验证路由
async function removeVerifyRoute(apisix_host, token, domain) {
  console.log('删除验证路由', domain)
  const id = `acme_verify_${domain}`
  await axios.request({
    method: 'DELETE',
    headers: {
      'X-API-KEY': token
    },
    url: `${apisix_host}/apisix/admin/routes/${id}`
  })
}

// 把自己注册到 apisix
async function addSelfRoute() {
  async function add() {
    const id = `apisix_acme`
    await axios.request({
      method: 'PUT',
      headers: {
        'X-API-KEY': config.APISIX_TOKEN
      },
      url: `${config.APISIX_HOST}/apisix/admin/routes/${id}`,
      data: {
        uri: '/apisix_acme/*',
        name: id,
        methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
        // host: domain,
        plugins: {
          'proxy-rewrite': {
            scheme: 'http'
          }
        },
        upstream: {
          nodes: [
            {
              host: new URL(config.SELF_APISIX_HOST).hostname,
              port: Number(new URL(config.SELF_APISIX_HOST).port) || 80,
              weight: 1
            }
          ],
          timeout: {
            connect: 100,
            send: 100,
            read: 100
          },
          type: 'roundrobin',
          scheme: 'http',
          pass_host: 'pass',
          keepalive_pool: {
            idle_timeout: 60,
            requests: 1000,
            size: 320
          }
        },
        status: 1
      }
    })
  }

  for (let i = 1; i <= 6; i++) {
    try {
      await add()
      break
    } catch (error) {
      if (i > 1) console.error('addSelfRoute fail:', error.message || error, 'retrying ...')
      if (i == 6) {
        sendMsg(`addSelfRoute fail: ${error.message || error}`)
        return Promise.reject(new Error('addSelfRoute fail: ' + error.message || error))
      }
    }
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}

// 导入证书
async function applySSL(apisix_host, token, domain, sslInfo) {
  const all = await listSSL(apisix_host, token, false)
  const idList = all.filter(item => item.domain == domain).map(item => item.id)
  if (idList.length == 0) idList.push(String(Date.now()))

  for (let i = 0; i < idList.length; i++) {
    const id = idList[i]
    await axios.request({
      method: 'PUT',
      headers: { 'X-API-KEY': token },
      url: `${apisix_host}/apisix/admin/ssl/${id}`,
      data: sslInfo
    })
  }
}

// 解析证书文件
function parseCA(ssl_cer, ssl_key) {
  const data = child_process.execSync(`openssl x509 -text -noout -in ${ssl_cer}`, { encoding: 'utf8' })
  const snis = /DNS:.+/
    .exec(data)[0]
    .split(',')
    .map(item => item.trim().replace('DNS:', ''))
    .filter(item => item != '')

  const start_time = /Not\sBefore.*:\s(.+)/.exec(data)[1].replace('GMT', '').trim()
  const end_time = /Not\sAfter.*:\s(.+)/.exec(data)[1].replace('GMT', '').trim()
  const validity_start = moment.utc(start_time, 'MMM DD HH:mm:ss YYYY').unix()
  const validity_end = moment.utc(end_time, 'MMM DD HH:mm:ss YYYY').unix()

  return {
    snis,
    cert: fs.readFileSync(ssl_cer, 'utf8'),
    key: fs.readFileSync(ssl_key, 'utf8'),
    validity_start,
    validity_end
  }
}

async function createSSL(domain, email) {
  const web_root = path.join(__dirname, 'www')
  const ssl_key = path.join(__dirname, 'out', `${domain}.key`)
  const ssl_cer = path.join(__dirname, 'out', `${domain}.cer`)

  if (fs.existsSync(ssl_cer)) {
    const info = parseCA(ssl_cer, ssl_key)
    if (info.validity_end - parseInt(Date.now() / 1000) >= config.RENEW_LESS) {
      const end_date = moment(info.validity_end * 1000).format('YYYY-MM-DD HH:mm:ss')
      const day = parseInt((info.validity_end - parseInt(Date.now() / 1000)) / 86400)
      sendMsg(`使用本地缓存证书: ${domain}\n\n过期时间: ${end_date}\n\n剩余: ${day}天`)
      return info
    }
  }

  const options = { cwd: path.join(__dirname, 'acme.sh-master'), timeout: 1000 * 90 }

  await execShell(`sh acme.sh --issue --force -m ${email} --server letsencrypt -d ${domain} -w ${web_root}`, options).catch(data => {
    const error = data.error
    sendMsg(`创建证书失败 ${domain} \n\n` + '```\n' + data.output + '\n```')
    return Promise.reject(error)
  })

  await execShell(`sh acme.sh --install-cert -d ${domain}  --key-file ${ssl_key} --fullchain-file ${ssl_cer}`, options)

  const info = parseCA(ssl_cer, ssl_key)
  const end_date = moment(info.validity_end * 1000).format('YYYY-MM-DD HH:mm:ss')
  const day = parseInt((info.validity_end - parseInt(Date.now() / 1000)) / 86400)
  sendMsg(`创建证书成功: ${domain}\n\n过期时间: ${end_date}\n\n剩余: ${day}天`)

  return info
}

// 把 host 加到某个 service 下
async function updateServiceHost(apisix_host, token, domain, serviceName, type) {
  const resp1 = await axios.request({
    method: 'GET',
    headers: {
      'X-API-KEY': token
    },
    url: `${apisix_host}/apisix/admin/services`
  })
  const nodes = resp1.data.node.nodes || []
  let service
  for (let i = 0; i < nodes.length; i++) {
    const value = nodes[i].value
    if (value.name === serviceName) {
      service = value
    }
  }

  if (!service) {
    throw new Error(`service ${serviceName} not found`)
  }

  const hosts_old = service.hosts || []
  const hosts_new = hosts_old.slice(0)

  if (type === 'add' && hosts_new.indexOf(domain) === -1) {
    console.log('服务绑定域名', serviceName, domain)
    hosts_new.push(domain)
  }
  if (type === 'remove' && hosts_old.indexOf(domain) !== -1) {
    console.log('服务移除域名', serviceName, domain)
    hosts_new.splice(hosts_new.indexOf(domain), 1)
  }

  if (hosts_new.length === hosts_old.length) {
    return
  }

  await axios.request({
    method: 'PATCH',
    headers: {
      'X-API-KEY': token
    },
    url: `${apisix_host}/apisix/admin/services/${service.id}`,
    data: {
      hosts: hosts_new.length === 0 ? ['block-ip-access.com'] : hosts_new
    }
  })
}

async function sendMsg(text) {
  if (!config.DING_DING_TOKEN) return
  return axios({
    method: 'POST',
    url: 'https://oapi.dingtalk.com/robot/send',
    params: { access_token: config.DING_DING_TOKEN },
    data: {
      msgtype: 'markdown',
      markdown: {
        title: '事件提醒',
        text: '## apisix-acme\n\n---\n\n' + text
      }
    }
  }).catch(err => {
    console.error('发送消息失败', err.message)
  })
}
async function sleep(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms)
  })
}

module.exports = {
  addSelfRoute,
  addVerifyRoute,
  updateServiceHost,
  removeVerifyRoute,
  listSSL,
  createSSL,
  applySSL,
  sendMsg,
  sleep
}
