# NexusOps

NexusOps is a CLI-first AWS DevOps automation project with an optional local web UI. It validates YAML, builds a sample FastAPI image locally, generates Terraform variables, and runs Terraform init, validation, and plan. Terraform supports optional S3 buckets and ECR repositories. Publishing an image to an existing ECR repository is a separate, confirmation-gated command. `render-k8s` generates a Kubernetes Deployment and Service from the YAML; CI deploys them to a throwaway kind cluster. Jenkins, EKS provisioning, and monitoring are future work; the `infrastructure.provision`, `infrastructure.platform`, `ci_cd`, and `monitoring` YAML fields are descriptive only and are not read by the CLI.

## Architecture

`run_nexusops.py` is the only CLI entry point. It reads `nexusops.yaml`. The `build-image` command builds the configured local context and Dockerfile, deriving the image name and tag from the YAML. It never logs in to a registry or pushes an image. `push-ecr` is separate, requires ECR to be enabled, and prompts for the exact word `PUSH` before any registry operation. Terraform uses generated variables in `infrastructure/s3.tf` and `infrastructure/ecr.tf`.

The Terraform plan command saves a binary plan plus a freshness manifest. The manifest fingerprints the YAML, generated variables, any other `*.tfvars`/`*.tfvars.json` files in `infrastructure/` (Terraform auto-loads `terraform.tfvars` and `*.auto.tfvars`), all Terraform source files (including nested modules), provider lock file, and saved plan. `show-plan` and `apply` reject missing or stale plans. `apply` displays the exact saved plan before asking for the exact word `APPLY` and checks freshness again after the prompt.

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

`container.image_name` is optional and defaults to `application.name`. The image tag defaults to `latest`, but `validate` rejects `latest` when ECR is enabled with `IMMUTABLE` tags, because ECR would refuse the second push of the same tag. Use a unique tag such as a version or commit SHA. Build context paths are relative to the project, and the Dockerfile path is relative to the build context. S3 and ECR are independent. ECR supports `enabled`, `repository_name`, `image_tag_mutability` (`IMMUTABLE` or `MUTABLE`), and `scan_on_push`. ECR uses AES256 encryption and `force_delete = false`; with `enabled: false`, Terraform sets the repository count to zero. When S3 is enabled, the bucket also gets a full public access block, `BucketOwnerEnforced` object ownership (ACLs disabled), and AES256 default encryption, so a plan for the sample config proposes 4 resources.

## Build and run the sample API

The sample FastAPI app is in `app/backend` and exposes `GET /health`, which returns `{"status":"ok"}`. Build the configured image locally:

```powershell
.\.venv\Scripts\python.exe run_nexusops.py build-image
```

This builds an image such as `payment-api:latest` and does not push it. Docker's build output is shown live. The empty Compose setup now provides an alternative way to build and run the same backend source:

```powershell
docker compose up --build
```

Visit `http://localhost:8000/health`. Stop with `Ctrl+C`, then run `docker compose down`.

### Optional remote Terraform state

By default Terraform state stays in `infrastructure/` on your machine. To keep it in an existing S3 bucket with state locking, add:

```yaml
terraform:
  backend:
    bucket: my-terraform-state-bucket   # must already exist
    key: nexusops/payment-api.tfstate
    region: ap-south-1                   # optional, defaults to infrastructure.region
    use_lockfile: true                   # optional, default true; needs Terraform 1.10+
```

`generate`, `plan` and `destroy` then write `infrastructure/backend.tf.json` (gitignored) with encryption turned on, and remove it again when the section is deleted. If state already exists in the other location, run `terraform init -migrate-state` in `infrastructure/` once.

## Safe Terraform workflow

```powershell
.\.venv\Scripts\python.exe run_nexusops.py validate
.\.venv\Scripts\python.exe run_nexusops.py generate
.\.venv\Scripts\python.exe run_nexusops.py plan
.\.venv\Scripts\python.exe run_nexusops.py show-plan
```

To delete everything NexusOps created:

```powershell
.\.venv\Scripts\python.exe run_nexusops.py destroy
```

`destroy` saves a destroy plan, shows it, and asks for the exact word `DESTROY`. It checks again that no inputs changed while it waited, applies exactly that plan, and then invalidates any saved create plan. A non-empty S3 bucket or ECR repository makes the destroy fail instead of deleting data.

`plan` can contact AWS to refresh provider data but does not apply infrastructure. The sample config enables S3 and disables ECR. Applying a plan may create or change AWS resources. Never commit credentials, Terraform state, generated variable files, plan binaries, or plan manifests.

## Optional ECR push

`push-ecr` does not build an image or create an ECR repository. First enable ECR in `nexusops.yaml`, make sure that repository already exists, configure AWS CLI credentials for the right account and region, and build the image locally. Then run:

```powershell
.\.venv\Scripts\python.exe run_nexusops.py push-ecr
```

The command asks for the exact word `PUSH` before looking up the repository, logging Docker into ECR, tagging, or pushing. Any other input cancels without registry operations. A confirmed push can incur AWS image storage or data transfer charges.

## Kubernetes manifests

```powershell
.\.venv\Scripts\python.exe run_nexusops.py render-k8s
```

This writes `build/kubernetes/manifests.yaml` (gitignored) and never contacts a cluster. It contains:

- A Deployment using the configured image (`container.image_name:image_tag`) and `deployment.replicas` (an integer from 1 to 20, default 1), with `imagePullPolicy: IfNotPresent`, readiness and liveness probes on `/health`, CPU/memory requests and limits, and a hardened security context: non-root UID 10001 matching the Dockerfile, no privilege escalation, all capabilities dropped, read-only root filesystem with an `emptyDir` at `/tmp`, RuntimeDefault seccomp, and no service-account token.
- A ClusterIP Service on port 80 forwarding to the container's `http` port.

The Deployment uses the local image name by default, which only works on clusters that already have the image (such as kind). For a real cluster, set `deployment.image` to the full registry image, for example `123456789012.dkr.ecr.ap-south-1.amazonaws.com/payment-api:v1`. It must include a tag or digest. `render-k8s` prints a reminder when ECR is enabled and `deployment.image` is not set.

`application.name` must be a DNS-1123 label (for example `payment-api`) to render manifests. Applying them to a real cluster is a manual step, for example `kubectl apply -f build/kubernetes/manifests.yaml` against a context you have chosen deliberately. Prefer an immutable image tag over `latest` for real deployments.

## Web UI

A local website for people who prefer not to use the terminal. It runs only on your machine (`127.0.0.1`), uses your own configuration files, and can only do safe things: edit and validate `nexusops.yaml`, generate Terraform variables, render Kubernetes manifests, and show the saved plan. Planning, applying, building and pushing stay in the CLI with their typed confirmations; the UI shows the exact command to run.

Build the frontend once (requires Node.js 24), then start the server:

```powershell
cd webui\frontend
npm ci
npm run build
cd ..\..
.\.venv\Scripts\python.exe run_nexusops.py ui
```

Open `http://127.0.0.1:8765`. The header has two independent toggles: light/dark theme and **3D / Lite**. 3D mode shows the pipeline as an animated scene that the camera flies through between pages. Lite mode has the same pages and theme without 3D and never downloads the 3D code or models, for slower devices. The site starts in 3D, suggests Lite if the frame rate stays low, and uses Lite automatically when WebGL is unavailable. Both choices are remembered in the browser.

Saving the configuration updates `nexusops.yaml` in place, keeping comments and the order of unchanged settings, and keeps the previous file as `nexusops.yaml.bak`. Invalid settings are never written.

The server rejects requests from other websites (Origin check) and other host names, sends a strict Content-Security-Policy, and has no endpoints for plan, apply, build or push.

For frontend development, run `npm run dev` in `webui/frontend` while `run_nexusops.py ui` is running; Vite proxies `/api` to it. The 3D models in `public/models` are generated by `npm run build:models` from `scripts/build-models.mjs`. To replace one with your own Blender export, keep the file name and name its meshes `body`, `accent` and `glow`.

## Tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Tests use temporary files and mocks for Docker, AWS, and Terraform commands. They do not build an image, contact AWS, push an image, or apply infrastructure. Web UI tests run with `npm test` in `webui/frontend`.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

- **Python**: installs `requirements.txt`, compiles sources, runs the unit tests, and runs `validate` and `generate`.
- **Terraform**: `fmt -check`, `init -backend=false` against the committed lock file, and `validate`.
- **Web UI**: `npm ci`, checks the 3D models (presence, size, triangle count, mesh names), runs the Vitest suite, and builds the frontend, failing if three.js leaks into the initial bundle that Lite mode loads.
- **Docker**: `docker compose config`, `run_nexusops.py build-image`, then runs the container and requires `GET /health` to return `{"status":"ok"}` and Docker's `HEALTHCHECK` to report `healthy`.
- **Security scanning**: installs Trivy from its release tarball, verified against a SHA-256 pinned in the workflow, then fails the build on fixable HIGH/CRITICAL image vulnerabilities (`trivy image --ignore-unfixed`) and on HIGH/CRITICAL misconfigurations in Terraform, the Dockerfile, Compose, and the rendered Kubernetes manifests (`trivy config`).
- **Kubernetes**: installs checksum-pinned kind and kubectl, creates an ephemeral kind cluster from a digest-pinned node image, loads the locally built image, applies the rendered manifests, then requires the rollout to finish, the ready replica count to equal `deployment.replicas`, and `/health` to answer through the Service. Every `kubectl` command targets the `kind-nexusops` context explicitly, and a unit test enforces this. No cloud cluster is involved.

Accepted risks are listed in `.trivyignore` with a reason. Currently the only entry is AWS-0132: the optional S3 bucket uses SSE-S3 (AES256) rather than a customer-managed KMS key, to avoid KMS charges for a demo bucket.

The workflow has read-only repository permissions and uses no secrets or AWS credentials. It never runs `plan`, `apply`, `destroy`, or `push-ecr`; a unit test fails if those operations are added to it.
