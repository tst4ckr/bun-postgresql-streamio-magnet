# 🚀 Production Deployment Guide

## Guía Completa de Despliegue Empresarial

### 🎯 Objetivo

Esta guía proporciona un roadmap completo para desplegar Streamio Veoveo en producción con las mejores prácticas de DevOps, seguridad y escalabilidad.

## 🐳 Docker Multi-Stage Build

### Dockerfile Optimizado para Producción

```dockerfile
# ================================
# Multi-Stage Production Dockerfile
# ================================

# Stage 1: Dependencies
FROM node:18-alpine AS dependencies
LABEL stage=dependencies

WORKDIR /app

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Stage 2: Build
FROM node:18-alpine AS build
LABEL stage=build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci --no-audit --no-fund

# Copy source code
COPY . .

# Run linting and tests
RUN npm run lint && \
    npm run test:coverage && \
    npm run build

# Stage 3: Security Scan
FROM node:18-alpine AS security
LABEL stage=security

WORKDIR /app

# Copy built application
COPY --from=build /app .

# Run security audit
RUN npm audit --audit-level=high

# Stage 4: Production Runtime
FROM node:18-alpine AS production
LABEL maintainer="streamio-team@company.com"
LABEL version="1.0.0"
LABEL description="Streamio Veoveo Production Image"

# Install security updates and dumb-init
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S streamio -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy production dependencies
COPY --from=dependencies --chown=streamio:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=build --chown=streamio:nodejs /app/dist ./dist
COPY --from=build --chown=streamio:nodejs /app/package.json ./

# Create necessary directories
RUN mkdir -p logs tmp && \
    chown -R streamio:nodejs logs tmp

# Switch to non-root user
USER streamio

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]
```

### Docker Compose para Desarrollo

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mongodb://mongo:27017/streamio
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=info
    depends_on:
      - mongo
      - redis
    networks:
      - streamio-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  mongo:
    image: mongo:6.0-focal
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=secure_password
      - MONGO_INITDB_DATABASE=streamio
    volumes:
      - mongo_data:/data/db
      - ./scripts/mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    networks:
      - streamio-network
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --requirepass secure_redis_password
    volumes:
      - redis_data:/data
    networks:
      - streamio-network
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    networks:
      - streamio-network
    restart: unless-stopped

volumes:
  mongo_data:
  redis_data:

networks:
  streamio-network:
    driver: bridge
```

## ☸️ Kubernetes Deployment

### Namespace y ConfigMap

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: streamio-production
  labels:
    name: streamio-production
    environment: production

---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: streamio-config
  namespace: streamio-production
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  SERVER_PORT: "3000"
  CACHE_TTL: "3600"
  MAX_CONNECTIONS: "100"
```

### Secrets Management

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: streamio-secrets
  namespace: streamio-production
type: Opaque
data:
  # Base64 encoded values
  DATABASE_URL: bW9uZ29kYjovL21vbmdvOjI3MDE3L3N0cmVhbWlv
  REDIS_URL: cmVkaXM6Ly9yZWRpczozNjM3OS8w
  JWT_SECRET: c3VwZXJfc2VjdXJlX2p3dF9zZWNyZXQ=
  API_KEY: YXBpX2tleV9mb3JfZXh0ZXJuYWxfc2VydmljZXM=
```

### Deployment Configuration

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: streamio-api
  namespace: streamio-production
  labels:
    app: streamio-api
    version: v1.0.0
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: streamio-api
  template:
    metadata:
      labels:
        app: streamio-api
        version: v1.0.0
    spec:
      serviceAccountName: streamio-service-account
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: streamio-api
        image: registry.company.com/streamio-api:1.0.0
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: streamio-config
              key: NODE_ENV
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: streamio-secrets
              key: DATABASE_URL
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: streamio-secrets
              key: REDIS_URL
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
        volumeMounts:
        - name: tmp-volume
          mountPath: /tmp
        - name: logs-volume
          mountPath: /app/logs
      volumes:
      - name: tmp-volume
        emptyDir: {}
      - name: logs-volume
        emptyDir: {}
      imagePullSecrets:
      - name: registry-secret
```

### Service y Ingress

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: streamio-api-service
  namespace: streamio-production
  labels:
    app: streamio-api
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  selector:
    app: streamio-api

---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: streamio-api-ingress
  namespace: streamio-production
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - api.streamio.company.com
    secretName: streamio-api-tls
  rules:
  - host: api.streamio.company.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: streamio-api-service
            port:
              number: 80
```

### Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: streamio-api-hpa
  namespace: streamio-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: streamio-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/production-deploy.yml
name: Production Deployment Pipeline

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

env:
  REGISTRY: registry.company.com
  IMAGE_NAME: streamio-api
  KUBERNETES_NAMESPACE: streamio-production

jobs:
  # ================================
  # Code Quality & Security
  # ================================
  quality-gate:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run linting
      run: npm run lint

    - name: Run type checking
      run: npm run type-check

    - name: Run unit tests
      run: npm run test:coverage

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        token: ${{ secrets.CODECOV_TOKEN }}

    - name: SonarCloud Scan
      uses: SonarSource/sonarcloud-github-action@master
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

  # ================================
  # Security Scanning
  # ================================
  security-scan:
    runs-on: ubuntu-latest
    needs: quality-gate
    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Run Snyk to check for vulnerabilities
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      with:
        args: --severity-threshold=high

    - name: Run npm audit
      run: npm audit --audit-level=high

    - name: OWASP Dependency Check
      uses: dependency-check/Dependency-Check_Action@main
      with:
        project: 'streamio-api'
        path: '.'
        format: 'JSON'

  # ================================
  # Build & Push Docker Image
  # ================================
  build-and-push:
    runs-on: ubuntu-latest
    needs: [quality-gate, security-scan]
    if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      image-digest: ${{ steps.build.outputs.digest }}
    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ secrets.REGISTRY_USERNAME }}
        password: ${{ secrets.REGISTRY_PASSWORD }}

    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=semver,pattern={{version}}
          type=semver,pattern={{major}}.{{minor}}
          type=sha,prefix={{branch}}-

    - name: Build and push Docker image
      id: build
      uses: docker/build-push-action@v5
      with:
        context: .
        platforms: linux/amd64,linux/arm64
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
        build-args: |
          BUILD_DATE=${{ fromJSON(steps.meta.outputs.json).labels['org.opencontainers.image.created'] }}
          VCS_REF=${{ github.sha }}
          VERSION=${{ fromJSON(steps.meta.outputs.json).labels['org.opencontainers.image.version'] }}

    - name: Sign container image
      run: |
        cosign sign --yes ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }}
      env:
        COSIGN_PRIVATE_KEY: ${{ secrets.COSIGN_PRIVATE_KEY }}
        COSIGN_PASSWORD: ${{ secrets.COSIGN_PASSWORD }}

  # ================================
  # Deploy to Staging
  # ================================
  deploy-staging:
    runs-on: ubuntu-latest
    needs: build-and-push
    environment: staging
    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Configure kubectl
      uses: azure/k8s-set-context@v3
      with:
        method: kubeconfig
        kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}

    - name: Deploy to staging
      run: |
        kubectl set image deployment/streamio-api streamio-api=${{ needs.build-and-push.outputs.image-tag }} -n streamio-staging
        kubectl rollout status deployment/streamio-api -n streamio-staging --timeout=300s

    - name: Run integration tests
      run: |
        npm run test:integration -- --baseUrl=https://staging-api.streamio.company.com

  # ================================
  # Deploy to Production
  # ================================
  deploy-production:
    runs-on: ubuntu-latest
    needs: [build-and-push, deploy-staging]
    environment: production
    if: startsWith(github.ref, 'refs/tags/v')
    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Configure kubectl
      uses: azure/k8s-set-context@v3
      with:
        method: kubeconfig
        kubeconfig: ${{ secrets.KUBE_CONFIG_PRODUCTION }}

    - name: Deploy to production
      run: |
        kubectl set image deployment/streamio-api streamio-api=${{ needs.build-and-push.outputs.image-tag }} -n ${{ env.KUBERNETES_NAMESPACE }}
        kubectl rollout status deployment/streamio-api -n ${{ env.KUBERNETES_NAMESPACE }} --timeout=600s

    - name: Verify deployment
      run: |
        kubectl get pods -n ${{ env.KUBERNETES_NAMESPACE }} -l app=streamio-api
        kubectl logs -n ${{ env.KUBERNETES_NAMESPACE }} -l app=streamio-api --tail=50

    - name: Run smoke tests
      run: |
        npm run test:smoke -- --baseUrl=https://api.streamio.company.com

    - name: Notify deployment success
      uses: 8398a7/action-slack@v3
      with:
        status: success
        text: '🚀 Streamio API deployed successfully to production!'
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## 📊 Monitoring y Observabilidad

### Prometheus Configuration

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "streamio-rules.yml"

scrape_configs:
  - job_name: 'streamio-api'
    kubernetes_sd_configs:
    - role: endpoints
      namespaces:
        names:
        - streamio-production
    relabel_configs:
    - source_labels: [__meta_kubernetes_service_name]
      action: keep
      regex: streamio-api-service
    - source_labels: [__meta_kubernetes_endpoint_port_name]
      action: keep
      regex: metrics

alerting:
  alertmanagers:
  - kubernetes_sd_configs:
    - role: pod
      namespaces:
        names:
        - monitoring
    relabel_configs:
    - source_labels: [__meta_kubernetes_pod_label_app]
      action: keep
      regex: alertmanager
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Streamio API Production Dashboard",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{job=\"streamio-api\"}[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "title": "Response Time P95",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=\"streamio-api\"}[5m]))",
            "legendFormat": "P95 Response Time"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{job=\"streamio-api\",status=~\"5..\"}[5m]) / rate(http_requests_total{job=\"streamio-api\"}[5m])",
            "legendFormat": "Error Rate"
          }
        ]
      }
    ]
  }
}
```

## 🔒 Security Hardening

### Network Policies

```yaml
# k8s/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: streamio-api-network-policy
  namespace: streamio-production
spec:
  podSelector:
    matchLabels:
      app: streamio-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: database
    ports:
    - protocol: TCP
      port: 27017
  - to:
    - namespaceSelector:
        matchLabels:
          name: cache
    ports:
    - protocol: TCP
      port: 6379
  - to: []
    ports:
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
```

### Pod Security Policy

```yaml
# k8s/pod-security-policy.yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: streamio-api-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
```

## 📈 Performance Optimization

### Resource Limits y Requests

```yaml
# Optimized resource configuration
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
    ephemeral-storage: "1Gi"
  limits:
    memory: "512Mi"
    cpu: "500m"
    ephemeral-storage: "2Gi"
```

### JVM Tuning (si aplica)

```bash
# Node.js optimization flags
NODE_OPTIONS="--max-old-space-size=512 --optimize-for-size"
```

## 🚨 Disaster Recovery

### Backup Strategy

```yaml
# k8s/backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: streamio-backup
  namespace: streamio-production
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: mongo:6.0
            command:
            - /bin/bash
            - -c
            - |
              mongodump --uri="$DATABASE_URL" --gzip --archive=/backup/streamio-$(date +%Y%m%d).gz
              aws s3 cp /backup/streamio-$(date +%Y%m%d).gz s3://streamio-backups/
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: streamio-secrets
                  key: DATABASE_URL
            volumeMounts:
            - name: backup-storage
              mountPath: /backup
          volumes:
          - name: backup-storage
            emptyDir: {}
          restartPolicy: OnFailure
```

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] **Code Quality**: Tests passing, coverage > 95%
- [ ] **Security Scan**: No high/critical vulnerabilities
- [ ] **Performance Test**: Load testing completed
- [ ] **Documentation**: Updated and reviewed
- [ ] **Configuration**: Environment variables validated

### Deployment Process
- [ ] **Blue-Green Deployment**: Zero-downtime strategy
- [ ] **Database Migration**: Schema changes applied
- [ ] **Feature Flags**: New features disabled initially
- [ ] **Monitoring**: Alerts configured and active
- [ ] **Rollback Plan**: Prepared and tested

### Post-Deployment
- [ ] **Health Checks**: All endpoints responding
- [ ] **Metrics**: Performance within SLA
- [ ] **Logs**: No error spikes detected
- [ ] **User Acceptance**: Smoke tests passed
- [ ] **Documentation**: Deployment notes updated

---

*Production Deployment Guide v1.0*  
*Optimizado para Kubernetes y Docker*  
*Basado en DevOps Best Practices*  
*Validado para Entornos Empresariales*