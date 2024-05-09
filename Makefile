.PHONY: network remove-network list-network start stop destroy volume build list link exe composer bun bun-upgrade bun-update

COMPOSE =sudo docker-compose
DOCKER = sudo docker
# Load .env file
DOCKER_PREFIX:= $(shell grep -E '^DOCKER_PREFIX' .env | cut -d '=' -f 2)
CONTAINER_NAME:= $(shell grep -E '^CONTAINER_NAME' .env | cut -d '=' -f 2)
BACKEND_OPENUI_PORT:= $(shell grep -E '^BACKEND_OPENUI_PORT' .env | cut -d '=' -f 2)
OLLAMA_OPENUI_PORT:= $(shell grep -E '^OLLAMA_OPENUI_PORT' .env | cut -d '=' -f 2)

# /*
# |--------------------------------------------------------------------------
# | docker cmds
# |--------------------------------------------------------------------------
# */
start:
	@$(COMPOSE) up -d

stop:
	@$(COMPOSE) down

destroy:
	@$(COMPOSE) rm -v -s -f

volume:
	@$(DOCKER) volume ls

build:
	@$(COMPOSE) build

list:
	@$(COMPOSE) ps -a

prune:
	@$(DOCKER) system prune -a

# /*
# |--------------------------------------------------------------------------
# | Utility cmds
# |--------------------------------------------------------------------------
# */
link:
	@echo "Creating URLs for services with '$(DOCKER_PREFIX)_' prefix..."
	@SERVER_IP=$$(hostname -I | cut -d' ' -f1); \
	echo "http://$$SERVER_IP:$(BACKEND_OPENUI_PORT)"; \
	echo "http://$$SERVER_IP:$(OLLAMA_OPENUI_PORT)";


exe-backend:
	@$(DOCKER) exec -it ${DOCKER_PREFIX}_${CONTAINER_NAME}_OPENUI_BACKEND /bin/bash

exe-ollama:
	@$(DOCKER) exec -it ${DOCKER_PREFIX}_${CONTAINER_NAME}_OPENUI_BACKEND /bin/bash

# Commands and their descriptions
help:
	@echo "Available commands:"
	@echo "  make start             - Starts the services"
	@echo "  make stop              - Stops the services"
	@echo "  make destroy           - Removes containers and volumes"
	@echo "  make volume            - Lists Docker volumes"
	@echo "  make build             - Builds the Docker containers"
	@echo "  make list              - Lists all Docker containers"
	@echo "  make link              - Creates URLs for services"
	@echo "  make exe-backend       - Executes a bash shell in the backend container"
	@echo "  make exe-ollama        - Executes a bash shell in the ollama container"
	@echo "  make help              - Displays this help message"
