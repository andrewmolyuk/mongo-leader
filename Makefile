SHELL := /bin/bash

lint:
	npx eslint 
@PHONY: lint

test:
	npx jest
@PHONY: test

upgrade:
	npm -g ls npm-check-updates | grep -c npm-check-updates || npm install -g npm-check-updates
	ncu -u &&	npm install --no-fund --no-audit
	cd example && ncu -u && npm install --no-fund --no-audit
@PHONY: upgrade
