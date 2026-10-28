"""NexusOps configuration and guarded Terraform workflow."""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

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


def load_config(path=CONFIG_FILE):
    """Load the NexusOps YAML configuration as a mapping."""
    if yaml is None:
        raise ValueError(
            "PyYAML is required. Activate the project environment and run "
            "'python -m pip install -r requirements.txt'."
        )
    try:
        with Path(path).open("r", encoding="utf-8") as file:
            config = yaml.safe_load(file)
    except yaml.YAMLError as error:
        raise ValueError(f"Invalid YAML syntax: {error}") from error
    except OSError as error:
        raise ValueError(f"Could not read configuration: {error}") from error

    if not isinstance(config, dict):
        raise ValueError("Configuration must be a YAML mapping.")
    return config


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
                elif (
                    not 3 <= len(name) <= 63
                    or not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", name)
                    or ".." in name
                    or re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", name)
                ):
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

        build_context = container.get("build_context", DEFAULT_BUILD_CONTEXT)
        if not isinstance(build_context, str) or not build_context.strip() or Path(build_context).is_absolute():
            errors.append("'container.build_context' must be a relative project path.")

        dockerfile = container.get("dockerfile", DEFAULT_DOCKERFILE)
        if not isinstance(dockerfile, str) or not dockerfile.strip() or Path(dockerfile).is_absolute():
            errors.append("'container.dockerfile' must be a relative path inside the build context.")

    return errors


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


def run_docker(*arguments):
    """Run Docker and report missing CLI or build/push failures clearly."""
    command = ["docker", *map(str, arguments)]
    print(f"\n> {' '.join(command)}")
    try:
        result = subprocess.run(
            command, cwd=PROJECT_ROOT, check=False, capture_output=True,
            text=True, encoding="utf-8", errors="replace",
        )
    except OSError as error:
        raise RuntimeError(f"Could not start Docker. Install Docker Desktop and ensure docker is on PATH: {error}") from error
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
    run_docker(*arguments)
    image = docker_image_reference(config)
    print(f"Docker image built locally: {image}")
    return image


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
    run_docker("image", "inspect", image)
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
    run_docker("push", remote_image)
    print(f"Pushed Docker image to ECR: {remote_image}")
    return remote_image


def _check_plan_freshness():
    error = plan_freshness_error()
    if error:
        print(f"ERROR: {error}")
        return False
    return True


def main(argv=None):
    """Run a NexusOps command."""
    allowed = {"validate", "generate", "plan", "show-plan", "apply", "build-image", "push-ecr"}
    args = sys.argv[1:] if argv is None else argv
    command = args[0] if args else "validate"
    if len(args) > 1 or command not in allowed:
        print("Usage: python run_nexusops.py [validate|generate|plan|show-plan|apply|build-image|push-ecr]")
        return 2

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
