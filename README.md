# NexusOps

NexusOps is a CLI-first AWS DevOps automation project. It validates YAML, builds a sample FastAPI image locally, generates Terraform variables, and runs Terraform init, validation, and plan. Terraform supports optional S3 buckets and ECR repositories. Publishing an image to an existing ECR repository is a separate, confirmation-gated command. Jenkins, EKS provisioning, and monitoring are future work; their descriptive YAML fields do not currently provision those systems.

## Architecture

`run_nexusops.py` reads `nexusops.yaml`. The `build-image` command builds the configured local context and Dockerfile, deriving the image name and tag from the YAML. It never logs in to a registry or pushes an image. `push-ecr` is separate, requires ECR to be enabled, and prompts for the exact word `PUSH` before any registry operation. Terraform uses generated variables in `infrastructure/s3.tf` and `infrastructure/ecr.tf`.

The Terraform plan command saves a binary plan plus a freshness manifest. The manifest fingerprints the YAML, generated variables, all Terraform source files (including nested modules), provider lock file, and saved plan. `show-plan` and `apply` reject missing or stale plans. `apply` displays the exact saved plan before asking for the exact word `APPLY` and checks freshness again after the prompt.

## Requirements and setup on Windows

- Python 3.10 or newer
- Terraform 1.5 or newer on `PATH`
- Docker Desktop with the Docker CLI available for image builds
- AWS credentials for a real AWS-backed Terraform plan
- AWS CLI and a pre-existing ECR repository for `push-ecr`

Create a project-local Python environment and install the declared dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The CLI reports a setup command if PyYAML is missing. Use the project environment instead of machine-specific `site-packages` paths.

## YAML configuration

The sample `nexusops.yaml` includes these container settings:

```yaml
application:
  name: payment-api

container:
  tool: docker
  registry: ecr
  build_context: app/backend
  dockerfile: Dockerfile
  image_tag: latest

resources:
  s3:
    enabled: true
    bucket_name: nexusops-payment-api-hnair-demo-171026
  ecr:
    enabled: false
    repository_name: payment-api
    image_tag_mutability: IMMUTABLE
    scan_on_push: true
```

`container.image_name` is optional and defaults to `application.name`. The image tag defaults to `latest`. Build context paths are relative to the project, and the Dockerfile path is relative to the build context. S3 and ECR are independent. ECR supports `enabled`, `repository_name`, `image_tag_mutability` (`IMMUTABLE` or `MUTABLE`), and `scan_on_push`. ECR uses AES256 encryption and `force_delete = false`; with `enabled: false`, Terraform sets the repository count to zero.

## Build and run the sample API

The sample FastAPI app is in `app/backend` and exposes `GET /health`, which returns `{"status":"ok"}`. Build the configured image locally:

```powershell
.\.venv\Scripts\python.exe run_nexusops.py build-image
```

This builds an image such as `payment-api:latest` and does not push it. The empty Compose setup now provides an alternative way to build and run the same backend source:

```powershell
docker compose up --build
```

Visit `http://localhost:8000/health`. Stop with `Ctrl+C`, then run `docker compose down`.

## Safe Terraform workflow

```powershell
.\.venv\Scripts\python.exe run_nexusops.py validate
.\.venv\Scripts\python.exe run_nexusops.py generate
.\.venv\Scripts\python.exe run_nexusops.py plan
.\.venv\Scripts\python.exe run_nexusops.py show-plan
```

`plan` can contact AWS to refresh provider data but does not apply infrastructure. The sample config enables S3 and disables ECR. Applying a plan may create or change AWS resources. Never commit credentials, Terraform state, generated variable files, plan binaries, or plan manifests.

## Optional ECR push

`push-ecr` does not build an image or create an ECR repository. First enable ECR in `nexusops.yaml`, make sure that repository already exists, configure AWS CLI credentials for the right account and region, and build the image locally. Then run:

```powershell
.\.venv\Scripts\python.exe run_nexusops.py push-ecr
```

The command asks for the exact word `PUSH` before looking up the repository, logging Docker into ECR, tagging, or pushing. Any other input cancels without registry operations. A confirmed push can incur AWS image storage or data transfer charges.

## Tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Tests use temporary files and mocks for Docker, AWS, and Terraform commands. They do not build an image, contact AWS, push an image, or apply infrastructure.
