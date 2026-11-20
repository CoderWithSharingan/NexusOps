import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import run_nexusops as core
from webui import server

ORIGIN = {"Origin": "http://127.0.0.1:8765"}


def valid_config():
    return {
        "application": {"name": "demo"},
        "infrastructure": {"provider": "aws", "region": "ap-south-1"},
        "deployment": {"replicas": 2},
        "resources": {
            "s3": {"enabled": False},
            "ecr": {"enabled": False, "repository_name": "demo", "image_tag_mutability": "IMMUTABLE",
                    "scan_on_push": True},
        },
    }


class WebUiTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        terraform_dir = self.root / "infrastructure"
        terraform_dir.mkdir()
        (terraform_dir / "main.tf").write_text("terraform {}", encoding="utf-8")
        self.config_file = self.root / "nexusops.yaml"
        self.config_file.write_text(core.yaml.safe_dump(valid_config()), encoding="utf-8")
        self.dist = self.root / "dist"
        (self.dist / "assets").mkdir(parents=True)
        (self.dist / "index.html").write_text("<html>nexusops</html>", encoding="utf-8")
        (self.dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
        (self.root / "secret.txt").write_text("secret", encoding="utf-8")
        patcher = patch.multiple(
            core, PROJECT_ROOT=self.root, TERRAFORM_DIR=terraform_dir, CONFIG_FILE=self.config_file,
            VARIABLES_FILE=terraform_dir / "terraform.tfvars.json", PLAN_FILE=terraform_dir / "nexusops.tfplan",
            PLAN_MANIFEST=terraform_dir / "nexusops.tfplan.json", KUBERNETES_DIR=self.root / "build" / "kubernetes",
            BACKEND_FILE=terraform_dir / "backend.tf.json",
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(server.create_app(dist_dir=self.dist), base_url="http://127.0.0.1:8765")
        stdout = contextlib.redirect_stdout(io.StringIO())
        stdout.__enter__()
        self.addCleanup(stdout.__exit__, None, None, None)

    def test_status_reports_valid_config_and_missing_plan(self):
        body = self.client.get("/api/status").json()
        self.assertTrue(body["config"]["valid"])
        self.assertFalse(body["plan"]["fresh"])
        self.assertEqual(body["application"], "demo")
        self.assertEqual(body["resources"], {"s3": False, "ecr": False})

    def test_status_reports_unreadable_config(self):
        self.config_file.write_text("application: [broken", encoding="utf-8")
        body = self.client.get("/api/status").json()
        self.assertFalse(body["config"]["valid"])
        self.assertIn("Invalid YAML", body["config"]["errors"][0])

    def test_invalid_config_is_rejected_and_file_is_unchanged(self):
        original = self.config_file.read_text(encoding="utf-8")
        config = valid_config()
        config["deployment"]["replicas"] = 25
        response = self.client.put("/api/config", json={"config": config}, headers=ORIGIN)
        self.assertEqual(response.status_code, 422)
        self.assertTrue(any("replicas" in error for error in response.json()["detail"]["errors"]))
        self.assertEqual(self.config_file.read_text(encoding="utf-8"), original)
        self.assertFalse(self.config_file.with_name("nexusops.yaml.bak").exists())

    def test_valid_config_is_saved_with_backup(self):
        original = self.config_file.read_text(encoding="utf-8")
        config = valid_config()
        config["deployment"]["replicas"] = 5
        response = self.client.put("/api/config", json={"config": config}, headers=ORIGIN)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(core.load_config()["deployment"]["replicas"], 5)
        self.assertEqual(self.config_file.with_name("nexusops.yaml.bak").read_text(encoding="utf-8"), original)
        self.assertEqual(self.client.get("/api/config").json()["config"], config)

    def test_validate_checks_draft_without_writing(self):
        original = self.config_file.read_text(encoding="utf-8")
        config = valid_config()
        config["infrastructure"]["provider"] = "gcp"
        body = self.client.post("/api/validate", json={"config": config}, headers=ORIGIN).json()
        self.assertFalse(body["valid"])
        self.assertEqual(self.config_file.read_text(encoding="utf-8"), original)

    def test_generate_and_render_write_outputs(self):
        variables = self.client.post("/api/generate", headers=ORIGIN).json()["variables"]
        self.assertEqual(variables["application_name"], "demo")
        self.assertTrue(core.VARIABLES_FILE.is_file())
        manifests = self.client.post("/api/render-k8s", headers=ORIGIN).json()["manifests"]
        self.assertIn("kind: Deployment", manifests)
        self.assertIn("replicas: 2", manifests)

    def test_generate_refuses_invalid_saved_config(self):
        self.config_file.write_text(core.yaml.safe_dump({"application": {}}), encoding="utf-8")
        self.assertEqual(self.client.post("/api/generate", headers=ORIGIN).status_code, 422)
        self.assertFalse(core.VARIABLES_FILE.exists())

    def test_stale_plan_is_reported_without_running_terraform(self):
        with patch.object(core.subprocess, "run") as run:
            body = self.client.get("/api/plan").json()
        self.assertFalse(body["fresh"])
        self.assertIsNone(body["text"])
        run.assert_not_called()

    def test_fresh_plan_text_is_returned(self):
        core.VARIABLES_FILE.write_text("{}", encoding="utf-8")
        core.PLAN_FILE.write_bytes(b"plan")
        core._write_plan_manifest()
        shown = subprocess.CompletedProcess([], 0, stdout="Plan: 4 to add", stderr="")
        with patch.object(core.subprocess, "run", return_value=shown) as run:
            body = self.client.get("/api/plan").json()
        self.assertTrue(body["fresh"])
        self.assertEqual(body["text"], "Plan: 4 to add")
        self.assertEqual(run.call_args.args[0][2:4], ["show", "-no-color"])

    def test_no_routes_change_aws_or_docker(self):
        paths = {getattr(route, "path", "") for route in self.client.app.routes}
        api_paths = {path for path in paths if path.startswith("/api")}
        self.assertEqual(api_paths, {"/api/status", "/api/config", "/api/validate", "/api/generate",
                                     "/api/render-k8s", "/api/plan"})
        for path in ("/api/apply", "/api/push-ecr", "/api/build-image"):
            self.assertIn(self.client.post(path, headers=ORIGIN).status_code, {404, 405})
        self.assertEqual(self.client.get("/api/apply").status_code, 404)

    def test_foreign_or_missing_origin_and_foreign_host_are_rejected(self):
        config = {"config": valid_config()}
        self.assertEqual(self.client.put("/api/config", json=config).status_code, 403)
        self.assertEqual(self.client.put("/api/config", json=config,
                                         headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.client.get("/api/status", headers={"Host": "evil.example"}).status_code, 400)
        self.assertFalse(self.config_file.with_name("nexusops.yaml.bak").exists())

    def test_security_headers_are_sent(self):
        headers = self.client.get("/api/status").headers
        self.assertIn("default-src 'self'", headers["content-security-policy"])
        self.assertEqual(headers["x-frame-options"], "DENY")
        self.assertEqual(headers["x-content-type-options"], "nosniff")

    def test_single_page_app_fallback_and_no_traversal(self):
        self.assertIn("nexusops", self.client.get("/config").text)
        self.assertEqual(self.client.get("/assets/app.js").text, "console.log(1)")
        self.assertNotIn("secret", self.client.get("/..%2Fsecret.txt").text)

    def test_ui_command_starts_without_loading_config(self):
        with patch.object(server, "serve", return_value=0) as serve, patch.object(core, "load_config") as load:
            self.assertEqual(core.main(["ui"]), 0)
        serve.assert_called_once_with()
        load.assert_not_called()


if __name__ == "__main__":
    unittest.main()
