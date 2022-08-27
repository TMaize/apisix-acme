export VERIFY_TOKEN=custom_token
export PORT=8899
export SELF_APISIX_HOST=http://172.18.0.1:8899
export APISIX_HOST=http://127.0.0.1:9080
export APISIX_TOKEN=xxxxxxxxxx
export ACME_MAIL=mail@example.com
export DING_DING_TOKEN=xxxxxxxxxx

node src/index.js
