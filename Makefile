.PHONY: up demo logs down clean

LOCAL_LAM_DIR ?= $(LAM_V2_DIR)
LOCAL_LAM_DIR ?= ../lam/lam-v2
COMPOSE_FILES := -f compose.yml

ifneq (,$(wildcard $(LOCAL_LAM_DIR)/Dockerfile))
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
