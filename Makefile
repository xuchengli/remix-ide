GREEN := $(shell tput -Txterm setaf 2)

REMIX-IDE-IMAGE := $(shell docker images -q opsdocker.ziggurat.cn/baas/remix-ide:latest)
REMIX-IDE-CONTAINER := $(shell docker ps -a | grep remix-ide | awk '{print $$1}')

stop:
ifneq ($(strip $(REMIX-IDE-CONTAINER)),)
	@docker stop $(REMIX-IDE-CONTAINER)
	@docker rm $(REMIX-IDE-CONTAINER)
else
	@echo $(GREEN)"No containers need to be clean...."
endif

start:
ifneq ($(strip $(REMIX-IDE-IMAGE)),)
	@docker rmi $(REMIX-IDE-IMAGE)
endif
	@docker build -t opsdocker.ziggurat.cn/baas/remix-ide .
	@docker run -d -p 9081:9081 --name remix-ide opsdocker.ziggurat.cn/baas/remix-ide
