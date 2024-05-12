## Deployment Instructions for OpenUI Helm Chart

This guide provides detailed instructions on how to deploy the "OpenUI" Helm chart into a Kubernetes cluster. Before proceeding, ensure you have the following prerequisites met:

### Prerequisites
- **Kubernetes Cluster**: Ensure you have access to a Kubernetes cluster and you have `kubectl` installed and configured to communicate with your cluster.
- **Helm Installed**: You need Helm installed on your machine. Helm is a tool for managing Kubernetes charts. Charts are packages of pre-configured Kubernetes resources.

### Step 1: Clone the Repository
First, clone the repository containing the Helm chart to your local machine and goto `helm` subdirectory:

```bash
git clone https://github.com/wandb/openui
cd opanui/helm
```

### Step 2: Create the Kubernetes Namespace
Create a namespace in your Kubernetes cluster where the resources will be deployed. This step is optional but recommended to keep your cluster organized:

```bash
kubectl create namespace openui
```

### Step 3: Managing the Kubernetes Secret

OpenUI application requires Kubernetes secret `OPENAI_API_KEY`. Ensure that these secrets are created within the same namespace. When creating secrets manually, specify the namespace:

```bash
kubectl create secret generic openai-api-key-secret \
  --from-literal=OPENAI_API_KEY='your_openai_api_key_here' \
  --namespace openui
```

### Step 4 Create the folder for persistant volumes
Create directory for ollama persistant volumes. For example, `/mnt/data/ollama`.

```bash
mkdir -p /mnt/data
mkdir -p /mnt/data/ollama
```
Do not forget to change the path to this directory in the `values.yaml` file on the next step.

### Step 5: Configure the Helm Chart
Edit the `values.yaml` file to customize the deployment settings like path to persistant volume, image tags, resource limits, or other configurations:

```bash
nano values.yaml
```
You can skip it if you use default values.

### Step 6: Deploy the Helm Chart
Deploy the Helm chart using the following command. This command assumes you are still in the `helm` chart directory:

```bash
helm install openui . --namespace openui
```

This command deploys the "OpenUI" application to the "openui" namespace in your Kubernetes cluster.

### Step 7: Verify the Deployment
Check the status of the deployment to ensure everything is running as expected:

```bash
kubectl get all -n openui
```

This command will show all the resources deployed in the "openui" namespace, allowing you to verify that your application components are up and running.

### Step 8: Accessing the Application
To access the deployed application, you might need to set up port forwarding or an ingress, depending on how the service is exposed:

- **For development purposes** (using port forwarding):

    ```bash
    kubectl port-forward service/backend-service 7878:7878 -n openui
    ```

    Now, access the application via [http://localhost:7878](http://localhost:7878).

- **For production environments** (using an ingress):

    Add to your Helm chart an ingress controller and that it is properly configured in `values.yaml`. Access the application via the URL configured in your ingress.

### Step 9: Clean Up (Optional)
If you need to delete the deployment, use the following command:

```bash
helm uninstall openui -n openui
```

And if you want to remove the namespace:

```bash
kubectl delete namespace openui
```

### Troubleshooting
- If you encounter issues during deployment, you can check the logs of your pods or describe the resources for more detailed error messages:
  
    ```bash
    kubectl logs pod-name -n openui
    kubectl describe pod pod-name -n openui
    ```

Replace `pod-name` with the name of the pod that is experiencing issues.
