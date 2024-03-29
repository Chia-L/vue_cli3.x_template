const chokidar = require('chokidar')
const bodyParser = require('body-parser')
const chalk = require('chalk')
const path = require('path')
const Mock = require('mockjs')

const mockDir = path.join(process.cwd(), 'mock')

// mock转换为app可以处理的请求
function responseFake(url, type, respond) {
  return {
    url: new RegExp(`^/local-api${url}$`),
    type: type || 'GET',
    response(req, res) {
      res.json(Mock.mock(respond instanceof Function ? respond(req, res) : respond))
    }
  }
}

// 将mock路由注册到app
function registerRoutes(app) {
  let mockLastIndex

  // mock 描述请求响应：{url, type, response}
  const mocks = require('./templates')

  // 封装mock，便于注册到app路由中
  const mocksForServer = mocks.map(route => {
    return responseFake(route.url, route.type, route.response)
  })

  // 将 mock 注册到app路由
  // app路由：
  // app.get(url, (req, res) { res.send({}) })
  for (const mock of mocksForServer) {
    app[mock.type.toLowerCase()](mock.url, mock.response)
    mockLastIndex = app._router.stack.length
  }

  // 返回 { mock总数，在app路由栈的位置 }
  const mockRoutesLength = Object.keys(mocksForServer).length
  return {
    mockRoutesLength: mockRoutesLength,
    mockStartIndex: mockLastIndex - mockRoutesLength
  }
}

// 注销路由
function unregisterRoutes() {
  Object.keys(require.cache).forEach(i => {
    if (i.includes(mockDir)) {
      delete require.cache[require.resolve(i)]
    }
  })
}

module.exports = app => {
  // http 主体按 json 解码！！
  // 进行 urlencoded 编码
  // https://expressjs.com/en/4x/api.html#req.body
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({
    extended: true
  }))

  const mockRoutes = registerRoutes(app)
  var mockRoutesLength = mockRoutes.mockRoutesLength
  var mockStartIndex = mockRoutes.mockStartIndex

  // 监听文件，热更新加载mock服务器
  chokidar.watch(mockDir, {
    ignored: /mock-server/, // 忽略掉mock-server.js文件
    ignoreInitial: true
  }).on('all', (event, path) => {
    if (['change', 'add'].includes(event)) {
      try {
        // 从路由栈移除请求
        app._router.stack.splice(mockStartIndex, mockRoutesLength)

        // 注销路由
        unregisterRoutes()

        const mockRoutes = registerRoutes(app)
        mockRoutesLength = mockRoutes.mockRoutesLength
        mockStartIndex = mockRoutes.mockStartIndex
        console.log(chalk.magentaBright(`\n > Mock Server hot reload success! changed  ${path}`))
      }
      catch (error) {
        console.log(chalk.redBright(error))
      }
    }
  })
}
