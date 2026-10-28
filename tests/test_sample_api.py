import unittest

from app.backend.main import app


class SampleApiTests(unittest.TestCase):
    def test_health_route_returns_ok(self):
        route = next(route for route in app.routes if getattr(route, "path", None) == "/health")
        self.assertEqual(route.endpoint(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
