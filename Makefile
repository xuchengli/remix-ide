stop:
	@docker stop remix-ide || true
	@docker rm remix-ide || true

start:
	@docker build -t opsdocker.ziggurat.cn/baas/remix-ide .
	@docker run -d -p 9080:9080 --name remix-ide opsdocker.ziggurat.cn/baas/remix-ide
