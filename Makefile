.PHONY: up demo logs down clean

LAM_V2_DIR ?= ../lam/lam-v2
COMPOSE_FILES := -f compose.yml

ifneq (,$(wildcard $(LAM_V2_DIR)/Dockerfile))
COMPOSE_FILES += -f compose.local.yml
endif

COMPOSE := docker compose $(COMPOSE_FILES)

up:
	$(COMPOSE) up -d --build

demo: up
	$(COMPOSE) exec -T demo node /demo/hello-world.mjs

logs:
	$(COMPOSE) logs -f --tail=200

down:
	$(COMPOSE) down -v --remove-orphans

clean: down
	rm -rf data
