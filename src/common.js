import axios from 'axios'
import child_process from 'child_process'
import fs from 'fs'
import moment from 'moment'
import path from 'path'
import url from 'url'
import config from './config.js'

const DIR_NAME = path.dirname(url.fileURLToPath(import.meta.url))

/**
 * 执行命令
 * @param {string} cmd
 * @param {import('child_process').SpawnOptionsWithoutStdio} options
 * @returns {Promise<{code: number, output: string, error: Error | undefined}>}
 */
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

// 解析证书文件
function parseCA(ssl_cer, ssl_key) {
  const data = child_process.execSync(`openssl x509 -text -noout -in '${ssl_cer}'`, { encoding: 'utf8' })
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

async function createSSLFromCache(domain) {
  const dc = getDomainConfig(domain)

  if (!fs.existsSync(dc.cerPath)) return

  const info = parseCA(dc.cerPath, dc.keyPath)
  if (info.validity_end - parseInt(Date.now() / 1000) >= config.renew_less) {
    return info
  }

  return null
}

async function createSSL(domain, email, dnsParam, acmeEnv, acmeParam) {
  const dc = getDomainConfig(domain)
  const options = { timeout: 1000 * 350, env: { ...acmeEnv, ...(dnsParam || {}).env } }

  let argD = `-d ${domain}`
  let argM = `-m ${email}`
  let argW = ''
  let argDNS = ''

  if (dnsParam) {
    if (dc.wildcard) {
      argD = `-d ${dc.domain} -d ${dc.baseDomain}`
    }
    argDNS = `--dns ${dnsParam.dns}`
  } else {
    argW = `-w ${path.join(DIR_NAME, 'www')}`
  }

  const args = `--issue --force ${argM} ${argD} ${argDNS} ${argW} ${acmeParam.join(' ')}`.replace(/\s{2,}/, ' ')
  console.log('acme.sh 参数', args)

  await execShell(`acme.sh --home /acme.sh ${args}`, options).catch(data => {
    return Promise.reject({
      message: 'acme.sh 执行失败',
      stack: data.error.stack,
      detail: data.output
    })
  })

  fs.mkdirSync(path.dirname(dc.keyPath), { recursive: true })

  await execShell(`acme.sh --home /acme.sh --install-cert ${argD} --key-file ${dc.keyPath} --fullchain-file ${dc.cerPath}`, { timeout: 1000 * 10 })

  const info = parseCA(dc.cerPath, dc.keyPath)

  return info
}

async function sendMsg(text) {
  if (!config.ding_ding_token) return
  return axios({
    method: 'POST',
    url: 'https://oapi.dingtalk.com/robot/send',
    params: { access_token: config.ding_ding_token },
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

function setupConsole() {
  const _log = console.log
  const _error = console.error
  const T_FORMAT = 'YYYY-MM-DD HH:mm:ss'

  console.log = function () {
    const t = moment().format(T_FORMAT)
    _log.call(this, `${t} I |`, ...arguments)
  }

  console.error = function () {
    const t = moment().format(T_FORMAT)
    _error.call(this, `${t} E |`, ...arguments)
  }
}

function toFixed(n, len, round) {
  if (round) {
    return Number(n).toFixed(len)
  }
  const arr = String(n).split('')
  if (!arr.includes('.')) {
    arr.push('.')
  }
  arr.push(...new Array(len).fill('0'))
  return arr.slice(0, arr.indexOf('.') + len + 1).join('')
}

/**
 * 获取域名基础配置
 * @param {string} domain
 * @returns {{domain: string, baseDomain: string, rootDomain: string, wildcard: boolean, keyPath: string, cerPath: string}}
 */
function getDomainConfig(domain) {
  const wildcard = /^\*\./.test(domain)
  const baseDomain = domain.replace(/^\*\./, '')

  let keyPath = path.join('out', `${domain}.key`)
  let cerPath = path.join('out', `${domain}.cer`)
  if (wildcard) {
    keyPath = path.join('out/wildcard', `${baseDomain}.key`)
    cerPath = path.join('out/wildcard', `${baseDomain}.cer`)
  }

  const list = domain.split('.')
  const rootDomain = list.slice(list.length - 2).join('.')

  return {
    domain,
    baseDomain,
    rootDomain,
    wildcard,
    keyPath,
    cerPath
  }
}

export default {
  getDomainConfig,
  createSSL,
  createSSLFromCache,
  sendMsg,
  sleep,
  setupConsole,
  toFixed,
  parseCA,
}
