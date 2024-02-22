import axios from 'axios'
import config from '../config.js'

/**
 * 列出所有证书
 * @typedef {{id: string, snis: Array<string>, validity_start: number, validity_end: number}} Item
 * @returns {Promise<Array<Item>>}
 */
async function sslList() {
  const resp = await axios.request({
    method: 'GET',
    headers: { 'X-API-KEY': config.apisix_token },
    url: `${config.apisix_host}/apisix/admin/ssls`
  })

  const { data } = resp
  const nodes = []
  const results = []

  if (Array.isArray(data.list)) {
    nodes.push(...data.list)
  }

  nodes.forEach(node => {
    const item = node.value || {}
    if (!item.snis) return

    results.push({
      id: item.id,
      snis: item.snis,
      validity_start: item.validity_start,
      validity_end: item.validity_end
    })
  })

  return results
}

/**
 * 设置证书
 * @param {string} id
 * @param {{snis: Array<string>, cert: string, key: string, validity_start: number, validity_end: number}} data
 * @returns {Promise<void>}
 */
async function setupSsl(id, data) {
  // 过滤掉 validity_start 和 validity_end，因为 v3 版本不允许此数据
  const v3Data = Object.keys(data).reduce((acc, key) => {
    if (key !== 'validity_start' && key !== 'validity_end') {
      acc[key] = data[key]
    }
    return acc
  }, {})

  return axios.request({
    method: 'PUT',
    headers: { 'X-API-KEY': config.apisix_token },
    url: `${config.apisix_host}/apisix/admin/ssls/${id}`,
    data: v3Data
  })
}

export default {
  sslList,
  setupSsl
}
