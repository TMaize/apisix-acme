const APISIX_HOST = process.env.APISIX_HOST || 'http://apisix:9080' // apisix host
const APISIX_TOKEN = process.env.APISIX_TOKEN || '' // apisix token
const ACME_MAIL = process.env.ACME_MAIL || '' // default acme mail
const SELF_APISIX_HOST = process.env.SELF_HOST || 'http://apisix-acme:80' // 注册到 apisix 的 host

module.exports = {
  APISIX_HOST,
  APISIX_TOKEN,
  SELF_APISIX_HOST,
  ACME_MAIL
}
