import apisix from './apisix.js'
import common from './common.js'
import config from './config.js'
import server from './server.js'
import task from './task.js'

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
