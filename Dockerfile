FROM neilpang/acme.sh:3.0.7

COPY ./ /app/

WORKDIR /app

RUN \
  printf "https://mirrors.cloud.tencent.com/alpine/v3.15/main\nhttps://mirrors.cloud.tencent.com/alpine/v3.15/community\n" > /etc/apk/repositories && \
  apk add -U --no-cache tzdata nodejs npm && \
  npm config set registry https://registry.npmmirror.com && \
  npm install yarn -g && \
  cd /app/ && yarn && \
  npm uninstall yarn -g && \
  rm -rf /usr/local/share/.cache && \
  rm -rf ~/.npm && \
  rm -rf /tmp/*

EXPOSE 80

ENTRYPOINT ["node", "src/index.js"]
