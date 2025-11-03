# 🔄 CI/CD Pipeline Enterprise

## Pipeline de Integración y Despliegue Continuo

### 🎯 Objetivo

Implementar un pipeline robusto de CI/CD que garantice calidad, seguridad y confiabilidad en cada despliegue, siguiendo las mejores prácticas de DevSecOps.

## 🏗️ Arquitectura del Pipeline

```mermaid
graph TD
    A[Code Push] --> B[Quality Gate]
    B --> C[Security Scan]
    C --> D[Build & Test]
    D --> E[Container Build]
    E --> F[Security Scan Image]
    F --> G[Deploy Staging]
    G --> H[Integration Tests]
    H --> I[Deploy Production]
    I --> J[Smoke Tests]
    J --> K[Monitoring]
```

## 🔧 GitHub Actions Workflows

### Main Pipeline

```yaml
# .github/workflows/main-pipeline.yml
name: 🚀 Main CI/CD Pipeline

on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main, develop]

env:
  NODE_VERSION: '18'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  SONAR_PROJECT_KEY: streamio-veoveo
  
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ================================
  # 🔍 Code Quality Analysis
  # ================================
  quality-gate:
    name: 🔍 Quality Gate
    runs-on: ubuntu-latest
    timeout-minutes: 15
    outputs:
      coverage: ${{ steps.coverage.outputs.coverage }}
      quality-gate: ${{ steps.sonar.outputs.quality-gate-status }}
    steps:
      - name: 📥 Checkout Repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Shallow clones should be disabled for better analysis

      - name: 🟢 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: 📦 Install Dependencies
        run: |
          npm ci --prefer-offline --no-audit --progress=false
          npm ls --depth=0

      - name: 🔍 ESLint Analysis
        run: |
          npm run lint -- --format=json --output-file=eslint-report.json
          npm run lint

      - name: 🔧 TypeScript Check
        run: npm run type-check

      - name: 🧪 Unit Tests with Coverage
        id: coverage
        run: |
          npm run test:coverage
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          echo "coverage=$COVERAGE" >> $GITHUB_OUTPUT
          echo "📊 Coverage: $COVERAGE%"

      - name: 📈 SonarCloud Analysis
        id: sonar
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          args: >
            -Dsonar.projectKey=${{ env.SONAR_PROJECT_KEY }}
            -Dsonar.organization=streamio-org
            -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
            -Dsonar.eslint.reportPaths=eslint-report.json
            -Dsonar.coverage.exclusions=**/*.test.js,**/*.spec.js,**/tests/**

      - name: 📊 Upload Coverage Reports
        uses: codecov/codecov-action@v3
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          flags: unittests
          name: streamio-coverage

      - name: ✅ Quality Gate Check
        run: |
          if [[ "${{ steps.coverage.outputs.coverage }}" < "95" ]]; then
            echo "❌ Coverage below 95%: ${{ steps.coverage.outputs.coverage }}%"
            exit 1
          fi
          echo "✅ Quality gate passed!"

  # ================================
  # 🛡️ Security Scanning
  # ================================
  security-scan:
    name: 🛡️ Security Analysis
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: quality-gate
    steps:
      - name: 📥 Checkout Repository
        uses: actions/checkout@v4

      - name: 🟢 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: 📦 Install Dependencies
        run: npm ci --prefer-offline --no-audit

      - name: 🔒 Snyk Security Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --json > snyk-report.json
        continue-on-error: true

      - name: 🔍 NPM Audit
        run: |
          npm audit --audit-level=high --json > npm-audit.json
          npm audit --audit-level=high

      - name: 🛡️ OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        id: depcheck
        with:
          project: 'streamio-veoveo'
          path: '.'
          format: 'JSON'
          args: >
            --enableRetired
            --enableExperimental
            --failOnCVSS 7

      - name: 📋 Security Report
        if: always()
        run: |
          echo "## 🛡️ Security Scan Results" >> $GITHUB_STEP_SUMMARY
          echo "- Snyk: $([ -f snyk-report.json ] && echo '✅ Completed' || echo '❌ Failed')" >> $GITHUB_STEP_SUMMARY
          echo "- NPM Audit: $([ -f npm-audit.json ] && echo '✅ Completed' || echo '❌ Failed')" >> $GITHUB_STEP_SUMMARY
          echo "- OWASP: ${{ steps.depcheck.outcome }}" >> $GITHUB_STEP_SUMMARY

  # ================================
  # 🧪 Advanced Testing
  # ================================
  advanced-testing:
    name: 🧪 Advanced Testing Suite
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: [quality-gate, security-scan]
    strategy:
      matrix:
        test-type: [unit, integration, e2e]
    services:
      mongodb:
        image: mongo:6.0
        env:
          MONGO_INITDB_ROOT_USERNAME: test
          MONGO_INITDB_ROOT_PASSWORD: test
        ports:
          - 27017:27017
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    steps:
      - name: 📥 Checkout Repository
        uses: actions/checkout@v4

      - name: 🟢 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: 📦 Install Dependencies
        run: npm ci --prefer-offline

      - name: 🧪 Run ${{ matrix.test-type }} Tests
        env:
          NODE_ENV: test
          DATABASE_URL: mongodb://test:test@localhost:27017/streamio_test
          REDIS_URL: redis://localhost:6379
        run: |
          case "${{ matrix.test-type }}" in
            "unit")
              npm run test:unit -- --coverage --maxWorkers=2
              ;;
            "integration")
              npm run test:integration -- --maxWorkers=1
              ;;
            "e2e")
              npm run test:e2e -- --headless
              ;;
          esac

      - name: 📊 Upload Test Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results-${{ matrix.test-type }}
          path: |
            coverage/
            test-results/
            screenshots/

  # ================================
  # 🐳 Container Build & Scan
  # ================================
  container-build:
    name: 🐳 Container Build & Security Scan
    runs-on: ubuntu-latest
    timeout-minutes: 30
    needs: [quality-gate, security-scan]
    if: github.event_name != 'pull_request'
    outputs:
      image: ${{ steps.image.outputs.image }}
      digest: ${{ steps.build.outputs.digest }}
      metadata: ${{ steps.meta.outputs.json }}
    steps:
      - name: 📥 Checkout Repository
        uses: actions/checkout@v4

      - name: 🐳 Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: 🔐 Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: 🏷️ Extract Metadata
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
            type=raw,value=latest,enable={{is_default_branch}}

      - name: 🔨 Build and Push Image
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

      - name: 🏷️ Generate Image Reference
        id: image
        run: |
          echo "image=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }}" >> $GITHUB_OUTPUT

      - name: 🛡️ Run Trivy Vulnerability Scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ steps.image.outputs.image }}
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: 📋 Upload Trivy Results to GitHub Security
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

      - name: 🔍 Container Structure Test
        run: |
          curl -LO https://storage.googleapis.com/container-structure-test/latest/container-structure-test-linux-amd64
          chmod +x container-structure-test-linux-amd64
          ./container-structure-test-linux-amd64 test --image ${{ steps.image.outputs.image }} --config .container-structure-test.yaml

  # ================================
  # 🚀 Deploy to Staging
  # ================================
  deploy-staging:
    name: 🚀 Deploy to Staging
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: [advanced-testing, container-build]
    environment: staging
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    steps:
      - name: 📥 Checkout Repository
        uses: actions/checkout@v4

      - name: ⚙️ Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}

      - name: 🚀 Deploy to Staging
        run: |
          kubectl set image deployment/streamio-api streamio-api=${{ needs.container-build.outputs.image }} -n streamio-staging
          kubectl rollout status deployment/streamio-api -n streamio-staging --timeout=300s

      - name: 🔍 Health Check
        run: |
          kubectl wait --for=condition=ready pod -l app=streamio-api -n streamio-staging --timeout=300s
          kubectl get pods -n streamio-staging -l app=streamio-api

      - name: 🧪 Integration Tests on Staging
        env:
          STAGING_URL: https://staging-api.streamio.company.com
        run: |
          npm run test:integration -- --baseUrl=$STAGING_URL --timeout=30000

      - name: 📊 Performance Tests
        run: |
          npm run test:performance -- --baseUrl=$STAGING_URL

  # ================================
  # 🎯 Deploy to Production
  # ================================
  deploy-production:
    name: 🎯 Deploy to Production
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: [deploy-staging, container-build]
    environment: production
    if: startsWith(github.ref, 'refs/tags/v')
    steps:
      - name: 📥 Checkout Repository
        uses: actions/checkout@v4

      - name: ⚙️ Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBE_CONFIG_PRODUCTION }}

      - name: 🎯 Blue-Green Deployment
        run: |
          # Create new deployment with green suffix
          kubectl patch deployment streamio-api -n streamio-production -p '{"spec":{"selector":{"matchLabels":{"version":"green"}},"template":{"metadata":{"labels":{"version":"green"}}}}}'
          kubectl set image deployment/streamio-api streamio-api=${{ needs.container-build.outputs.image }} -n streamio-production
          kubectl rollout status deployment/streamio-api -n streamio-production --timeout=600s

      - name: 🔍 Production Health Check
        run: |
          kubectl wait --for=condition=ready pod -l app=streamio-api,version=green -n streamio-production --timeout=300s
          
          # Test new deployment
          kubectl port-forward -n streamio-production svc/streamio-api-green 8080:80 &
          sleep 10
          curl -f http://localhost:8080/health || exit 1
          pkill -f "kubectl port-forward"

      - name: 🔄 Switch Traffic to Green
        run: |
          kubectl patch service streamio-api-service -n streamio-production -p '{"spec":{"selector":{"version":"green"}}}'
          sleep 30

      - name: 🧪 Production Smoke Tests
        env:
          PRODUCTION_URL: https://api.streamio.company.com
        run: |
          npm run test:smoke -- --baseUrl=$PRODUCTION_URL

      - name: 🧹 Cleanup Blue Deployment
        run: |
          kubectl delete deployment streamio-api-blue -n streamio-production --ignore-not-found=true

      - name: 📢 Deployment Notification
        uses: 8398a7/action-slack@v3
        with:
          status: success
          text: |
            🚀 *Streamio API* deployed successfully to production!
            📦 Version: ${{ github.ref_name }}
            🔗 Image: ${{ needs.container-build.outputs.image }}
            ⏱️ Duration: ${{ job.duration }}
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

  # ================================
  # 📊 Post-Deployment Monitoring
  # ================================
  post-deployment:
    name: 📊 Post-Deployment Monitoring
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: deploy-production
    if: always() && needs.deploy-production.result == 'success'
    steps:
      - name: 📊 Trigger Monitoring Alerts
        run: |
          curl -X POST "${{ secrets.MONITORING_WEBHOOK }}" \
            -H "Content-Type: application/json" \
            -d '{
              "event": "deployment_completed",
              "version": "${{ github.ref_name }}",
              "environment": "production",
              "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
            }'

      - name: 🔍 Verify Metrics Collection
        run: |
          sleep 60  # Wait for metrics to be collected
          # Add your metrics verification logic here

      - name: 📈 Performance Baseline Update
        run: |
          # Update performance baselines for future comparisons
          echo "Updating performance baselines..."
```

### Security-First Pipeline

```yaml
# .github/workflows/security-pipeline.yml
name: 🛡️ Security-First Pipeline

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  # ================================
  # 🔒 Comprehensive Security Audit
  # ================================
  security-audit:
    name: 🔒 Security Audit
    runs-on: ubuntu-latest
    steps:
      - name: 📥 Checkout Repository
        uses: actions/checkout@v4

      - name: 🔍 Secret Scanning
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD

      - name: 🛡️ SAST with CodeQL
        uses: github/codeql-action/init@v2
        with:
          languages: javascript

      - name: 🔨 Autobuild
        uses: github/codeql-action/autobuild@v2

      - name: 🔍 Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v2

      - name: 🔒 License Compliance Check
        uses: fossa-contrib/fossa-action@v2
        with:
          api-key: ${{ secrets.FOSSA_API_KEY }}

  # ================================
  # 🐳 Container Security Scanning
  # ================================
  container-security:
    name: 🐳 Container Security
    runs-on: ubuntu-latest
    steps:
      - name: 📥 Checkout Repository
        uses: actions/checkout@v4

      - name: 🔨 Build Test Image
        run: docker build -t test-image .

      - name: 🛡️ Anchore Container Scan
        uses: anchore/scan-action@v3
        with:
          image: test-image
          fail-build: true
          severity-cutoff: high

      - name: 🔍 Docker Bench Security
        run: |
          docker run --rm --net host --pid host --userns host --cap-add audit_control \
            -e DOCKER_CONTENT_TRUST=$DOCKER_CONTENT_TRUST \
            -v /etc:/etc:ro \
            -v /usr/bin/containerd:/usr/bin/containerd:ro \
            -v /usr/bin/runc:/usr/bin/runc:ro \
            -v /usr/lib/systemd:/usr/lib/systemd:ro \
            -v /var/lib:/var/lib:ro \
            -v /var/run/docker.sock:/var/run/docker.sock:ro \
            --label docker_bench_security \
            docker/docker-bench-security
```

## 🔧 Pipeline Configuration Files

### Container Structure Test

```yaml
# .container-structure-test.yaml
schemaVersion: 2.0.0

commandTests:
  - name: "Node.js version check"
    command: "node"
    args: ["--version"]
    expectedOutput: ["v18.*"]

  - name: "Application starts successfully"
    command: "timeout"
    args: ["10s", "node", "dist/index.js"]
    exitCode: 124  # timeout exit code

fileExistenceTests:
  - name: "Application files exist"
    path: "/app/dist/index.js"
    shouldExist: true

  - name: "Package.json exists"
    path: "/app/package.json"
    shouldExist: true

  - name: "Node modules exist"
    path: "/app/node_modules"
    shouldExist: true

fileContentTests:
  - name: "Non-root user"
    path: "/etc/passwd"
    expectedContents: ["streamio:x:1001:1001::/app:/bin/sh"]

metadataTest:
  exposedPorts: ["3000"]
  user: "streamio"
  workdir: "/app"
```

### SonarQube Configuration

```properties
# sonar-project.properties
sonar.projectKey=streamio-veoveo
sonar.organization=streamio-org
sonar.projectName=Streamio Veoveo API
sonar.projectVersion=1.0

# Source configuration
sonar.sources=src
sonar.tests=tests,src/**/*.test.js,src/**/*.spec.js
sonar.exclusions=**/node_modules/**,**/dist/**,**/coverage/**

# Language configuration
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.eslint.reportPaths=eslint-report.json

# Quality gate configuration
sonar.qualitygate.wait=true
sonar.coverage.exclusions=**/*.test.js,**/*.spec.js,**/tests/**

# Security configuration
sonar.security.hotspots.inheritFromParent=true
```

### ESLint Security Configuration

```json
{
  "extends": [
    "@eslint/js/recommended",
    "plugin:security/recommended",
    "plugin:node/recommended"
  ],
  "plugins": ["security", "node"],
  "rules": {
    "security/detect-object-injection": "error",
    "security/detect-non-literal-regexp": "error",
    "security/detect-unsafe-regex": "error",
    "security/detect-buffer-noassert": "error",
    "security/detect-child-process": "error",
    "security/detect-disable-mustache-escape": "error",
    "security/detect-eval-with-expression": "error",
    "security/detect-no-csrf-before-method-override": "error",
    "security/detect-non-literal-fs-filename": "error",
    "security/detect-non-literal-require": "error",
    "security/detect-possible-timing-attacks": "error",
    "security/detect-pseudoRandomBytes": "error"
  }
}
```

## 📊 Quality Metrics Dashboard

### Pipeline Metrics

```yaml
# .github/workflows/metrics.yml
name: 📊 Pipeline Metrics

on:
  workflow_run:
    workflows: ["🚀 Main CI/CD Pipeline"]
    types: [completed]

jobs:
  collect-metrics:
    runs-on: ubuntu-latest
    steps:
      - name: 📊 Collect Pipeline Metrics
        run: |
          # DORA Metrics Collection
          echo "Deployment Frequency: $(date)" >> metrics.log
          echo "Lead Time: ${{ github.event.workflow_run.run_duration_ms }}ms" >> metrics.log
          echo "MTTR: Calculating..." >> metrics.log
          echo "Change Failure Rate: ${{ github.event.workflow_run.conclusion }}" >> metrics.log

      - name: 📈 Send to Monitoring
        run: |
          curl -X POST "${{ secrets.METRICS_ENDPOINT }}" \
            -H "Content-Type: application/json" \
            -d '{
              "pipeline_duration": "${{ github.event.workflow_run.run_duration_ms }}",
              "status": "${{ github.event.workflow_run.conclusion }}",
              "branch": "${{ github.ref_name }}",
              "commit": "${{ github.sha }}"
            }'
```

## 🚨 Alerting y Notifications

### Slack Integration

```yaml
# .github/workflows/notifications.yml
name: 📢 Pipeline Notifications

on:
  workflow_run:
    workflows: ["🚀 Main CI/CD Pipeline"]
    types: [completed]

jobs:
  notify:
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: 📢 Slack Notification
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ github.event.workflow_run.conclusion }}
          custom_payload: |
            {
              "text": "Pipeline ${{ github.event.workflow_run.conclusion }}",
              "attachments": [{
                "color": "${{ github.event.workflow_run.conclusion == 'success' && 'good' || 'danger' }}",
                "fields": [{
                  "title": "Repository",
                  "value": "${{ github.repository }}",
                  "short": true
                }, {
                  "title": "Branch",
                  "value": "${{ github.ref_name }}",
                  "short": true
                }, {
                  "title": "Duration",
                  "value": "${{ github.event.workflow_run.run_duration_ms }}ms",
                  "short": true
                }, {
                  "title": "Commit",
                  "value": "${{ github.sha }}",
                  "short": true
                }]
              }]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## 📋 Pipeline Checklist

### Pre-Pipeline Setup
- [ ] **Repository Secrets**: All required secrets configured
- [ ] **Branch Protection**: Rules enabled for main/develop
- [ ] **Code Owners**: CODEOWNERS file configured
- [ ] **Security Scanning**: Tools integrated and configured
- [ ] **Quality Gates**: SonarCloud/CodeClimate setup

### Pipeline Validation
- [ ] **Quality Gate**: Code coverage > 95%
- [ ] **Security Scan**: No high/critical vulnerabilities
- [ ] **Performance Test**: Response time < 200ms
- [ ] **Container Scan**: No security issues in image
- [ ] **Integration Test**: All endpoints working

### Deployment Validation
- [ ] **Health Checks**: All services responding
- [ ] **Smoke Tests**: Critical paths verified
- [ ] **Rollback Plan**: Tested and ready
- [ ] **Monitoring**: Alerts active and configured
- [ ] **Documentation**: Deployment notes updated

---

*CI/CD Pipeline Guide v1.0*  
*Optimizado para DevSecOps*  
*Basado en DORA Metrics*  
*Validado para Entornos Empresariales*