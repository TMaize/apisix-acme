import axios from 'axios'
import common from './common.js'
import config from './config.js'

// 把自己注册到 apisix
async function addSelfRoute() {
  async function add() {
    const id = `apisix_acme`
    await axios.request({
      method: 'PUT',
      headers: {
        'X-API-KEY': config.apisix_token
      },
      url: `${config.apisix_host}/apisix/admin/routes/${id}`,
      data: {
        uri: '/apisix_acme/*',
        name: id,
        methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
        priority: config.route_priority,
        // host: domain,
        plugins: {
          'proxy-rewrite': {
            scheme: 'http'
          }
        },
        upstream: {
          nodes: [
            {
              host: new URL(config.self_apisix_host).hostname,
              port: Number(new URL(config.self_apisix_host).port) || 80,
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
      if (i >= 3) console.error('addSelfRoute fail:', error.message || error, 'retrying ...')
      if (i == 6) {
        common.sendMsg(`addSelfRoute fail: ${error.message || error}`)
        return Promise.reject(new Error('addSelfRoute fail: ' + error.message || error))
      }
    }
    await common.sleep(3000)
  }
  console.log('addSelfRoute success')
}

// 添加文件验证路由
async function addVerifyRoute(domain) {
  const id = `acme_verify_${domain}`
  await axios.request({
    method: 'PUT',
    headers: {
      'X-API-KEY': config.apisix_token
    },
    url: `${config.apisix_host}/apisix/admin/routes/${id}`,
    data: {
      uri: '/.well-known/acme-challenge/*',
      name: id,
      methods: ['GET'],
      priority: config.route_priority,
      host: domain,
      plugins: {
        'proxy-rewrite': {
          scheme: 'http'
        }
      },
      upstream: {
        nodes: [
          {
            host: new URL(config.self_apisix_host).hostname,
            port: Number(new URL(config.self_apisix_host).port) || 80,
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

// 删除文件验证路由
async function removeVerifyRoute(domain) {
  const id = `acme_verify_${domain}`
  await axios.request({
    method: 'DELETE',
    headers: {
      'X-API-KEY': config.apisix_token
    },
    url: `${config.apisix_host}/apisix/admin/routes/${id}`
  })
}

// 列出指定单sni的证书，不传列出所有单sni的证书
async function listSSL(sni) {
  const resp = await axios.request({
    method: 'GET',
    headers: { 'X-API-KEY': config.apisix_token },
    url: `${config.apisix_host}/apisix/admin/ssl`
  })

  const { data } = resp
  if (!data.count) return []

  const nodes = data.node.nodes || []
  const list = []

  nodes.forEach(node => {
    const item = node.value || {}
    if (!item.snis || item.snis.length > 1) return
    if (sni && sni !== item.snis[0]) return

    list.push({
      id: item.id,
      domain: item.snis[0],
      validity_start: item.validity_start,
      validity_end: item.validity_end
    })
  })

  return list
}

// 导入证书
async function applySSL(domain, sslInfo) {
  const sslList = await listSSL(domain)

  const idList = []
  sslList.forEach(item => {
    if (item.validity_end < sslInfo.validity_end) {
      idList.push(item.id)
    }
  })

  if (idList.length == 0) {
    idList.push(String(Date.now()))
  }

  for (let i = 0; i < idList.length; i++) {
    const id = idList[i]
    await axios.request({
      method: 'PUT',
      headers: { 'X-API-KEY': config.apisix_token },
      url: `${config.apisix_host}/apisix/admin/ssl/${id}`,
      data: sslInfo
    })
  }
}

// 把 host 加到某个 service 下
async function updateServiceHost(serviceName, domain, type) {
  const resp1 = await axios.request({
    method: 'GET',
    headers: {
      'X-API-KEY': config.apisix_token
    },
    url: `${config.apisix_host}/apisix/admin/services`
  })

  const nodes = resp1.data.node.nodes || []
  let service
  for (let i = 0; i < nodes.length; i++) {
    const value = nodes[i].value || {}
    if (String(value.id) === serviceName || value.name === serviceName) {
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
      'X-API-KEY': config.apisix_token
    },
    url: `${config.apisix_host}/apisix/admin/services/${service.id}`,
    data: {
      hosts: hosts_new
    }
  })
}

export default {
  addSelfRoute,
  addVerifyRoute,
  removeVerifyRoute,
  listSSL,
  applySSL,
  updateServiceHost
}
