const fs = require('fs')
const path = require('path')
const YAML = require('yaml')

const config = {
  init,
  port: 80,
  verify_token: '',
  apisix_host: '',
  apisix_token: '',
  self_apisix_host: '',
  priority: 999,
  acme_mail: '',
  ding_ding_token: '',
  renew_day: 0,
  renew_cron: '',
  renew_less: 0,
  dns_api: [],
  acme_env: {},
  acme_param: []
}

function init() {
  const idx = process.argv.indexOf('-c')
  const configFile = idx == -1 ? 'config.yml' : process.argv[idx + 1]

  const ok = fs.existsSync(configFile)
  if (!ok) throw new Error(`can't find ${configFile}`)
  console.log(`use config ${configFile}`)

  const configText = fs.readFileSync(configFile, 'utf-8')
  const f = YAML.parse(configText)

  config.port = Number(f.port) || 80
  config.verify_token = String(f.verify_token || '')
  config.apisix_host = f.apisix_host || ''
  config.apisix_token = f.apisix_token || ''
  config.self_apisix_host = f.self_apisix_host || ''
  config.acme_mail = f.acme_mail || ''
  config.priority = f.priority || 999
  config.ding_ding_token = f.ding_ding_token || ''
  config.renew_day = Number(f.renew_day) || 30
  config.renew_cron = String(f.renew_cron || '0 0 1 * * *')
  config.renew_less = config.renew_day * 24 * 60 * 60
  config.dns_api = Array.isArray(f.dns_api) ? f.dns_api : []
  config.acme_env = { ...f.acme_env }
  config.acme_param = Array.isArray(f.acme_param) ? f.acme_param : []

  const isConfigServer = config.acme_param.some(item => item.indexOf('--server ') != -1)
  if (!isConfigServer) {
    config.acme_param.push('--server letsencrypt')
  }

  if (config.renew_day <= 0) throw new Error('Bad configure value: renew_day = ' + config.renew_day)
  if (!config.verify_token) throw new Error('Need to configure: verify_token')
  if (!config.acme_mail) throw new Error('Need to configure: acme_mail')
  if (!config.apisix_host) throw new Error('Need to configure: apisix_host')
  if (!config.apisix_token) throw new Error('Need to configure: apisix_token')
  if (!config.self_apisix_host) throw new Error('Need to configure: self_apisix_host')
  if (config.renew_cron.split(' ').length !== 6) throw new Error('Bad configure value: renew_cron = ' + config.renew_cron)
}

module.exports = config
