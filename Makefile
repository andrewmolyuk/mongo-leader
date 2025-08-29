@PHONY: lint install test update

install:
	npm install

lint:
	npx eslint . --fix
	npx markdownlint --fix "**/*.md" -i node_modules
	npx prettier --write "**/*.md" "**/*.json" "**/*.js" "**/*.cjs"

test: lint
	npx jest --detectOpenHandles --forceExit

update:
	npx npm-check-updates -u
	npm install --no-fund --no-audit
