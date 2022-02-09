const axios = require('axios').default
const fs = require('fs')
const path = require('path')
const moment = require('moment')
const child_process = require('child_process')

async function execShell(cmd, options) {
  const arr = cmd.split(' ').filter(item => item != '')
  const [bin, ...args] = arr
  return new Promise((resolve, reject) => {
    const task = child_process.spawn(bin, args, options)
    task.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${cmd} failed with code ${code}`))
      }
    })
    task.on('error', err => {
      reject(err)
    })
  })
}

async function listSSL(apisix_host, token) {
  const resp = await axios.request({
    method: 'GET',
    headers: {
      'X-API-KEY': token
    },
    url: `${apisix_host}/apisix/admin/ssl`
  })
  const { data } = resp
  if (!data.count) {
    return []
  }
  const nodes = data.node.nodes
  const list = nodes.map(node => {
    const item = node.value || {}
    return {
      id: item.id,
      snis: item.snis || [],
      validity_start: item.validity_start,
      validity_end: item.validity_end
    }
  })
  return list
}

// 检查证书过期时间，若不存在 id 为空
async function checkSSL(apisix_host, token, domain) {
  let result = {
    id: '',
    validity_end: 0
  }
  const list = await listSSL(apisix_host, token)
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (item.snis.includes(domain)) {
      result.id = item.id
      result.validity_end = item.validity_end
      break
    }
  }
  return result
}

// 添加 acme.sh 验证路由
async function addVerifyRoute(apisix_host, token, domain, self_host) {
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
async function addSelfRoute(apisix_host, token, self_host) {
  const id = `apisix_acme`
  await axios.request({
    method: 'PUT',
    headers: {
      'X-API-KEY': token
    },
    url: `${apisix_host}/apisix/admin/routes/${id}`,
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
            host: new URL(self_host).hostname,
            port: Number(new URL(self_host).port) || 80,
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

// 导入证书
async function applySSL(apisix_host, token, sslInfo) {
  const id = 'acme_' + sslInfo.snis.join('_')
  await axios.request({
    method: 'PUT',
    headers: {
      'X-API-KEY': token
    },
    url: `${apisix_host}/apisix/admin/ssl/${id}`,
    data: sslInfo
  })
}

async function createSSL(domain, email) {
  const options = { cwd: path.join(__dirname, 'acme.sh-master'), stdio: 'inherit' }

  const web_root = path.join(__dirname, 'www')
  const ssl_key = path.join(__dirname, 'out', `${domain}.key`)
  const ssl_cer = path.join(__dirname, 'out', `${domain}.cer`)

  // await execShell('sh acme.sh --set-default-ca --server letsencrypt', options)
  await execShell(`sh acme.sh --issue -m ${email} --server letsencrypt -d ${domain} -w ${web_root}`, options)
  await execShell(`sh acme.sh --install-cert -d ${domain}  --key-file ${ssl_key} --fullchain-file ${ssl_cer}`, options)

  const data = child_process.execSync(`openssl x509 -text -noout -in ${ssl_cer}`, { encoding: 'utf8' })
  const snis = /DNS:.+/
    .exec(data)[0]
    .split(',')
    .map(item => item.trim().replace('DNS:', ''))
    .filter(item => item != '')

  const start_time = /Not\sBefore.*:\s(.+)/.exec(data)[1].replace('GMT', '').trim()
  const end_time = /Not\sAfter.*:\s(.+)/.exec(data)[1].replace('GMT', '').trim()

  return {
    snis,
    cert: fs.readFileSync(ssl_cer, 'utf8'),
    key: fs.readFileSync(ssl_key, 'utf8'),
    validity_start: moment.utc(start_time, 'MMM DD HH:mm:ss YYYY').unix(),
    validity_end: moment.utc(end_time, 'MMM DD HH:mm:ss YYYY').unix()
  }
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

module.exports = {
  addSelfRoute,
  updateServiceHost,
  removeVerifyRoute,
  listSSL,
  checkSSL,
  addVerifyRoute,
  createSSL,
  applySSL
}
