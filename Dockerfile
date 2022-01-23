FROM node:14-alpine3.14
COPY ./ /app/
COPY ./alpine_repositories /etc/apk/repositories
RUN apk add openssl-dev openssl wget
WORKDIR /app
EXPOSE 80
ENTRYPOINT ["node", "src/index.js"]
