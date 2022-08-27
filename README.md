# apisix-acme

自动申请 acme 证书，自动添加 acme 验证路由，证书自动续期

目前只支持通过文本验证来申请单域名证书，暂不支持泛域名证书申请

## 步骤

1. 域名解析到 apisix 服务器

2. 调用服务 `http://${apisix-server}/apisix_acme/task_create` 自动创建证书

3. 每天凌晨会自动检查 14 天内即将过期证书并自动重新申请

## 安装

可以直接使用 [tmaize/apisix-acme](https://hub.docker.com/r/tmaize/apisix-acme) 镜像，或者本地构建`./build.sh build`

```yaml
services:
  # ...
  apisix-acme:
    image: apisix-acme:1.0.8
    restart: always
    depends_on:
      - apisix
    volumes:
      - ./apisix_acme_out:/app/src/out
    environment:
      - TZ=Asia/Shanghai
      - VERIFY_TOKEN=custom_token
      - SELF_APISIX_HOST=http://apisix-acme:80
      - APISIX_HOST=http://apisix:9080
      - APISIX_TOKEN=xxxxxxxxxx
      - ACME_MAIL=mail@example.com
      - DING_DING_TOKEN=xxxxxxxxxx
    networks:
      apisix:
```

## API

- 新增、更新证书 `/apisix_acme/task_create`

  domain 必填，serviceList、mail 可选，VERIFY-TOKEN 可选

  ```
  POST { "domain": "example.com", "serviceList": [], "mail": "" }
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

- 测试页面 `/apisix_acme/tool.html`

  仅在设置了 VERIFY_TOKEN 时开启

## Acknowledgments

[acme.sh](https://github.com/acmesh-official/acme.sh)
