@PHONY: lint install test update release

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
	cd example
	npx npm-check-updates -u
	npm install --no-fund --no-audit

release: test
	@if gh auth status >/dev/null 2>&1; then \
		npx standard-version; \
		git push --follow-tags; \
		gh release create $$(git describe --tags --abbrev=0) --notes-file CHANGELOG.md; \
	else \
		echo "GitHub CLI not authenticated. Run 'gh auth login' to create releases automatically."; \
		echo "You can manually create a release at: https://github.com/andrewmolyuk/eslint-plugin-vue-modular/releases/new"; \
	fi
