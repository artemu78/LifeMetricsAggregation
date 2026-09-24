"""Build the dashboard frontend and start the local dashboard server."""

from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    print("Building dashboard frontend...", flush=True)
    try:
        subprocess.run(["npm", "run", "build"], cwd=ROOT / "web", check=True)
    except FileNotFoundError as error:
        raise SystemExit("npm was not found. Install Node.js and npm to build the dashboard.") from error
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            f"Dashboard frontend build failed (exit code {error.returncode}); server was not started."
        ) from error

    from .server import main as serve

    serve()
