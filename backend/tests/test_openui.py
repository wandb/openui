import subprocess
import sys

from fastapi.testclient import TestClient
from openui.server import app  # Adjust the import based on your project structure

client = TestClient(app)

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello World"}  # Adjust expected response

def test_create_item():
    response = client.post("/items/", json={"name": "Test Item", "description": "A test item"})
    assert response.status_code == 200  # Or 201 for created
    assert response.json() == {"name": "Test Item", "description": "A test item", "id": 1} 


def test_db_models_import_without_sqlite_ext_database():
    # peewee 4.0.1 dropped SqliteExtDatabase, so hide it and import the models fresh
    code = (
        "import playhouse.sqlite_ext as sqlite_ext\n"
        "vars(sqlite_ext).pop('SqliteExtDatabase', None)\n"
        "import openui.db.models\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, result.stderr
