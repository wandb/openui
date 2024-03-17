# Build the virtualenv as a separate step: Only re-execute this step when pyproject.toml changes
FROM python:3.12-bookworm AS build-venv
COPY pyproject.toml /build/pyproject.toml
RUN python -m venv /venv && \
    /venv/bin/pip install --upgrade pip setuptools wheel && \
    mkdir -p /build/openui/util && touch /build/README.md
RUN /venv/bin/pip install --disable-pip-version-check /build

# Copy the virtualenv into a distroless image
FROM python:3.12-slim-bookworm
ENV PATH="/venv/bin:$PATH"
COPY --from=build-venv /venv /venv
COPY . /app
WORKDIR /app
RUN pip install --no-deps -U /app
ENTRYPOINT ["python", "-m", "openui"]