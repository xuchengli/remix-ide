FROM node:9
MAINTAINER li xu cheng "lixucheng@ziggurat.cn"

# Build and start up app
RUN mkdir -p /usr/app/src
COPY . /usr/app/src
WORKDIR /usr/app/src

RUN npm install && npm cache clean --force
# RUN npm run setupremix && npm run build
RUN npm run setup_old_remix && npm run build

EXPOSE 9081
CMD ["npm", "start"]
