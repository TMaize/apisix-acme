
FROM neilpang/acme.sh:3.0.4

COPY ./ /app/
WORKDIR /app

RUN printf "\
https://mirrors.cloud.tencent.com/alpine/v3.15/main\n\
https://mirrors.cloud.tencent.com/alpine/v3.15/community\n\
\n" > /etc/apk/repositories && \
apk add -U --no-cache tzdata nodejs npm&& \
npm config set registry http://mirrors.cloud.tencent.com/npm/ && \
npm install yarn -g && \
cd /app/ && yarn && \
echo ~~~~~~~~~~~~~~~~&& \
rm -rf /usr/local/share/.cache/yarn && \
npm uninstall yarn -g && \
echo ~~~~~~~~~~~~~~~~

EXPOSE 80
ENTRYPOINT ["node", "src/index.js"]