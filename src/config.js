const PORT = Number(process.env.PORT || 80) // HTTP 端口
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || '' // 安全校验
const APISIX_HOST = process.env.APISIX_HOST || 'http://apisix:9080' // apisix host
const APISIX_TOKEN = process.env.APISIX_TOKEN || '' // apisix token
const ACME_MAIL = process.env.ACME_MAIL || '' // default acme mail
const SELF_APISIX_HOST = process.env.SELF_APISIX_HOST || 'http://apisix-acme:80' // 注册到 apisix 的 host
const DING_DING_TOKEN = process.env.DING_DING_TOKEN || '' // 钉钉通知关键词: 事件提醒

const S_DAY = 24 * 60 * 60

module.exports = {
  PORT,
  VERIFY_TOKEN,
  APISIX_HOST,
  APISIX_TOKEN,
  SELF_APISIX_HOST,
  ACME_MAIL,
  DING_DING_TOKEN,
  RENEW_LESS:  S_DAY * 30
}
