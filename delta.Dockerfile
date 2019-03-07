FROM zbaas/remix-ide:stable
MAINTAINER li xu cheng "lixucheng@zhigui.com"

ENV WORK_DIR /usr/app/src/

COPY package.json ${WORK_DIR}
COPY index.html ${WORK_DIR}
COPY *.ico ${WORK_DIR}
COPY src/app/tabs/run-tab.js ${WORK_DIR}src/app/tabs

RUN rm -rf build && npm run build
