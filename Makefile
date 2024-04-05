SHELL := /bin/bash

lint:
	npx eslint . --ext .js
@PHONY: lint

test:
	npx jest --detectOpenHandles tests/*.test.js
@PHONY: test

upgrade:
	npm -g ls npm-check-updates | grep -c npm-check-updates || npm install -g npm-check-updates
	ncu -u
	npm install --no-fund --no-audit
@PHONY: upgrade
