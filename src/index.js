const server = require('./server')
const common = require('./common')
const task = require('./task')

async function main() {
  try {
    await server.start()
    await common.addSelfRoute()
    task.scheduleTask()
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}

main()
