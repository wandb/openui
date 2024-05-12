Deploying to a Kubernetes cluster involves several steps. Below is a step-by-step guide that assumes you have a Kubernetes cluster already set up and configured, and you have `kubectl` installed and configured to communicate with your cluster. This guide also assumes you have already built and pushed your Docker images to a container registry that your Kubernetes cluster can access.

### Step 1: Create Persistent Volume and Claim

1. **Goto kubernetes subfolder**
  ```bash
  cd ./kubernetes
  ```

2. **Create the Persistent Volume and Persistent Volume Claim for Ollama**
   - Deploy to your cluster both `ollama-pv.yaml` and `ollama-pvc.yaml` files:
     ```bash
     kubectl apply -f ollama-pv.yaml
     kubectl apply -f ollama-pvc.yaml
     ```

### Step 2: Deploy Ollama Service

1. **Create the Deployment and Service for Ollama**
   - Deploy `ollama-deployment.yaml` and `ollama-service.yaml` files:
     ```bash
     kubectl apply -f ollama-deployment.yaml
     kubectl apply -f ollama-service.yaml
     ```

### Step 3: Deploy Backend Service

1. **Ensure your Docker image for the backend is built and pushed to a registry**
   - If not already done, build your Docker image from the backend directory and push it to your container registry. Make shure the image availablt for your kubernetes cluster. For example, for local microk8s deployment:
     ```bash
     cd ../backend
     docker build . -t openui-backend --load
     docker save openui-backend:latest > openui-backend.tar
     microk8s ctr image import openui-backend.tar
     rm -f openui-backend.tar
     cd ../kubernetes
     ```
   - Update the backend deployment YAML with the correct image name.

2. **Create the Deployment and Service for Backend**
   - Deploy `backend-deployment.yaml` and `backend-service.yaml` files:
     ```bash
     kubectl apply -f backend-deployment.yaml
     kubectl apply -f backend-service.yaml
     ```

### Step 4: Create Kubernetes Secret for Environment Variables

1. **Encode your API Key in Base64**
   - Encode your `OPENAI_API_KEY`:
     ```bash
     echo -n 'your_openai_api_key_here' | base64
     ```
   - Replace `YOUR_BASE64_ENCODED_API_KEY` in the secret YAML with the output from above command.

2. **Create the Secret**
   - Save the secret YAML configuration to a file named `openai-api-key-secret.yaml`.
   - Deploy it:
     ```bash
     kubectl apply -f openai-api-key-secret.yaml
     ```

### Step 5: Verify the Deployment

1. **Check the status of your deployments**
   - To see if the deployments are running and their statuses run:
     ```bash
     kubectl get deployments
     ```

2. **Check the status of your services**
   - To see if the services are running and to check their internal IP addresses and ports:
     ```bash
     kubectl get services
     ```

3. **Check the status of your pods**
   - This command helps you verify if the pods are running correctly:
     ```bash
     kubectl get pods
     ```

4. **View logs for troubleshooting**
   - If a pod isn’t starting or behaving as expected, view logs for more information:
     ```bash
     kubectl logs <pod_name>
     ```

### Step 6: Accessing Your Application

Depending on how your Kubernetes cluster is configured (e.g., if you're using Minikube, a cloud provider, etc.), accessing services externally will vary. For services only exposed internally, you can set up port forwarding:

```bash
kubectl port-forward service/backend-service 7878:7878
```

This command allows you to access the backend service via `localhost:7878` on your local machine.

By following these steps, you should be able to deploy and run your application on a Kubernetes cluster. Adjust the steps based on your specific environment and configuration needs.
