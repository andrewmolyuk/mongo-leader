SHELL := /bin/bash

VERSION := 1.2
BUILD := $(shell expr $(shell git describe --tag | (cut -d'.' -f3) | (cut -d'-' -f1)) + 1)
RELEASE := v$(VERSION).$(BUILD)

lint:
	npx eslint 
@PHONY: lint

test:
	npx jest --detectOpenHandles --forceExit
@PHONY: test

upgrade:
	npm -g ls npm-check-updates | grep -c npm-check-updates || npm install -g npm-check-updates
	ncu -u &&	npm install --no-fund --no-audit
	cd example && ncu -u && npm install --no-fund --no-audit
@PHONY: upgrade

release:
	npm version --no-git-tag-version $(RELEASE)
	git add package.json
	git add package-lock.json
	git commit -m "chore(build): release $(RELEASE)"
	git push
	gh release create $(RELEASE) --title 'Release $(RELEASE)' --notes-file release/$(RELEASE).md
	git fetch --tags
.PHONY: release
