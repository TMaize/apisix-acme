const server = require('./server')
const common = require('./common')
const apisix = require('./apisix')
const task = require('./task')
const config = require('./config')

async function main() {
  try {
    common.setupConsole()
    config.init()
    await server.start()
    await apisix.addSelfRoute()
    task.scheduleTask()
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}

main()
