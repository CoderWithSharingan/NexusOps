import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import run_nexusops as app


def valid_config():
    return {
        "application": {"name": "demo"},
        "infrastructure": {"provider": "aws", "region": "ap-south-1"},
        "resources": {
            "s3": {"enabled": False},
            "ecr": {
                "enabled": False,
                "repository_name": "demo/repo",
                "image_tag_mutability": "IMMUTABLE",
                "scan_on_push": True,
            },
        },
    }


class ConfigValidationTests(unittest.TestCase):
    def test_sample_config_is_valid(self):
        self.assertEqual(app.validate_config(app.load_config()), [])

    def test_malformed_yaml_is_reported(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            config_path = Path(directory) / "broken.yaml"
            config_path.write_text("application: [unterminated", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Invalid YAML syntax"):
                app.load_config(config_path)

    def test_missing_yaml_dependency_has_setup_guidance(self):
        with patch.object(app, "yaml", None):
            with self.assertRaisesRegex(ValueError, "requirements.txt"):
                app.load_config()

    def test_missing_fields_and_unsupported_provider_are_rejected(self):
        self.assertTrue(app.validate_config({"application": {}, "infrastructure": {"provider": "gcp"}}))

    def test_s3_settings_are_validated(self):
        config = valid_config()
        config["resources"]["s3"] = {"enabled": "false"}
        self.assertTrue(any("s3.enabled" in error for error in app.validate_config(config)))
        config["resources"]["s3"] = {"enabled": True, "bucket_name": "Invalid_Name"}
        self.assertTrue(any("S3 bucket_name" in error for error in app.validate_config(config)))
        config["resources"]["s3"] = {"enabled": True, "bucket_name": "192.168.1.1"}
        self.assertTrue(any("S3 bucket_name" in error for error in app.validate_config(config)))

    def test_ecr_valid_and_invalid_settings(self):
        config = valid_config()
        config["resources"]["ecr"].update(enabled=True)
        self.assertEqual(app.validate_config(config), [])
        for key, value in (
            ("repository_name", ""),
            ("repository_name", "Uppercase/repo"),
            ("image_tag_mutability", "SOMETIMES"),
            ("scan_on_push", "yes"),
            ("enabled", 1),
            ("unsupported", True),
        ):
            invalid = valid_config()
            invalid["resources"]["ecr"]["enabled"] = True
            invalid["resources"]["ecr"][key] = value
            self.assertTrue(app.validate_config(invalid), key)

    def test_container_settings_are_validated(self):
        config = valid_config()
        config["container"] = {
            "tool": "docker", "registry": "ecr", "image_tag": "bad:tag",
            "build_context": "app/backend", "dockerfile": "Dockerfile",
        }
        self.assertTrue(any("image_tag" in error for error in app.validate_config(config)))
        config["container"]["image_tag"] = "latest"
        config["container"]["build_context"] = "D:/outside"
        self.assertTrue(any("build_context" in error for error in app.validate_config(config)))

    def test_s3_and_ecr_toggles_are_independent(self):
        config = valid_config()
        config["resources"]["s3"] = {"enabled": True, "bucket_name": "valid-bucket-name"}
        config["resources"]["ecr"]["enabled"] = False
        variables = app.terraform_variables(config)
        self.assertTrue(variables["s3_enabled"])
        self.assertFalse(variables["ecr_enabled"])
        config["resources"]["s3"]["enabled"] = False
        config["resources"]["ecr"]["enabled"] = True
        variables = app.terraform_variables(config)
        self.assertFalse(variables["s3_enabled"])
        self.assertTrue(variables["ecr_enabled"])

    def test_variable_generation_writes_both_resource_settings(self):
        config = valid_config()
        config["resources"]["ecr"]["enabled"] = True
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            output = Path(directory) / "terraform.tfvars.json"
            app.generate_terraform_variables(config, output)
            variables = json.loads(output.read_text(encoding="utf-8"))
            self.assertFalse(variables["s3_enabled"])
            self.assertTrue(variables["ecr_enabled"])
            self.assertEqual(variables["ecr_repository_name"], "demo/repo")
            self.assertEqual(variables["ecr_image_tag_mutability"], "IMMUTABLE")
            self.assertTrue(variables["ecr_scan_on_push"])


class PlanFreshnessTests(unittest.TestCase):
    def test_missing_plan_and_manifest_are_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            plan = Path(directory) / "plan"
            manifest = Path(directory) / "manifest.json"
            self.assertIn("No saved plan", app.plan_freshness_error(plan, manifest))
            plan.write_bytes(b"plan")
            self.assertIn("no freshness metadata", app.plan_freshness_error(plan, manifest))

    def test_manifest_detects_plan_config_terraform_and_lockfile_changes(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            root = Path(directory)
            terraform_dir = root / "infrastructure"
            module_dir = terraform_dir / "modules" / "nested"
            module_dir.mkdir(parents=True)
            config = root / "nexusops.yaml"
            variables = terraform_dir / "terraform.tfvars.json"
            terraform_file = terraform_dir / "main.tf"
            nested_file = module_dir / "main.tf"
            lockfile = terraform_dir / ".terraform.lock.hcl"
            plan = terraform_dir / "nexusops.tfplan"
            manifest = terraform_dir / "nexusops.tfplan.json"
            for file, content in (
                (config, "config-v1"), (variables, "vars-v1"), (terraform_file, "tf-v1"),
                (nested_file, "nested-v1"), (lockfile, "lock-v1"), (plan, "plan-v1"),
            ):
                file.write_text(content, encoding="utf-8")
            with patch.multiple(
                app, PROJECT_ROOT=root, TERRAFORM_DIR=terraform_dir, CONFIG_FILE=config,
                VARIABLES_FILE=variables, PLAN_FILE=plan, PLAN_MANIFEST=manifest,
            ):
                app._write_plan_manifest()
                self.assertIsNone(app.plan_freshness_error())
                for file in (config, variables, terraform_file, nested_file, lockfile, plan):
                    original = file.read_text(encoding="utf-8")
                    file.write_text(original + "-changed", encoding="utf-8")
                    self.assertIsNotNone(app.plan_freshness_error(), str(file))
                    file.write_text(original, encoding="utf-8")

    def test_invalid_manifest_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            plan = Path(directory) / "plan"
            manifest = Path(directory) / "manifest.json"
            plan.write_bytes(b"plan")
            manifest.write_text("not json", encoding="utf-8")
            self.assertIn("unreadable", app.plan_freshness_error(plan, manifest))


class CliTests(unittest.TestCase):
    def test_unknown_or_extra_commands_return_usage_error(self):
        self.assertEqual(app.main(["destroy"]), 2)
        self.assertEqual(app.main(["validate", "extra"]), 2)

    def _patch_temp_project(self, directory):
        root = Path(directory)
        terraform_dir = root / "infrastructure"
        terraform_dir.mkdir()
        config_path = root / "nexusops.yaml"
        config_path.write_text("config", encoding="utf-8")
        (terraform_dir / "main.tf").write_text("terraform {}", encoding="utf-8")
        variables = terraform_dir / "terraform.tfvars.json"
        plan = terraform_dir / "nexusops.tfplan"
        manifest = terraform_dir / "nexusops.tfplan.json"
        values = {
            "PROJECT_ROOT": root, "TERRAFORM_DIR": terraform_dir, "CONFIG_FILE": config_path,
            "VARIABLES_FILE": variables, "PLAN_FILE": plan, "PLAN_MANIFEST": manifest,
        }
        return root, terraform_dir, variables, plan, manifest, values

    def test_plan_runs_init_validate_plan_and_writes_manifest_without_apply(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            _, _, _, plan, manifest, constants = self._patch_temp_project(directory)
            calls = []

            def fake_terraform(*args):
                calls.append(args)
                if args[0] == "plan":
                    plan.write_bytes(b"mock saved plan")

            with patch.multiple(app, **constants), patch.object(app, "load_config", return_value=valid_config()), \
                    patch.object(app, "run_terraform", side_effect=fake_terraform):
                with contextlib.redirect_stdout(io.StringIO()):
                    result = app.main(["plan"])
                self.assertEqual(result, 0)
                self.assertEqual([call[0] for call in calls], ["init", "validate", "plan"])
                self.assertEqual(calls[-1][-2:], ("-out", plan))
                self.assertTrue(manifest.is_file())
                self.assertIsNone(app.plan_freshness_error(plan, manifest))

    def test_terraform_stage_failures_return_error_without_manifest(self):
        for failed_stage in ("init", "validate", "plan"):
            with self.subTest(stage=failed_stage), tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
                _, _, _, _, manifest, constants = self._patch_temp_project(directory)

                def fail_at_stage(*args):
                    if args[0] == failed_stage:
                        raise RuntimeError(f"{failed_stage} failed")

                with patch.multiple(app, **constants), patch.object(app, "load_config", return_value=valid_config()), \
                        patch.object(app, "run_terraform", side_effect=fail_at_stage):
                    with contextlib.redirect_stdout(io.StringIO()):
                        result = app.main(["plan"])
                self.assertEqual(result, 1)
                self.assertFalse(manifest.exists())

    def test_apply_shows_exact_plan_then_cancels_without_applying(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            _, _, variables, plan, manifest, constants = self._patch_temp_project(directory)
            variables.write_text("{}", encoding="utf-8")
            plan.write_bytes(b"reviewed plan")
            with patch.multiple(app, **constants), patch.object(app, "load_config", return_value=valid_config()), \
                    patch.object(app, "run_terraform") as terraform, patch("builtins.input", return_value="no"):
                app._write_plan_manifest()
                with contextlib.redirect_stdout(io.StringIO()):
                    result = app.main(["apply"])
            self.assertEqual(result, 0)
            terraform.assert_called_once_with("show", plan)

    def test_apply_rejects_stale_plan_without_showing_or_applying(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            _, _, variables, plan, manifest, constants = self._patch_temp_project(directory)
            variables.write_text("{}", encoding="utf-8")
            plan.write_bytes(b"saved plan")
            with patch.multiple(app, **constants), patch.object(app, "load_config", return_value=valid_config()), \
                    patch.object(app, "run_terraform") as terraform:
                app._write_plan_manifest()
                (Path(directory) / "infrastructure" / "main.tf").write_text("changed", encoding="utf-8")
                with contextlib.redirect_stdout(io.StringIO()):
                    result = app.main(["apply"])
            self.assertEqual(result, 1)
            terraform.assert_not_called()


class DockerWorkflowTests(unittest.TestCase):
    def _config(self):
        config = valid_config()
        config["container"] = {
            "tool": "docker", "registry": "ecr", "build_context": "app/backend",
            "dockerfile": "Dockerfile", "image_tag": "dev-1",
        }
        return config

    def test_image_name_and_build_command_come_from_config(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            root = Path(directory)
            context = root / "app" / "backend"
            context.mkdir(parents=True)
            dockerfile = context / "Dockerfile"
            dockerfile.write_text("FROM scratch", encoding="utf-8")
            config = self._config()
            with patch.object(app, "PROJECT_ROOT", root), patch.object(app, "run_docker") as docker:
                image = app.build_docker_image(config)
            self.assertEqual(image, "demo:dev-1")
            docker.assert_called_once_with("build", "--file", dockerfile, "--tag", "demo:dev-1", context)

    def test_compose_uses_backend_build_context_and_health_endpoint(self):
        compose = app.yaml.safe_load((app.PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
        service = compose["services"]["api"]
        self.assertEqual(service["build"]["context"], "./app/backend")
        self.assertIn("/health", " ".join(service["healthcheck"]["test"]))

    def test_build_rejects_paths_outside_project(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            config = self._config()
            config["container"]["build_context"] = "../outside"
            with patch.object(app, "PROJECT_ROOT", Path(directory)):
                with self.assertRaisesRegex(ValueError, "stay inside"):
                    app._docker_build_arguments(config)

    def test_build_command_failure_is_reported(self):
        failure = subprocess.CompletedProcess([], 1, stdout="", stderr="Cannot connect to daemon")
        with patch.object(app.subprocess, "run", return_value=failure):
            with self.assertRaisesRegex(RuntimeError, "Docker command failed with exit code 1.*Cannot connect to daemon"):
                app.run_docker("build", "--tag", "demo:latest", ".")

    def test_missing_docker_cli_has_actionable_error(self):
        with patch.object(app.subprocess, "run", side_effect=FileNotFoundError("docker")):
            with self.assertRaisesRegex(RuntimeError, "Install Docker Desktop"):
                app.run_docker("build", ".")

    def test_build_failure_does_not_try_to_push(self):
        config = self._config()
        with patch.object(app, "_docker_build_arguments", return_value=["build", "."]), \
                patch.object(app, "run_docker", side_effect=RuntimeError("build failed")) as docker:
            with self.assertRaisesRegex(RuntimeError, "build failed"):
                app.build_docker_image(config)
        docker.assert_called_once()

    def test_ecr_push_uses_configured_repository_and_hides_login_token(self):
        config = self._config()
        config["resources"]["ecr"].update(enabled=True)
        config["resources"]["ecr"]["repository_name"] = "demo/repo"
        login = subprocess.CompletedProcess([], 0, stdout="", stderr="")
        with patch.object(app, "_run_aws_capture", side_effect=[
            "123456789012.dkr.ecr.ap-south-1.amazonaws.com/demo/repo", "secret-token"
        ]) as aws, patch.object(app.subprocess, "run", return_value=login) as docker_login, \
                patch.object(app, "run_docker") as docker:
            pushed = app.push_ecr_image(config, confirmed=True)
        self.assertEqual(pushed, "123456789012.dkr.ecr.ap-south-1.amazonaws.com/demo/repo:dev-1")
        self.assertEqual(aws.call_args_list[0].args[0:4], (
            "ecr", "describe-repositories", "--repository-names", "demo/repo"
        ))
        self.assertEqual(docker_login.call_args.kwargs["input"], "secret-token")
        self.assertNotIn("secret-token", str(docker_login.call_args.args))
        self.assertEqual(docker.call_args_list[0].args, ("image", "inspect", "demo:dev-1"))
        self.assertEqual(docker.call_args_list[1].args, ("tag", "demo:dev-1", pushed))
        self.assertEqual(docker.call_args_list[2].args, ("push", pushed))

    def test_ecr_push_function_requires_explicit_confirmation(self):
        config = self._config()
        config["resources"]["ecr"].update(enabled=True)
        with patch.object(app, "_run_aws_capture") as aws:
            with self.assertRaisesRegex(ValueError, "explicit PUSH confirmation"):
                app.push_ecr_image(config)
        aws.assert_not_called()

    def test_push_command_requires_explicit_confirmation(self):
        config = self._config()
        config["resources"]["ecr"].update(enabled=True)
        with patch.object(app, "load_config", return_value=config), \
                patch.object(app, "push_ecr_image") as push, patch("builtins.input", return_value="no"):
            with contextlib.redirect_stdout(io.StringIO()):
                result = app.main(["push-ecr"])
        self.assertEqual(result, 0)
        push.assert_not_called()

    def test_push_command_cancels_when_confirmation_input_is_unavailable(self):
        config = self._config()
        config["resources"]["ecr"].update(enabled=True)
        with patch.object(app, "load_config", return_value=config), \
                patch.object(app, "push_ecr_image") as push, patch("builtins.input", side_effect=EOFError):
            with contextlib.redirect_stdout(io.StringIO()):
                result = app.main(["push-ecr"])
        self.assertEqual(result, 1)
        push.assert_not_called()

    def test_disabled_ecr_push_is_rejected_before_confirmation(self):
        config = self._config()
        with patch.object(app, "load_config", return_value=config), patch("builtins.input") as prompt, \
                patch.object(app, "push_ecr_image") as push:
            with contextlib.redirect_stdout(io.StringIO()):
                result = app.main(["push-ecr"])
        self.assertEqual(result, 1)
        prompt.assert_not_called()
        push.assert_not_called()


if __name__ == "__main__":
    unittest.main()
