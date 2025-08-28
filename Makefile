@PHONY: lint install test update

install:
	npm install

lint:
	npx eslint . --fix
	npx markdownlint README.md --fix

test: lint
	npx jest --detectOpenHandles --forceExit

update:
	npx npm-check-updates -u
	npm install --no-fund --no-audit
