export APISIX_HOST=http://127.0.0.2:80
export APISIX_TOKEN=xxxxxxxxxxxxxxxxxxxxxxx
export SELF_REGISTER=false
export SELF_APISIX_HOST=http://apisix-acme:80
export ACME_MAIL=test@qq.com

node src/index.js
