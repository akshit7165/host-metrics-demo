
# Host Metrics Demo

This project demonstrates how to build, containerize, and deploy a simple Node.js application that exposes your host machine's CPU, memory, and disk usage as a JSON endpoint. It uses Docker, Minikube (Docker driver), Kubernetes, GitHub, and GitHub Actions. Follow these steps from scratch.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Step 1: Create the Metrics Server](#step-1-create-the-metrics-server)
4. [Step 2: Dockerize the App](#step-2-dockerize-the-app)
5. [Step 3: Push the Docker Image to Docker Hub](#step-3-push-the-docker-image-to-docker-hub)
6. [Step 4: Kubernetes Manifest](#step-4-kubernetes-manifest)
7. [Step 5: Deploy to Minikube](#step-5-deploy-to-minikube)
8. [Step 6: Access the `/metrics` Endpoint](#step-6-access-the-metrics-endpoint)
9. [Step 7: GitHub Setup](#step-7-github-setup)
10. [Step 8: GitHub Actions Workflow](#step-8-github-actions-workflow)
11. [Step 9: Update Deployment with New Image](#step-9-update-deployment-with-new-image)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Docker Desktop installed and running.
- Minikube installed and started with the Docker driver:
  ```bash
  minikube start --driver=docker
  ```
- `kubectl` installed and configured to point to Minikube.
- Git installed.
- GitHub account.
- Docker Hub account.
- (Optional) Node.js installed locally for testing.

---

## Project Structure

```
host-metrics-demo/
├── app/
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
│
├── k8s/
│   └── deployment.yaml
│
└── .github/
    └── workflows/
        └── docker-build.yml
```

---

## Step 1: Create the Metrics Server

1. Create the project directory and `app/` folder:
   ```bash
   mkdir -p host-metrics-demo/app
   cd host-metrics-demo/app
   npm init -y
   npm install express os-utils
   ```

2. Create `app/server.js`:
   ```js
   const express = require('express');
   const osu = require('os-utils');
   const { exec } = require('child_process');
   const fs = require('fs');

   const app = express();
   const port = process.env.PORT || 3000;

   // If /hostproc exists, point os-utils to it
   if (fs.existsSync('/hostproc')) {
     osu.cpuInfoFiles = {
       stat: '/hostproc/stat',
       uptime: '/hostproc/uptime'
     };
   }

   app.get('/metrics', (req, res) => {
     osu.cpuUsage((cpuPercent) => {
       const freeMemMB = osu.freemem();
       const totalMemMB = osu.totalmem();
       const usedMemMB = totalMemMB - freeMemMB;

       // Use /hostproc for disk if mounted
       const dfTarget = fs.existsSync('/hostproc') ? '/hostproc' : '/';

       exec(`df -h ${dfTarget}`, (err, stdout) => {
         const diskInfo = err ? `Error: ${err.message}` : stdout.trim();
         res.json({
           cpu: `${(cpuPercent * 100).toFixed(2)}%`,
           memory: {
             used: `${usedMemMB.toFixed(2)} MB`,
             total: `${totalMemMB.toFixed(2)} MB`
           },
           disk: diskInfo
         });
       });
     });
   });

   app.listen(port, () => {
     console.log(`Metrics server running on port ${port}`);
   });
   ```

3. Verify `app/package.json` has:
   ```json
   {
     "name": "host-metrics",
     "version": "1.0.0",
     "main": "server.js",
     "scripts": {
       "start": "node server.js"
     },
     "dependencies": {
       "express": "^4.x",
       "os-utils": "^0.x"
     }
   }
   ```

4. (Optional) Test locally:
   ```bash
   node server.js
   ```
   Open [http://localhost:3000/metrics](http://localhost:3000/metrics).

---

## Step 2: Dockerize the App

1. Create `app/Dockerfile`:
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /usr/src/app
   COPY package.json package-lock.json ./
   RUN npm install --production
   COPY server.js ./
   EXPOSE 3000
   CMD ["node", "server.js"]
   ```

2. Build and run locally (mounting host PID and `/proc`):
   ```bash
   cd host-metrics-demo/app
   docker build -t <YOUR_DOCKERHUB_USER>/host-metrics:latest .
   docker run -d      --name host-metrics      --pid=host      --privileged      -p 8080:3000      <YOUR_DOCKERHUB_USER>/host-metrics:latest
   ```
   Open [http://localhost:8080/metrics](http://localhost:8080/metrics).

3. Inspect in Docker Desktop:
   - Under **Images**, locate `host-metrics:latest`.
   - Under **Containers / Apps**, see the running container.

---

## Step 3: Push the Docker Image to Docker Hub

1. Log in to Docker Hub:
   ```bash
   docker login
   ```

2. Push the image:
   ```bash
   docker push <YOUR_DOCKERHUB_USER>/host-metrics:latest
   ```

---

## Step 4: Kubernetes Manifest

Create `k8s/deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: host-metrics-deploy
  labels:
    app: host-metrics
spec:
  replicas: 1
  selector:
    matchLabels:
      app: host-metrics
  template:
    metadata:
      labels:
        app: host-metrics
    spec:
      hostPID: true
      containers:
        - name: host-metrics
          image: <YOUR_DOCKERHUB_USER>/host-metrics:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 3000
          volumeMounts:
            - name: procfs
              mountPath: /hostproc
      volumes:
        - name: procfs
          hostPath:
            path: /proc
            type: Directory
---
apiVersion: v1
kind: Service
metadata:
  name: host-metrics-svc
spec:
  selector:
    app: host-metrics
  type: NodePort
  ports:
    - port: 3000
      targetPort: 3000
      nodePort: 30030
```

---

## Step 5: Deploy to Minikube

1. Ensure Minikube is running:
   ```bash
   minikube status
   ```

2. Apply the manifest:
   ```bash
   kubectl apply -f k8s/deployment.yaml
   ```

3. Verify:
   ```bash
   kubectl get pods -l app=host-metrics
   kubectl get svc host-metrics-svc
   ```

---

## Step 6: Access the `/metrics` Endpoint

### Option A: Minikube Service Tunnel

1. Run in a terminal:
   ```bash
   minikube service host-metrics-svc --url
   ```
2. Copy the HTTP URL (e.g., `http://127.0.0.1:61087`) and open:
   ```
   http://127.0.0.1:61087/metrics
   ```
3. Keep the terminal open while browsing.

### Option B: kubectl Port-Forward

1. Find Pod name:
   ```bash
   kubectl get pods -l app=host-metrics -o name
   ```
2. Port-forward:
   ```bash
   kubectl port-forward pod/<POD_NAME> 8080:3000
   ```
3. Open in browser:
   ```
   http://localhost:8080/metrics
   ```
4. Keep the terminal open while browsing.

---

## Step 7: GitHub Setup

1. Initialize Git:
   ```bash
   cd host-metrics-demo
   git init
   git add .
   git commit -m "Initial commit: Host Metrics project"
   ```

2. Create GitHub repo (`host-metrics-demo`), then push:
   ```bash
   git remote add origin git@github.com:<YOUR_USERNAME>/host-metrics-demo.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 8: GitHub Actions Workflow

1. In GitHub repo settings, add repository secrets under **Secrets and variables → Actions**:
   - `DOCKERHUB_USERNAME` = your Docker Hub username
   - `DOCKERHUB_TOKEN` = your Docker Hub access token (or password)

2. Create `.github/workflows/docker-build.yml`:
   ```yaml
   name: Build & Push Docker Image

   on:
     push:
       branches:
         - main

   jobs:
     build:
       runs-on: ubuntu-latest

       steps:
         - name: Check out code
           uses: actions/checkout@v4

         - name: Log in to Docker Hub
           uses: docker/login-action@v2
           with:
             username: ${{ secrets.DOCKERHUB_USERNAME }}
             password: ${{ secrets.DOCKERHUB_TOKEN }}

         - name: Build and push Docker image
           uses: docker/build-push-action@v4
           with:
             context: ./app
             file: ./app/Dockerfile
             push: true
             tags: ${{ secrets.DOCKERHUB_USERNAME }}/host-metrics:latest
   ```

3. Commit and push:
   ```bash
   git add .github/workflows/docker-build.yml
   git commit -m "ci: add Docker build & push workflow"
   git push
   ```

4. Go to **Actions** in GitHub to watch the workflow run.

---

## Step 9: Update Deployment with New Image

Each time you push a new commit to `main`, the GitHub Action builds and pushes the updated image to Docker Hub. To update your Minikube deployment:

1. (Optional) SSH into Minikube and pull:
   ```bash
   minikube ssh
   docker pull <YOUR_DOCKERHUB_USER>/host-metrics:latest
   exit
   ```

2. Restart the deployment:
   ```bash
   kubectl rollout restart deployment/host-metrics-deploy
   ```

3. Verify new Pod:
   ```bash
   kubectl get pods -l app=host-metrics
   ```
4. Access `/metrics` as in [Step 6](#step-6-access-the-/metrics-endpoint).

---

## Troubleshooting

- **Pod CrashLoopBackOff**:  
  Check logs:
  ```bash
  kubectl logs -l app=host-metrics
  ```
  Ensure `hostPID: true` and `/proc` volume mount are correct.

- **Service Not Accessible**:  
  - Make sure you use `http://`, not `https://`.  
  - If Minikube tunnel closes, re-run:
    ```bash
    minikube service host-metrics-svc --url
    ```
  - For `port-forward`, confirm correct Pod name.

- **Docker Hub Login Fails in Actions**:  
  - Verify `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are set under **Secrets** (not **Variables**).  
  - Check your token hasn’t expired.

- **Minikube Status Error**:  
  ```bash
  minikube status
  ```
  If not running, start:
  ```bash
  minikube start --driver=docker
  ```

- **Image Pull Errors**:  
  - Confirm the image tag matches: `<YOUR_USER>/host-metrics:latest`.  
  - Check Docker Hub to verify the image exists.

---

## Summary

You now have a fully automated project that:

1. Reads host metrics in Node.js.  
2. Dockerizes the app and runs locally with host resource access.  
3. Deploys to Minikube via Kubernetes.  
4. Automates Docker builds and pushes with GitHub Actions.  
5. Provides troubleshooting steps for common issues.

Enjoy experimenting, and let me know if you need further assistance!
