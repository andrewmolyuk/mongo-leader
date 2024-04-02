SHELL := /bin/bash

lint:
	npx eslint --ext .js *.js
@PHONY: lint

upgrade:
	npm -g ls npm-check-updates | grep -c npm-check-updates || npm install -g npm-check-updates
	ncu -u
	npm install
@PHONY: upgrade
