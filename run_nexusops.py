"""NexusOps configuration and guarded Terraform workflow."""

import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path, PurePosixPath, PureWindowsPath

try:
    import yaml
except ModuleNotFoundError:
    yaml = None


PROJECT_ROOT = Path(__file__).resolve().parent
TERRAFORM_DIR = PROJECT_ROOT / "infrastructure"
CONFIG_FILE = PROJECT_ROOT / "nexusops.yaml"
VARIABLES_FILE = TERRAFORM_DIR / "terraform.tfvars.json"
PLAN_FILE = TERRAFORM_DIR / "nexusops.tfplan"
PLAN_MANIFEST = TERRAFORM_DIR / "nexusops.tfplan.json"
DEFAULT_BUILD_CONTEXT = "app/backend"
DEFAULT_DOCKERFILE = "Dockerfile"
KUBERNETES_DIR = PROJECT_ROOT / "build" / "kubernetes"
DEFAULT_REPLICAS = 1
MAX_REPLICAS = 20
CONTAINER_PORT = 8000
# Must match the non-root USER in app/backend/Dockerfile.
CONTAINER_UID = 10001
# Generated from nexusops.yaml when terraform.backend is set; removed otherwise.
BACKEND_FILE = TERRAFORM_DIR / "backend.tf.json"
DESTROY_PLAN_FILE = TERRAFORM_DIR / "nexusops-destroy.tfplan"
_NAME_COMPONENT = r"[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*"
# registry[:port]/path[:tag][@sha256:digest], requiring a tag or a digest so "latest" is never implied.
IMAGE_REFERENCE = re.compile(
    rf"(?:[A-Za-z0-9.-]+(?::[0-9]+)?/)?{_NAME_COMPONENT}(?:/{_NAME_COMPONENT})*"
    r"(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}(?:@sha256:[a-f0-9]{64})?|@sha256:[a-f0-9]{64})"
)


def _is_anchored_path(value):
    """Reject absolute paths in both styles so the same YAML validates on Windows and Linux CI."""
    return bool(PureWindowsPath(value).anchor or PurePosixPath(value).anchor)


def load_config(path=None):
    """Load the NexusOps YAML configuration as a mapping."""
    if yaml is None:
        raise ValueError(
            "PyYAML is required. Activate the project environment and run "
            "'python -m pip install -r requirements.txt'."
        )
    try:
        with Path(path or CONFIG_FILE).open("r", encoding="utf-8") as file:
            config = yaml.safe_load(file)
    except yaml.YAMLError as error:
        raise ValueError(f"Invalid YAML syntax: {error}") from error
    except OSError as error:
        raise ValueError(f"Could not read configuration: {error}") from error

    if not isinstance(config, dict):
        raise ValueError("Configuration must be a YAML mapping.")
    return config


def save_config(config, path=None):
    """Write configuration only if it validates; return validation errors otherwise."""
    if yaml is None:
        raise ValueError("PyYAML is required to save the configuration.")
    errors = validate_config(config)
    if errors:
        return errors
    path = Path(path or CONFIG_FILE)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(_dump_preserving_comments(path, config), encoding="utf-8")
    if path.exists():
        shutil.copy2(path, path.with_name(path.name + ".bak"))
    os.replace(temporary, path)
    return []


def _merge_into(target, source):
    """Update a round-trip mapping in place so unchanged keys keep their comments and layout."""
    for key in [each for each in target if each not in source]:
        del target[key]
    for key, value in source.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _merge_into(target[key], value)
        elif key not in target or target[key] != value or type(target[key]) is not type(value):
            target[key] = value


def _dump_preserving_comments(path, config):
    """Serialize config, keeping comments from the existing file when ruamel.yaml is available."""
    try:
        from ruamel.yaml import YAML
        from ruamel.yaml.error import YAMLError as RoundTripError
    except ModuleNotFoundError:
        return yaml.safe_dump(config, sort_keys=False, allow_unicode=True)
    round_trip = YAML()
    round_trip.preserve_quotes = True
    round_trip.width = 4096
    document = None
    if path.is_file():
        try:
            document = round_trip.load(path.read_text(encoding="utf-8"))
        except (RoundTripError, OSError, ValueError):
            document = None
    if isinstance(document, dict):
        _merge_into(document, config)
    else:
        document = config
    stream = io.StringIO()
    round_trip.dump(document, stream)
    return stream.getvalue()


def validate_config(config):
    """Validate required NexusOps, Terraform, and container settings."""
    errors = []
    application = config.get("application")
    infrastructure = config.get("infrastructure")
    resources = config.get("resources", {})

    if not isinstance(application, dict):
        errors.append("'application' must be a YAML mapping.")
    elif not isinstance(application.get("name"), str) or not application["name"].strip():
        errors.append("A valid application.name is required.")

    if not isinstance(infrastructure, dict):
        errors.append("'infrastructure' must be a YAML mapping.")
    else:
        if infrastructure.get("provider") != "aws":
            errors.append("NexusOps currently supports AWS only.")
        region = infrastructure.get("region")
        if not isinstance(region, str) or not region.strip():
            errors.append("A valid infrastructure.region is required.")

    if not isinstance(resources, dict):
        errors.append("'resources' must be a YAML mapping.")
    else:
        s3 = resources.get("s3", {})
        if not isinstance(s3, dict):
            errors.append("'resources.s3' must be a YAML mapping.")
        else:
            enabled = s3.get("enabled", False)
            if not isinstance(enabled, bool):
                errors.append("'resources.s3.enabled' must be true or false.")
            elif enabled:
                name = s3.get("bucket_name")
                if not isinstance(name, str) or not name.strip():
                    errors.append("A bucket_name is required when S3 is enabled.")
                elif not _is_bucket_name(name):
                    errors.append("S3 bucket_name must be 3-63 lowercase letters, digits, dots, or hyphens.")

        ecr = resources.get("ecr", {})
        if not isinstance(ecr, dict):
            errors.append("'resources.ecr' must be a YAML mapping.")
        else:
            supported_ecr_keys = {
                "enabled", "repository_name", "image_tag_mutability", "scan_on_push"
            }
            for key in sorted(set(ecr) - supported_ecr_keys):
                errors.append(f"Unsupported 'resources.ecr' option: {key}.")

            ecr_enabled = ecr.get("enabled", False)
            if not isinstance(ecr_enabled, bool):
                errors.append("'resources.ecr.enabled' must be true or false.")

            repository_name = ecr.get("repository_name", "")
            if not isinstance(repository_name, str):
                errors.append("'resources.ecr.repository_name' must be a string.")
            elif ecr_enabled and not repository_name:
                errors.append("A repository_name is required when ECR is enabled.")
            elif repository_name and (
                len(repository_name) > 256
                or not re.fullmatch(r"[a-z0-9]+(?:[._/-][a-z0-9]+)*", repository_name)
            ):
                errors.append(
                    "ECR repository_name must use lowercase letters, digits, '.', '_', '-', or '/', "
                    "with nonempty segments and a maximum length of 256."
                )

            mutability = ecr.get("image_tag_mutability", "IMMUTABLE")
            if not isinstance(mutability, str) or mutability not in {"MUTABLE", "IMMUTABLE"}:
                errors.append("'resources.ecr.image_tag_mutability' must be MUTABLE or IMMUTABLE.")
            scan_on_push = ecr.get("scan_on_push", True)
            if not isinstance(scan_on_push, bool):
                errors.append("'resources.ecr.scan_on_push' must be true or false.")

    container = config.get("container", {})
    if not isinstance(container, dict):
        errors.append("'container' must be a YAML mapping.")
    else:
        if container.get("tool", "docker") != "docker":
            errors.append("NexusOps currently supports Docker for container builds.")
        if container.get("registry", "ecr") != "ecr":
            errors.append("NexusOps currently supports ECR for registry pushes.")

        image_name = container.get("image_name", application.get("name") if isinstance(application, dict) else "")
        if not isinstance(image_name, str) or not re.fullmatch(
            r"[a-z0-9]+(?:[._/-][a-z0-9]+)*", image_name
        ):
            errors.append("'container.image_name' must be a lowercase Docker image name.")

        image_tag = container.get("image_tag", "latest")
        if not isinstance(image_tag, str) or not re.fullmatch(
            r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}", image_tag
        ):
            errors.append("'container.image_tag' must be a valid Docker tag of at most 128 characters.")
        elif image_tag == "latest" and _ecr_settings(config).get("enabled") is True \
                and _ecr_settings(config).get("image_tag_mutability", "IMMUTABLE") == "IMMUTABLE":
            # ECR rejects a second push of an existing tag when tags are immutable.
            errors.append(
                "'container.image_tag' cannot be 'latest' while ECR uses IMMUTABLE tags, because the "
                "second push would be rejected. Use a unique tag such as a version or commit SHA, "
                "or set resources.ecr.image_tag_mutability to MUTABLE."
            )

        build_context = container.get("build_context", DEFAULT_BUILD_CONTEXT)
        if not isinstance(build_context, str) or not build_context.strip() or _is_anchored_path(build_context):
            errors.append("'container.build_context' must be a relative project path.")

        dockerfile = container.get("dockerfile", DEFAULT_DOCKERFILE)
        if not isinstance(dockerfile, str) or not dockerfile.strip() or _is_anchored_path(dockerfile):
            errors.append("'container.dockerfile' must be a relative path inside the build context.")

    deployment = config.get("deployment", {})
    if not isinstance(deployment, dict):
        errors.append("'deployment' must be a YAML mapping.")
    else:
        replicas = deployment.get("replicas", DEFAULT_REPLICAS)
        if isinstance(replicas, bool) or not isinstance(replicas, int) or not 1 <= replicas <= MAX_REPLICAS:
            errors.append(f"'deployment.replicas' must be an integer from 1 to {MAX_REPLICAS}.")
        image = deployment.get("image")
        if image not in (None, "") and (not isinstance(image, str) or not IMAGE_REFERENCE.fullmatch(image)):
            errors.append(
                "'deployment.image' must be a full image reference with a tag or digest, for example "
                "123456789012.dkr.ecr.ap-south-1.amazonaws.com/payment-api:v1."
            )

    errors.extend(_backend_errors(config.get("terraform", {})))
    return errors


def _is_bucket_name(name):
    return (
        3 <= len(name) <= 63
        and re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", name) is not None
        and ".." not in name
        and re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", name) is None
    )


def _backend_errors(terraform):
    """Validate the optional S3 remote state backend under terraform.backend."""
    if not isinstance(terraform, dict):
        return ["'terraform' must be a YAML mapping."]
    errors = [f"Unsupported 'terraform' option: {key}." for key in sorted(set(terraform) - {"backend"})]
    backend = terraform.get("backend")
    if backend is None:
        return errors
    if not isinstance(backend, dict):
        return errors + ["'terraform.backend' must be a YAML mapping."]
    errors += [
        f"Unsupported 'terraform.backend' option: {key}."
        for key in sorted(set(backend) - {"bucket", "key", "region", "use_lockfile"})
    ]
    bucket = backend.get("bucket")
    if not isinstance(bucket, str) or not _is_bucket_name(bucket):
        errors.append("'terraform.backend.bucket' must be an existing S3 bucket name for Terraform state.")
    key = backend.get("key")
    if not isinstance(key, str) or not key.strip() or key.startswith("/") or len(key) > 1024:
        errors.append("'terraform.backend.key' must be a relative object key such as nexusops/terraform.tfstate.")
    region = backend.get("region")
    if region is not None and (not isinstance(region, str) or not re.fullmatch(r"[a-z]{2}(?:-[a-z]+)+-\d+", region)):
        errors.append("'terraform.backend.region' must be an AWS region such as ap-south-1.")
    if not isinstance(backend.get("use_lockfile", True), bool):
        errors.append("'terraform.backend.use_lockfile' must be true or false.")
    return errors


def _ecr_settings(config):
    resources = config.get("resources")
    ecr = resources.get("ecr") if isinstance(resources, dict) else None
    return ecr if isinstance(ecr, dict) else {}


def terraform_variables(config):
    """Build Terraform input variables from validated NexusOps YAML."""
    infrastructure = config["infrastructure"]
    resources = config.get("resources", {})
    s3 = resources.get("s3", {})
    ecr = resources.get("ecr", {})
    return {
        "aws_region": infrastructure["region"],
        "s3_enabled": s3.get("enabled", False),
        "s3_bucket_name": s3.get("bucket_name", ""),
        "application_name": config["application"]["name"],
        "ecr_enabled": ecr.get("enabled", False),
        "ecr_repository_name": ecr.get("repository_name", ""),
        "ecr_image_tag_mutability": ecr.get("image_tag_mutability", "IMMUTABLE"),
        "ecr_scan_on_push": ecr.get("scan_on_push", True),
    }


def generate_terraform_variables(config, output_file=None):
    """Write Terraform input variables generated from NexusOps YAML."""
    variables = terraform_variables(config)
    output_file = Path(output_file or VARIABLES_FILE)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(variables, indent=2) + "\n", encoding="utf-8")
    print(f"Generated Terraform variables: {output_file}")


def write_backend_config(config, output_file=None):
    """Write the S3 state backend from terraform.backend, or remove it so state stays local."""
    output_file = Path(output_file or BACKEND_FILE)
    backend = config.get("terraform", {}).get("backend")
    if not backend:
        if output_file.exists():
            output_file.unlink()
            print(f"Removed {output_file.name}; Terraform state is local. "
                  "Run 'terraform init -migrate-state' in infrastructure/ to move existing state.")
        return None
    settings = {
        "bucket": backend["bucket"],
        "key": backend["key"],
        "region": backend.get("region") or config["infrastructure"]["region"],
        "encrypt": True,
        "use_lockfile": backend.get("use_lockfile", True),
    }
    document = {"terraform": {"backend": {"s3": settings}}}
    text = json.dumps(document, indent=2) + "\n"
    if output_file.is_file() and output_file.read_text(encoding="utf-8") == text:
        return output_file
    output_file.write_text(text, encoding="utf-8")
    print(f"Generated Terraform S3 backend: {output_file} (s3://{settings['bucket']}/{settings['key']}). "
          "If state already exists elsewhere, run 'terraform init -migrate-state' in infrastructure/.")
    return output_file


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _input_fingerprints():
    """Hash configuration and Terraform inputs, excluding provider cache/state."""
    candidates = [CONFIG_FILE, VARIABLES_FILE]
    candidates.extend(TERRAFORM_DIR.rglob("*.tf"))
    candidates.extend(TERRAFORM_DIR.rglob("*.tf.json"))
    # Terraform auto-loads terraform.tfvars[.json] and *.auto.tfvars[.json] from the root module.
    candidates.extend(TERRAFORM_DIR.glob("*.tfvars"))
    candidates.extend(TERRAFORM_DIR.glob("*.tfvars.json"))
    lock_file = TERRAFORM_DIR / ".terraform.lock.hcl"
    if lock_file.exists():
        candidates.append(lock_file)
    return {
        path.relative_to(PROJECT_ROOT).as_posix(): _sha256(path)
        for path in sorted(set(candidates))
        if path.is_file()
    }


def _write_plan_manifest():
    manifest = {
        "format": 1,
        "plan_sha256": _sha256(PLAN_FILE),
        "inputs": _input_fingerprints(),
    }
    PLAN_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def plan_freshness_error(plan_file=None, manifest_file=None):
    """Return a human-readable reason when the saved plan is missing/stale."""
    plan_file = Path(plan_file or PLAN_FILE)
    manifest_file = Path(manifest_file or PLAN_MANIFEST)
    if not plan_file.is_file():
        return "No saved plan found. Run 'python run_nexusops.py plan' first."
    if not manifest_file.is_file():
        return "Saved plan has no freshness metadata. Recreate it with 'python run_nexusops.py plan'."
    try:
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "Saved plan freshness metadata is unreadable. Recreate the plan."
    if not isinstance(manifest, dict):
        return "Saved plan freshness metadata is invalid. Recreate the plan."
    if manifest.get("format") != 1:
        return "Saved plan freshness metadata uses an unsupported format. Recreate the plan."
    if not isinstance(manifest.get("inputs"), dict):
        return "Saved plan freshness metadata is invalid. Recreate the plan."
    if manifest.get("plan_sha256") != _sha256(plan_file):
        return "Saved plan contents changed after creation. Recreate the plan."
    try:
        current = _input_fingerprints()
    except OSError as error:
        return f"Could not verify plan inputs: {error}"
    if manifest.get("inputs") != current:
        return "Terraform inputs changed since this plan was created. Recreate the plan."
    return None


def run_terraform(*arguments):
    """Run Terraform without a shell and report command failures."""
    command = ["terraform", f"-chdir={TERRAFORM_DIR}", *map(str, arguments)]
    print(f"\n> terraform {' '.join(map(str, arguments))}")
    try:
        result = subprocess.run(command, cwd=PROJECT_ROOT, check=False)
    except OSError as error:
        raise RuntimeError(f"Could not start Terraform: {error}") from error
    if result.returncode != 0:
        raise RuntimeError(f"Terraform command failed with exit code {result.returncode}.")


def saved_plan_text():
    """Return the saved plan as plain text; refuses missing or stale plans."""
    error = plan_freshness_error()
    if error:
        raise ValueError(error)
    command = ["terraform", f"-chdir={TERRAFORM_DIR}", "show", "-no-color", str(PLAN_FILE)]
    try:
        result = subprocess.run(
            command, cwd=PROJECT_ROOT, check=False, capture_output=True,
            text=True, encoding="utf-8", errors="replace",
        )
    except OSError as error:
        raise RuntimeError(f"Could not start Terraform: {error}") from error
    if result.returncode != 0:
        detail = (result.stderr or "").strip()
        raise RuntimeError(f"Terraform show failed with exit code {result.returncode}. {detail}".strip())
    return result.stdout


def docker_image_reference(config):
    """Return the configured local image name and tag."""
    container = config.get("container", {})
    image_name = container.get("image_name", config["application"]["name"])
    image_tag = container.get("image_tag", "latest")
    return f"{image_name}:{image_tag}"


def _docker_build_arguments(config):
    """Build Docker CLI arguments from validated YAML and project-local paths."""
    container = config.get("container", {})
    context_value = container.get("build_context", DEFAULT_BUILD_CONTEXT)
    dockerfile_value = container.get("dockerfile", DEFAULT_DOCKERFILE)
    project_root = PROJECT_ROOT.resolve()
    context = (project_root / context_value).resolve()
    dockerfile = (context / dockerfile_value).resolve()

    try:
        context.relative_to(project_root)
        dockerfile.relative_to(context)
    except ValueError as error:
        raise ValueError("Docker build context and Dockerfile must stay inside the project build context.") from error

    if not context.is_dir():
        raise ValueError(f"Docker build context directory does not exist: {context}")
    if not dockerfile.is_file():
        raise ValueError(f"Dockerfile does not exist: {dockerfile}")

    return ["build", "--file", dockerfile, "--tag", docker_image_reference(config), context]


def run_docker(*arguments, stream=False):
    """Run Docker and report missing CLI or build/push failures clearly.

    With stream=True, output goes straight to the terminal so long builds and pushes show progress.
    """
    command = ["docker", *map(str, arguments)]
    print(f"\n> {' '.join(command)}", flush=True)
    try:
        if stream:
            result = subprocess.run(command, cwd=PROJECT_ROOT, check=False)
        else:
            result = subprocess.run(
                command, cwd=PROJECT_ROOT, check=False, capture_output=True,
                text=True, encoding="utf-8", errors="replace",
            )
    except OSError as error:
        raise RuntimeError(f"Could not start Docker. Install Docker Desktop and ensure docker is on PATH: {error}") from error
    if stream:
        if result.returncode != 0:
            raise RuntimeError(f"Docker command failed with exit code {result.returncode}. See the output above.")
        return
    output = (result.stdout or "").strip()
    detail = (result.stderr or "").strip()
    if output:
        print(output)
    if detail:
        print(detail, file=sys.stderr)
    if result.returncode != 0:
        message = f"Docker command failed with exit code {result.returncode}."
        if detail:
            message += f" {detail}"
        elif output:
            message += f" {output}"
        raise RuntimeError(message)


def build_docker_image(config):
    """Build a local image; this does not authenticate to or push to a registry."""
    arguments = _docker_build_arguments(config)
    run_docker(*arguments, stream=True)
    image = docker_image_reference(config)
    print(f"Docker image built locally: {image}")
    return image


def kubernetes_manifests(config):
    """Build a Deployment and Service for the configured image without contacting a cluster."""
    name = config["application"]["name"]
    if len(name) > 63 or not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", name):
        raise ValueError(
            "application.name must be a lowercase DNS-1123 label of at most 63 characters "
            "to render Kubernetes manifests."
        )
    deployment_settings = config.get("deployment", {})
    replicas = deployment_settings.get("replicas", DEFAULT_REPLICAS)
    # deployment.image points real clusters at a registry (for example ECR); the local name suits kind.
    image = deployment_settings.get("image") or docker_image_reference(config)
    selector = {"app.kubernetes.io/name": name}
    labels = {**selector, "app.kubernetes.io/managed-by": "nexusops"}

    def health_probe(initial_delay, period):
        return {
            "httpGet": {"path": "/health", "port": "http"},
            "initialDelaySeconds": initial_delay,
            "periodSeconds": period,
            "timeoutSeconds": 2,
        }

    deployment = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": name, "labels": labels},
        "spec": {
            "replicas": replicas,
            "selector": {"matchLabels": selector},
            "template": {
                "metadata": {"labels": labels},
                "spec": {
                    "automountServiceAccountToken": False,
                    "securityContext": {
                        "runAsNonRoot": True,
                        "runAsUser": CONTAINER_UID,
                        "runAsGroup": CONTAINER_UID,
                        "seccompProfile": {"type": "RuntimeDefault"},
                    },
                    "containers": [{
                        "name": "app",
                        "image": image,
                        # A "latest" tag defaults to Always, which cannot use images preloaded into kind.
                        "imagePullPolicy": "IfNotPresent",
                        "ports": [{"name": "http", "containerPort": CONTAINER_PORT}],
                        "readinessProbe": health_probe(2, 5),
                        "livenessProbe": health_probe(10, 10),
                        "resources": {
                            "requests": {"cpu": "50m", "memory": "64Mi"},
                            "limits": {"cpu": "500m", "memory": "256Mi"},
                        },
                        "securityContext": {
                            "allowPrivilegeEscalation": False,
                            "readOnlyRootFilesystem": True,
                            "capabilities": {"drop": ["ALL"]},
                        },
                        "volumeMounts": [{"name": "tmp", "mountPath": "/tmp"}],
                    }],
                    "volumes": [{"name": "tmp", "emptyDir": {}}],
                },
            },
        },
    }
    service = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": name, "labels": labels},
        "spec": {
            "type": "ClusterIP",
            "selector": selector,
            "ports": [{"name": "http", "port": 80, "targetPort": "http"}],
        },
    }
    return [deployment, service]


def write_kubernetes_manifests(config, output_file=None):
    """Write rendered manifests; applying them to a cluster is a separate, manual step."""
    output_file = Path(output_file or KUBERNETES_DIR / "manifests.yaml")
    documents = kubernetes_manifests(config)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(yaml.safe_dump_all(documents, sort_keys=False), encoding="utf-8")
    print(f"Rendered Kubernetes manifests: {output_file}")
    if _ecr_settings(config).get("enabled") is True and not config.get("deployment", {}).get("image"):
        print("NOTE: The manifests use the local image name, which only works on clusters that already "
              "have it (such as kind). Set deployment.image to the ECR image URI for a real cluster.")
    return output_file


def _run_aws_capture(*arguments):
    """Run AWS CLI and return stdout without logging potentially sensitive output."""
    command = ["aws", *map(str, arguments)]
    try:
        result = subprocess.run(
            command, cwd=PROJECT_ROOT, check=False, capture_output=True, text=True
        )
    except OSError as error:
        raise RuntimeError(f"Could not start AWS CLI. Install AWS CLI and ensure aws is on PATH: {error}") from error
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"AWS command failed with exit code {result.returncode}: {detail}")
    return result.stdout.strip()


def push_ecr_image(config, *, confirmed=False):
    """Push an already-built local image to the configured, existing ECR repository."""
    if not confirmed:
        raise ValueError("An explicit PUSH confirmation is required before ECR operations.")
    resources = config.get("resources", {})
    ecr = resources.get("ecr", {})
    if not ecr.get("enabled", False):
        raise ValueError("ECR push is disabled. Set resources.ecr.enabled to true first.")
    if config.get("container", {}).get("registry", "ecr") != "ecr":
        raise ValueError("The configured container registry is not ECR.")

    repository_name = ecr["repository_name"]
    region = config["infrastructure"]["region"]
    image = docker_image_reference(config)
    run_docker("image", "inspect", "--format", "{{.Id}}", image)
    repository_uri = _run_aws_capture(
        "ecr", "describe-repositories", "--repository-names", repository_name,
        "--region", region, "--query", "repositories[0].repositoryUri", "--output", "text",
    )
    if not repository_uri or repository_uri == "None":
        raise RuntimeError(f"ECR repository '{repository_name}' was not found in {region}.")

    registry_host = repository_uri.split("/", 1)[0]
    password = _run_aws_capture("ecr", "get-login-password", "--region", region)
    if not password:
        raise RuntimeError("AWS CLI returned an empty ECR login token.")

    try:
        login = subprocess.run(
            ["docker", "login", "--username", "AWS", "--password-stdin", registry_host],
            cwd=PROJECT_ROOT, input=password, check=False, capture_output=True, text=True,
        )
    except OSError as error:
        raise RuntimeError(f"Could not start Docker for ECR login: {error}") from error
    if login.returncode != 0:
        detail = (login.stderr or login.stdout or "").strip()
        raise RuntimeError(f"Docker ECR login failed with exit code {login.returncode}: {detail}")

    remote_image = f"{repository_uri}:{config.get('container', {}).get('image_tag', 'latest')}"
    run_docker("tag", image, remote_image)
    run_docker("push", remote_image, stream=True)
    print(f"Pushed Docker image to ECR: {remote_image}")
    return remote_image


def _destroy():
    """Plan a destroy, show it, require DESTROY, then apply exactly that saved destroy plan."""
    DESTROY_PLAN_FILE.unlink(missing_ok=True)
    try:
        run_terraform("init", "-input=false")
        run_terraform("plan", "-destroy", "-input=false", "-out", DESTROY_PLAN_FILE)
        snapshot = (_sha256(DESTROY_PLAN_FILE), _input_fingerprints())
        run_terraform("show", DESTROY_PLAN_FILE)
        print("\nWARNING: This permanently deletes the AWS resources listed above.")
        print("A non-empty S3 bucket or ECR repository will make the destroy fail rather than delete data.")
        try:
            confirmation = input("Type DESTROY to delete these resources, or anything else to cancel: ")
        except EOFError:
            print("Destroy cancelled because no confirmation was received.")
            return 1
        if confirmation != "DESTROY":
            print("Destroy cancelled. No infrastructure was changed.")
            return 0
        if (_sha256(DESTROY_PLAN_FILE), _input_fingerprints()) != snapshot:
            print("ERROR: Terraform inputs changed while waiting for confirmation. Run destroy again.")
            return 1
        run_terraform("apply", "-input=false", DESTROY_PLAN_FILE)
        # Any saved create/update plan described the old state; refuse to apply it afterwards.
        PLAN_MANIFEST.unlink(missing_ok=True)
        print("Terraform destroy completed.")
        return 0
    finally:
        DESTROY_PLAN_FILE.unlink(missing_ok=True)


def _check_plan_freshness():
    error = plan_freshness_error()
    if error:
        print(f"ERROR: {error}")
        return False
    return True


def main(argv=None):
    """Run a NexusOps command."""
    allowed = {
        "validate", "generate", "plan", "show-plan", "apply", "destroy", "build-image", "push-ecr",
        "render-k8s", "ui",
    }
    args = sys.argv[1:] if argv is None else argv
    command = args[0] if args else "validate"
    if len(args) > 1 or command not in allowed:
        print("Usage: python run_nexusops.py "
              "[validate|generate|plan|show-plan|apply|destroy|build-image|push-ecr|render-k8s|ui]")
        return 2

    if command == "ui":
        # Started before config validation so an invalid config can be fixed in the UI.
        from webui.server import serve
        return serve()

    try:
        config = load_config()
        errors = validate_config(config)
        if errors:
            print("NexusOps configuration validation FAILED:")
            for error in errors:
                print(f"  - {error}")
            return 1
        print("NexusOps configuration validation PASSED!")

        if command == "validate":
            return 0
        if command == "render-k8s":
            write_kubernetes_manifests(config)
            return 0
        if command == "build-image":
            build_docker_image(config)
            return 0
        if command == "push-ecr":
            if not config.get("resources", {}).get("ecr", {}).get("enabled", False):
                print("ERROR: ECR push is disabled. Set resources.ecr.enabled to true first.")
                return 1
            try:
                confirmation = input("This will push an image to AWS ECR. Type PUSH to continue: ")
            except EOFError:
                print("ECR push cancelled because no confirmation was received.")
                return 1
            if confirmation != "PUSH":
                print("ECR push cancelled. No image was pushed.")
                return 0
            push_ecr_image(config, confirmed=True)
            return 0
        if command in {"show-plan", "apply"}:
            if not _check_plan_freshness():
                return 1
            if command == "show-plan":
                run_terraform("show", PLAN_FILE)
                return 0
            # Display the exact saved binary plan in this invocation before confirmation.
            run_terraform("show", PLAN_FILE)
            print("\nWARNING: Applying this plan can change real AWS resources.")
            print("Review it first with: python run_nexusops.py show-plan")
            try:
                confirmation = input("Type APPLY to apply the saved plan, or anything else to cancel: ")
            except EOFError:
                print("Apply cancelled because no confirmation was received.")
                return 1
            if confirmation != "APPLY":
                print("Apply cancelled. No infrastructure was changed.")
                return 0
            # Recheck after interactive confirmation in case inputs changed while waiting.
            if not _check_plan_freshness():
                return 1
            run_terraform("apply", "-input=false", PLAN_FILE)
            print("Terraform apply completed.")
            return 0

        generate_terraform_variables(config)
        write_backend_config(config)
        if command == "destroy":
            return _destroy()
        if command == "generate":
            print("Terraform variables generated successfully.")
            return 0

        # Remove old metadata before starting so a failed plan cannot bless an old plan.
        PLAN_MANIFEST.unlink(missing_ok=True)
        run_terraform("init", "-input=false")
        run_terraform("validate")
        run_terraform("plan", "-input=false", "-out", PLAN_FILE)
        _write_plan_manifest()
        print(f"\nSaved Terraform plan: {PLAN_FILE}")
        print(f"Freshness metadata: {PLAN_MANIFEST}")
        print("No infrastructure was applied.")
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"\nERROR: {error}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
