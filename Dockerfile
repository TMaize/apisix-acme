# alpine 镜像设置时区麻烦
# FROM node:14-alpine3.14
# COPY ./ /app/
# COPY ./alpine_repositories /etc/apk/repositories
# RUN apk add openssl-dev openssl wget
# WORKDIR /app
# EXPOSE 80
# ENTRYPOINT ["node", "src/index.js"]

FROM node:14-buster-slim
COPY ./ /app/
WORKDIR /app

RUN printf "\
deb http://mirrors.cloud.tencent.com/debian/ buster main contrib non-free \n\
deb http://mirrors.cloud.tencent.com/debian/ buster-updates main contrib non-free \n\
deb http://mirrors.cloud.tencent.com/debian/ buster-backports main contrib non-free \n\
deb http://mirrors.cloud.tencent.com/debian-security buster/updates main contrib non-free \n\
deb-src http://mirrors.cloud.tencent.com/debian/ buster main contrib non-free \n\
deb-src http://mirrors.cloud.tencent.com/debian/ buster-updates main contrib non-free \n\
deb-src http://mirrors.cloud.tencent.com/debian/ buster-backports main contrib non-free \n\
deb-src http://mirrors.cloud.tencent.com/debian-security buster/updates main contrib non-free \n" > /etc/apt/sources.list && \
apt-get update && \
apt-get install wget openssl --assume-yes && \
apt-get clean all && \
yarn

EXPOSE 80
ENTRYPOINT ["node", "src/index.js"]