import axios from 'axios'
import { compareVersions } from 'compare-versions'
import v2 from './apisix/v2.js'
import v3 from './apisix/v3.js'
import common from './common.js'
import config from './config.js'

async function getVersion() {
  const headers = await axios
    .request({
      method: 'GET',
      headers: {
        'X-API-KEY': config.apisix_token
      },
      url: `${config.apisix_host}/apisix/admin/routes`
    })
    .then(resp => resp.headers)
    .catch(err => {
      return (err.response || {}).headers || {}
    })

  const server = headers['server'] || ''
  const version = server.replace("APISIX", "").replace('/', '').trim() || config.apisix_version
  return version
}

function setErrorLoggerInterceptor() {
  axios.interceptors.response.use(function(response) {
      return response
    }, function (error) {
      if (error.config) {
        console.log("AdminApi Error", error.config.method, error.config.url, error.config.data, error.response.data)
      }
      return Promise.reject(error)
    }
  )
}

// 把自己注册到 apisix
async function addSelfRoute() {

  // 不一定要放到这里
  setErrorLoggerInterceptor()

  async function add() {
    const id = `apisix_acme`
    await axios.request({
      method: 'PUT',
      timeout: 5 * 1000,
      headers: {
        'X-API-KEY': config.apisix_token
      },
      url: `${config.apisix_host}/apisix/admin/routes/${id}`,
      data: {
        uri: '/'+config.apisix_api_prefix+'/*',
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
      if (i >= 3) console.error('init acme route fail:', error.message || error, 'retrying ...')
      if (i == 6) {
        common.sendMsg(`init acme route fail: ${error.message || error}`)
        return Promise.reject(new Error('init acme route fail: ' + error.message || error))
      }
    }
    await common.sleep(3000)
  }
  console.log('init acme route success')
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

/**
 * 列出指定单sni的证书，不传列出所有单sni的证书
 * @typedef {{id: string, domain: string, validity_start: number, validity_end: number}} Item
 * @param {string|undefined} sni
 * @returns {Promise<Array<Item>>}
 */
async function listSSL(sni) {
  const version = await getVersion()

  let list = []
  if (compareVersions(version, '3.0.0') >= 0) {
    list = await v3.sslList()
  } else {
    list = await v2.sslList()
  }

  const results = []

  list.forEach(item => {
    if (!Array.isArray(item.snis) || item.snis.length == 0) {
      return
    }

    if (!item.labels || !item.labels.acme) {
      return
    }

    const isSingle = item.snis.length == 1

    let isWildcard = false
    const idx1 = item.snis.findIndex(d => /^\*\./.test(d))
    if (idx1 != -1 && item.snis.length === 2) {
      const idx2 = idx1 === 1 ? 0 : 1
      isWildcard = '*.' + item.snis[idx2] === item.snis[idx1]
    }

    if (isSingle || isWildcard) {
      const domain = isSingle ? item.snis[0] : item.snis[idx1]
      if (sni && domain !== sni) {
        return
      }
      results.push({
        id: item.id,
        domain,
        validity_start: item.validity_start,
        validity_end: item.validity_end,
      })
    }
  })

  return results
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

  const version = await getVersion()

  for (let i = 0; i < idList.length; i++) {
    const id = idList[i]
    const save = {
      snis: sslInfo.snis,
      cert: sslInfo.cert,
      key: sslInfo.key,
      validity_start: sslInfo.validity_start,
      validity_end: sslInfo.validity_end,
      labels: {
        acme: "ok",
      },
    }
    if (compareVersions(version, '3.0.0') >= 0) {
      // https://github.com/apache/apisix/pull/10323
      // https://apisix.apache.org/zh/blog/2023/11/21/release-apache-apisix-3.7.0/
      // 修复 invalid configuration: additional properties forbidden, found validity_end
      if (compareVersions(version, '3.7.0') >= 0) {
        delete save.validity_start
        delete save.validity_end
      }
      await v3.setupSsl(id, save)
    } else {
      await v2.setupSsl(id, save)
    }
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
