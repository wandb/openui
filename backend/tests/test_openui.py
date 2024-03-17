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