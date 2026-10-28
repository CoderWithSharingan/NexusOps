
from pathlib import Path
import sys

import yaml


def validate_config(config):
    """Validate the basic NexusOps configuration."""
    errors = []

    if not isinstance(config, dict):
        return ["The configuration must be a YAML mapping."]

    application = config.get("application")
    infrastructure = config.get("infrastructure")

    if not isinstance(application, dict):
        errors.append("'application' must be a YAML mapping.")

    if not isinstance(infrastructure, dict):
        errors.append("'infrastructure' must be a YAML mapping.")

    if errors:
        return errors

    name = application.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append("Missing or invalid field: application.name")

    provider = infrastructure.get("provider")
    if provider != "aws":
        errors.append(
            "Unsupported cloud provider. NexusOps currently supports AWS only."
        )

    region = infrastructure.get("region")
    if not isinstance(region, str) or not region.strip():
        errors.append("Missing or invalid field: infrastructure.region")

    return errors


def load_config():
    """Load the YAML configuration from the project root."""
    project_root = Path(__file__).resolve().parent.parent
    config_path = project_root / "nexusops.yaml"

    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def print_plan(config):
    """Display a configuration-based deployment preview."""
    application = config.get("application", {})
    infrastructure = config.get("infrastructure", {})
    container = config.get("container", {})
    ci_cd = config.get("ci_cd", {})
    deployment = config.get("deployment", {})
    monitoring = config.get("monitoring", {})

    print("\nNexusOps deployment plan")
    print("=" * 32)
    print(f"Application:       {application.get('name', 'Not configured')}")
    print(f"Language:          {application.get('language', 'Not configured')}")
    print(f"Framework:         {application.get('framework', 'Not configured')}")
    print(f"Cloud provider:    {infrastructure.get('provider', 'Not configured')}")
    print(f"AWS region:        {infrastructure.get('region', 'Not configured')}")
    print(f"Platform:          {infrastructure.get('platform', 'Not configured')}")
    print(f"Provision enabled: {infrastructure.get('provision', False)}")
    print(f"Container tool:    {container.get('tool', 'Not configured')}")
    print(f"Registry:          {container.get('registry', 'Not configured')}")
    print(f"CI/CD tool:        {ci_cd.get('tool', 'Not configured')}")
    print(f"Run tests:         {ci_cd.get('run_tests', False)}")
    print(f"Replicas:          {deployment.get('replicas', 'Not configured')}")
    print(f"Monitoring enabled:{monitoring.get('enabled', False)}")
    print(f"Monitoring tool:   {monitoring.get('tool', 'Not configured')}")
    print("\nPreview only. No Terraform plan was generated.")
    print("No AWS resources have been created.")


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "validate"

    if command not in {"validate", "plan"}:
        print(f"Unknown command: {command}")
        print("Usage: python run_nexusops.py [validate|plan]")
        sys.exit(2)

    try:
        config = load_config()
    except yaml.YAMLError as error:
        print(f"ERROR: Invalid YAML syntax: {error}")
        sys.exit(1)
    except OSError as error:
        print(f"ERROR: {error}")
        sys.exit(1)

    errors = validate_config(config)

    if errors:
        print("NexusOps configuration validation FAILED:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)

    print("NexusOps configuration validation PASSED!")

    if command == "validate":
        print(f"Application: {config['application']['name']}")
        print(f"Cloud provider: {config['infrastructure']['provider']}")
        print(f"Region: {config['infrastructure']['region']}")
    else:
        print_plan(config)


if __name__ == "__main__":
    main()
