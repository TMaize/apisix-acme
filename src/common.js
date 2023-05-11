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

function getRootDomain(domain) {
  const temp = domain.split('.')
  const list = []
  list.unshift(temp.pop())
  list.unshift(temp.pop())
  return list.join('.')
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
  const ssl_key = path.join('out', `${domain}.key`)
  const ssl_cer = path.join('out', `${domain}.cer`)
  if (!fs.existsSync(ssl_cer)) return

  const info = parseCA(ssl_cer, ssl_key)
  if (info.validity_end - parseInt(Date.now() / 1000) >= config.renew_less) {
    return info
  }

  return null
}

async function createSSL(domain, email, dnsParam, acmeEnv, acmeParam) {
  const ssl_key = path.join('out', `${domain}.key`)
  const ssl_cer = path.join('out', `${domain}.cer`)

  if (dnsParam) {
    const options = { timeout: 1000 * 350, env: { ...acmeEnv, ...dnsParam.env } }
    await execShell(`acme.sh  --home /acme.sh --issue --force -m ${email} -d ${domain} --dns ${dnsParam.dns} ${acmeParam.join(' ')}`, options).catch(
      data => {
        return Promise.reject({
          message: 'DSN验证申请证书失败',
          stack: data.error.stack,
          detail: data.output
        })
      }
    )
  } else {
    const options = { timeout: 1000 * 350, env: { ...acmeEnv } }
    const web_root = path.join(__dirname, 'www')

    await execShell(`acme.sh  --home /acme.sh --issue --force -m ${email} -d ${domain} -w ${web_root} ${acmeParam.join(' ')}`, options).catch(data => {
      return Promise.reject({
        message: '路由验证申请证书失败',
        stack: data.error.stack,
        detail: data.output
      })
    })
  }

  await execShell(`acme.sh --home /acme.sh --install-cert -d ${domain} --key-file ${ssl_key} --fullchain-file ${ssl_cer}`, { timeout: 1000 * 10 })

  const info = parseCA(ssl_cer, ssl_key)

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

module.exports = {
  getRootDomain,
  createSSL,
  createSSLFromCache,
  sendMsg,
  sleep,
  setupConsole,
  toFixed
}
