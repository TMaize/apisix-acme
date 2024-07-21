# apisix-acme

管理 apisix 里面的证书，支持自动续期，支持通过接口创建单域名、泛域名证书

单域名：优先使用 dns 验证，未配置 dns_api 的情况下使用 apisix 自动创建路由进行文件验证

泛域名：只支持使用 dns 验证

## 步骤

1. 域名解析到 apisix 服务器（dsn 验证不需要该步骤）

2. 调用服务 `http://${apisix-server}/apisix_acme/task_create` 创建证书，也可在 apisix 里面手动导入证书

3. 每天凌晨会自动检查即将过期且符合格式（单sni）的证书并自动重新申请

## 配置文件

参考 [config.yml](config.example.yml)

## 安装

可以直接使用 [tmaize/apisix-acme](https://hub.docker.com/r/tmaize/apisix-acme) 镜像，或者本地构建`./build.sh build`

```yaml
version: "3"

services:
  apisix-acme:
    image: tmaize/apisix-acme:2.3.4
    restart: always
    volumes:
      - ./out:/app/out
      - ./config.yml:/app/config.yml
    environment:
      - TZ=Asia/Shanghai
    networks:
      apisix:

networks:
  apisix:
    external: true
```

## API

- 新增、更新证书 `/apisix_acme/task_create`

  domain 必填，serviceList、mail、force，VERIFY-TOKEN 可选

  ```
  POST {"domain":"example.com","serviceList":[],"mail":"","force":false}
  HEADER {VERIFY-TOKEN: xxxxxxxxxx}
  ```

  响应

  ```json
  { "code": 200, "message": "证书已存在且未过期，跳过操作", "data": { "status": "skip", "domain": "example.com" } }
  ```

  ```json
  { "code": 200, "message": "证书申请中，等待片刻", "data": { "status": "running", "domain": "example.com" } }
  ```

  ```json
  { "code": 200, "message": "任务已提交，等待片刻", "data": { "status": "created", "domain": "example.com" } }
  ```

- 查询任务 `/apisix_acme/task_status`

  请求

  ```
  GET ?domain=example.com
  ```

  响应

  ```json
  { "code": 200, "data": { "status": "error", "domain": "example.com", "error": "域名不存在" } }
  ```

  ```json
  { "code": 200, "data": { "status": "running", "domain": "example.com" } }
  ```

  ```json
  { "code": 200, "data": { "status": "success", "domain": "example.com" } }
  ```

- 工具页面 `/apisix_acme/tool.html`

## Acknowledgments

[acme.sh](https://github.com/acmesh-official/acme.sh)
