const koaRouter = require('koa-router');
const interfaceController = require('./controllers/interface.js');
const yapi = require('./yapi.js');

const router = koaRouter();
const { createAction } = require("./utils/commons.js");

const { getInterfaceData, getWSMockData } = require('./utils/webSocketMockServer.js');

let pluginsRouterPath = [];


function addPluginRouter(config) {
  if (!config.path || !config.controller || !config.action) {
    throw new Error('Plugin Route config Error');
  }
  let method = config.method || 'GET';
  let routerPath = '/ws_plugin/' + config.path;
  if (pluginsRouterPath.indexOf(routerPath) > -1) {
    throw new Error('Plugin Route path conflict, please try rename the path')
  }
  pluginsRouterPath.push(routerPath);
  createAction(router, "/api", config.controller, config.action, routerPath, method, true);
}

function webSocketMock(ctx, project, interfaceData) {
  getWSMockData(ctx, project, interfaceData)
    .then(value => {
      if (ctx.websocket.readyState === 1) {
        ctx.websocket.send(JSON.stringify(value))
      }
    })
    .catch(err => {
      if (ctx.websocket.readyState === 1) {
        ctx.websocket.send(JSON.stringify(err))
        ctx.websocket.close()
      }
    })
}

function websocket(app) {
  createAction(router, "/api", interfaceController, "solveConflict", "/interface/solve_conflict", "get")

  yapi.emitHookSync('add_ws_router', addPluginRouter);

  router.all('/mock/*', async ctx => {
    let timerInterval  //mock定时器
    let intervalTime   //mock时间间隔
    let timerOut       //超时定时器
    let outTime        //心跳超时
    getInterfaceData(ctx)
      .then(data => {
        intervalTime = data.interfaceData.interval_time
        outTime = intervalTime*10
        if (outTime > 60000) {
          outTime = 60000
        }
        webSocketMock(ctx, data.project, data.interfaceData)
        timerInterval = setInterval(webSocketMock, intervalTime, ctx, data.project, data.interfaceData)
        timerOut = setTimeout(() => {
          ctx.websocket.close()
        }, outTime);
      })
      .catch(err => {
        if (ctx.websocket.readyState === 1) {
          ctx.websocket.send(JSON.stringify(err))
        }
        ctx.websocket.close()
      })

    ctx.websocket.on('message', msg => {
      clearTimeout(timerOut)
      timerOut = setTimeout(() => {
        ctx.websocket.close()
      }, outTime);
      if (msg === 'ping' && ctx.websocket.readyState === 1) {
        ctx.websocket.send('pong')
      }
      console.log('websocket收到数据：', msg)
    })
    ctx.websocket.on('close', () => {
      clearInterval(timerInterval)
      clearTimeout(timerOut)
      console.log('websocket关闭')
    })
  })

  app.ws.use(router.routes())
  app.ws.use(router.allowedMethods());
  app.ws.use(function (ctx, next) {
    return ctx.websocket.send(JSON.stringify({
      errcode: 404,
      errmsg: 'No Fount.'
    }));
  });
}

module.exports = websocket