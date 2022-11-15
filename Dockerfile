
FROM neilpang/acme.sh:3.0.4

COPY ./ /app/
WORKDIR /app

RUN printf "\
https://mirrors.cloud.tencent.com/alpine/v3.15/main\n\
https://mirrors.cloud.tencent.com/alpine/v3.15/community\n\
\n" > /etc/apk/repositories && \
apk add --no-cache tzdata && \
apk add --no-cache nodejs && \
apk add --no-cache npm && \
npm config set registry http://mirrors.cloud.tencent.com/npm/ && \
npm install yarn -g && \
cd /app/ && yarn && \
echo ////////////////////////////////

EXPOSE 80
ENTRYPOINT ["node", "src/index.js"]